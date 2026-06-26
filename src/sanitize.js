const BLOCK_TAGS =
  /<\/?(?:script|style|head|title|meta|link|base|iframe|object|embed|applet|frame|frameset|noscript|svg|math|form|input|button|textarea|select|option)\b[^>]*>/gi;
const SCRIPT_BODY = /<(script|style|head|title|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi;
const COMMENTS = /<!--[\s\S]*?-->/g;
const ON_ATTR = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
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

export function sanitizeEmailHtml(html, { cidMap = {}, allowRemote = false } = {}) {
  let out = String(html || "");
  out = out.replace(COMMENTS, "");
  out = out.replace(SCRIPT_BODY, "");
  out = out.replace(BLOCK_TAGS, "");
  out = out.replace(ON_ATTR, "");
  out = out.replace(DANGEROUS_PROTO, '$1="#"');
  out = out.replace(STYLE_URL, "url(");
  out = rewriteImages(out, cidMap, allowRemote);
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
