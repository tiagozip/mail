import { encryptText, tryDecryptBytes } from "./crypto.js";
import { sanitizeEmailHtml, textToHtml } from "./sanitize.js";
import { bumpContact, htmlKey, insertMessage, resolveThread, updateStorage } from "./store.js";
import { isValidEmail, normalizeAddr, now, snippetFrom, uuid } from "./util.js";

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function checkSendLimit(env, userId) {
  const limit = Number.parseInt(env.DAILY_SEND_LIMIT || "200", 10);
  const key = `send:${userId}:${dayKey()}`;
  const current = Number.parseInt((await env.KV.get(key)) || "0", 10);
  if (current >= limit) return false;
  await env.KV.put(key, String(current + 1), { expirationTtl: 90000 });
  return true;
}

export async function sendMessage(env, user, payload) {
  const to = (payload.to || []).map(normalizeAddr).filter(isValidEmail);
  const cc = (payload.cc || []).map(normalizeAddr).filter(isValidEmail);
  const bcc = (payload.bcc || []).map(normalizeAddr).filter(isValidEmail);
  if (to.length + cc.length + bcc.length === 0) throw new Error("no valid recipients");
  if (to.length + cc.length + bcc.length > 50) throw new Error("too many recipients (max 50)");

  if (!(await checkSendLimit(env, user.id))) {
    const e = new Error("daily send limit reached");
    e.code = "E_DAILY_LIMIT";
    throw e;
  }

  const attIds = payload.attachmentIds || [];
  const attachments = [];
  const attRows = [];
  for (const id of attIds) {
    const row = await env.DB.prepare(
      "SELECT * FROM attachments WHERE id = ? AND user_id = ? AND message_id IS NULL",
    )
      .bind(id, user.id)
      .first();
    if (!row) continue;
    const obj = await env.R2.get(row.r2_key);
    if (!obj) continue;
    const buf = await tryDecryptBytes(env, await obj.arrayBuffer());
    attachments.push({
      content: buf,
      filename: row.filename,
      type: row.mime,
      disposition: "attachment",
    });
    attRows.push(row);
  }

  let fromAddr = user.address;
  if (payload.from) {
    const owned = await env.DB.prepare(
      "SELECT address FROM addresses WHERE address = ? AND user_id = ?",
    )
      .bind(normalizeAddr(payload.from), user.id)
      .first();
    if (owned) fromAddr = owned.address;
  }

  const subject = (payload.subject || "(no subject)").slice(0, 988);
  const text = payload.text || "";
  const html = payload.html
    ? sanitizeEmailHtml(payload.html, { allowRemote: true })
    : textToHtml(text);
  const signature = user.signature ? `\n\n${user.signature}` : "";

  const validMsgId = (v) => typeof v === "string" && /^<[^\s<>@]+@[^\s<>]+>$/.test(v.trim());
  const inReplyTo = validMsgId(payload.inReplyTo) ? payload.inReplyTo.trim() : null;
  const headers = {};
  const refs = [];
  if (inReplyTo) {
    headers["In-Reply-To"] = inReplyTo;
    refs.push(...(payload.references || []).filter(validMsgId).map((r) => r.trim()), inReplyTo);
    if (refs.length) headers.References = refs.slice(-20).join(" ");
  }

  const sendPayload = {
    to,
    from: { email: fromAddr, name: user.display_name || user.username },
    subject,
    text: text + signature,
    html,
  };
  if (cc.length) sendPayload.cc = cc;
  if (bcc.length) sendPayload.bcc = bcc;
  if (Object.keys(headers).length) sendPayload.headers = headers;
  if (attachments.length) sendPayload.attachments = attachments;

  const result = await env.EMAIL.send(sendPayload);

  const messageId = uuid();
  const rfcId = `<${messageId}@${env.MAIL_DOMAIN}>`;
  const threadId = (await resolveThread(env, user.id, inReplyTo, refs)) || messageId;

  let hKey = null;
  if (html) {
    hKey = htmlKey(user.id, messageId);
    await env.R2.put(hKey, await encryptText(env, sanitizeEmailHtml(html, { allowRemote: true })), {
      httpMetadata: { contentType: "text/html; charset=utf-8" },
    });
  }

  await insertMessage(env, {
    id: messageId,
    user_id: user.id,
    thread_id: threadId,
    rfc_message_id: rfcId,
    in_reply_to: inReplyTo,
    refs: refs.join(" "),
    folder: "sent",
    from_addr: fromAddr,
    from_name: user.display_name || user.username,
    to: to.map((a) => ({ name: "", address: a })),
    cc: cc.map((a) => ({ name: "", address: a })),
    bcc: bcc.map((a) => ({ name: "", address: a })),
    subject,
    snippet: snippetFrom(text || html.replace(/<[^>]+>/g, " ")),
    body_text: text,
    has_html: html ? 1 : 0,
    date: now(),
    received_at: now(),
    is_read: 1,
    has_attachments: attRows.length ? 1 : 0,
    size: text.length + html.length,
    html_key: hKey,
  });

  let attBytes = 0;
  for (const row of attRows) {
    await env.DB.prepare("UPDATE attachments SET message_id = ?, status = 'stored' WHERE id = ?")
      .bind(messageId, row.id)
      .run();
    attBytes += row.size || 0;
  }
  await updateStorage(env, user.id, attBytes + (hKey ? html.length : 0));

  for (const addr of [...to, ...cc]) await bumpContact(env, user.id, addr, "");

  return { id: messageId, threadId, messageId: result?.messageId || rfcId };
}
