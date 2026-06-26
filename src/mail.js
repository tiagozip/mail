import * as openpgp from "openpgp";
import PostalMime from "postal-mime";
import { encryptBytes, encryptText } from "./crypto.js";
import { sanitizeEmailHtml } from "./sanitize.js";
import {
  attKey,
  bumpContact,
  htmlKey,
  insertMessage,
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

async function resolveRecipient(env, to) {
  const addr = normalizeAddr(to);
  const direct = await env.DB.prepare("SELECT user_id FROM addresses WHERE address = ?")
    .bind(addr)
    .first();
  if (direct?.user_id) return direct.user_id;
  const catchAll = await env.DB.prepare(
    "SELECT id FROM users WHERE is_admin = 1 AND json_extract(settings_json, '$.catchAll') = 1 ORDER BY created_at LIMIT 1",
  ).first();
  return catchAll?.id || null;
}

export async function handleEmail(message, env, ctx) {
  const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
  const userId = await resolveRecipient(env, message.to);
  if (!userId) {
    message.setReject("550 5.1.1 No such mailbox at estrogen.delivery");
    return;
  }

  const parsed = await PostalMime.parse(raw);
  const messageId = uuid();
  const user = await env.DB.prepare(
    "SELECT storage_used, pgp_enabled, pgp_public_key FROM users WHERE id = ?",
  )
    .bind(userId)
    .first();
  let used = user?.storage_used || 0;

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

  await insertMessage(env, {
    id: messageId,
    user_id: userId,
    thread_id: threadId,
    rfc_message_id: parsed.messageId || message.headers.get("message-id") || null,
    in_reply_to: inReplyTo,
    refs: refs.join(" "),
    folder: "inbox",
    from_addr: fromAddr,
    from_name: fromName,
    to: (parsed.to || []).map((a) => ({ name: a.name || "", address: normalizeAddr(a.address) })),
    cc: (parsed.cc || []).map((a) => ({ name: a.name || "", address: normalizeAddr(a.address) })),
    reply_to: normalizeAddr(parsed.replyTo?.[0]?.address || ""),
    subject: parsed.subject || "(no subject)",
    snippet: pgpFlag
      ? "PGP encrypted message"
      : snippetFrom(parsed.text || parsed.html?.replace(/<[^>]+>/g, " ") || ""),
    body_text: pgpFlag ? "" : parsed.text || "",
    has_html: hasHtml,
    date,
    received_at: now(),
    is_read: 0,
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

  await updateStorage(env, userId, used - (user?.storage_used || 0));
  ctx.waitUntil(bumpContact(env, userId, fromAddr, fromName));
}
