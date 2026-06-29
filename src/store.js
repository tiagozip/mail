import { now, snippetFrom, uuid } from "./util.js";

export const FOLDERS = ["inbox", "sent", "drafts", "archive", "trash", "spam"];
export const FILTER_FIELDS = ["from", "to", "subject"];
export const FILTER_ACTIONS = ["read", "archive", "star", "spam"];
export const LABEL_RULE_FIELDS = ["from", "to", "subject", "body"];
export const LABEL_RULE_OPS = ["contains", "is", "startsWith"];

export function validateLabelRule(rule) {
  if (!rule || typeof rule !== "object") return null;
  const match = rule.match === "any" ? "any" : "all";
  const conditions = [];
  for (const c of Array.isArray(rule.conditions) ? rule.conditions : []) {
    if (!c || typeof c !== "object") return false;
    if (!LABEL_RULE_FIELDS.includes(c.field)) return false;
    if (!LABEL_RULE_OPS.includes(c.op)) return false;
    const value = String(c.value ?? "").trim();
    if (!value) return false;
    conditions.push({ field: c.field, op: c.op, value: value.slice(0, 500) });
    if (conditions.length > 10) return false;
  }
  if (conditions.length === 0) return null;
  return { match, conditions };
}

function matchOp(op, hay, needle) {
  if (op === "is") return hay === needle;
  if (op === "startsWith") return hay.startsWith(needle);
  return hay.includes(needle);
}

export function labelsForMessage(labels, msg) {
  const fields = {
    from: `${msg.fromName || ""} ${msg.fromAddr || ""}`.trim().toLowerCase(),
    to: String(msg.to || "")
      .trim()
      .toLowerCase(),
    subject: String(msg.subject || "")
      .trim()
      .toLowerCase(),
    body: String(msg.body || "")
      .trim()
      .toLowerCase(),
  };
  const out = [];
  for (const label of labels || []) {
    let rule = label.rule;
    if (rule == null && typeof label.rule_json === "string") {
      try {
        rule = JSON.parse(label.rule_json);
      } catch {
        rule = null;
      }
    }
    const conditions = Array.isArray(rule?.conditions) ? rule.conditions : [];
    if (conditions.length === 0) continue;
    const match = rule.match === "any" ? "any" : "all";
    const results = conditions.map((c) =>
      matchOp(c.op, fields[c.field] ?? "", String(c.value || "").toLowerCase()),
    );
    const hit = match === "any" ? results.some(Boolean) : results.every(Boolean);
    if (hit) out.push(label);
  }
  return out;
}

export async function applyFilters(env, userId, ctx) {
  const res = await env.DB.prepare(
    "SELECT field, match_value, action FROM filters WHERE user_id = ? ORDER BY position, created_at",
  )
    .bind(userId)
    .all();
  const rules = res.results || [];
  const fields = {
    from: `${ctx.fromName || ""} ${ctx.fromAddr || ""}`.toLowerCase(),
    to: (ctx.to || [])
      .map((t) => `${t.name || ""} ${t.address || ""}`)
      .join(" ")
      .toLowerCase(),
    subject: String(ctx.subject || "").toLowerCase(),
  };
  const out = { folder: null, read: false, star: false };
  for (const rule of rules) {
    const needle = String(rule.match_value || "")
      .trim()
      .toLowerCase();
    if (!needle) continue;
    const hay = fields[rule.field];
    if (hay === undefined || !hay.includes(needle)) continue;
    if (rule.action === "read") out.read = true;
    else if (rule.action === "star") out.star = true;
    else if (rule.action === "archive") out.folder = "archive";
    else if (rule.action === "spam") out.folder = "spam";
  }
  return out;
}

export function rawKey(userId, messageId) {
  return `raw/${userId}/${messageId}.eml`;
}
export function htmlKey(userId, messageId) {
  return `html/${userId}/${messageId}.html`;
}
export function attKey(userId, attachmentId, filename) {
  const safe = String(filename || "file")
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 100);
  return `att/${userId}/${attachmentId}/${safe}`;
}

export async function recordChange(env, userId, messageId, kind) {
  if (!userId || !messageId) return;
  await env.DB.prepare("INSERT INTO mailbox_changes (user_id, message_id, kind, ts) VALUES (?,?,?,?)")
    .bind(userId, messageId, kind, now())
    .run();
}

export async function recordChanges(env, userId, messageIds, kind) {
  const ids = [...new Set((messageIds || []).filter(Boolean))];
  if (!ids.length) return;
  const ts = now();
  await env.DB.batch(
    ids.map((id) =>
      env.DB.prepare(
        "INSERT INTO mailbox_changes (user_id, message_id, kind, ts) VALUES (?,?,?,?)",
      ).bind(userId, id, kind, ts),
    ),
  );
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
    snippet_enc: row.snippet_enc || null,
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
    auth_status: row.auth_status || "none",
    auth_detail: row.auth_detail || null,
    created_at: now(),
  };
  await env.DB.prepare(
    `INSERT INTO messages (id,user_id,thread_id,rfc_message_id,in_reply_to,refs,folder,from_addr,from_name,to_json,cc_json,bcc_json,reply_to,subject,snippet,snippet_enc,body_text,has_html,date,received_at,is_read,is_starred,is_draft,has_attachments,size,raw_key,html_key,pgp,auth_status,auth_detail,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
      m.snippet_enc,
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
      m.auth_status,
      m.auth_detail,
      m.created_at,
    )
    .run();
  await env.DB.prepare(
    "INSERT INTO messages_fts (mid, uid, subject, sender, body) VALUES (?,?,?,?,?)",
  )
    .bind(m.id, m.user_id, m.subject, `${m.from_name} ${m.from_addr}`, m.body_text)
    .run();
  await recordChange(env, m.user_id, m.id, "upsert");
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
  await recordChange(env, userId, messageId, "delete");
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
