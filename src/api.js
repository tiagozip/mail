import * as openpgp from "openpgp";
import {
  authenticate,
  clearCookie,
  createSession,
  destroySession,
  requireOrigin,
  sessionCookie,
  sha256Hex,
} from "./auth.js";
import { encryptBytes, tryDecryptBytes, tryDecryptText } from "./crypto.js";
import {
  authorizeUrl,
  challengeFor,
  endSessionUrl,
  exchangeCode,
  randomVerifier,
  userInfo,
  verifyIdToken,
} from "./oidc.js";
import { sanitizeEmailHtml, stripTrackers } from "./sanitize.js";
import { sendMessage } from "./send.js";
import {
  attKey,
  deleteMessageRow,
  FILTER_ACTIONS,
  FILTER_FIELDS,
  FOLDERS,
  insertMessage,
  updateStorage,
} from "./store.js";
import {
  clampInt,
  error,
  json,
  normalizeAddr,
  now,
  randomToken,
  snippetFrom,
  uuid,
} from "./util.js";

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function isSecure(request) {
  return new URL(request.url).protocol === "https:";
}

const AVATAR_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/avif",
]);

const INLINE_SAFE_TYPES = new Set([
  ...AVATAR_TYPES,
  "image/bmp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "application/pdf",
]);

function listItem(row) {
  return {
    id: row.id,
    threadId: row.thread_id,
    folder: row.folder,
    from: { address: row.from_addr, name: row.from_name },
    to: JSON.parse(row.to_json || "[]"),
    subject: row.subject,
    snippet: row.snippet,
    date: row.date,
    isRead: !!row.is_read,
    isStarred: !!row.is_starred,
    isDraft: !!row.is_draft,
    hasAttachments: !!row.has_attachments,
    pgp: !!row.pgp,
    authStatus: row.auth_status || "none",
  };
}

async function withLabels(env, userId, items) {
  if (!items.length) return items;
  const ids = items.map((i) => i.id);
  const ph = ids.map(() => "?").join(",");
  const res = await env.DB.prepare(
    `SELECT ml.message_id, l.id, l.name, l.color FROM message_labels ml JOIN labels l ON l.id = ml.label_id WHERE l.user_id = ? AND ml.message_id IN (${ph})`,
  )
    .bind(userId, ...ids)
    .all();
  const byMsg = {};
  for (const r of res.results || []) {
    (byMsg[r.message_id] ||= []).push({ id: r.id, name: r.name, color: r.color });
  }
  for (const i of items) i.labels = byMsg[i.id] || [];
  return items;
}

async function attachSenderAvatars(env, items) {
  const list = (items || []).filter(Boolean);
  const addrs = [...new Set(list.map((i) => i.from?.address).filter(Boolean))];
  if (!addrs.length) return items;
  const ph = addrs.map(() => "?").join(",");
  const res = await env.DB.prepare(
    `SELECT a.address, u.avatar_url FROM addresses a JOIN users u ON u.id = a.user_id WHERE a.address IN (${ph}) AND u.avatar_url IS NOT NULL`,
  )
    .bind(...addrs)
    .all();
  const map = {};
  for (const r of res.results || []) map[r.address] = r.avatar_url;
  for (const i of list) {
    if (i.from?.address && map[i.from.address]) i.from.avatar = map[i.from.address];
  }
  return items;
}

function redirectTo(dest, extraHeaders) {
  const headers = new Headers(extraHeaders || {});
  headers.set("location", dest);
  return new Response(null, { status: 302, headers });
}

async function oidcLogin(request, env) {
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/auth/callback`;
  const state = randomToken(16);
  const nonce = randomToken(16);
  const verifier = randomVerifier();
  const challenge = await challengeFor(verifier);
  await env.KV.put(`oauthflow:${state}`, JSON.stringify({ verifier, nonce, redirectUri }), {
    expirationTtl: 600,
  });
  const dest = await authorizeUrl(env, { redirectUri, state, nonce, challenge });
  return redirectTo(dest);
}

async function oidcCallback(request, env) {
  const url = new URL(request.url);
  const home = `${url.origin}/`;
  const params = url.searchParams;
  const errParam = params.get("error");
  if (errParam) return redirectTo(`${home}?auth_error=${encodeURIComponent(errParam)}`);
  const state = params.get("state");
  const code = params.get("code");
  if (!state || !code) return redirectTo(`${home}?auth_error=invalid_request`);
  const raw = await env.KV.get(`oauthflow:${state}`);
  if (!raw) return redirectTo(`${home}?auth_error=expired`);
  await env.KV.delete(`oauthflow:${state}`);
  const flow = JSON.parse(raw);
  try {
    const tokens = await exchangeCode(env, {
      code,
      redirectUri: flow.redirectUri,
      verifier: flow.verifier,
    });
    const verified = await verifyIdToken(env, tokens.id_token, flow.nonce);
    const claims = await userInfo(env, tokens.access_token);
    if (String(claims.sub) !== String(verified.sub)) throw new Error("sub mismatch");
    const user = await upsertOidcUser(env, { ...claims, sub: verified.sub });
    const token = await createSession(env, user.id, { idToken: tokens.id_token || null });
    return redirectTo(home, { "set-cookie": sessionCookie(token, isSecure(request)) });
  } catch (e) {
    console.error("oidc callback error", e?.stack || e);
    return redirectTo(`${home}?auth_error=signin_failed`);
  }
}

async function upsertOidcUser(env, claims) {
  const sub = String(claims.sub);
  const base = claims.preferred_username || claims.email?.split("@")[0] || sub;
  const username = normalizeAddr(base).replace(/[^a-z0-9._-]/g, "") || `user${sub.slice(0, 8)}`;
  const displayName = String(claims.name || username).slice(0, 80);
  const email = claims.email || "";
  const picture = typeof claims.picture === "string" ? claims.picture : "";
  const groups = Array.isArray(claims.groups) ? claims.groups : [];
  const adminFromGroup = !!env.ADMIN_GROUP && groups.includes(env.ADMIN_GROUP);

  const existing = await env.DB.prepare("SELECT * FROM users WHERE oidc_sub = ?").bind(sub).first();
  if (existing) {
    const isAdmin = adminFromGroup || existing.is_admin ? 1 : 0;
    const avatar = existing.avatar_url || picture || null;
    await env.DB.prepare(
      "UPDATE users SET display_name = ?, email = ?, is_admin = ?, avatar_url = ?, last_login = ? WHERE id = ?",
    )
      .bind(displayName, email, isAdmin, avatar, now(), existing.id)
      .run();
    return { ...existing, display_name: displayName, email, is_admin: isAdmin, avatar_url: avatar };
  }

  const countRow = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
  const firstUser = (countRow?.n || 0) === 0;
  const isAdmin = adminFromGroup || firstUser ? 1 : 0;
  const address = `${username}@${env.MAIL_DOMAIN}`;
  const id = uuid();
  const ts = now();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO users (id, oidc_sub, username, address, email, display_name, is_admin, avatar_url, created_at, last_login) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).bind(id, sub, username, address, email, displayName, isAdmin, picture || null, ts, ts),
    env.DB.prepare(
      "INSERT INTO addresses (address, user_id, is_primary, created_at) VALUES (?,?,1,?)",
    ).bind(address, id, ts),
  ]);
  return env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
}

const ALIAS_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const ALIAS_LIMIT = 100;
const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const CF_MX_RE = /(?:^|\.)mx\.cloudflare\.net\.?$/;

async function lookupMx(domain) {
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

async function verifiedDomainSet(env) {
  const set = new Set([String(env.MAIL_DOMAIN || "").toLowerCase()]);
  const res = await env.DB.prepare("SELECT domain FROM domains WHERE verified = 1").all();
  for (const r of res.results || []) set.add(String(r.domain).toLowerCase());
  set.delete("");
  return set;
}

async function listAddresses(env, userId) {
  const res = await env.DB.prepare(
    "SELECT address, is_primary FROM addresses WHERE user_id = ? ORDER BY is_primary DESC, address",
  )
    .bind(userId)
    .all();
  return (res.results || []).map((r) => ({ address: r.address, isPrimary: !!r.is_primary }));
}

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    address: u.address,
    email: u.email || "",
    displayName: u.display_name,
    isAdmin: !!u.is_admin,
    signature: u.signature || "",
    settings: JSON.parse(u.settings_json || "{}"),
    storageUsed: u.storage_used || 0,
    avatarUrl: u.avatar_url || null,
    pgpEnabled: !!u.pgp_enabled,
  };
}

async function folderCounts(env, userId) {
  const res = await env.DB.prepare(
    "SELECT folder, COUNT(*) AS total, SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread FROM messages WHERE user_id = ? GROUP BY folder",
  )
    .bind(userId)
    .all();
  const counts = {};
  for (const f of FOLDERS) counts[f] = { total: 0, unread: 0 };
  for (const r of res.results || []) counts[r.folder] = { total: r.total, unread: r.unread || 0 };
  const starred = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND is_starred = 1 AND folder != 'trash'",
  )
    .bind(userId)
    .first();
  counts.starred = { total: starred?.n || 0, unread: 0 };
  return counts;
}

async function listMessages(request, env, user) {
  const url = new URL(request.url);
  const folder = url.searchParams.get("folder") || "inbox";
  const q = (url.searchParams.get("q") || "").trim();
  const labelId = url.searchParams.get("label");
  const starred = url.searchParams.get("starred") === "1";
  const limit = clampInt(url.searchParams.get("limit"), 1, 100, 50);
  const cursor = url.searchParams.get("cursor");

  const where = ["m.user_id = ?"];
  const binds = [user.id];

  if (q) {
    const term = q.replace(/[^\w\s@.-]/g, " ").trim();
    if (!term) return json({ messages: [], nextCursor: null });
    let ftsIds;
    try {
      ftsIds = await env.DB.prepare(
        "SELECT mid FROM messages_fts WHERE uid = ? AND messages_fts MATCH ? LIMIT 300",
      )
        .bind(user.id, `"${term}"*`)
        .all();
    } catch {
      return json({ messages: [], nextCursor: null });
    }
    const ids = (ftsIds.results || []).map((r) => r.mid);
    if (!ids.length) return json({ messages: [], nextCursor: null });
    where.push(`m.id IN (${ids.map(() => "?").join(",")})`);
    binds.push(...ids);
  } else if (starred) {
    where.push("m.is_starred = 1 AND m.folder != 'trash'");
  } else if (labelId) {
    where.push("m.id IN (SELECT message_id FROM message_labels WHERE label_id = ?)");
    binds.push(labelId);
  } else {
    where.push("m.folder = ?");
    binds.push(folder);
  }

  if (cursor) {
    const [cd, cid] = cursor.split("_");
    where.push("(m.date < ? OR (m.date = ? AND m.id < ?))");
    binds.push(Number.parseInt(cd, 10), Number.parseInt(cd, 10), cid);
  }

  const sql = `SELECT m.* FROM messages m WHERE ${where.join(" AND ")} ORDER BY m.date DESC, m.id DESC LIMIT ?`;
  const res = await env.DB.prepare(sql)
    .bind(...binds, limit + 1)
    .all();
  const rows = res.results || [];
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const items = await withLabels(env, user.id, page.map(listItem));
  await attachSenderAvatars(env, items);
  const last = page[page.length - 1];
  return json({
    messages: items,
    nextCursor: hasMore && last ? `${last.date}_${last.id}` : null,
  });
}

async function getMessage(env, user, id, allowRemote) {
  const row = await env.DB.prepare("SELECT * FROM messages WHERE id = ? AND user_id = ?")
    .bind(id, user.id)
    .first();
  if (!row) return null;
  const atts = await env.DB.prepare(
    "SELECT id, filename, mime, size, is_inline, content_id, status FROM attachments WHERE message_id = ? AND user_id = ?",
  )
    .bind(id, user.id)
    .all();
  if (row.pgp) {
    let armored = "";
    if (row.html_key) {
      const obj = await env.R2.get(row.html_key);
      if (obj) armored = await tryDecryptText(env, await obj.arrayBuffer());
    }
    return {
      ...listItem(row),
      cc: JSON.parse(row.cc_json || "[]"),
      bcc: JSON.parse(row.bcc_json || "[]"),
      replyTo: row.reply_to,
      rfcMessageId: row.rfc_message_id,
      inReplyTo: row.in_reply_to,
      references: row.refs ? row.refs.split(" ") : [],
      authDetail: row.auth_detail ? JSON.parse(row.auth_detail) : null,
      bodyText: armored,
      bodyHtml: null,
      hasHtml: !!row.has_html,
      pgp: true,
      attachments: (atts.results || [])
        .filter((a) => !a.is_inline && a.status === "stored")
        .map((a) => ({ id: a.id, filename: a.filename, mime: a.mime, size: a.size, pgp: true })),
    };
  }

  let bodyHtml = null;
  let trackersBlocked = 0;
  if (row.html_key) {
    const obj = await env.R2.get(row.html_key);
    if (obj) {
      const html = await tryDecryptText(env, await obj.arrayBuffer());
      const tr = stripTrackers(html);
      trackersBlocked = tr.count;
      bodyHtml = sanitizeEmailHtml(tr.html, { allowRemote });
    }
  }
  return {
    ...listItem(row),
    cc: JSON.parse(row.cc_json || "[]"),
    bcc: JSON.parse(row.bcc_json || "[]"),
    replyTo: row.reply_to,
    rfcMessageId: row.rfc_message_id,
    inReplyTo: row.in_reply_to,
    references: row.refs ? row.refs.split(" ") : [],
    authDetail: row.auth_detail ? JSON.parse(row.auth_detail) : null,
    bodyText: row.body_text,
    bodyHtml,
    trackersBlocked,
    hasHtml: !!row.has_html,
    attachments: (atts.results || [])
      .filter((a) => !a.is_inline && a.status === "stored")
      .map((a) => ({ id: a.id, filename: a.filename, mime: a.mime, size: a.size })),
  };
}

async function markRead(env, user, ids, read) {
  const ph = ids.map(() => "?").join(",");
  await env.DB.prepare(`UPDATE messages SET is_read = ? WHERE user_id = ? AND id IN (${ph})`)
    .bind(read ? 1 : 0, user.id, ...ids)
    .run();
}

async function uploadAttachment(request, env, user) {
  const max = Number.parseInt(env.MAX_ATTACHMENT_BYTES || "26214400", 10);
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") return error(400, "no file");
  const size = file.size;
  if (size > max) return error(413, `file too large (max ${Math.floor(max / 1048576)} MiB)`);

  const id = uuid();
  const key = attKey(user.id, id, file.name || "file");
  const plain = new Uint8Array(await file.arrayBuffer());
  await env.R2.put(key, await encryptBytes(env, plain), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  await env.DB.prepare(
    "INSERT INTO attachments (id, message_id, user_id, filename, mime, size, r2_key, is_inline, status, created_at) VALUES (?,NULL,?,?,?,?,?,0,'pending',?)",
  )
    .bind(
      id,
      user.id,
      file.name || "file",
      file.type || "application/octet-stream",
      size,
      key,
      now(),
    )
    .run();
  await updateStorage(env, user.id, size);
  return json({ id, filename: file.name || "file", mime: file.type, size });
}

async function downloadAttachment(env, user, id, inline) {
  const row = await env.DB.prepare("SELECT * FROM attachments WHERE id = ? AND user_id = ?")
    .bind(id, user.id)
    .first();
  if (!row || row.status === "skipped") return error(404, "not found");
  const obj = await env.R2.get(row.r2_key);
  if (!obj) return error(404, "not found");
  const bytes = await tryDecryptBytes(env, await obj.arrayBuffer());
  const mime = (row.mime || "application/octet-stream").toLowerCase().split(";")[0].trim();
  const inlineOk = inline && INLINE_SAFE_TYPES.has(mime);
  const headers = new Headers();
  headers.set(
    "content-type",
    inlineOk ? mime : inline ? "application/octet-stream" : row.mime || "application/octet-stream",
  );
  headers.set("content-length", String(bytes.byteLength));
  headers.set("cache-control", "private, max-age=3600");
  const dispo = inlineOk ? "inline" : "attachment";
  const safeName = String(row.filename || "file")
    .replace(/[\r\n";\\]+/g, "_")
    .slice(0, 200);
  headers.set("content-disposition", `${dispo}; filename="${safeName}"`);
  return new Response(bytes, { headers });
}

async function saveDraft(request, env, user, draftId) {
  const body = await readJson(request);
  const to = (body.to || []).map(normalizeAddr).filter(Boolean);
  const cc = (body.cc || []).map(normalizeAddr).filter(Boolean);
  const bcc = (body.bcc || []).map(normalizeAddr).filter(Boolean);
  const subject = String(body.subject || "").slice(0, 988);
  const text = String(body.text || "");
  const ts = now();

  if (draftId) {
    const existing = await env.DB.prepare(
      "SELECT id FROM messages WHERE id = ? AND user_id = ? AND folder = 'drafts'",
    )
      .bind(draftId, user.id)
      .first();
    if (existing) {
      await env.DB.prepare(
        "UPDATE messages SET to_json=?, cc_json=?, bcc_json=?, subject=?, body_text=?, snippet=?, date=? WHERE id = ? AND user_id = ?",
      )
        .bind(
          JSON.stringify(to.map((a) => ({ address: a, name: "" }))),
          JSON.stringify(cc.map((a) => ({ address: a, name: "" }))),
          JSON.stringify(bcc.map((a) => ({ address: a, name: "" }))),
          subject,
          text,
          snippetFrom(text),
          ts,
          draftId,
          user.id,
        )
        .run();
      return json({ id: draftId });
    }
  }

  const id = uuid();
  await insertMessage(env, {
    id,
    user_id: user.id,
    thread_id: id,
    folder: "drafts",
    is_draft: 1,
    is_read: 1,
    from_addr: user.address,
    from_name: user.display_name || user.username,
    to: to.map((a) => ({ address: a, name: "" })),
    cc: cc.map((a) => ({ address: a, name: "" })),
    bcc: bcc.map((a) => ({ address: a, name: "" })),
    subject,
    snippet: snippetFrom(text),
    body_text: text,
    date: ts,
    received_at: ts,
  });
  return json({ id });
}

export async function handleApi(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/auth/login" && method === "GET") return oidcLogin(request, env);
  if (path === "/api/auth/callback" && method === "GET") return oidcCallback(request, env);

  const auth = await authenticate(request, env);
  if (!auth?.viaApiKey && !requireOrigin(request, env)) return error(403, "bad origin");
  if (path === "/api/me" && method === "GET") {
    if (!auth) return json({ user: null });
    const me = publicUser(auth.user);
    me.addresses = await listAddresses(env, auth.user.id);
    return json({ user: me });
  }
  if (!auth) return error(401, "not authenticated");
  const user = auth.user;

  if (path === "/api/auth/logout" && method === "POST") {
    const idToken = auth.session?.idToken || null;
    await destroySession(env, auth.token);
    const logoutUrl = await endSessionUrl(env, {
      idToken,
      redirectUri: new URL(request.url).origin,
    });
    return json(
      { ok: true, logoutUrl },
      { headers: { "set-cookie": clearCookie(isSecure(request)) } },
    );
  }

  if (path === "/api/folders" && method === "GET")
    return json({ counts: await folderCounts(env, user.id) });
  if (path === "/api/messages" && method === "GET") return listMessages(request, env, user);

  let m;
  if ((m = path.match(/^\/api\/threads\/([\w-]+)$/)) && method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT * FROM messages WHERE user_id = ? AND thread_id = ? ORDER BY date ASC",
    )
      .bind(user.id, m[1])
      .all();
    const out = [];
    for (const r of rows.results || []) out.push(await getMessage(env, user, r.id, false));
    const msgs = out.filter(Boolean);
    await attachSenderAvatars(env, msgs);
    const unreadIds = (rows.results || [])
      .filter((r) => !r.is_read && r.folder !== "sent")
      .map((r) => r.id);
    if (unreadIds.length) await markRead(env, user, unreadIds, true);
    return json({ messages: msgs });
  }

  if ((m = path.match(/^\/api\/messages\/([\w-]+)$/))) {
    if (method === "GET") {
      const allowRemote = url.searchParams.get("images") === "1";
      const msg = await getMessage(env, user, m[1], allowRemote);
      if (!msg) return error(404, "not found");
      if (!msg.isRead && msg.folder !== "sent") await markRead(env, user, [m[1]], true);
      await attachSenderAvatars(env, [msg]);
      return json({ message: msg });
    }
    if (method === "DELETE") {
      await deleteMessageRow(env, user.id, m[1]);
      return json({ ok: true });
    }
  }

  if ((m = path.match(/^\/api\/messages\/([\w-]+)\/raw$/)) && method === "GET") {
    const row = await env.DB.prepare(
      "SELECT raw_key, subject FROM messages WHERE id = ? AND user_id = ?",
    )
      .bind(m[1], user.id)
      .first();
    if (!row?.raw_key) return error(404, "no source available");
    const obj = await env.R2.get(row.raw_key);
    if (!obj) return error(404, "not found");
    const bytes = await tryDecryptBytes(env, await obj.arrayBuffer());
    const safeName =
      String(row.subject || "message")
        .replace(/[^\w.\- ]+/g, "_")
        .trim()
        .slice(0, 80) || "message";
    const headers = new Headers();
    headers.set("content-type", "message/rfc822");
    headers.set("content-length", String(bytes.byteLength));
    headers.set("content-disposition", `attachment; filename="${safeName}.eml"`);
    headers.set("cache-control", "private, no-store");
    return new Response(bytes, { headers });
  }

  if ((m = path.match(/^\/api\/messages\/([\w-]+)\/read$/)) && method === "POST") {
    const b = await readJson(request);
    await markRead(env, user, [m[1]], b.read !== false);
    return json({ ok: true });
  }
  if ((m = path.match(/^\/api\/messages\/([\w-]+)\/star$/)) && method === "POST") {
    const b = await readJson(request);
    await env.DB.prepare("UPDATE messages SET is_starred = ? WHERE id = ? AND user_id = ?")
      .bind(b.star !== false ? 1 : 0, m[1], user.id)
      .run();
    return json({ ok: true });
  }
  if ((m = path.match(/^\/api\/messages\/([\w-]+)\/move$/)) && method === "POST") {
    const b = await readJson(request);
    if (!FOLDERS.includes(b.folder)) return error(400, "bad folder");
    await env.DB.prepare("UPDATE messages SET folder = ? WHERE id = ? AND user_id = ?")
      .bind(b.folder, m[1], user.id)
      .run();
    return json({ ok: true });
  }
  if ((m = path.match(/^\/api\/messages\/([\w-]+)\/labels$/)) && method === "POST") {
    const owned = await env.DB.prepare("SELECT 1 FROM messages WHERE id = ? AND user_id = ?")
      .bind(m[1], user.id)
      .first();
    if (!owned) return error(404, "not found");
    const b = await readJson(request);
    for (const lid of b.add || []) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO message_labels (message_id, label_id) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM labels WHERE id = ? AND user_id = ?)",
      )
        .bind(m[1], lid, lid, user.id)
        .run();
    }
    for (const lid of b.remove || []) {
      await env.DB.prepare("DELETE FROM message_labels WHERE message_id = ? AND label_id = ?")
        .bind(m[1], lid)
        .run();
    }
    return json({ ok: true });
  }

  if (path === "/api/messages/bulk" && method === "POST") {
    const b = await readJson(request);
    const ids = (b.ids || []).filter(Boolean).slice(0, 200);
    if (!ids.length) return error(400, "no ids");
    const ph = ids.map(() => "?").join(",");
    if (b.action === "read") await markRead(env, user, ids, b.value !== false);
    else if (b.action === "star")
      await env.DB.prepare(`UPDATE messages SET is_starred = ? WHERE user_id = ? AND id IN (${ph})`)
        .bind(b.value !== false ? 1 : 0, user.id, ...ids)
        .run();
    else if (b.action === "move" && FOLDERS.includes(b.value))
      await env.DB.prepare(`UPDATE messages SET folder = ? WHERE user_id = ? AND id IN (${ph})`)
        .bind(b.value, user.id, ...ids)
        .run();
    else if (b.action === "delete") for (const id of ids) await deleteMessageRow(env, user.id, id);
    else return error(400, "bad action");
    return json({ ok: true, count: ids.length });
  }

  if (path === "/api/send" && method === "POST") {
    try {
      const b = await readJson(request);
      const result = await sendMessage(env, user, b);
      if (b.draftId) await deleteMessageRow(env, user.id, b.draftId);
      return json({ ok: true, ...result });
    } catch (e) {
      return error(400, e.message || "send failed", { code: e.code });
    }
  }

  if (path === "/api/drafts" && method === "POST") return saveDraft(request, env, user, null);
  if ((m = path.match(/^\/api\/drafts\/([\w-]+)$/)) && method === "PUT")
    return saveDraft(request, env, user, m[1]);

  if (path === "/api/attachments" && method === "POST") return uploadAttachment(request, env, user);
  if ((m = path.match(/^\/api\/attachments\/([\w-]+)\/inline$/)) && method === "GET")
    return downloadAttachment(env, user, m[1], true);
  if ((m = path.match(/^\/api\/attachments\/([\w-]+)$/))) {
    if (method === "GET") return downloadAttachment(env, user, m[1], false);
    if (method === "DELETE") {
      const row = await env.DB.prepare(
        "SELECT * FROM attachments WHERE id = ? AND user_id = ? AND message_id IS NULL",
      )
        .bind(m[1], user.id)
        .first();
      if (row) {
        await env.R2.delete(row.r2_key).catch(() => {});
        await env.DB.prepare("DELETE FROM attachments WHERE id = ?").bind(m[1]).run();
        await updateStorage(env, user.id, -(row.size || 0));
      }
      return json({ ok: true });
    }
  }

  if (path === "/api/avatar" && method === "POST") {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") return error(400, "no file");
    if (!AVATAR_TYPES.has(String(file.type || "").toLowerCase()))
      return error(400, "use a PNG, JPEG, GIF, WebP, or AVIF image");
    if (file.size > 3 * 1024 * 1024) return error(413, "image too large (max 3 MiB)");
    const key = `avatar/${user.id}`;
    await env.R2.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    const avatarUrl = `/api/avatar/${user.id}?v=${now()}`;
    await env.DB.prepare("UPDATE users SET avatar_url = ? WHERE id = ?")
      .bind(avatarUrl, user.id)
      .run();
    return json({ avatarUrl });
  }
  if (path === "/api/avatar" && method === "DELETE") {
    await env.R2.delete(`avatar/${user.id}`).catch(() => {});
    await env.DB.prepare("UPDATE users SET avatar_url = NULL WHERE id = ?").bind(user.id).run();
    return json({ ok: true });
  }
  if ((m = path.match(/^\/api\/avatar\/([\w-]+)$/)) && method === "GET") {
    const obj = await env.R2.get(`avatar/${m[1]}`);
    if (!obj) return error(404, "not found");
    const ct = (obj.httpMetadata?.contentType || "image/png").toLowerCase();
    const headers = new Headers();
    headers.set("content-type", AVATAR_TYPES.has(ct) ? ct : "application/octet-stream");
    headers.set("cache-control", "private, max-age=86400");
    return new Response(obj.body, { headers });
  }

  if (path === "/api/labels" && method === "GET") {
    const res = await env.DB.prepare(
      "SELECT id, name, color FROM labels WHERE user_id = ? ORDER BY name",
    )
      .bind(user.id)
      .all();
    return json({ labels: res.results || [] });
  }
  if (path === "/api/labels" && method === "POST") {
    const b = await readJson(request);
    const name = String(b.name || "")
      .trim()
      .slice(0, 40);
    if (!name) return error(400, "name required");
    const id = uuid();
    await env.DB.prepare(
      "INSERT INTO labels (id, user_id, name, color, created_at) VALUES (?,?,?,?,?)",
    )
      .bind(id, user.id, name, String(b.color || "#8b7fd6").slice(0, 9), now())
      .run();
    return json({ id, name, color: b.color || "#8b7fd6" });
  }
  if ((m = path.match(/^\/api\/labels\/([\w-]+)$/)) && method === "DELETE") {
    await env.DB.prepare("DELETE FROM labels WHERE id = ? AND user_id = ?")
      .bind(m[1], user.id)
      .run();
    return json({ ok: true });
  }

  if (path === "/api/filters" && method === "GET") {
    const res = await env.DB.prepare(
      "SELECT id, field, match_value, action, position FROM filters WHERE user_id = ? ORDER BY position, created_at",
    )
      .bind(user.id)
      .all();
    return json({ filters: res.results || [] });
  }
  if (path === "/api/filters" && method === "POST") {
    const b = await readJson(request);
    const field = FILTER_FIELDS.includes(b.field) ? b.field : null;
    const action = FILTER_ACTIONS.includes(b.action) ? b.action : null;
    const matchValue = String(b.matchValue || "")
      .trim()
      .slice(0, 200);
    if (!field || !action) return error(400, "invalid field or action");
    if (!matchValue) return error(400, "match value required");
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM filters WHERE user_id = ?")
      .bind(user.id)
      .first();
    if ((count?.n || 0) >= 100) return error(400, "filter limit reached (100)");
    const id = uuid();
    await env.DB.prepare(
      "INSERT INTO filters (id, user_id, field, match_value, action, position, created_at) VALUES (?,?,?,?,?,?,?)",
    )
      .bind(id, user.id, field, matchValue, action, count?.n || 0, now())
      .run();
    return json({ id, field, match_value: matchValue, action, position: count?.n || 0 });
  }
  if ((m = path.match(/^\/api\/filters\/([\w-]+)$/)) && method === "DELETE") {
    await env.DB.prepare("DELETE FROM filters WHERE id = ? AND user_id = ?")
      .bind(m[1], user.id)
      .run();
    return json({ ok: true });
  }

  if (path === "/api/alias-domains" && method === "GET") {
    const set = await verifiedDomainSet(env);
    const builtIn = String(env.MAIL_DOMAIN || "").toLowerCase();
    const domains = [...set].sort((a, b) =>
      a === builtIn ? -1 : b === builtIn ? 1 : a.localeCompare(b),
    );
    return json({ domains, builtIn });
  }

  if (path === "/api/aliases" && method === "GET") {
    return json({ addresses: await listAddresses(env, user.id) });
  }
  if (path === "/api/aliases" && method === "POST") {
    const b = await readJson(request);
    const localPart = String(b.localPart || "")
      .trim()
      .toLowerCase();
    if (!ALIAS_RE.test(localPart)) return error(400, "invalid alias (a-z, 0-9, . _ - ; up to 64)");
    const domain = String(b.domain || env.MAIL_DOMAIN)
      .trim()
      .toLowerCase();
    const allowed = await verifiedDomainSet(env);
    if (!allowed.has(domain)) return error(400, "unknown or unverified domain");
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM addresses WHERE user_id = ?")
      .bind(user.id)
      .first();
    if ((count?.n || 0) >= ALIAS_LIMIT) return error(400, `alias limit reached (${ALIAS_LIMIT})`);
    const address = `${localPart}@${domain}`;
    const taken = await env.DB.prepare("SELECT user_id FROM addresses WHERE address = ?")
      .bind(address)
      .first();
    if (taken) return error(409, "that address is already taken");
    await env.DB.prepare(
      "INSERT INTO addresses (address, user_id, is_primary, created_at) VALUES (?,?,0,?)",
    )
      .bind(address, user.id, now())
      .run();
    return json({ address, isPrimary: false });
  }
  if ((m = path.match(/^\/api\/aliases\/(.+)$/)) && method === "DELETE") {
    const address = normalizeAddr(decodeURIComponent(m[1]));
    const row = await env.DB.prepare(
      "SELECT is_primary FROM addresses WHERE address = ? AND user_id = ?",
    )
      .bind(address, user.id)
      .first();
    if (!row) return error(404, "not found");
    if (row.is_primary) return error(400, "cannot remove your primary address");
    await env.DB.prepare("DELETE FROM addresses WHERE address = ? AND user_id = ?")
      .bind(address, user.id)
      .run();
    return json({ ok: true });
  }
  if (path === "/api/aliases/primary" && method === "POST") {
    const b = await readJson(request);
    const address = normalizeAddr(b.address || "");
    const row = await env.DB.prepare(
      "SELECT address FROM addresses WHERE address = ? AND user_id = ?",
    )
      .bind(address, user.id)
      .first();
    if (!row) return error(404, "not found");
    await env.DB.batch([
      env.DB.prepare("UPDATE addresses SET is_primary = 0 WHERE user_id = ?").bind(user.id),
      env.DB.prepare("UPDATE addresses SET is_primary = 1 WHERE address = ? AND user_id = ?").bind(
        address,
        user.id,
      ),
      env.DB.prepare("UPDATE users SET address = ? WHERE id = ?").bind(address, user.id),
    ]);
    return json({ ok: true });
  }

  if (path === "/api/keys" && (method === "GET" || method === "POST")) {
    if (!auth?.session) return error(403, "use the web app to manage keys");
    if (method === "GET") {
      const res = await env.DB.prepare(
        "SELECT id, name, prefix, created_at, last_used FROM api_keys WHERE user_id = ? ORDER BY created_at DESC",
      )
        .bind(user.id)
        .all();
      return json({ keys: res.results || [] });
    }
    const b = await readJson(request);
    const name = String(b.name || "")
      .trim()
      .slice(0, 80);
    const key = `emk_${randomToken(20)}`;
    const prefix = key.slice(0, 12);
    const keyHash = await sha256Hex(key);
    const id = uuid();
    const createdAt = now();
    await env.DB.prepare(
      "INSERT INTO api_keys (id, user_id, name, key_hash, prefix, created_at) VALUES (?,?,?,?,?,?)",
    )
      .bind(id, user.id, name, keyHash, prefix, createdAt)
      .run();
    return json({ id, name, prefix, key, created_at: createdAt });
  }
  if ((m = path.match(/^\/api\/keys\/([\w-]+)$/)) && method === "DELETE") {
    if (!auth?.session) return error(403, "use the web app to manage keys");
    await env.DB.prepare("DELETE FROM api_keys WHERE id = ? AND user_id = ?")
      .bind(m[1], user.id)
      .run();
    return json({ ok: true });
  }

  if (path === "/api/pgp" && method === "GET") {
    if (!auth?.session) return error(403, "use the web app to manage pgp keys");
    const row = await env.DB.prepare(
      "SELECT pgp_enabled, pgp_public_key, pgp_private_key_enc FROM users WHERE id = ?",
    )
      .bind(user.id)
      .first();
    return json({
      enabled: !!row?.pgp_enabled,
      publicKey: row?.pgp_public_key || null,
      privateKeyEnc: row?.pgp_private_key_enc || null,
    });
  }
  if (path === "/api/pgp/enable" && method === "POST") {
    if (!auth?.session) return error(403, "use the web app to manage pgp keys");
    const b = await readJson(request);
    const publicKey = String(b.publicKey || "");
    const privateKeyEnc = String(b.privateKeyEnc || "");
    if (!publicKey || !privateKeyEnc) return error(400, "publicKey and privateKeyEnc required");
    try {
      await openpgp.readKey({ armoredKey: publicKey });
    } catch {
      return error(400, "invalid armored public key");
    }
    await env.DB.prepare(
      "UPDATE users SET pgp_public_key = ?, pgp_private_key_enc = ?, pgp_enabled = 1 WHERE id = ?",
    )
      .bind(publicKey, privateKeyEnc, user.id)
      .run();
    return json({ ok: true });
  }
  if (path === "/api/pgp" && method === "DELETE") {
    if (!auth?.session) return error(403, "use the web app to manage pgp keys");
    await env.DB.prepare(
      "UPDATE users SET pgp_public_key = NULL, pgp_private_key_enc = NULL, pgp_enabled = 0 WHERE id = ?",
    )
      .bind(user.id)
      .run();
    return json({ ok: true });
  }
  if (path === "/api/pgp/pubkey" && method === "GET") {
    const address = normalizeAddr(url.searchParams.get("address") || "");
    if (!address) return error(400, "address required");
    const row = await env.DB.prepare(
      "SELECT u.pgp_public_key AS pk FROM addresses a JOIN users u ON u.id = a.user_id WHERE a.address = ? AND u.pgp_enabled = 1 AND u.pgp_public_key IS NOT NULL",
    )
      .bind(address)
      .first();
    if (!row?.pk) return error(404, "no public key");
    return json({ publicKey: row.pk });
  }

  if (path === "/api/contacts" && method === "GET") {
    const q = (url.searchParams.get("q") || "").toLowerCase().trim();
    const limit = clampInt(url.searchParams.get("limit"), 1, 20, 8);
    const selfAddrs = new Set((await listAddresses(env, user.id)).map((a) => a.address));
    const rows = q
      ? (
          await env.DB.prepare(
            "SELECT address, name, count, last_seen FROM contacts WHERE user_id = ? AND (address LIKE ? OR name LIKE ?) ORDER BY count DESC, last_seen DESC LIMIT 60",
          )
            .bind(user.id, `%${q}%`, `%${q}%`)
            .all()
        ).results || []
      : (
          await env.DB.prepare(
            "SELECT address, name, count, last_seen FROM contacts WHERE user_id = ? ORDER BY last_seen DESC, count DESC LIMIT 60",
          )
            .bind(user.id)
            .all()
        ).results || [];

    const today = now();
    const ranked = rows
      .filter((r) => r.address && !selfAddrs.has(r.address))
      .map((r) => {
        const ageDays = Math.max(0, (today - (r.last_seen || 0)) / 86400000);
        const recencyBoost = 2 ** (-ageDays / 30);
        return { ...r, score: Math.log2((r.count || 1) + 1) * recencyBoost };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const contacts = ranked.map((r) => ({ address: r.address, name: r.name || "" }));
    const addrs = contacts.map((c) => c.address);
    if (addrs.length) {
      const ph = addrs.map(() => "?").join(",");
      const av = await env.DB.prepare(
        `SELECT a.address, u.avatar_url, u.display_name FROM addresses a JOIN users u ON u.id = a.user_id WHERE a.address IN (${ph})`,
      )
        .bind(...addrs)
        .all();
      const map = {};
      for (const r of av.results || []) map[r.address] = r;
      for (const c of contacts) {
        const hit = map[c.address];
        if (hit?.avatar_url) c.avatar = hit.avatar_url;
        if (!c.name && hit?.display_name) c.name = hit.display_name;
      }
    }
    return json({ contacts });
  }

  if (path === "/api/push/key" && method === "GET") {
    return json({ key: env.VAPID_PUBLIC_KEY || null });
  }
  if (path === "/api/push/subscribe" && method === "POST") {
    const b = await readJson(request);
    const endpoint = String(b.endpoint || "");
    const p256dh = String(b.keys?.p256dh || "");
    const authKey = String(b.keys?.auth || "");
    if (!endpoint || !p256dh || !authKey) return error(400, "endpoint and keys required");
    await env.DB.prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at) VALUES (?,?,?,?,?,?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    )
      .bind(uuid(), user.id, endpoint, p256dh, authKey, now())
      .run();
    return json({ ok: true });
  }
  if (path === "/api/push/unsubscribe" && method === "POST") {
    const b = await readJson(request);
    const endpoint = String(b.endpoint || "");
    if (endpoint) {
      await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?")
        .bind(endpoint, user.id)
        .run();
    }
    return json({ ok: true });
  }
  if (path === "/api/push/latest" && method === "GET") {
    const unread = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND folder = 'inbox' AND is_read = 0",
    )
      .bind(user.id)
      .first();
    const count = unread?.n || 0;
    const latest = await env.DB.prepare(
      "SELECT from_name, from_addr, subject FROM messages WHERE user_id = ? AND folder = 'inbox' AND is_read = 0 ORDER BY date DESC LIMIT 1",
    )
      .bind(user.id)
      .first();
    if (!latest) return json({ count: 0, title: "New mail", body: "" });
    const sender = latest.from_name || latest.from_addr || "New mail";
    return json({
      count,
      title: count > 1 ? `${sender} and ${count - 1} more` : sender,
      body: latest.subject || "(no subject)",
    });
  }

  if (path === "/api/settings" && method === "PUT") {
    const b = await readJson(request);
    const incoming = b.settings || {};
    if (!user.is_admin) incoming.catchAll = false;
    const settings = JSON.stringify(incoming);
    await env.DB.prepare(
      "UPDATE users SET display_name = ?, signature = ?, settings_json = ? WHERE id = ?",
    )
      .bind(
        String(b.displayName ?? user.display_name).slice(0, 80),
        String(b.signature ?? user.signature).slice(0, 2000),
        settings,
        user.id,
      )
      .run();
    const updated = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();
    return json({ user: publicUser(updated) });
  }

  if (path === "/api/domains" && method === "GET") {
    if (!user.is_admin) return error(403, "admin only");
    const res = await env.DB.prepare(
      "SELECT id, domain, verified, created_at, added_by FROM domains ORDER BY created_at DESC",
    ).all();
    const custom = (res.results || []).map((r) => ({
      id: r.id,
      domain: r.domain,
      verified: !!r.verified,
      createdAt: r.created_at,
      builtIn: false,
    }));
    const builtIn = {
      id: "builtin",
      domain: String(env.MAIL_DOMAIN || "").toLowerCase(),
      verified: true,
      createdAt: null,
      builtIn: true,
    };
    return json({ domains: [builtIn, ...custom] });
  }
  if (path === "/api/domains" && method === "POST") {
    if (!user.is_admin) return error(403, "admin only");
    const b = await readJson(request);
    const domain = String(b.domain || "")
      .trim()
      .toLowerCase();
    if (!DOMAIN_RE.test(domain)) return error(400, "invalid domain");
    if (domain === String(env.MAIL_DOMAIN || "").toLowerCase())
      return error(409, "that is the built-in domain");
    const exists = await env.DB.prepare("SELECT id FROM domains WHERE domain = ?")
      .bind(domain)
      .first();
    if (exists) return error(409, "domain already added");
    const id = uuid();
    await env.DB.prepare(
      "INSERT INTO domains (id, domain, verified, created_at, added_by) VALUES (?,?,0,?,?)",
    )
      .bind(id, domain, now(), user.id)
      .run();
    return json({ id, domain, verified: false, createdAt: now(), builtIn: false });
  }
  if ((m = path.match(/^\/api\/domains\/([\w-]+)\/verify$/)) && method === "POST") {
    if (!user.is_admin) return error(403, "admin only");
    const row = await env.DB.prepare("SELECT id, domain FROM domains WHERE id = ?")
      .bind(m[1])
      .first();
    if (!row) return error(404, "not found");
    let lookup;
    try {
      lookup = await lookupMx(row.domain);
    } catch {
      return error(502, "dns lookup failed, try again");
    }
    await env.DB.prepare("UPDATE domains SET verified = ? WHERE id = ?")
      .bind(lookup.routesToCloudflare ? 1 : 0, row.id)
      .run();
    return json({
      verified: lookup.routesToCloudflare,
      records: lookup.records,
    });
  }
  if ((m = path.match(/^\/api\/domains\/([\w-]+)$/)) && method === "DELETE") {
    if (!user.is_admin) return error(403, "admin only");
    const row = await env.DB.prepare("SELECT domain FROM domains WHERE id = ?").bind(m[1]).first();
    if (!row) return error(404, "not found");
    const inUse = await env.DB.prepare("SELECT COUNT(*) AS n FROM addresses WHERE address LIKE ?")
      .bind(`%@${row.domain}`)
      .first();
    if ((inUse?.n || 0) > 0)
      return error(409, `cannot remove: ${inUse.n} alias(es) still use this domain`);
    await env.DB.prepare("DELETE FROM domains WHERE id = ?").bind(m[1]).run();
    return json({ ok: true });
  }

  if (path === "/api/admin/users" && method === "GET") {
    if (!user.is_admin) return error(403, "admin only");
    const res = await env.DB.prepare(
      "SELECT id, username, address, email, display_name, is_admin, storage_used, created_at, last_login FROM users ORDER BY created_at DESC",
    ).all();
    return json({ users: res.results || [] });
  }

  return error(404, "not found");
}
