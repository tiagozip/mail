import { decryptText, encryptText } from "./crypto.js";
import { storeInbound } from "./mail.js";
import { normalizeAddr } from "./util.js";

const SKEW_MS = 300000;
const MAX_INGEST_BYTES = 26214400;
const RELAY_TIMEOUT_MS = 10000;
const MAX_RELAY_RESP = 16384;
const enc = new TextEncoder();

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

async function sha256hex(bytes) {
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

function timingSafeEqual(a, b) {
  const aa = String(a || "");
  const bb = String(b || "");
  if (aa.length !== bb.length) return false;
  let r = 0;
  for (let i = 0; i < aa.length; i++) r |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  return r === 0;
}

function randHex(n) {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return toHex(buf);
}

export function generateRelaySecret() {
  return randHex(32);
}

export const RELAY_DEPLOY_URL =
  "https://deploy.workers.cloudflare.com/?url=https://github.com/tiagozip/email-worker-template";

export function relayConfigToken(secret, domain, mailEndpoint) {
  const json = JSON.stringify({
    s: secret,
    d: String(domain).toLowerCase(),
    m: String(mailEndpoint).replace(/\/$/, ""),
  });
  return bufToB64(enc.encode(json));
}

const probeKey = (localpart) => `byod:probe:${localpart}`;

export async function sendVerifyProbe(env, row) {
  const localpart = `estrogen-verify-${randHex(16)}`;
  await env.KV.put(probeKey(localpart), JSON.stringify({ id: row.id, domain: row.domain }), {
    expirationTtl: 900,
  });
  await env.EMAIL.send({
    to: `${localpart}@${row.domain}`,
    from: { email: `verify@${String(env.MAIL_DOMAIN).toLowerCase()}`, name: "estrogen.delivery" },
    subject: "Verifying your domain",
    text: `This message confirms that ${row.domain} is connected to estrogen.delivery. You can ignore it.`,
  });
}

function bufToB64(bytes) {
  let bin = "";
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const b of u) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptSecret(env, domain, secret) {
  return bufToB64(await encryptText(env, `${domain}\n${secret}`));
}

export async function decryptRelaySecret(env, domain, secretEnc) {
  const pt = await decryptText(env, b64ToBytes(secretEnc));
  const i = pt.indexOf("\n");
  if (i < 0 || pt.slice(0, i) !== domain) throw new Error("relay secret/domain mismatch");
  return pt.slice(i + 1);
}

function validTs(ts) {
  if (!/^\d{13}$/.test(String(ts || ""))) return false;
  return Math.abs(Date.now() - Number(ts)) <= SKEW_MS;
}

const noNewline = (s) => typeof s === "string" && !/[\r\n]/.test(s);

async function consumeNonce(env, domain, nonce) {
  const key = `byod:nonce:${domain}:${nonce}`;
  try {
    if (await env.KV.get(key)) return false;
    await env.KV.put(key, "1", { expirationTtl: 900 });
    return true;
  } catch {
    return false;
  }
}

async function rateOk(env, domain) {
  const key = `byod:in:${domain}:${Math.floor(Date.now() / 3600000)}`;
  try {
    const n = Number.parseInt((await env.KV.get(key)) || "0", 10);
    if (n >= 5000) return false;
    await env.KV.put(key, String(n + 1), { expirationTtl: 4000 });
    return true;
  } catch {
    return false;
  }
}

export async function byodIngest(request, env, ctx) {
  const domain = String(request.headers.get("x-relay-domain") || "")
    .toLowerCase()
    .trim();
  const rcpt = normalizeAddr(request.headers.get("x-relay-rcpt") || "");
  const mailfrom = normalizeAddr(request.headers.get("x-relay-mailfrom") || "");
  const ts = request.headers.get("x-relay-ts") || "";
  const nonce = request.headers.get("x-relay-nonce") || "";
  const sig = request.headers.get("x-relay-sig") || "";

  if (!domain || !rcpt || !validTs(ts) || !/^[a-f0-9]{16,64}$/.test(nonce))
    return new Response("bad request", { status: 400 });
  if (!noNewline(domain) || !noNewline(rcpt) || !noNewline(mailfrom))
    return new Response("bad request", { status: 400 });
  if ((rcpt.split("@")[1] || "").toLowerCase() !== domain)
    return new Response("recipient not on domain", { status: 422 });

  const declared = Number.parseInt(request.headers.get("content-length") || "0", 10);
  if (declared > MAX_INGEST_BYTES) return new Response("too large", { status: 413 });

  const localpart = (rcpt.split("@")[0] || "").toLowerCase();
  let probe = null;
  if (/^[a-z0-9._+-]{1,128}$/.test(localpart)) {
    try {
      const p = await env.KV.get(probeKey(localpart));
      if (p) probe = JSON.parse(p);
    } catch {}
  }

  let isProbe = false;
  let row;
  if (probe && probe.domain === domain && typeof probe.id === "string") {
    row = await env.DB.prepare("SELECT id, owner_id, domain, relay_secret_enc FROM domains WHERE id = ?")
      .bind(probe.id)
      .first();
    if (!row?.relay_secret_enc || row.domain !== domain)
      return new Response("unknown domain", { status: 404 });
    isProbe = true;
  } else {
    row = await env.DB.prepare(
      "SELECT id, owner_id, domain, relay_secret_enc FROM domains WHERE domain = ? AND relay_url IS NOT NULL AND verified = 1",
    )
      .bind(domain)
      .first();
    if (!row?.relay_secret_enc || !row.owner_id) return new Response("unknown domain", { status: 404 });
  }

  if (!(await rateOk(env, domain))) return new Response("rate limited", { status: 429 });

  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.byteLength === 0 || raw.byteLength > MAX_INGEST_BYTES)
    return new Response("bad size", { status: 413 });

  let secret;
  try {
    secret = await decryptRelaySecret(env, domain, row.relay_secret_enc);
  } catch {
    return new Response("secret error", { status: 500 });
  }
  const signed = `ingest\n${ts}\n${nonce}\n${domain}\n${rcpt}\n${mailfrom}\n${await sha256hex(raw)}`;
  if (!timingSafeEqual(sig, await hmacHex(secret, signed)))
    return new Response("bad signature", { status: 401 });

  if (!(await consumeNonce(env, domain, nonce))) return new Response("replay", { status: 409 });

  if (isProbe) {
    const taken = await env.DB.prepare(
      "SELECT 1 FROM domains WHERE domain = ? AND verified = 1 AND owner_id != ? LIMIT 1",
    )
      .bind(domain, row.owner_id)
      .first();
    if (taken) return new Response("domain claimed by another account", { status: 409 });
    try {
      await env.DB.prepare("UPDATE domains SET verified = 1, send_verified = 1 WHERE id = ?")
        .bind(row.id)
        .run();
    } catch {
      return new Response("domain claimed by another account", { status: 409 });
    }
    try {
      await env.KV.delete(probeKey(localpart));
    } catch {}
    return Response.json({ ok: true, verified: true });
  }

  try {
    await storeInbound(env, ctx, {
      raw,
      userId: row.owner_id,
      matchedAddress: rcpt,
      envelopeFrom: mailfrom,
    });
  } catch (e) {
    if (e?.permanent) return new Response(`rejected: ${e.message}`, { status: 422 });
    console.error("byod ingest store error", e?.stack || e);
    return new Response("temporary failure", { status: 503 });
  }
  return Response.json({ ok: true });
}

async function readCapped(res) {
  const buf = await res.arrayBuffer();
  const slice = new Uint8Array(buf).slice(0, MAX_RELAY_RESP);
  try {
    return JSON.parse(new TextDecoder().decode(slice));
  } catch {
    return null;
  }
}

export async function sendViaRelay(env, domainRow, sendPayload) {
  const secret = await decryptRelaySecret(env, domainRow.domain, domainRow.relay_secret_enc);
  const payload = { ...sendPayload };
  if (Array.isArray(payload.attachments) && payload.attachments.length) {
    payload.attachments = payload.attachments.map((a) => ({
      filename: a.filename,
      type: a.type,
      disposition: a.disposition,
      contentId: a.contentId,
      b64: true,
      content: bufToB64(a.content),
    }));
  }
  const body = JSON.stringify(payload);
  const ts = Date.now().toString();
  const nonce = randHex(16);
  const sig = await hmacHex(secret, `send\n${ts}\n${nonce}\n${await sha256hex(enc.encode(body))}`);
  let res;
  try {
    res = await fetch(`${String(domainRow.relay_url).replace(/\/$/, "")}/send`, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "x-relay-ts": ts,
        "x-relay-nonce": nonce,
        "x-relay-sig": sig,
      },
      body,
    });
  } catch (e) {
    throw new Error(`relay unreachable: ${e?.message || e}`);
  }
  if (!res.ok) {
    const data = await readCapped(res);
    throw new Error(`relay send failed: ${res.status} ${(data?.error || "").slice(0, 160)}`);
  }
  return (await readCapped(res)) || {};
}

export async function verifyRelay(relayUrl, secret, expectedDomain) {
  const ts = Date.now().toString();
  const nonce = randHex(16);
  const sig = await hmacHex(secret, `health\n${ts}\n${nonce}`);
  let res;
  try {
    res = await fetch(`${String(relayUrl).replace(/\/$/, "")}/health`, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
      headers: { "x-relay-ts": ts, "x-relay-nonce": nonce, "x-relay-sig": sig },
    });
  } catch (e) {
    return { ok: false, error: `could not reach relay: ${e?.message || e}` };
  }
  if (!res.ok) return { ok: false, error: `relay returned ${res.status}` };
  const data = await readCapped(res);
  if (!data?.ok) return { ok: false, error: "relay rejected the shared secret" };
  if (String(data.domain || "").toLowerCase() !== String(expectedDomain).toLowerCase())
    return { ok: false, error: `relay is bound to ${data.domain}, not ${expectedDomain}` };
  return { ok: true };
}
