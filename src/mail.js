import * as openpgp from "openpgp";
import PostalMime from "postal-mime";
import { encryptBytes, encryptText } from "./crypto.js";
import { sendPush } from "./push.js";
import { sanitizeEmailHtml } from "./sanitize.js";
import { classifySpam } from "./spam.js";
import {
  applyFilters,
  attKey,
  bumpContact,
  htmlKey,
  insertMessage,
  labelsForMessage,
  rawKey,
  resolveThread,
  updateStorage,
} from "./store.js";
import { normalizeAddr, now, snippetFrom, uuid } from "./util.js";

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input);
}

function refsToList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value).split(/\s+/).filter(Boolean);
}

function firstHeader(rawHeaders, name) {
  const lower = name.toLowerCase();
  const lines = String(rawHeaders || "").split(/\r?\n/);
  let value = null;
  let collecting = false;
  for (const line of lines) {
    if (collecting) {
      if (/^[ \t]/.test(line)) {
        value += ` ${line.trim()}`;
        continue;
      }
      break;
    }
    const idx = line.indexOf(":");
    if (idx > 0 && line.slice(0, idx).trim().toLowerCase() === lower) {
      value = line.slice(idx + 1).trim();
      collecting = true;
    }
  }
  return value;
}

function evaluateAuth(rawHeaders) {
  const ar = (firstHeader(rawHeaders, "authentication-results") || "").toLowerCase();
  const grab = (re) => (ar.match(re) || [])[1] || null;
  const spf =
    grab(/[^-]spf=(\w+)/) ||
    grab(/^spf=(\w+)/) ||
    ((firstHeader(rawHeaders, "received-spf") || "").toLowerCase().match(/^\s*(\w+)/) || [])[1] ||
    null;
  const dkim = grab(/dkim=(\w+)/);
  const dmarc = grab(/dmarc=(\w+)/);
  let status = "none";
  if (dmarc) status = dmarc === "pass" ? "pass" : "fail";
  else if (spf || dkim) status = spf === "pass" || dkim === "pass" ? "pass" : "fail";
  return { status, spf, dkim, dmarc };
}

async function resolveRecipient(env, to) {
  const addr = normalizeAddr(to);
  const direct = await env.DB.prepare("SELECT user_id, enabled FROM addresses WHERE address = ?")
    .bind(addr)
    .first();
  if (direct?.user_id) {
    if (!direct.enabled) return { disabled: true };
    return { userId: direct.user_id, address: addr };
  }
  const domain = (addr.split("@")[1] || "").toLowerCase();
  if (domain && domain !== String(env.MAIL_DOMAIN || "").toLowerCase()) {
    const dom = await env.DB.prepare(
      "SELECT owner_id FROM domains WHERE domain = ? AND verified = 1",
    )
      .bind(domain)
      .first();
    if (!dom?.owner_id) return {};
    const owner = await env.DB.prepare(
      "SELECT id FROM users WHERE id = ? AND json_extract(settings_json, '$.catchAll') = 1",
    )
      .bind(dom.owner_id)
      .first();
    return owner?.id ? { userId: owner.id } : {};
  }
  const catchAll = await env.DB.prepare(
    "SELECT id FROM users WHERE is_admin = 1 AND json_extract(settings_json, '$.catchAll') = 1 ORDER BY created_at LIMIT 1",
  ).first();
  return catchAll?.id ? { userId: catchAll.id } : {};
}

export async function handleEmail(message, env, ctx) {
  const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
  const resolved = await resolveRecipient(env, message.to);
  if (resolved.disabled) {
    message.setReject("550 5.1.1 This address is no longer active");
    return;
  }
  const userId = resolved.userId;
  const matchedAddress = resolved.address;
  if (!userId) {
    message.setReject("550 5.1.1 No such mailbox at estrogen.delivery");
    return;
  }

  const parsed = await PostalMime.parse(raw);
  const messageId = uuid();
  const user = await env.DB.prepare(
    "SELECT storage_used, pgp_enabled, pgp_public_key, settings_json FROM users WHERE id = ?",
  )
    .bind(userId)
    .first();
  let used = user?.storage_used || 0;
  let aiSpamEnabled = true;
  try {
    aiSpamEnabled = JSON.parse(user?.settings_json || "{}").aiSpam !== false;
  } catch {}

  const rawText = new TextDecoder().decode(raw);
  const alreadyPgp =
    rawText.includes("-----BEGIN PGP MESSAGE-----") ||
    (parsed.attachments || []).some((a) =>
      String(a.mimeType || "")
        .toLowerCase()
        .includes("application/pgp-encrypted"),
    ) ||
    String(parsed.text || "").includes("-----BEGIN PGP MESSAGE-----");

  const usePgp = !!(user?.pgp_enabled && user?.pgp_public_key);
  let pgpKey = null;
  if (usePgp) {
    try {
      pgpKey = await openpgp.readKey({ armoredKey: user.pgp_public_key });
    } catch {
      pgpKey = null;
    }
  }
  const pgpEncrypt = usePgp && !alreadyPgp && pgpKey;

  const encryptToPgpBytes = async (bytes) => {
    const message = await openpgp.createMessage({ binary: toBytes(bytes) });
    const armored = await openpgp.encrypt({ message, encryptionKeys: pgpKey });
    return new TextEncoder().encode(armored);
  };
  const encryptToPgpText = async (str) => {
    const message = await openpgp.createMessage({ text: String(str ?? "") });
    return openpgp.encrypt({ message, encryptionKeys: pgpKey });
  };

  const pgpFlag = usePgp && (alreadyPgp || pgpEncrypt) ? 1 : 0;

  const rKey = rawKey(userId, messageId);
  const rawToStore = pgpEncrypt ? await encryptToPgpBytes(raw) : raw;
  await env.R2.put(rKey, await encryptBytes(env, rawToStore), {
    httpMetadata: { contentType: "message/rfc822" },
  });
  used += raw.byteLength;

  const cidMap = {};
  const attRows = [];
  for (const att of parsed.attachments || []) {
    const attId = uuid();
    const body = att.content instanceof ArrayBuffer ? new Uint8Array(att.content) : att.content;
    const size = body?.byteLength || 0;
    const key = attKey(userId, attId, att.filename || "attachment");
    const attToStore = pgpEncrypt ? await encryptToPgpBytes(body) : body;
    await env.R2.put(key, await encryptBytes(env, attToStore), {
      httpMetadata: { contentType: att.mimeType || "application/octet-stream" },
    });
    used += size;
    const contentId = (att.contentId || "").replace(/^<|>$/g, "");
    const isInline = att.disposition === "inline" || !!contentId;
    if (contentId && !pgpEncrypt) cidMap[contentId] = `/api/attachments/${attId}/inline`;
    attRows.push({
      id: attId,
      filename: att.filename || "attachment",
      mime: att.mimeType || "application/octet-stream",
      size,
      key,
      contentId: contentId || null,
      isInline: isInline ? 1 : 0,
      status: "stored",
    });
  }

  let hKey = null;
  let hasHtml = 0;
  if (pgpFlag) {
    let armoredBody = "";
    if (alreadyPgp) {
      const m = rawText.match(/-----BEGIN PGP MESSAGE-----[\s\S]*?-----END PGP MESSAGE-----/);
      armoredBody = m?.[0] || parsed.text || rawText;
    } else if (parsed.html) {
      const sanitized = sanitizeEmailHtml(parsed.html, { allowRemote: true });
      armoredBody = await encryptToPgpText(sanitized);
      hasHtml = 1;
    } else {
      armoredBody = await encryptToPgpText(parsed.text || "");
    }
    hKey = htmlKey(userId, messageId);
    await env.R2.put(hKey, await encryptText(env, armoredBody), {
      httpMetadata: { contentType: "text/plain; charset=utf-8" },
    });
    used += armoredBody.length;
  } else if (parsed.html) {
    const sanitized = sanitizeEmailHtml(parsed.html, { cidMap, allowRemote: true });
    hKey = htmlKey(userId, messageId);
    await env.R2.put(hKey, await encryptText(env, sanitized), {
      httpMetadata: { contentType: "text/html; charset=utf-8" },
    });
    used += sanitized.length;
    hasHtml = 1;
  }

  const inReplyTo = (message.headers.get("in-reply-to") || parsed.inReplyTo || "").trim() || null;
  const refs = refsToList(message.headers.get("references") || parsed.references);
  const threadId = (await resolveThread(env, userId, inReplyTo, refs)) || messageId;

  const fromAddr = normalizeAddr(parsed.from?.address || message.from);
  const fromName = parsed.from?.name || "";
  const date = parsed.date ? new Date(parsed.date).getTime() || now() : now();

  const headerSep = rawText.search(/\r?\n\r?\n/);
  const headerBlock = headerSep === -1 ? rawText : rawText.slice(0, headerSep);
  const auth = evaluateAuth(headerBlock);
  const spoofed = auth.status === "fail";
  let folder = spoofed ? "spam" : "inbox";
  console.log("inbound auth", fromAddr, "->", JSON.stringify(auth), spoofed ? "SPOOFED->spam" : "");

  const toList = (parsed.to || []).map((a) => ({
    name: a.name || "",
    address: normalizeAddr(a.address),
  }));
  let snippetEnc = null;
  if (pgpEncrypt) {
    const plainSnippet = snippetFrom(parsed.text || parsed.html?.replace(/<[^>]+>/g, " ") || "");
    if (plainSnippet) snippetEnc = await encryptToPgpText(plainSnippet);
  }

  let filterRead = 0;
  let filterStar = 0;
  let autoLabels = [];
  if (!spoofed) {
    const applied = await applyFilters(env, userId, {
      fromAddr,
      fromName,
      to: toList,
      subject: parsed.subject || "",
    });
    if (applied.folder) folder = applied.folder;
    if (applied.read) filterRead = 1;
    if (applied.star) filterStar = 1;

    const ruled = await env.DB.prepare(
      "SELECT id, rule_json FROM labels WHERE user_id = ? AND rule_json IS NOT NULL",
    )
      .bind(userId)
      .all();
    const bodyText = parsed.text || parsed.html?.replace(/<[^>]+>/g, " ") || "";
    autoLabels = labelsForMessage(ruled.results || [], {
      fromAddr,
      fromName,
      to: toList.map((t) => `${t.name || ""} ${t.address || ""}`).join(" "),
      subject: parsed.subject || "",
      body: bodyText,
    });

    if (folder === "inbox" && aiSpamEnabled) {
      const verdict = await classifySpam(env, {
        from: `${fromName} <${fromAddr}>`,
        subject: parsed.subject || "",
        text: bodyText,
      });
      if (verdict?.spam && verdict.score >= 0.7) {
        folder = "spam";
        console.log("ai-spam", fromAddr, verdict.score, verdict.reason);
      }
    }
  }

  await insertMessage(env, {
    id: messageId,
    user_id: userId,
    thread_id: threadId,
    rfc_message_id: parsed.messageId || message.headers.get("message-id") || null,
    in_reply_to: inReplyTo,
    refs: refs.join(" "),
    folder,
    auth_status: auth.status,
    auth_detail: JSON.stringify({
      spf: auth.spf,
      dkim: auth.dkim,
      dmarc: auth.dmarc,
      envelopeFrom: message.from,
    }),
    from_addr: fromAddr,
    from_name: fromName,
    to: toList,
    cc: (parsed.cc || []).map((a) => ({ name: a.name || "", address: normalizeAddr(a.address) })),
    reply_to: normalizeAddr(parsed.replyTo?.[0]?.address || ""),
    subject: parsed.subject || "(no subject)",
    snippet: pgpFlag
      ? "Encrypted message"
      : snippetFrom(parsed.text || parsed.html?.replace(/<[^>]+>/g, " ") || ""),
    snippet_enc: snippetEnc,
    body_text: pgpFlag ? "" : parsed.text || "",
    has_html: hasHtml,
    date,
    received_at: now(),
    is_read: filterRead,
    is_starred: filterStar,
    has_attachments: attRows.some((a) => !a.isInline) ? 1 : 0,
    size: raw.byteLength,
    raw_key: rKey,
    html_key: hKey,
    pgp: pgpFlag,
  });

  for (const a of attRows) {
    await env.DB.prepare(
      "INSERT INTO attachments (id, message_id, user_id, filename, mime, size, r2_key, content_id, is_inline, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        a.id,
        messageId,
        userId,
        a.filename,
        a.mime,
        a.size,
        a.key,
        a.contentId,
        a.isInline,
        a.status,
        now(),
      )
      .run();
  }

  for (const label of autoLabels) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO message_labels (message_id, label_id) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM labels WHERE id = ? AND user_id = ?)",
    )
      .bind(messageId, label.id, label.id, userId)
      .run();
  }

  await updateStorage(env, userId, used - (user?.storage_used || 0));
  ctx.waitUntil(bumpContact(env, userId, fromAddr, fromName));
  if (matchedAddress) {
    ctx.waitUntil(
      env.DB.prepare(
        "UPDATE addresses SET recv_count = recv_count + 1, last_seen = ? WHERE address = ?",
      )
        .bind(now(), matchedAddress)
        .run(),
    );
  }

  if (folder !== "spam") {
    ctx.waitUntil(
      sendPush(env, userId, {
        title: fromName || fromAddr,
        body: parsed.subject || "(no subject)",
        url: "/",
      }),
    );
  }
}
