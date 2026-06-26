export function json(data, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function error(status, message, extra = {}) {
  return json({ error: message, ...extra }, { status });
}

export function uuid() {
  return crypto.randomUUID();
}

export function now() {
  return Date.now();
}

export function randomToken(bytes = 32) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomCode(len = 10) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function snippetFrom(text, len = 200) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, len);
}

export function parseCookies(request) {
  const header = request.headers.get("cookie") || "";
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function normalizeAddr(addr) {
  return String(addr || "")
    .trim()
    .toLowerCase();
}

const ADDR_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export function isValidEmail(addr) {
  return ADDR_RE.test(normalizeAddr(addr));
}

export function displayAddr(value) {
  if (!value) return { name: "", address: "" };
  const m = String(value).match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), address: normalizeAddr(m[2]) };
  return { name: "", address: normalizeAddr(value) };
}

export function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
