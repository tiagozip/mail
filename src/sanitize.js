const GLOBAL_ATTRS = ["class", "id", "style", "dir", "lang", "title"];
const CELL_ATTRS = [
  "abbr",
  "align",
  "background",
  "bgcolor",
  "char",
  "charoff",
  "colspan",
  "height",
  "nowrap",
  "rowspan",
  "scope",
  "valign",
  "width",
];
const ALLOWED_TAGS = Object.fromEntries(
  Object.entries({
    a: ["href", "name"],
    abbr: [],
    address: [],
    article: [],
    aside: [],
    b: [],
    big: [],
    blockquote: ["cite"],
    br: [],
    caption: ["align"],
    center: [],
    cite: [],
    code: [],
    col: ["align", "bgcolor", "char", "charoff", "span", "valign", "width"],
    colgroup: ["align", "bgcolor", "char", "charoff", "span", "valign", "width"],
    dd: [],
    del: [],
    dfn: [],
    div: ["align"],
    dl: [],
    dt: [],
    em: [],
    figcaption: [],
    figure: [],
    font: ["color", "face", "size"],
    footer: [],
    h1: ["align"],
    h2: ["align"],
    h3: ["align"],
    h4: ["align"],
    h5: ["align"],
    h6: ["align"],
    header: [],
    hr: ["align", "noshade", "size", "width"],
    i: [],
    img: [
      "align",
      "alt",
      "border",
      "height",
      "hspace",
      "src",
      "srcset",
      "sizes",
      "vspace",
      "width",
    ],
    ins: [],
    kbd: [],
    label: [],
    legend: [],
    li: ["type", "value"],
    main: [],
    mark: [],
    nav: [],
    ol: ["type", "start", "reversed"],
    p: ["align"],
    pre: [],
    q: ["cite"],
    s: [],
    samp: [],
    section: [],
    small: [],
    span: [],
    strike: [],
    strong: [],
    sub: [],
    summary: [],
    sup: [],
    table: [
      "align",
      "background",
      "bgcolor",
      "border",
      "cellpadding",
      "cellspacing",
      "frame",
      "height",
      "rules",
      "width",
    ],
    tbody: ["align", "bgcolor", "char", "charoff", "valign"],
    td: CELL_ATTRS,
    tfoot: ["align", "bgcolor", "char", "charoff", "valign"],
    th: CELL_ATTRS,
    thead: ["align", "bgcolor", "char", "charoff", "valign"],
    tr: ["align", "background", "bgcolor", "char", "charoff", "height", "valign"],
    tt: [],
    u: [],
    ul: ["type"],
    var: [],
    wbr: [],
  }).map(([tag, attrs]) => [tag, new Set([...GLOBAL_ATTRS, ...attrs])]),
);
const VOID_TAGS = new Set(["br", "col", "hr", "img", "wbr"]);
const RAW_TEXT_TAGS = new Set([
  "iframe",
  "noembed",
  "noframes",
  "noscript",
  "plaintext",
  "script",
  "textarea",
  "title",
  "xmp",
]);
const NESTED_DROP_TAGS = new Set(["applet", "head", "math", "object", "svg", "template"]);
const HREF_SCHEMES = new Set(["http", "https", "mailto", "tel"]);
const SRC_SCHEMES = new Set(["http", "https"]);
const URL_ATTRS = new Set(["src", "background", "poster", "cite"]);

const ALLOWED_CSS = new Set(
  "azimuth background background-blend-mode background-clip background-color background-image background-origin background-position background-position-x background-position-y background-repeat background-repeat-x background-repeat-y background-size border border-bottom border-bottom-color border-bottom-left-radius border-bottom-right-radius border-bottom-style border-bottom-width border-collapse border-color border-left border-left-color border-left-style border-left-width border-radius border-right border-right-color border-right-style border-right-width border-spacing border-style border-top border-top-color border-top-left-radius border-top-right-radius border-top-style border-top-width border-width box-sizing break-after break-before break-inside caption-side clear color column-count column-fill column-gap column-rule column-rule-color column-rule-style column-rule-width column-span column-width columns direction display elevation empty-cells float font font-family font-feature-settings font-kerning font-size font-size-adjust font-stretch font-style font-synthesis font-variant font-variant-alternates font-variant-caps font-variant-east-asian font-variant-ligatures font-variant-numeric font-weight height image-orientation image-resolution ime-mode isolation layout-flow layout-grid layout-grid-char layout-grid-char-spacing layout-grid-line layout-grid-mode layout-grid-type letter-spacing line-break line-height list-style list-style-position list-style-type margin margin-bottom margin-left margin-right margin-top marker-offset max-height max-width min-height min-width mix-blend-mode object-fit object-position opacity outline outline-color outline-style outline-width overflow overflow-x overflow-y padding padding-bottom padding-left padding-right padding-top page-break-after page-break-before page-break-inside pause pause-after pause-before pitch pitch-range quotes richness speak speak-header speak-numeral speak-punctuation speech-rate stress table-layout text-align text-align-last text-autospace text-combine-upright text-decoration text-decoration-color text-decoration-line text-decoration-skip text-decoration-style text-emphasis text-emphasis-color text-emphasis-style text-indent text-justify text-kashida-space text-orientation text-overflow text-transform text-underline-position text-wrap text-wrap-mode text-wrap-style unicode-bidi vertical-align voice-family white-space white-space-collapse width word-break word-spacing word-wrap writing-mode zoom".split(
    " ",
  ),
);
const CSS_URL = /url\s*\(\s*(['"]?)([^'")]*)\1\s*\)/gi;
const CSS_BAD_VALUE =
  /expression\s*\(|image-set\s*\(|image\s*\(|element\s*\(|cross-fade\s*\(|src\s*\(|paint\s*\(|-moz-binding|behavior|javascript:|vbscript:/i;

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  colon: ":",
  tab: "\t",
  newline: "\n",
  sol: "/",
  num: "#",
  percnt: "%",
  quest: "?",
  equals: "=",
};

function decodeEntities(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => {
      const code = Number.parseInt(h, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);?/g, (_, d) => {
      const code = Number(d);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&([a-z]+);?/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
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
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(stripUrlJunk(value));
  return m ? m[1].toLowerCase() : "";
}

const DATA_IMAGE_OK = /^data:image\/(?:png|gif|jpeg|jpg|webp|bmp|avif|x-icon)[;,]/i;

function isDangerousUrl(value, allowedSchemes) {
  const scheme = schemeOf(value);
  if (!scheme) return false;
  if (scheme === "data") return !DATA_IMAGE_OK.test(stripUrlJunk(value));
  return !allowedSchemes.has(scheme);
}

function splitDeclarations(css) {
  const parts = [];
  let cur = "";
  let quote = "";
  let depth = 0;
  for (const ch of css) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function sanitizeDeclarations(css, allowRemote, toProxy) {
  const out = [];
  for (const decl of splitDeclarations(String(css || "").replace(/\/\*[\s\S]*?\*\//g, ""))) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const rawValue = decl.slice(idx + 1).trim();
    if (!ALLOWED_CSS.has(prop) || !rawValue) continue;
    if (/[\\<>{}@]/.test(rawValue) || CSS_BAD_VALUE.test(rawValue)) continue;
    const value = rawValue.replace(CSS_URL, (full, _q, raw) => {
      const target = raw.trim();
      if (DATA_IMAGE_OK.test(stripUrlJunk(target))) return full;
      if (isDangerousUrl(target, SRC_SCHEMES)) return "url()";
      if (target.startsWith("/api/attachments/")) return full;
      if (!allowRemote) return "url()";
      if (!toProxy) return full;
      const proxied = toProxy(target);
      return proxied ? `url("${proxied}")` : "url()";
    });
    out.push(`${prop}:${value}`);
  }
  return out.join(";");
}

function sanitizeStyleSheet(css, allowRemote, toProxy) {
  const stripped = String(css || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/<!--|-->/g, "")
    .replace(/@(?:import|charset|namespace)\b[^;{]*;?/gi, "");
  return stripped
    .replace(/\{([^{}]*)\}/g, (_m, body) => `{${sanitizeDeclarations(body, allowRemote, toProxy)}}`)
    .replace(/</g, "");
}

function proxySrcset(value, toProxy) {
  const parts = String(value)
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return "";
      const sp = trimmed.split(/\s+/);
      if (isDangerousUrl(sp[0], SRC_SCHEMES)) return "";
      const proxied = toProxy(sp[0]);
      if (!proxied) return "";
      return [proxied, ...sp.slice(1)].join(" ");
    });
  return parts.filter(Boolean).join(", ");
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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

export function expandHtmlBlocks(html) {
  return String(html || "").replace(
    /<div\b[^>]*\bdata-htmlblock="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi,
    (_m, b64) => {
      try {
        const bin = atob(b64);
        return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
      } catch {
        return "";
      }
    },
  );
}

const TAG_NAME = /[a-zA-Z][^\s/>]*/y;
const ATTR_NAME = /=?[^\s/>=]*/y;
const UNQUOTED_VALUE = /[^\s>]*/y;
const WS = new Set([" ", "\t", "\n", "\r", "\f"]);

export function sanitizeEmailHtml(html, { cidMap = {}, allowRemote = false, toProxy = null } = {}) {
  const src = String(html || "").replace(/\0/g, "");
  const n = src.length;
  const out = [];
  let i = 0;
  while (i < n) {
    const lt = src.indexOf("<", i);
    if (lt === -1) {
      out.push(src.slice(i));
      break;
    }
    if (lt > i) out.push(src.slice(i, lt));
    const c = src[lt + 1] || "";
    if (c === "!" || c === "?") {
      if (src.startsWith("<!--", lt)) {
        const a = src.indexOf("-->", lt + 2);
        const b = src.indexOf("--!>", lt + 2);
        const end = a === -1 ? b : b === -1 ? a : Math.min(a, b);
        i = end === -1 ? n : end + (src.startsWith("--!>", end) ? 4 : 3);
      } else {
        const end = src.indexOf(">", lt);
        i = end === -1 ? n : end + 1;
      }
      continue;
    }
    if (c === "/") {
      TAG_NAME.lastIndex = lt + 2;
      const m = TAG_NAME.exec(src);
      const end = src.indexOf(">", lt);
      i = end === -1 ? n : end + 1;
      if (!m) continue;
      const name = m[0].toLowerCase();
      if (ALLOWED_TAGS[name] && !VOID_TAGS.has(name)) out.push(`</${name}>`);
      continue;
    }
    TAG_NAME.lastIndex = lt + 1;
    const nm = TAG_NAME.exec(src);
    if (!nm) {
      out.push("&lt;");
      i = lt + 1;
      continue;
    }
    const name = nm[0].toLowerCase();
    let p = TAG_NAME.lastIndex;
    const attrs = [];
    let closed = false;
    let selfClosing = false;
    while (p < n) {
      while (p < n && (WS.has(src[p]) || src[p] === "/")) p += 1;
      if (p >= n) break;
      if (src[p] === ">") {
        selfClosing = src[p - 1] === "/";
        closed = true;
        p += 1;
        break;
      }
      ATTR_NAME.lastIndex = p;
      const an = ATTR_NAME.exec(src);
      const attrName = an?.[0] || src[p];
      p = an ? ATTR_NAME.lastIndex : p + 1;
      while (p < n && WS.has(src[p])) p += 1;
      let value = "";
      if (src[p] === "=") {
        p += 1;
        while (p < n && WS.has(src[p])) p += 1;
        const q = src[p];
        if (q === '"' || q === "'") {
          const e = src.indexOf(q, p + 1);
          if (e === -1) {
            p = n;
            break;
          }
          value = src.slice(p + 1, e);
          p = e + 1;
        } else {
          UNQUOTED_VALUE.lastIndex = p;
          const uv = UNQUOTED_VALUE.exec(src);
          value = uv?.[0] || "";
          p = UNQUOTED_VALUE.lastIndex;
        }
      }
      attrs.push([attrName.toLowerCase(), value]);
    }
    i = p;
    if (!closed) continue;

    if (name === "style") {
      const re = /<\/style[\s/>]/gi;
      re.lastIndex = i;
      const m = re.exec(src);
      const bodyEnd = m ? m.index : n;
      out.push(`<style>${sanitizeStyleSheet(src.slice(i, bodyEnd), allowRemote, toProxy)}</style>`);
      if (!m) {
        i = n;
        continue;
      }
      const gt = src.indexOf(">", m.index);
      i = gt === -1 ? n : gt + 1;
      continue;
    }
    if (RAW_TEXT_TAGS.has(name)) {
      const re = new RegExp(`</${name}[\\s/>]`, "gi");
      re.lastIndex = i;
      const m = re.exec(src);
      if (!m) {
        i = n;
        continue;
      }
      const gt = src.indexOf(">", m.index);
      i = gt === -1 ? n : gt + 1;
      continue;
    }
    if (NESTED_DROP_TAGS.has(name) && !selfClosing) {
      const re = new RegExp(`<(/?)(${name}${name === "head" ? "|body" : ""})(?=[\\s/>])`, "gi");
      re.lastIndex = i;
      let depth = 1;
      while (depth > 0) {
        const m = re.exec(src);
        if (!m) {
          i = n;
          break;
        }
        if (m[2].toLowerCase() !== name) {
          i = m.index;
          break;
        }
        depth += m[1] ? -1 : 1;
        if (depth === 0) {
          const gt = src.indexOf(">", m.index);
          i = gt === -1 ? n : gt + 1;
        }
      }
      continue;
    }
    const allowed = ALLOWED_TAGS[name];
    if (!allowed) continue;

    const kept = new Map();
    let blockedSrc = null;
    for (const [attrName, raw] of attrs) {
      if (!allowed.has(attrName)) continue;
      const value = decodeEntities(raw);
      if (attrName === "style") {
        const css = sanitizeDeclarations(value, allowRemote, toProxy);
        if (css) kept.set("style", css);
        continue;
      }
      if (attrName === "href") {
        if (!isDangerousUrl(value, HREF_SCHEMES)) kept.set("href", value);
        continue;
      }
      if (attrName === "srcset") {
        if (!allowRemote) continue;
        const proxied = toProxy
          ? proxySrcset(value, toProxy)
          : value
                .split(",")
                .some((part) => isDangerousUrl(part.trim().split(/\s+/)[0], SRC_SCHEMES))
            ? ""
            : value;
        if (proxied) kept.set("srcset", proxied);
        continue;
      }
      if (URL_ATTRS.has(attrName)) {
        if (name === "img" && attrName === "src" && value.startsWith("cid:")) {
          const cid = value.slice(4).replace(/^<|>$/g, "");
          const url = cidMap[cid] || cidMap[`<${cid}>`] || "";
          kept.set("src", url);
          if (!url && !kept.has("alt")) kept.set("alt", "inline image");
          continue;
        }
        if (DATA_IMAGE_OK.test(stripUrlJunk(value))) {
          kept.set(attrName, value);
          continue;
        }
        if (isDangerousUrl(value, SRC_SCHEMES)) continue;
        if (value.startsWith("/api/attachments/")) {
          kept.set(attrName, value);
          continue;
        }
        if (!allowRemote) {
          if (name === "img" && attrName === "src") blockedSrc = value;
          continue;
        }
        if (!toProxy) {
          kept.set(attrName, value);
          continue;
        }
        const proxied = toProxy(value);
        if (proxied) kept.set(attrName, proxied);
        continue;
      }
      kept.set(attrName, value);
    }
    if (blockedSrc !== null) {
      kept.set("data-blocked-src", blockedSrc);
      kept.set("class", `${kept.get("class") ? `${kept.get("class")} ` : ""}blocked-img`);
    }
    if (name === "a") {
      kept.set("target", "_blank");
      kept.set("rel", "noopener noreferrer nofollow");
    }
    let tag = `<${name}`;
    for (const [k, v] of kept) tag += ` ${k}="${escapeAttr(v)}"`;
    out.push(`${tag}>`);
  }
  return neutralizeDarkColors(out.join(""));
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
