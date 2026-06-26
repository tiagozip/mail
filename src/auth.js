import { now, parseCookies, randomToken } from "./util.js";

const SESSION_TTL = 60 * 60 * 24 * 30;

export async function createSession(env, userId, meta = {}) {
  const token = randomToken(32);
  await env.KV.put(`session:${token}`, JSON.stringify({ userId, createdAt: now(), ...meta }), {
    expirationTtl: SESSION_TTL,
  });
  return token;
}

export async function destroySession(env, token) {
  if (token) await env.KV.delete(`session:${token}`);
}

export function sessionCookie(token, secure = true) {
  const attrs = [`sid=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${SESSION_TTL}`];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearCookie(secure = true) {
  const attrs = ["sid=", "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

const USER_SELECT =
  "SELECT id, username, address, email, display_name, is_admin, signature, settings_json, storage_used, avatar_url, pgp_enabled, created_at FROM users WHERE id = ?";

export async function sha256Hex(str) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bearerKey(request) {
  const header = request.headers.get("authorization") || "";
  const m = header.match(/^Bearer\s+(emk_[a-f0-9]+)$/i);
  if (m) return m[1];
  const x = request.headers.get("x-api-key") || "";
  return /^emk_[a-f0-9]+$/i.test(x.trim()) ? x.trim() : null;
}

export async function authenticate(request, env) {
  const token = parseCookies(request).sid;
  if (token) {
    const raw = await env.KV.get(`session:${token}`);
    if (raw) {
      const session = JSON.parse(raw);
      const user = await env.DB.prepare(USER_SELECT).bind(session.userId).first();
      if (user) return { user, token, session };
    }
  }

  const key = bearerKey(request);
  if (!key) return null;
  const keyHash = await sha256Hex(key);
  const keyRow = await env.DB.prepare("SELECT id, user_id FROM api_keys WHERE key_hash = ?")
    .bind(keyHash)
    .first();
  if (!keyRow) return null;
  const user = await env.DB.prepare(USER_SELECT).bind(keyRow.user_id).first();
  if (!user) return null;
  env.DB.prepare("UPDATE api_keys SET last_used = ? WHERE id = ?")
    .bind(now(), keyRow.id)
    .run()
    .catch(() => {});
  return { user, token: null, session: null, viaApiKey: true };
}

export function requireOrigin(request) {
  const method = request.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  const host = new URL(request.url).host;
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  return false;
}
