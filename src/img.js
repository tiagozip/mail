const ENC = new TextEncoder();
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/tiff",
]);

let cachedKey = null;

function decodeBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlFromBytes(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlEncode(str) {
  return b64urlFromBytes(ENC.encode(str));
}

function b64urlDecode(str) {
  const pad = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function signingKey(env) {
  if (cachedKey) return cachedKey;
  const raw = decodeBase64(env.ENCRYPTION_KEY);
  const label = ENC.encode("estrogen-img-proxy-v1");
  const material = new Uint8Array(raw.length + label.length);
  material.set(raw, 0);
  material.set(label, raw.length);
  const digest = await crypto.subtle.digest("SHA-256", material);
  cachedKey = await crypto.subtle.importKey(
    "raw",
    digest,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return cachedKey;
}

async function sign(env, payload) {
  const key = await signingKey(env);
  const mac = await crypto.subtle.sign("HMAC", key, ENC.encode(payload));
  return b64urlFromBytes(new Uint8Array(mac));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isProxyableUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  if (host === "metadata.google.internal") return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const p = host.split(".").map(Number);
    if (p.some((n) => n > 255)) return false;
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return false;
    if (p[0] === 169 && p[1] === 254) return false;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return false;
    if (p[0] === 192 && p[1] === 168) return false;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return false;
    if (p[0] >= 224) return false;
    return true;
  }
  if (host.includes(":")) {
    if (host === "::1" || host === "::") return false;
    if (/^(fc|fd|fe80|ff)/.test(host)) return false;
  }
  return true;
}

export async function signImageUrl(env, raw) {
  if (!isProxyableUrl(raw)) return "";
  const u = b64urlEncode(raw);
  const e = String(Date.now() + TTL_MS);
  const s = await sign(env, `${u}.${e}`);
  return `/api/img?u=${u}&e=${e}&s=${s}`;
}

function deny(status, msg) {
  return new Response(msg, {
    status,
    headers: { "content-type": "text/plain", "cache-control": "no-store" },
  });
}

export async function proxyImage(request, env) {
  const url = new URL(request.url);
  const u = url.searchParams.get("u") || "";
  const e = url.searchParams.get("e") || "";
  const s = url.searchParams.get("s") || "";
  if (!u || !e || !s) return deny(400, "bad request");

  const expected = await sign(env, `${u}.${e}`);
  if (!timingSafeEqual(expected, s)) return deny(403, "bad signature");
  if (!/^\d+$/.test(e) || Number(e) < Date.now()) return deny(410, "expired");

  let target;
  try {
    target = b64urlDecode(u);
  } catch {
    return deny(400, "bad url");
  }
  if (!isProxyableUrl(target)) return deny(403, "blocked host");

  let res = null;
  let current = target;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    res = await fetch(current, {
      redirect: "manual",
      headers: {
        accept: "image/*",
        "user-agent": "Mozilla/5.0 (compatible; estrogen-mail image proxy)",
        "accept-encoding": "identity",
      },
      cf: { cacheEverything: true, cacheTtl: 86400 },
    });
    if (res.status < 300 || res.status >= 400) break;
    const loc = res.headers.get("location");
    if (!loc) break;
    let next;
    try {
      next = new URL(loc, current).toString();
    } catch {
      return deny(502, "bad redirect");
    }
    if (!isProxyableUrl(next)) return deny(403, "blocked redirect");
    if (hop === MAX_REDIRECTS) return deny(502, "too many redirects");
    current = next;
  }

  if (!res?.ok) return deny(502, "upstream error");

  const mime = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_MIME.has(mime)) return deny(415, "not an image");

  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > MAX_BYTES) return deny(413, "too large");

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) return deny(413, "too large");

  return new Response(buf, {
    status: 200,
    headers: {
      "content-type": mime,
      "content-length": String(buf.byteLength),
      "cache-control": "private, max-age=604800, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-origin",
      "referrer-policy": "no-referrer",
    },
  });
}
