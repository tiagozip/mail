import { now, snippetFrom, uuid } from "./util.js";

export const FOLDERS = ["inbox", "sent", "drafts", "archive", "trash", "spam"];

export function rawKey(userId, messageId) {
  return `raw/${userId}/${messageId}.eml`;
}
export function htmlKey(userId, messageId) {
  return `html/${userId}/${messageId}.html`;
}
export function attKey(userId, attachmentId, filename) {
  const safe = String(filename || "file")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 100);
  return `att/${userId}/${attachmentId}/${safe}`;
}

export async function resolveThread(env, userId, inReplyTo, refs) {
  const candidates = [];
  if (inReplyTo) candidates.push(inReplyTo);
  for (const r of refs) candidates.push(r);
  for (const mid of candidates) {
    if (!mid) continue;
    const row = await env.DB.prepare(
      "SELECT thread_id FROM messages WHERE user_id = ? AND rfc_message_id = ? LIMIT 1",
    )
      .bind(userId, mid)
      .first();
    if (row?.thread_id) return row.thread_id;
  }
  return null;
}

export async function insertMessage(env, row) {
  const m = {
    id: row.id || uuid(),
    user_id: row.user_id,
    thread_id: row.thread_id,
    rfc_message_id: row.rfc_message_id || null,
    in_reply_to: row.in_reply_to || null,
    refs: row.refs || "",
    folder: row.folder || "inbox",
    from_addr: row.from_addr || "",
    from_name: row.from_name || "",
    to_json: JSON.stringify(row.to || []),
    cc_json: JSON.stringify(row.cc || []),
    bcc_json: JSON.stringify(row.bcc || []),
    reply_to: row.reply_to || "",
    subject: row.subject || "",
    snippet: snippetFrom(row.snippet ?? row.body_text ?? ""),
    body_text: (row.body_text || "").slice(0, 200000),
    has_html: row.has_html ? 1 : 0,
    date: row.date || now(),
    received_at: row.received_at || now(),
    is_read: row.is_read ? 1 : 0,
    is_starred: row.is_starred ? 1 : 0,
    is_draft: row.is_draft ? 1 : 0,
    has_attachments: row.has_attachments ? 1 : 0,
    size: row.size || 0,
    raw_key: row.raw_key || null,
    html_key: row.html_key || null,
    pgp: row.pgp ? 1 : 0,
    created_at: now(),
  };
  await env.DB.prepare(
    `INSERT INTO messages (id,user_id,thread_id,rfc_message_id,in_reply_to,refs,folder,from_addr,from_name,to_json,cc_json,bcc_json,reply_to,subject,snippet,body_text,has_html,date,received_at,is_read,is_starred,is_draft,has_attachments,size,raw_key,html_key,pgp,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      m.id,
      m.user_id,
      m.thread_id,
      m.rfc_message_id,
      m.in_reply_to,
      m.refs,
      m.folder,
      m.from_addr,
      m.from_name,
      m.to_json,
      m.cc_json,
      m.bcc_json,
      m.reply_to,
      m.subject,
      m.snippet,
      m.body_text,
      m.has_html,
      m.date,
      m.received_at,
      m.is_read,
      m.is_starred,
      m.is_draft,
      m.has_attachments,
      m.size,
      m.raw_key,
      m.html_key,
      m.pgp,
      m.created_at,
    )
    .run();
  await env.DB.prepare(
    "INSERT INTO messages_fts (mid, uid, subject, sender, body) VALUES (?,?,?,?,?)",
  )
    .bind(m.id, m.user_id, m.subject, `${m.from_name} ${m.from_addr}`, m.body_text)
    .run();
  return m;
}

export async function deleteMessageRow(env, userId, messageId) {
  const atts = await env.DB.prepare(
    "SELECT id, r2_key, size FROM attachments WHERE message_id = ? AND user_id = ?",
  )
    .bind(messageId, userId)
    .all();
  let freed = 0;
  for (const a of atts.results || []) {
    await env.R2.delete(a.r2_key).catch(() => {});
    freed += a.size || 0;
  }
  const msg = await env.DB.prepare(
    "SELECT raw_key, html_key, size FROM messages WHERE id = ? AND user_id = ?",
  )
    .bind(messageId, userId)
    .first();
  if (msg?.raw_key) await env.R2.delete(msg.raw_key).catch(() => {});
  if (msg?.html_key) await env.R2.delete(msg.html_key).catch(() => {});
  await env.DB.batch([
    env.DB.prepare("DELETE FROM attachments WHERE message_id = ?").bind(messageId),
    env.DB.prepare("DELETE FROM messages_fts WHERE mid = ?").bind(messageId),
    env.DB.prepare("DELETE FROM messages WHERE id = ? AND user_id = ?").bind(messageId, userId),
  ]);
  await updateStorage(env, userId, -(freed + (msg?.size || 0)));
}

export async function updateStorage(env, userId, delta) {
  if (!delta) return;
  await env.DB.prepare("UPDATE users SET storage_used = MAX(0, storage_used + ?) WHERE id = ?")
    .bind(delta, userId)
    .run();
}

export async function bumpContact(env, userId, address, name) {
  if (!address) return;
  await env.DB.prepare(
    `INSERT INTO contacts (user_id, address, name, count, last_seen) VALUES (?,?,?,1,?)
     ON CONFLICT(user_id, address) DO UPDATE SET count = count + 1, last_seen = excluded.last_seen,
       name = CASE WHEN excluded.name != '' THEN excluded.name ELSE contacts.name END`,
  )
    .bind(userId, address, name || "", now())
    .run();
}

export async function userStorageQuota(env) {
  return Number.parseInt(env.USER_STORAGE_QUOTA || "524288000", 10);
}
