const BLOCK_TAGS =
  /<\/?(?:script|style|head|title|meta|link|base|iframe|object|embed|applet|frame|frameset|noscript|svg|math|form|input|button|textarea|select|option)\b[^>]*>/gi;
const SCRIPT_BODY = /<(script|style|head|title|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi;
const COMMENTS = /<!--[\s\S]*?-->/g;
const ON_ATTR = /[\s/]+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const AT_IMPORT = /@import\b[^;]*;?/gi;
const CSS_EXPRESSION = /expression\s*\(/gi;
const CSS_BEHAVIOR = /(?:^|[;{\s])(?:-moz-binding|behavior)\s*:[^;}]*/gi;
const CSS_URL = /url\s*\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const STYLE_ATTR = /\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi;

function decodeEntities(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCharCode(Number.parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&colon;/gi, ":")
    .replace(/&tab;/gi, "\t")
    .replace(/&newline;/gi, "\n");
}

function stripUrlJunk(value) {
  let out = "";
  for (const ch of String(value || "")) {
    const code = ch.charCodeAt(0);
    if (code > 32 && code !== 127) out += ch;
  }
  return out;
}

function schemeOf(value) {
  const decoded = stripUrlJunk(decodeEntities(value)).toLowerCase();
  const idx = decoded.indexOf(":");
  return idx === -1 ? "" : decoded.slice(0, idx);
}

const BAD_SCHEMES = new Set(["javascript", "vbscript", "livescript", "mocha", "data", "blob"]);
const DATA_IMAGE_OK = /^data:image\/(?:png|gif|jpeg|jpg|webp|bmp|avif|x-icon)[;,]/i;

function isDangerousUrl(value, allowDataImage = false) {
  const scheme = schemeOf(value);
  if (!scheme) return false;
  if (scheme === "data") {
    if (!allowDataImage) return true;
    const normalized = stripUrlJunk(decodeEntities(value));
    return !DATA_IMAGE_OK.test(normalized);
  }
  return BAD_SCHEMES.has(scheme);
}

function attrValue(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  if (!m) return null;
  return { full: m[0], value: m[2] ?? m[3] ?? m[4] ?? "" };
}

function proxySrcset(value, toProxy) {
  const parts = String(value)
      .split(",")
      .map((part) => {
        const trimmed = part.trim();
        if (!trimmed) return "";
        const sp = trimmed.split(/\s+/);
        const proxied = toProxy(sp[0]);
        if (!proxied) return "";
        return [proxied, ...sp.slice(1)].join(" ");
      });
  return parts.filter(Boolean).join(", ");
}

function rewriteImages(html, cidMap, allowRemote, toProxy) {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const srcAttr = attrValue(tag, "src");
    const src = srcAttr ? srcAttr.value : "";
    let out = tag;

    const srcsetAttr = attrValue(out, "srcset");
    if (srcsetAttr) {
      const replacement = allowRemote ? proxySrcset(srcsetAttr.value, toProxy) : "";
      out = out.replace(srcsetAttr.full, replacement ? ` srcset="${escapeAttr(replacement)}"` : "");
    }

    if (src.startsWith("cid:")) {
      const cid = src.slice(4).replace(/^<|>$/g, "");
      const url = cidMap[cid] || cidMap[`<${cid}>`] || "";
      if (url) return out.replace(srcAttr.full, ` src="${url}"`);
      return out.replace(srcAttr.full, ' src="" alt="inline image"');
    }
    if (DATA_IMAGE_OK.test(src)) return out;
    if (allowRemote) {
      if (!srcAttr || !toProxy) return out;
      const proxied = toProxy(src);
      if (!proxied) return out.replace(srcAttr.full, "");
      return out.replace(srcAttr.full, ` src="${escapeAttr(proxied)}"`);
    }
    const cleaned = srcAttr ? out.replace(srcAttr.full, "") : out;
    return cleaned.replace(
      /<img\b/i,
      `<img data-blocked-src="${escapeAttr(src)}" class="blocked-img"`,
    );
  });
}

function rewriteCssUrls(css, allowRemote, toProxy) {
  let out = String(css || "").replace(AT_IMPORT, "");
  out = out.replace(CSS_EXPRESSION, "void(");
  out = out.replace(CSS_BEHAVIOR, "");
  return out.replace(CSS_URL, (full, _q, raw) => {
    const value = raw.trim();
    if (DATA_IMAGE_OK.test(value)) return full;
    if (isDangerousUrl(value)) return "url()";
    if (value.startsWith("/api/attachments/")) return full;
    if (!allowRemote) return "url()";
    if (!toProxy) return full;
    const proxied = toProxy(value);
    return proxied ? `url("${proxied}")` : "url()";
  });
}

function rewriteAllCss(html, allowRemote, toProxy) {
  let out = html.replace(STYLE_BLOCK, (_full, body) => {
    const clean = rewriteCssUrls(body, allowRemote, toProxy);
    return `<style>${clean}</style>`;
  });
  out = out.replace(STYLE_ATTR, (_full, _raw, dq, sq) => {
    const css = dq ?? sq ?? "";
    const clean = rewriteCssUrls(css, allowRemote, toProxy);
    return ` style="${escapeAttr(clean)}"`;
  });
  return out;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const TRACKER_URL =
  /(?:\/(?:open|wf\/open|track|tracking|beacon|pixel|piwik|matomo)(?:[/.?]|$))|(?:[?&](?:utm_medium=email|mc_eid|email_open|trk_msg|trk_contact|oseid))|(?:\b(?:1x1|spacer|clear|blank|pixel|trans|transparent)\.(?:gif|png|jpg))|list-manage\.com\/track|sendgrid\.net\/wf\/open|awstrack\.me|mailtrack\.io|sparkpostmail|hubspotemail|hs-analytics|getsidekick|bananatag|streak-track/i;

function imgDimension(tag, name) {
  const attr = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']?\\s*(\\d+(?:\\.\\d+)?)`, "i"));
  if (attr) return Number.parseFloat(attr[1]);
  const style = tag.match(new RegExp(`[;"'\\s]${name}\\s*:\\s*(\\d+(?:\\.\\d+)?)\\s*px`, "i"));
  if (style) return Number.parseFloat(style[1]);
  return null;
}

function isTrackerImg(tag) {
  const w = imgDimension(tag, "width");
  const h = imgDimension(tag, "height");
  if (w !== null && h !== null && w <= 2 && h <= 2) return true;
  if (w !== null && h === null && w <= 2) return true;
  if (h !== null && w === null && h <= 2) return true;
  if (w === 0 || h === 0) return true;
  if (
    /style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*(?:0?\.0+|0)\b)/i.test(
      tag,
    )
  ) {
    return true;
  }
  const srcMatch = tag.match(/\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const src = srcMatch ? (srcMatch[2] ?? srcMatch[3] ?? srcMatch[4] ?? "") : "";
  return !!src && TRACKER_URL.test(src);
}

export function stripTrackers(html) {
  let count = 0;
  const out = String(html || "").replace(/<img\b[^>]*>/gi, (tag) => {
    if (!isTrackerImg(tag)) return tag;
    count += 1;
    return "";
  });
  return { html: out, count };
}

function isDarkColor(value) {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  if (!v || v === "transparent" || v === "inherit" || v === "currentcolor") return false;
  if (v === "black" || v === "windowtext") return true;
  let r;
  let g;
  let b;
  let m;
  if ((m = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/))) {
    r = Number.parseInt(m[1] + m[1], 16);
    g = Number.parseInt(m[2] + m[2], 16);
    b = Number.parseInt(m[3] + m[3], 16);
  } else if ((m = v.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/))) {
    r = Number.parseInt(m[1], 16);
    g = Number.parseInt(m[2], 16);
    b = Number.parseInt(m[3], 16);
  } else if ((m = v.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i))) {
    r = +m[1];
    g = +m[2];
    b = +m[3];
  } else {
    return false;
  }
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max <= 120 && max - min <= 40;
}

function neutralizeDarkColors(html) {
  let out = html.replace(/style\s*=\s*("[^"]*"|'[^']*')/gi, (_full, raw) => {
    const q = raw[0];
    const css = raw
      .slice(1, -1)
      .replace(/(^|;)\s*color\s*:\s*([^;]+)/gi, (mm, sep, val) => (isDarkColor(val) ? sep : mm));
    return `style=${q}${css}${q}`;
  });
  out = out.replace(
    /(<font\b[^>]*?\bcolor\s*=\s*)("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (full, pre, _wrapped, dq, sq, bare) =>
      isDarkColor(dq ?? sq ?? bare) ? pre.replace(/\s*color\s*=\s*$/i, " ") : full,
  );
  return out;
}

export function sanitizeEmailHtml(html, { cidMap = {}, allowRemote = false, toProxy = null } = {}) {
  let out = String(html || "");
  out = out.replace(COMMENTS, "");
  out = out.replace(SCRIPT_BODY, "");
  out = out.replace(BLOCK_TAGS, "");
  let prev;
  do {
    prev = out;
    out = out.replace(ON_ATTR, "");
  } while (out !== prev);
  out = out.replace(
    /\s(href|src|action|formaction|xlink:href)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (full, name, _wrapped, dq, sq, bare) =>
      isDangerousUrl(dq ?? sq ?? bare ?? "", name.toLowerCase() === "src") ? ` ${name}="#"` : full,
  );
  out = rewriteImages(out, cidMap, allowRemote, toProxy);
  out = rewriteAllCss(out, allowRemote, toProxy);
  out = neutralizeDarkColors(out);
  out = out.replace(/<a\b([^>]*)>/gi, (_m, attrs) => {
    let a = attrs.replace(/\s+target\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    a = a.replace(/\s+rel\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    return `<a${a} target="_blank" rel="noopener noreferrer nofollow">`;
  });
  return out;
}

export function textToHtml(text) {
  const escaped = String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const linked = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer nofollow">$1</a>',
  );
  return `<div class="plaintext">${linked.replace(/\n/g, "<br>")}</div>`;
}
