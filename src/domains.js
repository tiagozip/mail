import { checkRelayHealth } from "./byod.js";

const CF_MX_RE = /(?:^|\.)mx\.cloudflare\.net\.?$/;
const CF_SPF_INCLUDE = "_spf.mx.cloudflare.net";
const RELAY_GRACE_MS = 72 * 60 * 60 * 1000;

const DKIM_SELECTORS = ["cf2024-1", "cf2024-2", "cf2025-1", "cf2026-1"];

async function lookupTxt(name) {
  const res = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`,
    { headers: { accept: "application/dns-json" } },
  );
  if (!res.ok) throw new Error("dns lookup failed");
  const data = await res.json();
  return (data.Answer || [])
    .filter((a) => a.type === 16)
    .map((a) =>
      String(a.data || "")
        .replace(/^"|"$/g, "")
        .replace(/"\s+"/g, "")
        .toLowerCase(),
    );
}

export async function checkSendingDns(domain) {
  const spfRecords = await lookupTxt(domain);
  const spf = spfRecords.some((t) => t.startsWith("v=spf1") && t.includes(CF_SPF_INCLUDE));
  const dkimLists = await Promise.all(
    DKIM_SELECTORS.map((sel) => lookupTxt(`${sel}._domainkey.${domain}`).catch(() => [])),
  );
  const dkim = dkimLists.some((list) =>
    list.some((t) => t.includes("v=dkim1") && /p=\s*[a-z0-9+/]/.test(t)),
  );
  return { spf, dkim, ok: spf && dkim };
}

export async function checkOwnership(domain, token) {
  if (!token) return false;
  try {
    const txt = await lookupTxt(`_estrogen.${domain}`);
    return txt.some((t) => t.includes(String(token).toLowerCase()));
  } catch {
    return false;
  }
}

export async function lookupMx(domain) {
  const res = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
    { headers: { accept: "application/dns-json" } },
  );
  if (!res.ok) throw new Error("dns lookup failed");
  const data = await res.json();
  const records = (data.Answer || [])
    .filter((a) => a.type === 15)
    .map((a) => {
      const parts = String(a.data || "")
        .trim()
        .split(/\s+/);
      const target = (parts.length > 1 ? parts[1] : parts[0]).replace(/\.$/, "").toLowerCase();
      return { priority: Number.parseInt(parts[0], 10) || 0, target };
    });
  const routesToCloudflare = records.length > 0 && records.every((r) => CF_MX_RE.test(r.target));
  return { records, routesToCloudflare };
}

async function notifyDowngrade(env, d) {
  if (!d.owner_id) return;
  const owner = await env.DB.prepare("SELECT address FROM users WHERE id = ?")
    .bind(d.owner_id)
    .first();
  if (!owner?.address) return;
  try {
    await env.EMAIL.send({
      to: owner.address,
      from: { email: `noreply@${env.MAIL_DOMAIN}`, name: "estrogen.mail" },
      subject: `Your domain ${d.domain} stopped verifying`,
      text: `Heads up: ${d.domain} is no longer reachable for this mailbox. Receiving and sending on it are paused until you re-verify it in Settings, Domains.`,
    });
  } catch {}
}

export async function reverifyAllDomains(env) {
  const res = await env.DB.prepare(
    "SELECT id, domain, verified, send_verified, public, owner_id, relay_secret_enc, relay_url, relay_failing_since FROM domains",
  ).all();
  for (const d of res.results || []) {
    if (d.relay_secret_enc) {
      if (!d.relay_url) continue;
      const health = await checkRelayHealth(env, d);
      const ts = Date.now();
      if (health.ok) {
        await env.DB.prepare(
          "UPDATE domains SET relay_ok = 1, relay_checked_at = ?, relay_failing_since = NULL WHERE id = ?",
        )
          .bind(ts, d.id)
          .run();
        continue;
      }
      const failingSince = d.relay_failing_since || ts;
      if (ts - failingSince < RELAY_GRACE_MS) {
        await env.DB.prepare(
          "UPDATE domains SET relay_ok = 0, relay_checked_at = ?, relay_failing_since = ? WHERE id = ?",
        )
          .bind(ts, failingSince, d.id)
          .run();
        continue;
      }
      await env.DB.prepare(
        "UPDATE domains SET relay_ok = 0, relay_checked_at = ?, relay_failing_since = ?, verified = 0, send_verified = 0, public = 0 WHERE id = ?",
      )
        .bind(ts, failingSince, d.id)
        .run();
      if (d.verified) await notifyDowngrade(env, d);
      continue;
    }
    let mx;
    let sending;
    try {
      mx = await lookupMx(d.domain);
      sending = await checkSendingDns(d.domain);
    } catch {
      continue;
    }
    const verified = mx.routesToCloudflare && d.verified ? 1 : 0;
    const sendVerified = sending.ok && d.send_verified ? 1 : 0;
    const pub = verified ? d.public : 0;
    if (verified === d.verified && sendVerified === d.send_verified && pub === d.public) continue;
    await env.DB.prepare(
      "UPDATE domains SET verified = ?, send_verified = ?, public = ? WHERE id = ?",
    )
      .bind(verified, sendVerified, pub, d.id)
      .run();
    if (d.verified && !verified) await notifyDowngrade(env, d);
  }
}
