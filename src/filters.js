import { isValidEmail, normalizeAddr } from "./util.js";

export const FILTER_FIELDS = [
  "from",
  "from_address",
  "from_domain",
  "to",
  "cc",
  "delivered_to",
  "subject",
  "body",
  "attachment_name",
  "has_attachment",
  "header",
];
export const FILTER_OPS = [
  "contains",
  "not_contains",
  "is",
  "is_not",
  "starts_with",
  "ends_with",
  "matches",
  "not_matches",
  "exists",
  "not_exists",
];
export const FILTER_ACTIONS = [
  "read",
  "star",
  "archive",
  "trash",
  "spam",
  "never_spam",
  "block",
  "label",
  "move",
  "forward",
];
export const MAX_FORWARD_TARGETS = 5;
export const MAX_FILTERS = 100;
const MAX_CONDITIONS = 20;
const MAX_HAY = 20000;
const NEGATED = {
  not_contains: "contains",
  is_not: "is",
  not_matches: "matches",
  not_exists: "exists",
};
const VALUELESS = new Set(["exists", "not_exists"]);
const LEGACY_FIELDS = new Set(["from", "to", "delivered_to", "subject"]);

export function normalizeFilter(row) {
  let conditions = null;
  let actions = null;
  try {
    conditions = row.conditions_json ? JSON.parse(row.conditions_json) : null;
    actions = row.actions_json ? JSON.parse(row.actions_json) : null;
  } catch {}
  if (!Array.isArray(conditions))
    conditions = LEGACY_FIELDS.has(row.field)
      ? [{ field: row.field, op: "contains", value: row.match_value || "" }]
      : [];
  if (!Array.isArray(actions))
    actions = row.action ? [{ type: row.action, value: row.action_value || undefined }] : [];
  return {
    id: row.id,
    name: row.name || "",
    match: row.match_mode === "any" ? "any" : "all",
    conditions,
    actions,
    enabled: row.enabled !== 0,
    stop: !!row.stop,
    hits: row.hits || 0,
    lastHitAt: row.last_hit_at || null,
    position: row.position || 0,
  };
}

export function validateFilter(b, { labels, folders }) {
  const conditions = [];
  for (const c of Array.isArray(b?.conditions) ? b.conditions : []) {
    if (!FILTER_FIELDS.includes(c?.field)) return { error: "unknown condition field" };
    const valueless = c.field === "has_attachment";
    const op = valueless ? (c.op === "not_exists" ? "not_exists" : "exists") : c.op;
    if (!FILTER_OPS.includes(op)) return { error: "unknown condition operator" };
    if (!valueless && VALUELESS.has(op) && c.field !== "header")
      return { error: "that operator only works on headers and attachments" };
    const value = VALUELESS.has(op)
      ? ""
      : String(c.value ?? "")
          .trim()
          .slice(0, 500);
    if (!VALUELESS.has(op) && !value) return { error: "every condition needs a value" };
    if (op === "matches" || op === "not_matches") {
      if (value.length > 200) return { error: "patterns are limited to 200 characters" };
      try {
        new RegExp(value, "i");
      } catch {
        return { error: `invalid pattern: ${value}` };
      }
    }
    const cond = { field: c.field, op, value };
    if (c.field === "header") {
      const header = String(c.header || "")
        .trim()
        .toLowerCase();
      if (!/^[a-z0-9-]{1,64}$/.test(header)) return { error: "enter a header name" };
      cond.header = header;
    }
    conditions.push(cond);
  }
  if (!conditions.length) return { error: "add at least one condition" };
  if (conditions.length > MAX_CONDITIONS) return { error: `up to ${MAX_CONDITIONS} conditions` };

  const actions = [];
  const seen = new Set();
  let forwards = 0;
  for (const a of Array.isArray(b?.actions) ? b.actions : []) {
    if (!FILTER_ACTIONS.includes(a?.type)) return { error: "unknown action" };
    const key = `${a.type}:${a.value || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (a.type === "forward") {
      const to = normalizeAddr(a.value || "");
      if (!isValidEmail(to)) return { error: "a valid forwarding address is required" };
      if (++forwards > MAX_FORWARD_TARGETS) return { error: "too many forwarding addresses" };
      actions.push({ type: "forward", value: to });
    } else if (a.type === "label") {
      if (!labels.has(a.value)) return { error: "pick a label" };
      actions.push({ type: "label", value: a.value });
    } else if (a.type === "move") {
      if (!folders.has(a.value)) return { error: "pick a folder" };
      actions.push({ type: "move", value: a.value });
    } else actions.push({ type: a.type });
  }
  if (!actions.length) return { error: "add at least one action" };
  if (actions.some((a) => a.type === "block") && actions.length > 1)
    return { error: "block can't be combined with other actions" };

  return {
    filter: {
      name: String(b.name || "")
        .trim()
        .slice(0, 80),
      match: b.match === "any" ? "any" : "all",
      conditions,
      actions,
      enabled: b.enabled !== false,
      stop: !!b.stop,
    },
  };
}

export function messageFields(msg) {
  const lower = (v) =>
    String(v || "")
      .toLowerCase()
      .slice(0, MAX_HAY);
  const people = (list) => (list || []).map((p) => lower(p.address)).filter(Boolean);
  const fromAddress = lower(msg.fromAddr);
  const headerBlock = String(msg.headerBlock || "");
  return {
    from: [`${lower(msg.fromName)} ${fromAddress}`.trim(), fromAddress],
    from_address: [fromAddress],
    from_domain: [fromAddress.split("@")[1] || ""],
    to: [...people(msg.to), ...(msg.to || []).map((p) => lower(p.name)).filter(Boolean)],
    cc: [...people(msg.cc), ...(msg.cc || []).map((p) => lower(p.name)).filter(Boolean)],
    delivered_to: [lower(msg.deliveredTo)],
    subject: [lower(msg.subject)],
    body: [lower(msg.body)],
    attachment_name: (msg.attachments || []).map(lower),
    has_attachment: (msg.attachments || []).length > 0,
    header: (name) => {
      if (!headerBlock) return null;
      const re = new RegExp(`^${name}:[ \\t]*(.*(?:\\r?\\n[ \\t].*)*)`, "im");
      const m = headerBlock.match(re);
      return m ? [lower(m[1].replace(/\r?\n[ \t]+/g, " "))] : null;
    },
  };
}

function test(op, values, needle, regex) {
  if (op === "contains") return values.some((v) => v.includes(needle));
  if (op === "is") return values.some((v) => v === needle);
  if (op === "starts_with") return values.some((v) => v.startsWith(needle));
  if (op === "ends_with") return values.some((v) => v.endsWith(needle));
  if (op === "matches") return values.some((v) => regex.test(v));
  return false;
}

function conditionHolds(c, fields, cache) {
  if (c.field === "has_attachment")
    return c.op === "not_exists" ? !fields.has_attachment : fields.has_attachment;
  const values = c.field === "header" ? fields.header(c.header) : fields[c.field];
  if (c.op === "exists") return values != null;
  if (c.op === "not_exists") return values == null;
  const positive = NEGATED[c.op] || c.op;
  let regex = null;
  if (positive === "matches") {
    regex = cache.get(c.value);
    if (regex === undefined) {
      try {
        regex = new RegExp(c.value, "i");
      } catch {
        regex = null;
      }
      cache.set(c.value, regex);
    }
    if (!regex) return false;
  }
  const hit = test(positive, values || [], String(c.value || "").toLowerCase(), regex);
  return NEGATED[c.op] ? !hit : hit;
}

export function filterMatches(filter, fields, cache = new Map()) {
  if (!filter.conditions.length) return false;
  return filter.match === "any"
    ? filter.conditions.some((c) => conditionHolds(c, fields, cache))
    : filter.conditions.every((c) => conditionHolds(c, fields, cache));
}

export function evaluateFilters(filters, msg) {
  const fields = messageFields(msg);
  const cache = new Map();
  const out = {
    block: false,
    folder: null,
    folderId: null,
    read: false,
    star: false,
    neverSpam: false,
    labels: [],
    forwards: [],
    hits: [],
  };
  for (const f of filters) {
    if (!f.enabled || !filterMatches(f, fields, cache)) continue;
    out.hits.push(f.id);
    for (const a of f.actions) {
      if (a.type === "block") out.block = true;
      else if (a.type === "read") out.read = true;
      else if (a.type === "star") out.star = true;
      else if (a.type === "never_spam") out.neverSpam = true;
      else if (a.type === "archive" || a.type === "trash" || a.type === "spam") {
        out.folder = a.type;
        out.folderId = null;
      } else if (a.type === "move") {
        out.folder = "inbox";
        out.folderId = a.value;
      } else if (a.type === "label" && !out.labels.includes(a.value)) out.labels.push(a.value);
      else if (
        a.type === "forward" &&
        !out.forwards.includes(a.value) &&
        out.forwards.length < MAX_FORWARD_TARGETS
      )
        out.forwards.push(a.value);
    }
    if (out.block || f.stop) break;
  }
  return out;
}

export async function loadFilters(env, userId) {
  const res = await env.DB.prepare(
    "SELECT * FROM filters WHERE user_id = ? ORDER BY position, created_at",
  )
    .bind(userId)
    .all();
  return (res.results || []).map(normalizeFilter);
}
