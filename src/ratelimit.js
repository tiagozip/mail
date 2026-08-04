import { error, now } from "./util.js";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Every bucket is a fixed window: the first request opens a window of
// `window` seconds and the counter resets once it expires. `scope` only
// documents what the caller is expected to key by (user id, client ip,
// domain, address); the key itself is passed to consume().
export const LIMITS = {
  // --- unauthenticated, keyed by client ip ---------------------------------
  "auth:start": {
    limit: 30,
    window: 10 * MINUTE,
    scope: "ip",
    message: "too many sign-in attempts",
  },
  "auth:exchange": {
    limit: 10,
    window: 10 * MINUTE,
    scope: "ip",
    message: "too many sign-in attempts",
  },
  anon: { limit: 120, window: MINUTE, scope: "ip" },
  "ingest:ip": { limit: 3000, window: HOUR, scope: "ip" },
  "ingest:domain": { limit: 5000, window: HOUR, scope: "domain" },

  // --- inbound smtp, keyed by mailbox / sender pair ------------------------
  "inbound:user": { limit: 1000, window: HOUR, scope: "user" },
  "inbound:pair": { limit: 200, window: HOUR, scope: "address" },

  // --- authenticated ceilings, keyed by user id ----------------------------
  api: { limit: 1200, window: MINUTE, scope: "user" },
  read: { limit: 600, window: MINUTE, scope: "user" },
  write: { limit: 180, window: MINUTE, scope: "user" },
  sync: { limit: 300, window: MINUTE, scope: "user" },
  search: { limit: 60, window: MINUTE, scope: "user" },
  bulk: { limit: 60, window: MINUTE, scope: "user" },

  // --- per feature ---------------------------------------------------------
  send: { limit: 30, window: MINUTE, scope: "user", message: "sending too fast" },
  "send:hour": { limit: 120, window: HOUR, scope: "user", message: "hourly send limit reached" },
  "send:day": { limit: 200, window: DAY, scope: "user", message: "daily send limit reached" },
  "alias:create": {
    limit: 20,
    window: HOUR,
    scope: "user",
    message: "too many aliases created",
  },
  "alias:create:day": {
    limit: 60,
    window: DAY,
    scope: "user",
    message: "daily alias limit reached",
  },
  "alias:write": { limit: 120, window: HOUR, scope: "user" },
  upload: { limit: 200, window: HOUR, scope: "user", message: "too many uploads" },
  avatar: { limit: 30, window: HOUR, scope: "user", message: "too many avatar uploads" },
  draft: { limit: 240, window: MINUTE, scope: "user" },
  label: { limit: 60, window: HOUR, scope: "user" },
  folder: { limit: 60, window: HOUR, scope: "user" },
  filter: { limit: 60, window: HOUR, scope: "user" },
  "keys:create": { limit: 10, window: DAY, scope: "user", message: "too many api keys created" },
  "keys:write": { limit: 60, window: DAY, scope: "user" },
  "domain:write": { limit: 30, window: HOUR, scope: "user", message: "too many domain changes" },
  "domain:verify": {
    limit: 40,
    window: HOUR,
    scope: "user",
    message: "too many verification attempts",
  },
  "pgp:write": { limit: 60, window: HOUR, scope: "user" },
  push: { limit: 60, window: HOUR, scope: "user" },
  settings: { limit: 120, window: HOUR, scope: "user" },
  admin: { limit: 300, window: HOUR, scope: "user" },
};

// Buckets whose ceiling is operator-configurable.
const ENV_OVERRIDES = { "send:day": "DAILY_SEND_LIMIT" };

function specFor(env, name) {
  const spec = LIMITS[name];
  if (!spec) throw new Error(`unknown rate limit bucket: ${name}`);
  const envVar = ENV_OVERRIDES[name];
  if (!envVar) return spec;
  const override = Number.parseInt(env?.[envVar] ?? "", 10);
  return Number.isFinite(override) && override > 0 ? { ...spec, limit: override } : spec;
}

// Keys already known to be over their limit, so a flood costs no D1 writes.
// Isolate-local and purely an optimisation: the D1 row is the real counter.
const blocked = new Map();

function blockedUntil(key) {
  const until = blocked.get(key);
  if (until === undefined) return 0;
  if (until <= now()) {
    blocked.delete(key);
    return 0;
  }
  return until;
}

function markBlocked(key, resetAt) {
  if (blocked.size > 5000) blocked.clear();
  blocked.set(key, resetAt);
}

function result(spec, count, resetAt) {
  const remaining = Math.max(0, spec.limit - count);
  return {
    ok: count <= spec.limit,
    limit: spec.limit,
    remaining,
    resetAt,
    retryAfter: Math.max(1, Math.ceil((resetAt - now()) / 1000)),
    message: spec.message || "too many requests",
  };
}

/**
 * Count one hit against `bucket` for `identity` and report whether it is
 * allowed. Storage failures fail open — a broken counter must not take the
 * mailbox down — but the in-memory block list still applies.
 */
export async function consume(env, bucket, identity, hits = 1) {
  const spec = specFor(env, bucket);
  const key = `${bucket}:${identity || "unknown"}`;
  const t = now();

  const until = blockedUntil(key);
  if (until) return result(spec, spec.limit + 1, until);

  const resetAt = t + spec.window * 1000;
  try {
    const row = await env.DB.prepare(
      `INSERT INTO rate_limits (bucket_key, count, reset_at) VALUES (?, ?, ?)
       ON CONFLICT(bucket_key) DO UPDATE SET
         count = CASE WHEN rate_limits.reset_at <= ? THEN ? ELSE rate_limits.count + ? END,
         reset_at = CASE WHEN rate_limits.reset_at <= ? THEN ? ELSE rate_limits.reset_at END
       RETURNING count, reset_at`,
    )
      .bind(key, hits, resetAt, t, hits, hits, t, resetAt)
      .first();
    const out = result(spec, row?.count ?? hits, row?.reset_at ?? resetAt);
    if (!out.ok) markBlocked(key, out.resetAt);
    return out;
  } catch (e) {
    console.error("rate limit store error", bucket, e?.stack || e);
    return { ...result(spec, 0, resetAt), ok: true };
  }
}

/** Count a hit against several buckets and return the first one that blocks. */
export async function consumeAll(env, entries) {
  let tightest = null;
  for (const [bucket, identity, hits] of entries) {
    const r = await consume(env, bucket, identity, hits);
    if (!r.ok) return r;
    if (!tightest || r.remaining < tightest.remaining) tightest = r;
  }
  return tightest || { ok: true };
}

export function clientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown"
  );
}

export function rateLimitHeaders(r) {
  if (!r || r.limit === undefined) return {};
  return {
    "x-ratelimit-limit": String(r.limit),
    "x-ratelimit-remaining": String(r.remaining),
    "x-ratelimit-reset": String(Math.ceil(r.resetAt / 1000)),
  };
}

export function tooMany(r) {
  return error(
    429,
    `${r.message}, retry in ${r.retryAfter}s`,
    { code: "E_RATE_LIMIT", retryAfter: r.retryAfter },
    { headers: { "retry-after": String(r.retryAfter), ...rateLimitHeaders(r) } },
  );
}

export function withRateLimitHeaders(res, r) {
  const headers = rateLimitHeaders(r);
  if (!Object.keys(headers).length) return res;
  const merged = new Headers(res.headers);
  for (const [k, v] of Object.entries(headers)) merged.set(k, v);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: merged,
  });
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Route policy. First match wins; every authenticated request also counts
// against the `api` ceiling. A rule method of "WRITE" matches any mutating
// method. Anything not listed falls back to read/write by method, so a new
// endpoint is limited by default rather than by omission.
const ROUTES = [
  ["POST", /^\/api\/aliases$/, ["alias:create", "alias:create:day"]],
  ["POST", /^\/api\/hidden-aliases$/, ["alias:create", "alias:create:day"]],
  ["POST", /^\/api\/aliases\/[^/]+\/avatar$/, ["avatar"]],
  ["WRITE", /^\/api\/(hidden-)?aliases(\/|$)/, ["alias:write"]],

  ["GET", /^\/api\/sync$/, ["sync"]],
  ["GET", /^\/api\/contacts$/, ["search"]],
  ["POST", /^\/api\/(messages|threads)\/bulk$/, ["bulk"]],

  ["POST", /^\/api\/send$/, ["send", "send:hour"]],
  ["POST", /^\/api\/drafts$/, ["draft"]],
  ["PUT", /^\/api\/drafts\//, ["draft"]],

  ["POST", /^\/api\/attachments$/, ["upload"]],
  ["POST", /^\/api\/avatar$/, ["avatar"]],

  ["WRITE", /^\/api\/labels(\/|$)/, ["label"]],
  ["WRITE", /^\/api\/folders(\/|$)/, ["folder"]],
  ["WRITE", /^\/api\/filters(\/|$)/, ["filter"]],

  ["POST", /^\/api\/keys$/, ["keys:create"]],
  ["DELETE", /^\/api\/keys\//, ["keys:write"]],

  ["POST", /^\/api\/domains\/[\w-]+\/(verify|relay-health)$/, ["domain:verify"]],
  ["WRITE", /^\/api\/domains(\/|$)/, ["domain:write"]],
  ["WRITE", /^\/api\/pgp(\/|$)/, ["pgp:write"]],
  ["WRITE", /^\/api\/push\//, ["push"]],
  ["PUT", /^\/api\/settings$/, ["settings"]],
  ["WRITE", /^\/api\/admin\//, ["admin"]],
];

/** Buckets that apply to a request, beyond the global `api` ceiling. */
export function bucketsFor(method, path) {
  const isRead = READ_METHODS.has(method);
  for (const [ruleMethod, pattern, buckets] of ROUTES) {
    if (ruleMethod === "WRITE" ? isRead : ruleMethod !== method) continue;
    if (pattern.test(path)) return buckets;
  }
  return [isRead ? "read" : "write"];
}

/** Apply the global ceiling plus the route's own buckets. */
export async function enforce(env, { method, path, userId, ip }) {
  if (!userId) return consume(env, "anon", ip);
  const entries = [["api", userId]];
  for (const bucket of bucketsFor(method, path)) entries.push([bucket, userId]);
  return consumeAll(env, entries);
}

/** Drop expired counters; called from the every-minute cron. */
export async function purgeRateLimits(env) {
  await env.DB.prepare("DELETE FROM rate_limits WHERE reset_at <= ?").bind(now()).run();
}
