const BLOCK_TAGS =
  /<\/?(?:script|style|head|title|meta|link|base|iframe|object|embed|applet|frame|frameset|noscript|svg|math|form|input|button|textarea|select|option)\b[^>]*>/gi;
const SCRIPT_BODY = /<(script|style|head|title|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi;
const COMMENTS = /<!--[\s\S]*?-->/g;
const ON_ATTR = /[\s/]+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const STYLE_URL = /url\s*\(\s*['"]?\s*(?:javascript|vbscript|data):/gi;
const DANGEROUS_PROTO =
  /(href|src|action|formaction|xlink:href)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+|"vbscript:[^"]*"|'vbscript:[^']*')/gi;

function rewriteImages(html, cidMap, allowRemote) {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const srcMatch = tag.match(/\ssrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const src = srcMatch ? (srcMatch[2] ?? srcMatch[3] ?? srcMatch[4] ?? "") : "";
    if (src.startsWith("cid:")) {
      const cid = src.slice(4).replace(/^<|>$/g, "");
      const url = cidMap[cid] || cidMap[`<${cid}>`] || "";
      if (url) return tag.replace(srcMatch[0], ` src="${url}"`);
      return tag.replace(srcMatch[0], ' src="" alt="inline image"');
    }
    if (src.startsWith("data:image/")) return tag;
    if (allowRemote) return tag;
    const cleaned = srcMatch ? tag.replace(srcMatch[0], "") : tag;
    return cleaned.replace(
      /<img\b/i,
      `<img data-blocked-src="${escapeAttr(src)}" class="blocked-img"`,
    );
  });
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
  if (w === 0 || h === 0) return true;
  if (/style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0+)?\b)/i.test(tag)) {
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
  const v = String(value || "").trim().toLowerCase();
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
  let out = html.replace(/style\s*=\s*("[^"]*"|'[^']*')/gi, (full, raw) => {
    const q = raw[0];
    const css = raw.slice(1, -1).replace(
      /(^|;)\s*color\s*:\s*([^;]+)/gi,
      (mm, sep, val) => (isDarkColor(val) ? sep : mm),
    );
    return `style=${q}${css}${q}`;
  });
  out = out.replace(
    /(<font\b[^>]*?\bcolor\s*=\s*)("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (full, pre, _wrapped, dq, sq, bare) =>
      isDarkColor(dq ?? sq ?? bare) ? pre.replace(/\s*color\s*=\s*$/i, " ") : full,
  );
  return out;
}

export function sanitizeEmailHtml(html, { cidMap = {}, allowRemote = false } = {}) {
  let out = String(html || "");
  out = out.replace(COMMENTS, "");
  out = out.replace(SCRIPT_BODY, "");
  out = out.replace(BLOCK_TAGS, "");
  let prev;
  do {
    prev = out;
    out = out.replace(ON_ATTR, "");
  } while (out !== prev);
  out = out.replace(DANGEROUS_PROTO, '$1="#"');
  out = out.replace(STYLE_URL, "url(");
  out = rewriteImages(out, cidMap, allowRemote);
  out = neutralizeDarkColors(out);
  out = out.replace(/<a\b([^>]*)>/gi, (m, attrs) => {
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
