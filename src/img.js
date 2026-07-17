const MAX_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;

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

export function proxyUrl(raw) {
  if (!isProxyableUrl(raw)) return "";
  return `/api/img?url=${encodeURIComponent(raw)}`;
}

function deny(status, msg) {
  return new Response(msg, {
    status,
    headers: { "content-type": "text/plain", "cache-control": "no-store" },
  });
}

export async function proxyImage(request) {
  const url = new URL(request.url);
  const target = url.searchParams.get("url") || "";
  if (!target) return deny(400, "bad request");
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
