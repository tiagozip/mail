export function relativeTime(ms) {
  if (!ms) return "";
  const now = Date.now();
  const diff = now - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

export function fullDate(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function humanSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

export function displayName(person) {
  if (!person) return "";
  return person.name || person.address || "";
}

export function initials(person) {
  const base = (person?.name || person?.address || "?").trim();
  const parts = base.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`;
  return base.slice(0, 2);
}

const MONO_COLORS = [
  "#bf3264",
  "#c2557e",
  "#8b6fd6",
  "#5a86e6",
  "#3fa8a0",
  "#5f9a52",
  "#c98a30",
  "#d2693f",
];

export function monoColor(seed) {
  const str = String(seed || "");
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return MONO_COLORS[h % MONO_COLORS.length];
}

export function recipientLine(list) {
  if (!list?.length) return "";
  return list.map((p) => p.name || p.address).join(", ");
}

export function senderLabel(item, selfAddresses) {
  const selves = new Set((selfAddresses || []).map((a) => a.toLowerCase()));
  const outgoing = item.folder === "sent" || item.folder === "drafts";
  if (outgoing) {
    const names = (item.to || []).map((t) => t.name || t.address);
    return `To ${names.join(", ") || "(no recipient)"}`;
  }
  const names = [];
  for (const m of item._members || [item]) {
    const out = m.folder === "sent" || m.folder === "drafts";
    const isSelf = out || (m.from?.address && selves.has(m.from.address.toLowerCase()));
    const label = isSelf ? "you" : displayName(m.from) || m.from?.address || "(unknown)";
    if (!names.includes(label)) names.push(label);
  }
  if (!names.length) return displayName(item.from) || item.from?.address || "(unknown)";
  if (names.length <= 2) return names.join(", ");
  return `${names[0]}, ${names[names.length - 1]}`;
}

export function groupThreads(messages) {
  const order = [];
  const byThread = new Map();
  for (const m of messages) {
    const key = m.threadId || m.id;
    const bucket = byThread.get(key);
    if (bucket) {
      bucket.members.push(m);
      if ((m.date || 0) >= (bucket.rep.date || 0)) bucket.rep = m;
    } else {
      byThread.set(key, { rep: m, members: [m] });
      order.push(key);
    }
  }
  return order.map((key) => {
    const { rep, members } = byThread.get(key);
    const sorted = [...members].sort((a, b) => (a.date || 0) - (b.date || 0));
    const anyUnread = members.some((m) => !m.isRead);
    const anyStarred = members.some((m) => m.isStarred);
    const anyAttachments = members.some((m) => m.hasAttachments);
    return {
      ...rep,
      _members: sorted,
      _count: members.length,
      isRead: !anyUnread,
      isStarred: anyStarred,
      hasAttachments: anyAttachments,
    };
  });
}

export function parseRecipients(raw) {
  return String(raw || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const URL_RE = /(https?:\/\/[^\s<]+)/g;

export function linkifyParts(text) {
  const out = [];
  let last = 0;
  const str = String(text || "");
  str.replace(URL_RE, (match, _g, offset) => {
    if (offset > last) out.push({ t: "text", v: str.slice(last, offset) });
    out.push({ t: "link", v: match });
    last = offset + match.length;
    return match;
  });
  if (last < str.length) out.push({ t: "text", v: str.slice(last) });
  return out;
}

export function splitQuoted(text) {
  const str = String(text || "");
  const lines = str.split("\n");
  let cut = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*>/.test(line)) {
      cut = i;
      break;
    }
    if (/^\s*On .+wrote:\s*$/.test(line) || /^\s*-{2,}\s*(Original Message|Forwarded message)/i.test(line)) {
      cut = i;
      break;
    }
  }
  if (cut < 0) return { main: str, quoted: "" };
  let start = cut;
  while (start > 0 && lines[start - 1].trim() === "") start -= 1;
  return {
    main: lines.slice(0, start).join("\n"),
    quoted: lines.slice(start).join("\n"),
  };
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function plainBodyToHtml(text) {
  const str = String(text || "");
  if (!str.trim()) return "";
  const lines = str.replace(/^\n+/, "").split("\n");
  const out = ['<p></p>'];
  const block = [];
  for (const line of lines) {
    block.push(escapeHtml(line.replace(/^>\s?/, "")));
  }
  const joined = block.join("<br>");
  out.push(`<blockquote>${joined || "<br>"}</blockquote>`);
  return out.join("");
}

export function htmlHasBlockedImages(html) {
  if (!html) return false;
  return html.includes("data-blocked-src") || html.includes("blocked-img");
}

export function imagesDefaultOn(user) {
  if (user?.settings?.imagesDefault) return true;
  try {
    return localStorage.getItem("em-images-default") === "1";
  } catch {
    return false;
  }
}

export const FOLDER_LABELS = {
  inbox: "Inbox",
  starred: "Starred",
  sent: "Sent",
  drafts: "Drafts",
  archive: "Archive",
  spam: "Spam",
  trash: "Trash",
};

const QUOTA = 500 * 1024 * 1024;
export const STORAGE_QUOTA = QUOTA;
