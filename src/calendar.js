import { consume } from "./ratelimit.js";
import { sendMessage } from "./send.js";
import {
  clampInt,
  error,
  escapeHtml,
  isValidEmail,
  json,
  normalizeAddr,
  now,
  randomToken,
  uuid,
} from "./util.js";

const DAY_MS = 86400000;
const MAX_RANGE = 120 * DAY_MS;
const MAX_OCCURRENCES = 500;
const MAX_GUESTS = 50;
const RSVP = new Set(["accepted", "declined", "tentative"]);
const COLORS = new Set(["rose", "violet", "blue", "teal", "green", "amber", "gray"]);
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

const WINDOWS_ZONES = {
  "W. Europe Standard Time": "Europe/Berlin",
  "Central Europe Standard Time": "Europe/Budapest",
  "Romance Standard Time": "Europe/Paris",
  "Central European Standard Time": "Europe/Warsaw",
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "E. Europe Standard Time": "Europe/Chisinau",
  "FLE Standard Time": "Europe/Kiev",
  "GTB Standard Time": "Europe/Bucharest",
  "Russian Standard Time": "Europe/Moscow",
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "US Mountain Standard Time": "America/Phoenix",
  "Pacific Standard Time": "America/Los_Angeles",
  "Alaskan Standard Time": "America/Anchorage",
  "Hawaiian Standard Time": "Pacific/Honolulu",
  "Atlantic Standard Time": "America/Halifax",
  "E. South America Standard Time": "America/Sao_Paulo",
  "India Standard Time": "Asia/Kolkata",
  "China Standard Time": "Asia/Shanghai",
  "Tokyo Standard Time": "Asia/Tokyo",
  "Korea Standard Time": "Asia/Seoul",
  "Singapore Standard Time": "Asia/Singapore",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "New Zealand Standard Time": "Pacific/Auckland",
  "Israel Standard Time": "Asia/Jerusalem",
  "Arabian Standard Time": "Asia/Dubai",
  "South Africa Standard Time": "Africa/Johannesburg",
  UTC: "UTC",
};

function unfold(text) {
  return String(text || "")
    .replace(/\r\n|\r/g, "\n")
    .replace(/\n[ \t]/g, "");
}

function unescapeText(v) {
  return String(v || "").replace(/\\([nN,;\\])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
}

function escapeText(v) {
  return String(v || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function parseLine(line) {
  let i = 0;
  let inQuote = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuote = !inQuote;
    else if (c === ":" && !inQuote) break;
  }
  const head = line.slice(0, i);
  const value = line.slice(i + 1);
  const parts = head.match(/(?:[^;"]|"[^"]*")+/g) || [head];
  const params = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: parts[0].toUpperCase(), params, value };
}

export function validZone(tz) {
  if (!tz) return null;
  const name = WINDOWS_ZONES[tz] || String(tz).replace(/^\/+/, "");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return name;
  } catch {
    return null;
  }
}

function zoneOffset(tz, ts) {
  if (!tz || tz === "UTC") return 0;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ts));
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  return (
    Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) -
    ts
  );
}

function wallToUtc(tz, wall) {
  if (!tz || tz === "UTC") return wall;
  const first = wall - zoneOffset(tz, wall);
  return wall - zoneOffset(tz, first);
}

function utcToWall(tz, ts) {
  return ts + zoneOffset(tz, ts);
}

function parseDateValue(value, params) {
  const m = String(value || "")
    .trim()
    .match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined || params.VALUE === "DATE") {
    return { ts: Date.UTC(+y, +mo - 1, +d), allDay: true, tz: null };
  }
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0));
  if (z) return { ts: wall, allDay: false, tz: null };
  const tz = validZone(params.TZID);
  return { ts: wallToUtc(tz, wall), allDay: false, tz };
}

function parseDate(prop) {
  return prop ? parseDateValue(prop.value, prop.params) : null;
}

function parseDuration(v) {
  const m = String(v || "").match(
    /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
  );
  if (!m) return null;
  const [, sign, w, d, h, mi, s] = m;
  const ms =
    ((+w || 0) * 7 * 86400 + (+d || 0) * 86400 + (+h || 0) * 3600 + (+mi || 0) * 60 + (+s || 0)) *
    1000;
  return sign === "-" ? -ms : ms;
}

function mailtoOf(v) {
  return normalizeAddr(String(v || "").replace(/^mailto:/i, ""));
}

export function parseIcs(text) {
  const lines = unfold(text).split("\n");
  let method = "";
  const events = [];
  let cur = null;
  let depth = 0;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const p = parseLine(raw);
    if (p.name === "METHOD" && !cur) method = p.value.trim().toUpperCase();
    if (p.name === "BEGIN" && p.value.toUpperCase() === "VEVENT") {
      cur = { props: {}, attendees: [], exdates: [] };
      depth = 0;
      continue;
    }
    if (!cur) continue;
    if (p.name === "BEGIN") {
      depth++;
      continue;
    }
    if (p.name === "END" && depth > 0) {
      depth--;
      continue;
    }
    if (p.name === "END" && p.value.toUpperCase() === "VEVENT") {
      events.push(cur);
      cur = null;
      continue;
    }
    if (depth > 0) continue;
    if (p.name === "ATTENDEE") cur.attendees.push(p);
    else if (p.name === "EXDATE") {
      for (const v of p.value.split(",")) {
        const d = parseDateValue(v, p.params);
        if (d) cur.exdates.push(d.ts);
      }
    } else if (!cur.props[p.name]) cur.props[p.name] = p;
  }
  return {
    method,
    events: events
      .map((e) => {
        const start = parseDate(e.props.DTSTART);
        if (!start || !e.props.UID) return null;
        let end = parseDate(e.props.DTEND)?.ts;
        if (!end && e.props.DURATION) end = start.ts + (parseDuration(e.props.DURATION.value) || 0);
        if (!end || end < start.ts) end = start.ts + (start.allDay ? DAY_MS : 3600000);
        const org = e.props.ORGANIZER;
        return {
          uid: e.props.UID.value.trim().slice(0, 500),
          recurrenceId: parseDate(e.props["RECURRENCE-ID"])?.ts || 0,
          title: unescapeText(e.props.SUMMARY?.value).slice(0, 500),
          description: unescapeText(e.props.DESCRIPTION?.value).slice(0, 8000),
          location: unescapeText(e.props.LOCATION?.value).slice(0, 1000),
          start: start.ts,
          end,
          allDay: start.allDay,
          tz: start.tz,
          rrule: e.props.RRULE?.value?.trim().slice(0, 500) || null,
          exdates: e.exdates.slice(0, 500),
          status: (e.props.STATUS?.value || "CONFIRMED").trim().toLowerCase(),
          sequence: Number.parseInt(e.props.SEQUENCE?.value || "0", 10) || 0,
          organizer: org ? mailtoOf(org.value) : null,
          organizerName: org?.params.CN || null,
          attendees: e.attendees.slice(0, 200).map((a) => ({
            address: mailtoOf(a.value),
            name: a.params.CN || "",
            status: (a.params.PARTSTAT || "NEEDS-ACTION").toLowerCase(),
          })),
        };
      })
      .filter(Boolean),
  };
}

function fmtUtc(ts) {
  return `${new Date(ts).toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

function fmtDate(ts) {
  return new Date(ts).toISOString().slice(0, 10).replace(/-/g, "");
}

function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

function attendeesOf(row) {
  try {
    return JSON.parse(row.attendees_json || "[]");
  } catch {
    return [];
  }
}

function exdatesOf(row) {
  try {
    return JSON.parse(row.exdates || "[]");
  } catch {
    return [];
  }
}

function veventLines(ev, { extra = [], withAttendees = false, recurrenceId = 0 } = {}) {
  const date = (ts) => (ev.all_day ? `;VALUE=DATE:${fmtDate(ts)}` : `:${fmtUtc(ts)}`);
  const rid = recurrenceId || ev.recurrence_id || 0;
  const lines = [
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `DTSTAMP:${fmtUtc(now())}`,
    `DTSTART${date(ev.start_at)}`,
    `DTEND${date(ev.end_at)}`,
    `SUMMARY:${escapeText(ev.title)}`,
    `SEQUENCE:${ev.sequence || 0}`,
  ];
  if (rid) lines.push(`RECURRENCE-ID${date(rid)}`);
  if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
  if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
  if (ev.rrule && !rid) {
    lines.push(`RRULE:${ev.rrule}`);
    for (const x of exdatesOf(ev)) lines.push(`EXDATE${date(x)}`);
  }
  if (ev.status === "cancelled") lines.push("STATUS:CANCELLED");
  if (ev.organizer) {
    const cn = ev.organizer_name ? `;CN=${escapeText(ev.organizer_name)}` : "";
    lines.push(`ORGANIZER${cn}:mailto:${ev.organizer}`);
  }
  if (withAttendees) {
    for (const a of attendeesOf(ev)) {
      const cn = a.name ? `;CN=${escapeText(a.name)}` : "";
      lines.push(
        `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=${String(a.status || "needs-action").toUpperCase()};RSVP=TRUE${cn}:mailto:${a.address}`,
      );
    }
  }
  lines.push(...extra, "END:VEVENT");
  return lines;
}

function wrapCalendar(lines, method) {
  const head = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Estrogen Mail//Calendar//EN",
    "CALSCALE:GREGORIAN",
  ];
  if (method) head.push(`METHOD:${method}`);
  return `${[...head, ...lines, "END:VCALENDAR"].map(fold).join("\r\n")}\r\n`;
}

function isOwned(r) {
  return !r.organizer || r.organizer === r.my_address;
}

function shape(r) {
  const attendees = attendeesOf(r);
  return {
    id: r.id,
    uid: r.uid,
    title: r.title,
    description: r.description,
    location: r.location,
    start: r.start_at,
    end: r.end_at,
    allDay: !!r.all_day,
    tz: r.tz,
    rrule: r.rrule,
    exdates: exdatesOf(r),
    recurrenceId: r.recurrence_id || 0,
    color: r.color,
    reminder: r.reminder_min ?? 10,
    status: r.status,
    organizer: r.organizer,
    organizerName: r.organizer_name,
    attendees,
    owned: isOwned(r),
    myStatus: r.my_status,
    myAddress: r.my_address,
    sourceMessageId: r.source_message_id,
    updatedAt: r.updated_at,
  };
}

function expand(ev, from, to, overridden) {
  if (!ev.rrule) return ev.end > from && ev.start < to ? [ev] : [];
  const rule = Object.fromEntries(
    ev.rrule.split(";").map((kv) => {
      const [k, v] = kv.split("=");
      return [k.toUpperCase(), v || ""];
    }),
  );
  const freq = rule.FREQ;
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) {
    return ev.end > from && ev.start < to ? [ev] : [];
  }
  const tz = ev.allDay ? "UTC" : ev.tz || "UTC";
  const interval = Math.max(1, Number.parseInt(rule.INTERVAL || "1", 10) || 1);
  const count = Number.parseInt(rule.COUNT || "0", 10) || 0;
  const until = rule.UNTIL ? parseDateValue(rule.UNTIL, {})?.ts || 0 : 0;
  const dur = ev.end - ev.start;
  const skip = new Set([...(ev.exdates || []), ...(overridden || [])]);
  const byDay = [
    ...new Set(
      (rule.BYDAY || "")
        .split(",")
        .map((d) => WEEKDAYS.indexOf(d.slice(-2)))
        .filter((d) => d >= 0),
    ),
  ].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const baseWall = utcToWall(tz, ev.start);
  const base = new Date(baseWall);
  const out = [];
  let n = 0;
  const done = (ts) =>
    (count && n >= count) || (until && ts > until) || ts >= to || out.length >= MAX_OCCURRENCES;
  const push = (ts) => {
    n++;
    if (skip.has(ts)) return;
    if (ts + dur > from && ts < to)
      out.push({ ...ev, start: ts, end: ts + dur, occurrence: ts, seriesStart: ev.start });
  };
  for (let i = 0; i < 5000; i++) {
    if (freq === "WEEKLY" && byDay.length) {
      const mondayWall = baseWall - ((base.getUTCDay() + 6) % 7) * DAY_MS;
      const weekWall = mondayWall + i * interval * 7 * DAY_MS;
      let stop = false;
      for (const d of byDay) {
        const wall = weekWall + ((d + 6) % 7) * DAY_MS;
        if (wall < baseWall) continue;
        const ts = wallToUtc(tz, wall);
        if (done(ts)) {
          stop = true;
          break;
        }
        push(ts);
      }
      if (stop) break;
      continue;
    }
    const d = new Date(base);
    if (freq === "DAILY") d.setUTCDate(d.getUTCDate() + i * interval);
    else if (freq === "WEEKLY") d.setUTCDate(d.getUTCDate() + i * interval * 7);
    else if (freq === "MONTHLY") {
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + i * interval);
      const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      if (base.getUTCDate() > last) continue;
      d.setUTCDate(base.getUTCDate());
    } else d.setUTCFullYear(d.getUTCFullYear() + i * interval);
    const ts = wallToUtc(tz, d.getTime());
    if (done(ts)) break;
    push(ts);
  }
  return out;
}

async function userAddresses(env, userId, primary) {
  const { results } = await env.DB.prepare("SELECT address FROM addresses WHERE user_id = ?")
    .bind(userId)
    .all();
  return new Set([primary, ...(results || []).map((r) => r.address)].map(normalizeAddr));
}

async function eventById(env, id) {
  return env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(id).first();
}

export async function ingestCalendar(env, user, icsText, messageId) {
  const { method, events } = parseIcs(icsText);
  if (!events.length) return;
  const mine = await userAddresses(env, user.id, user.address);
  const t = now();
  for (const e of events.slice(0, 20)) {
    const existing = await env.DB.prepare(
      "SELECT * FROM events WHERE user_id = ? AND uid = ? AND recurrence_id = ?",
    )
      .bind(user.id, e.uid, e.recurrenceId)
      .first();
    if (method === "REPLY") {
      const target =
        existing ||
        (await env.DB.prepare(
          "SELECT * FROM events WHERE user_id = ? AND uid = ? AND recurrence_id = 0",
        )
          .bind(user.id, e.uid)
          .first());
      if (!target || !isOwned(target)) continue;
      const atts = attendeesOf(target);
      for (const a of e.attendees) {
        const hit = atts.find((x) => x.address === a.address);
        if (hit) hit.status = a.status;
      }
      await env.DB.prepare("UPDATE events SET attendees_json = ?, updated_at = ? WHERE id = ?")
        .bind(JSON.stringify(atts), t, target.id)
        .run();
      continue;
    }
    if (e.organizer && mine.has(e.organizer)) continue;
    if (existing && existing.sequence > e.sequence) continue;
    if (method === "CANCEL" && e.recurrenceId && !existing) {
      const master = await env.DB.prepare(
        "SELECT * FROM events WHERE user_id = ? AND uid = ? AND recurrence_id = 0",
      )
        .bind(user.id, e.uid)
        .first();
      if (master) {
        const ex = [...new Set([...exdatesOf(master), e.recurrenceId])];
        await env.DB.prepare("UPDATE events SET exdates = ?, updated_at = ? WHERE id = ?")
          .bind(JSON.stringify(ex), t, master.id)
          .run();
      }
      continue;
    }
    const me = e.attendees.find((a) => mine.has(a.address));
    const status = method === "CANCEL" ? "cancelled" : e.status;
    if (existing) {
      await env.DB.prepare(
        "UPDATE events SET title = ?, description = ?, location = ?, start_at = ?, end_at = ?, all_day = ?, tz = ?, rrule = ?, exdates = ?, status = ?, organizer = ?, organizer_name = ?, attendees_json = ?, sequence = ?, source_message_id = ?, updated_at = ? WHERE id = ?",
      )
        .bind(
          e.title,
          e.description,
          e.location,
          e.start,
          e.end,
          e.allDay ? 1 : 0,
          e.tz,
          e.rrule,
          JSON.stringify(e.exdates),
          status,
          e.organizer,
          e.organizerName,
          JSON.stringify(e.attendees),
          e.sequence,
          messageId,
          t,
          existing.id,
        )
        .run();
      continue;
    }
    if (method === "CANCEL") continue;
    const master = e.recurrenceId
      ? await env.DB.prepare(
          "SELECT my_status FROM events WHERE user_id = ? AND uid = ? AND recurrence_id = 0",
        )
          .bind(user.id, e.uid)
          .first()
      : null;
    await env.DB.prepare(
      "INSERT INTO events (id, user_id, uid, recurrence_id, title, description, location, start_at, end_at, all_day, tz, rrule, exdates, status, organizer, organizer_name, attendees_json, my_address, my_status, sequence, source_message_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        uuid(),
        user.id,
        e.uid,
        e.recurrenceId,
        e.title,
        e.description,
        e.location,
        e.start,
        e.end,
        e.allDay ? 1 : 0,
        e.tz,
        e.rrule,
        JSON.stringify(e.exdates),
        status,
        e.organizer,
        e.organizerName,
        JSON.stringify(e.attendees),
        me?.address || null,
        master?.my_status || (method === "REQUEST" ? "needs-action" : null),
        e.sequence,
        messageId,
        t,
        t,
      )
      .run();
  }
}

function readEventBody(b) {
  const title = String(b.title || "")
    .trim()
    .slice(0, 500);
  const start = Number(b.start);
  const end = Number(b.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  if (end - start > 366 * DAY_MS) return null;
  const rrule = b.rrule ? String(b.rrule).toUpperCase().slice(0, 200) : null;
  if (rrule && !/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,]+)*$/.test(rrule))
    return null;
  const guests = [
    ...new Set(
      (Array.isArray(b.guests) ? b.guests : [])
        .map((g) => normalizeAddr(typeof g === "string" ? g : g?.address))
        .filter(isValidEmail),
    ),
  ];
  if (guests.length > MAX_GUESTS) return null;
  return {
    title: title || "Untitled",
    description: String(b.description || "").slice(0, 8000),
    location: String(b.location || "").slice(0, 1000),
    start,
    end,
    allDay: b.allDay ? 1 : 0,
    tz: validZone(b.tz) || "UTC",
    rrule,
    color: COLORS.has(b.color) ? b.color : null,
    reminder: clampInt(b.reminder, -1, 10080, 10),
    guests,
  };
}

function whenText(row) {
  const tz = row.all_day ? "UTC" : row.tz || "UTC";
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  if (row.all_day) return `${day.format(new Date(row.start_at))}, all day`;
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return `${day.format(new Date(row.start_at))}, ${time.format(new Date(row.start_at))} to ${time.format(new Date(row.end_at))}`;
}

async function sendInvite(env, user, row, method, recipients, recurrenceId = 0) {
  const to = recipients.filter((a) => a !== row.organizer);
  if (!to.length) return null;
  const rl = await consume(env, "send", user.id);
  if (!rl.ok) return rl.message;
  const dur = row.end_at - row.start_at;
  const base = recurrenceId ? { ...row, start_at: recurrenceId, end_at: recurrenceId + dur } : row;
  const ics = wrapCalendar(
    veventLines(method === "CANCEL" ? { ...base, status: "cancelled" } : base, {
      withAttendees: true,
      recurrenceId,
    }),
    method,
  );
  const verb =
    method === "CANCEL" ? "Cancelled" : row.sequence > 0 ? "Updated invitation" : "Invitation";
  const when = whenText(base);
  const who = user.display_name || user.username;
  const lead =
    method === "CANCEL"
      ? `${who} cancelled this event.`
      : `${who} invited you to ${row.title || "an event"}.`;
  const text = [lead, "", when, row.location, row.description].filter(Boolean).join("\n");
  const html = `<p>${escapeHtml(lead)}</p><p><strong>${escapeHtml(row.title)}</strong><br>${escapeHtml(when)}${row.location ? `<br>${escapeHtml(row.location)}` : ""}</p>${row.description ? `<p style="white-space:pre-wrap">${escapeHtml(row.description)}</p>` : ""}`;
  try {
    await sendMessage(env, user, {
      to,
      from: row.organizer,
      subject: `${verb}: ${row.title}`,
      text,
      html,
      track: false,
      extraAttachments: [
        {
          content: new TextEncoder().encode(ics),
          filename: method === "CANCEL" ? "cancel.ics" : "invite.ics",
          type: `text/calendar; method=${method}; charset=utf-8`,
          disposition: "attachment",
        },
      ],
    });
    return null;
  } catch (e) {
    return e?.message || "could not send invitations";
  }
}

async function pickOrganizer(env, user, wanted) {
  const mine = await userAddresses(env, user.id, user.address);
  const addr = normalizeAddr(wanted || "");
  return mine.has(addr) ? addr : normalizeAddr(user.address);
}

async function feedToken(env, user, rotate) {
  const settings = JSON.parse(user.settings_json || "{}");
  if (settings.calFeedToken && !rotate) return settings.calFeedToken;
  settings.calFeedToken = randomToken(24);
  await env.DB.prepare("UPDATE users SET settings_json = ? WHERE id = ?")
    .bind(JSON.stringify(settings), user.id)
    .run();
  user.settings_json = JSON.stringify(settings);
  return settings.calFeedToken;
}

async function allIcs(env, userId) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM events WHERE user_id = ? AND (my_status IS NULL OR my_status != 'declined') ORDER BY start_at LIMIT 5000",
  )
    .bind(userId)
    .all();
  return wrapCalendar((results || []).flatMap((r) => veventLines(r, { withAttendees: true })));
}

export async function calendarFeed(env, userId, token) {
  const user = await env.DB.prepare("SELECT id, settings_json FROM users WHERE id = ?")
    .bind(userId)
    .first();
  const want = JSON.parse(user?.settings_json || "{}").calFeedToken;
  if (!want || want.length !== token.length) return error(404, "not found");
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ token.charCodeAt(i);
  if (diff) return error(404, "not found");
  return new Response(await allIcs(env, userId), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "private, max-age=300",
    },
  });
}

async function listRange(env, userId, from, to) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM events WHERE user_id = ? AND start_at < ? AND (end_at > ? OR rrule IS NOT NULL) ORDER BY start_at LIMIT 2000",
  )
    .bind(userId, to, from)
    .all();
  const rows = results || [];
  const overrides = {};
  if (rows.some((r) => r.rrule)) {
    const o = await env.DB.prepare(
      "SELECT uid, recurrence_id FROM events WHERE user_id = ? AND recurrence_id != 0",
    )
      .bind(userId)
      .all();
    for (const r of o.results || []) {
      overrides[r.uid] = overrides[r.uid] || [];
      overrides[r.uid].push(r.recurrence_id);
    }
  }
  return rows.map(shape).flatMap((e) => expand(e, from, to, overrides[e.uid]));
}

function mergeGuests(previous, guests) {
  return guests.map(
    (address) =>
      previous.find((a) => a.address === address) || { address, name: "", status: "needs-action" },
  );
}

const REMINDER_WINDOW = 90000;

async function dueRows(env, t, horizon) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM events WHERE reminder_min >= 0 AND all_day = 0 AND status != 'cancelled' AND (my_status IS NULL OR my_status != 'declined') AND ((rrule IS NULL AND start_at > ? AND start_at <= ?) OR (rrule IS NOT NULL AND start_at <= ?)) LIMIT 2000",
  )
    .bind(t, t + horizon, t + horizon)
    .all();
  return (results || []).flatMap((r) =>
    expand(shape(r), t, t + horizon).map((e) => ({ ...e, userId: r.user_id })),
  );
}

export async function sendEventReminders(env, sendPush) {
  const t = now();
  const due = (await dueRows(env, t, 7 * DAY_MS)).filter((e) => {
    const at = e.start - e.reminder * 60000;
    return at <= t && at > t - 60000;
  });
  for (const userId of new Set(due.map((e) => e.userId))) await sendPush(env, userId);
}

export async function dueReminder(env, userId) {
  const t = now();
  const { results } = await env.DB.prepare(
    "SELECT * FROM events WHERE user_id = ? AND reminder_min >= 0 AND all_day = 0 AND status != 'cancelled' AND (my_status IS NULL OR my_status != 'declined') AND ((rrule IS NULL AND start_at > ? AND start_at <= ?) OR (rrule IS NOT NULL AND start_at <= ?)) LIMIT 200",
  )
    .bind(userId, t - 60000, t + 7 * DAY_MS, t + 7 * DAY_MS)
    .all();
  const hit = (results || [])
    .map(shape)
    .flatMap((e) => expand(e, t - 60000, t + 7 * DAY_MS))
    .filter((e) => {
      const at = e.start - e.reminder * 60000;
      return at <= t && at > t - REMINDER_WINDOW;
    })
    .sort((a, b) => a.start - b.start)[0];
  if (!hit) return null;
  const mins = Math.round((hit.start - t) / 60000);
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: hit.tz || "UTC",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(hit.start));
  return {
    title: hit.title || "Event",
    body: `${mins <= 0 ? "Now" : `In ${mins} min`}, ${when}${hit.location ? `, ${hit.location}` : ""}`,
    tag: `estrogen-cal-${hit.id}-${hit.start}`,
    url: "/calendar",
  };
}

export async function routeCalendar(request, env, user, path, method) {
  const url = new URL(request.url);
  if (path === "/api/calendar/events" && method === "GET") {
    const from = Number(url.searchParams.get("from")) || now() - 31 * DAY_MS;
    const to = Math.min(Number(url.searchParams.get("to")) || from + 62 * DAY_MS, from + MAX_RANGE);
    return json({ from, to, events: await listRange(env, user.id, from, to) });
  }
  if (path === "/api/calendar/events" && method === "POST") {
    const raw = await request.json().catch(() => ({}));
    const b = readEventBody(raw);
    if (!b) return error(400, "invalid event");
    const id = uuid();
    const t = now();
    const organizer = b.guests.length ? await pickOrganizer(env, user, raw.from) : null;
    await env.DB.prepare(
      "INSERT INTO events (id, user_id, uid, title, description, location, start_at, end_at, all_day, tz, rrule, color, reminder_min, organizer, organizer_name, attendees_json, my_address, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        user.id,
        `${id}@estrogen-mail`,
        b.title,
        b.description,
        b.location,
        b.start,
        b.end,
        b.allDay,
        b.tz,
        b.rrule,
        b.color,
        b.reminder,
        organizer,
        organizer ? user.display_name || user.username : null,
        JSON.stringify(mergeGuests([], b.guests)),
        organizer,
        t,
        t,
      )
      .run();
    const row = await eventById(env, id);
    const sendError = b.guests.length
      ? await sendInvite(env, user, row, "REQUEST", b.guests)
      : null;
    return json({ event: shape(row), sendError, notified: b.guests.length, invited: true });
  }
  let m = path.match(/^\/api\/calendar\/events\/([\w-]+)$/);
  if (m) {
    const row = await env.DB.prepare("SELECT * FROM events WHERE id = ? AND user_id = ?")
      .bind(m[1], user.id)
      .first();
    if (!row) return error(404, "event not found");
    const owned = isOwned(row);
    const notify = url.searchParams.get("notify") !== "0";
    const guests = attendeesOf(row).map((a) => a.address);
    if (method === "DELETE") {
      const occurrence = Number(url.searchParams.get("occurrence")) || 0;
      if (occurrence && row.rrule) {
        const ex = [...new Set([...exdatesOf(row), occurrence])];
        await env.DB.prepare(
          "UPDATE events SET exdates = ?, sequence = sequence + 1, updated_at = ? WHERE id = ?",
        )
          .bind(JSON.stringify(ex), now(), row.id)
          .run();
        const next = await eventById(env, row.id);
        const sendError =
          owned && notify && guests.length
            ? await sendInvite(env, user, next, "CANCEL", guests, occurrence)
            : null;
        return json({ ok: true, event: shape(next), sendError });
      }
      await env.DB.prepare("DELETE FROM events WHERE user_id = ? AND uid = ? AND (id = ? OR ? = 0)")
        .bind(user.id, row.uid, row.id, row.recurrence_id ? 1 : 0)
        .run();
      const sendError =
        owned && notify && guests.length
          ? await sendInvite(env, user, { ...row, sequence: row.sequence + 1 }, "CANCEL", guests)
          : null;
      return json({ ok: true, sendError });
    }
    if (method === "PATCH" || method === "PUT") {
      const raw = await request.json().catch(() => ({}));
      if (!owned) {
        const color = COLORS.has(raw.color) ? raw.color : row.color;
        const reminder = clampInt(raw.reminder, -1, 10080, row.reminder_min ?? 10);
        await env.DB.prepare(
          "UPDATE events SET color = ?, reminder_min = ?, updated_at = ? WHERE id = ?",
        )
          .bind(color, reminder, now(), row.id)
          .run();
        return json({ event: shape(await eventById(env, row.id)) });
      }
      const b = readEventBody({ ...shape(row), guests, ...raw });
      if (!b) return error(400, "invalid event");
      const previous = attendeesOf(row);
      const attendees = mergeGuests(previous, b.guests);
      const removed = guests.filter((g) => !b.guests.includes(g));
      const organizer = b.guests.length
        ? row.organizer || (await pickOrganizer(env, user, raw.from))
        : null;
      const changed =
        b.start !== row.start_at ||
        b.end !== row.end_at ||
        b.title !== row.title ||
        b.location !== row.location ||
        b.description !== row.description ||
        (b.rrule || null) !== (row.rrule || null) ||
        b.allDay !== row.all_day;
      await env.DB.prepare(
        "UPDATE events SET title = ?, description = ?, location = ?, start_at = ?, end_at = ?, all_day = ?, tz = ?, rrule = ?, exdates = ?, color = ?, reminder_min = ?, organizer = ?, organizer_name = ?, attendees_json = ?, my_address = ?, sequence = sequence + ?, updated_at = ? WHERE id = ?",
      )
        .bind(
          b.title,
          b.description,
          b.location,
          b.start,
          b.end,
          b.allDay,
          b.tz,
          b.rrule,
          JSON.stringify(b.rrule ? exdatesOf(row).map((x) => x + (b.start - row.start_at)) : []),
          b.color,
          b.reminder,
          organizer,
          organizer ? row.organizer_name || user.display_name || user.username : null,
          JSON.stringify(attendees),
          organizer,
          changed ? 1 : 0,
          now(),
          row.id,
        )
        .run();
      const next = await eventById(env, row.id);
      const errors = [];
      if (notify && removed.length)
        errors.push(
          await sendInvite(env, user, { ...row, sequence: row.sequence + 1 }, "CANCEL", removed),
        );
      const added = b.guests.filter((g) => !guests.includes(g));
      const to = changed ? b.guests : added;
      if (notify && to.length) errors.push(await sendInvite(env, user, next, "REQUEST", to));
      return json({
        event: shape(next),
        sendError: errors.find(Boolean) || null,
        notified: notify ? to.length + removed.length : 0,
      });
    }
  }
  m = path.match(/^\/api\/calendar\/events\/([\w-]+)\/rsvp$/);
  if (m && method === "POST") {
    const row = await env.DB.prepare("SELECT * FROM events WHERE id = ? AND user_id = ?")
      .bind(m[1], user.id)
      .first();
    if (!row) return error(404, "event not found");
    const { status } = await request.json().catch(() => ({}));
    if (!RSVP.has(status)) return error(400, "invalid status");
    if (!row.organizer || isOwned(row)) return error(400, "event has no organizer");
    const me = row.my_address || user.address;
    const ics = wrapCalendar(
      veventLines(
        { ...row, description: "", location: "", rrule: row.recurrence_id ? null : row.rrule },
        {
          extra: [
            `ATTENDEE;PARTSTAT=${status.toUpperCase()};CN=${escapeText(user.display_name || user.username)}:mailto:${me}`,
          ],
        },
      ),
      "REPLY",
    );
    const verb = { accepted: "Accepted", declined: "Declined", tentative: "Tentative" }[status];
    const who = user.display_name || user.username;
    const text = `${who} ${status === "tentative" ? "tentatively accepted" : status} this invitation.`;
    try {
      await sendMessage(env, user, {
        to: [row.organizer],
        from: me,
        subject: `${verb}: ${row.title}`,
        text,
        html: `<p>${escapeHtml(text)}</p>`,
        track: false,
        extraAttachments: [
          {
            content: new TextEncoder().encode(ics),
            filename: "reply.ics",
            type: "text/calendar; method=REPLY; charset=utf-8",
            disposition: "attachment",
          },
        ],
      });
    } catch (e) {
      return error(502, e?.message || "could not send reply");
    }
    await env.DB.prepare(
      "UPDATE events SET my_status = ?, updated_at = ? WHERE user_id = ? AND uid = ? AND (id = ? OR ? = 0)",
    )
      .bind(status, now(), user.id, row.uid, row.id, row.recurrence_id ? 1 : 0)
      .run();
    return json({ event: shape(await eventById(env, row.id)) });
  }
  m = path.match(/^\/api\/calendar\/message\/([\w-]+)$/);
  if (m && method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT * FROM events WHERE user_id = ? AND source_message_id = ? LIMIT 5",
    )
      .bind(user.id, m[1])
      .all();
    return json({ events: (results || []).map(shape) });
  }
  if (path === "/api/calendar/feed" && (method === "GET" || method === "POST")) {
    const token = await feedToken(env, user, method === "POST");
    return json({ url: `${url.origin}/api/cal/${user.id}/${token}.ics` });
  }
  if (path === "/api/calendar/export" && method === "GET") {
    return new Response(await allIcs(env, user.id), {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": 'attachment; filename="calendar.ics"',
      },
    });
  }
  if (path === "/api/calendar/import" && method === "POST") {
    const text = await request.text();
    if (text.length > 2_000_000) return error(413, "file too large");
    const { events } = parseIcs(text);
    let added = 0;
    const t = now();
    for (const e of events.slice(0, 2000)) {
      const res = await env.DB.prepare(
        "INSERT OR IGNORE INTO events (id, user_id, uid, recurrence_id, title, description, location, start_at, end_at, all_day, tz, rrule, exdates, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
        .bind(
          uuid(),
          user.id,
          e.uid,
          e.recurrenceId,
          e.title,
          e.description,
          e.location,
          e.start,
          e.end,
          e.allDay ? 1 : 0,
          e.tz,
          e.rrule,
          JSON.stringify(e.exdates),
          e.status === "cancelled" ? "cancelled" : "confirmed",
          t,
          t,
        )
        .run();
      added += res.meta?.changes || 0;
    }
    return json({ added, total: events.length });
  }
  if (path === "/api/calendar/agenda" && method === "GET") {
    const days = clampInt(url.searchParams.get("days"), 1, 60, 14);
    const from = now();
    return json({ events: await listRange(env, user.id, from, from + days * DAY_MS) });
  }
  return null;
}
