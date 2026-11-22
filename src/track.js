import { clientIp, consume } from "./ratelimit.js";
import { now } from "./util.js";

const GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) =>
  c.charCodeAt(0),
);

const ID = /^[A-Za-z0-9_-]{22}$/;
const DEDUPE_MS = 60_000;
const SCANNER_MS = 15_000;

export function newTrackingId() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function pixelTag(env, id) {
  return `<img src="https://${env.APP_HOST || `mail.${env.MAIL_DOMAIN}`}/api/t/${id}.gif" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`;
}

function classify(ua, sinceSend) {
  if (/GoogleImageProxy/i.test(ua)) return { kind: "gmail", auto: false };
  if (/YahooMailProxy/i.test(ua)) return { kind: "yahoo", auto: false };
  if (sinceSend < SCANNER_MS) return { kind: "scanner", auto: true };
  if (!ua || ua === "Mozilla/5.0") return { kind: "apple", auto: true };
  if (/bot|crawler|spider|scanner|barracuda|mimecast|proofpoint/i.test(ua))
    return { kind: "scanner", auto: true };
  if (/Microsoft Office|Outlook/i.test(ua)) return { kind: "outlook", auto: false };
  return { kind: "person", auto: false };
}

export async function handlePixel(request, env, ctx, id) {
  const res = new Response(GIF, {
    headers: {
      "content-type": "image/gif",
      "cache-control": "no-store, no-cache, must-revalidate, private",
      "referrer-policy": "no-referrer",
    },
  });
  if (!ID.test(id) || request.method !== "GET") return res;
  ctx.waitUntil(
    (async () => {
      if (!(await consume(env, "pixel", clientIp(request))).ok) return;
      const t = now();
      const row = await env.DB.prepare("SELECT created_at, last_open_at FROM tracking WHERE id = ?")
        .bind(id)
        .first();
      if (!row || (row.last_open_at && t - row.last_open_at < DEDUPE_MS)) return;
      const { kind, auto } = classify(request.headers.get("user-agent") || "", t - row.created_at);
      await env.DB.prepare(
        `UPDATE tracking SET opens = opens + ?, auto_opens = auto_opens + ?,
           first_open_at = CASE WHEN ? = 0 THEN COALESCE(first_open_at, ?) ELSE first_open_at END,
           last_open_at = ?, last_kind = ?
         WHERE id = ? AND (last_open_at IS NULL OR last_open_at < ?)`,
      )
        .bind(auto ? 0 : 1, auto ? 1 : 0, auto ? 1 : 0, t, t, kind, id, t - DEDUPE_MS)
        .run();
    })().catch((e) => console.error("pixel error", e?.stack || e)),
  );
  return res;
}

export async function opensFor(env, userId, messageIds) {
  if (!messageIds.length) return new Map();
  const res = await env.DB.prepare(
    `SELECT message_id, opens, auto_opens, first_open_at, last_open_at, last_kind FROM tracking
     WHERE user_id = ? AND message_id IN (${messageIds.map(() => "?").join(",")})`,
  )
    .bind(userId, ...messageIds)
    .all();
  return new Map(
    (res.results || []).map((r) => [
      r.message_id,
      {
        opens: r.opens,
        autoOpens: r.auto_opens,
        firstOpenAt: r.first_open_at,
        lastOpenAt: r.last_open_at,
        lastKind: r.last_kind,
      },
    ]),
  );
}
