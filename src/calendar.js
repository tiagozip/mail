import { sendMessage } from "./send.js";
import { clampInt, error, json, normalizeAddr, now, randomToken, uuid } from "./util.js";

const DAY_MS = 86400000;
const MAX_RANGE = 120 * DAY_MS;
const MAX_OCCURRENCES = 500;
const RSVP = new Set(["accepted", "declined", "tentative"]);
const COLORS = new Set(["rose", "violet", "blue", "teal", "green", "amber", "gray"]);

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

function zoneOffset(tz, ts) {
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

function parseDate(prop) {
  if (!prop) return null;
  const m = prop.value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined || prop.params.VALUE === "DATE") {
    return { ts: Date.UTC(+y, +mo - 1, +d), allDay: true };
  }
  const local = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0));
  if (z) return { ts: local, allDay: false };
  const tz = prop.params.TZID;
  if (!tz) return { ts: local, allDay: false, floating: true };
  try {
    let ts = local - zoneOffset(tz, local);
    ts = local - zoneOffset(tz, ts);
    return { ts, allDay: false };
  } catch {
    return { ts: local, allDay: false, floating: true };
  }
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
      cur = { props: {}, attendees: [] };
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
    else if (!cur.props[p.name]) cur.props[p.name] = p;
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
          title: unescapeText(e.props.SUMMARY?.value).slice(0, 500),
          description: unescapeText(e.props.DESCRIPTION?.value).slice(0, 8000),
          location: unescapeText(e.props.LOCATION?.value).slice(0, 1000),
          start: start.ts,
          end,
          allDay: start.allDay,
          rrule: e.props.RRULE?.value?.trim().slice(0, 500) || null,
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

function veventLines(ev, extra = []) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `DTSTAMP:${fmtUtc(now())}`,
    ev.all_day ? `DTSTART;VALUE=DATE:${fmtDate(ev.start_at)}` : `DTSTART:${fmtUtc(ev.start_at)}`,
    ev.all_day ? `DTEND;VALUE=DATE:${fmtDate(ev.end_at)}` : `DTEND:${fmtUtc(ev.end_at)}`,
    `SUMMARY:${escapeText(ev.title)}`,
    `SEQUENCE:${ev.sequence || 0}`,
  ];
  if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
  if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
  if (ev.rrule) lines.push(`RRULE:${ev.rrule}`);
  if (ev.status === "cancelled") lines.push("STATUS:CANCELLED");
  if (ev.organizer) lines.push(`ORGANIZER:mailto:${ev.organizer}`);
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

function shape(r) {
  return {
    id: r.id,
    uid: r.uid,
    title: r.title,
    description: r.description,
    location: r.location,
    start: r.start_at,
    end: r.end_at,
    allDay: !!r.all_day,
    rrule: r.rrule,
    color: r.color,
    status: r.status,
    organizer: r.organizer,
    organizerName: r.organizer_name,
    attendees: JSON.parse(r.attendees_json || "[]"),
    myStatus: r.my_status,
    myAddress: r.my_address,
    sourceMessageId: r.source_message_id,
    updatedAt: r.updated_at,
  };
}

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function expand(ev, from, to) {
  if (!ev.rrule) return ev.end > from && ev.start < to ? [ev] : [];
  const rule = Object.fromEntries(
    ev.rrule.split(";").map((kv) => {
      const [k, v] = kv.split("=");
      return [k.toUpperCase(), v || ""];
    }),
  );
  const freq = rule.FREQ;
  const interval = Math.max(1, Number.parseInt(rule.INTERVAL || "1", 10) || 1);
  const count = Number.parseInt(rule.COUNT || "0", 10) || 0;
  const until = rule.UNTIL ? parseDate({ value: rule.UNTIL, params: {} })?.ts || 0 : 0;
  const dur = ev.end - ev.start;
  const byDay = (rule.BYDAY || "")
    .split(",")
    .map((d) => WEEKDAYS.indexOf(d.slice(-2)))
    .filter((d) => d >= 0);
  const out = [];
  const base = new Date(ev.start);
  let n = 0;
  const push = (ts) => {
    n++;
    if (ts + dur > from && ts < to)
      out.push({ ...ev, start: ts, end: ts + dur, occurrence: ts, seriesStart: ev.start });
  };
  const done = (ts) =>
    (count && n >= count) || (until && ts > until) || ts >= to || out.length >= MAX_OCCURRENCES;
  for (let i = 0; i < 5000; i++) {
    if (freq === "WEEKLY" && byDay.length) {
      const weekStart = ev.start - base.getUTCDay() * DAY_MS + i * interval * 7 * DAY_MS;
      let stop = false;
      for (const d of [...byDay].sort()) {
        const ts = weekStart + d * DAY_MS;
        if (ts < ev.start) continue;
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
    else if (freq === "MONTHLY") d.setUTCMonth(d.getUTCMonth() + i * interval);
    else if (freq === "YEARLY") d.setUTCFullYear(d.getUTCFullYear() + i * interval);
    else return ev.end > from && ev.start < to ? [ev] : [];
    const ts = d.getTime();
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

export async function ingestCalendar(env, user, icsText, messageId) {
  const { method, events } = parseIcs(icsText);
  if (!events.length) return;
  const mine = await userAddresses(env, user.id, user.address);
  const t = now();
  for (const e of events.slice(0, 20)) {
    const existing = await env.DB.prepare("SELECT * FROM events WHERE user_id = ? AND uid = ?")
      .bind(user.id, e.uid)
      .first();
    if (method === "REPLY") {
      if (!existing) continue;
      const atts = JSON.parse(existing.attendees_json || "[]");
      for (const a of e.attendees) {
        const hit = atts.find((x) => x.address === a.address);
        if (hit) hit.status = a.status;
        else atts.push(a);
      }
      await env.DB.prepare("UPDATE events SET attendees_json = ?, updated_at = ? WHERE id = ?")
        .bind(JSON.stringify(atts), t, existing.id)
        .run();
      continue;
    }
    if (existing && existing.sequence > e.sequence) continue;
    const me = e.attendees.find((a) => mine.has(a.address));
    const status = method === "CANCEL" ? "cancelled" : e.status;
    if (existing) {
      await env.DB.prepare(
        "UPDATE events SET title = ?, description = ?, location = ?, start_at = ?, end_at = ?, all_day = ?, rrule = ?, status = ?, organizer = ?, organizer_name = ?, attendees_json = ?, sequence = ?, source_message_id = ?, updated_at = ? WHERE id = ?",
      )
        .bind(
          e.title,
          e.description,
          e.location,
          e.start,
          e.end,
          e.allDay ? 1 : 0,
          e.rrule,
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
    await env.DB.prepare(
      "INSERT INTO events (id, user_id, uid, title, description, location, start_at, end_at, all_day, rrule, status, organizer, organizer_name, attendees_json, my_address, my_status, sequence, source_message_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        uuid(),
        user.id,
        e.uid,
        e.title,
        e.description,
        e.location,
        e.start,
        e.end,
        e.allDay ? 1 : 0,
        e.rrule,
        status,
        e.organizer,
        e.organizerName,
        JSON.stringify(e.attendees),
        me?.address || null,
        method === "REQUEST" ? "needs-action" : null,
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
  return {
    title: title || "Untitled",
    description: String(b.description || "").slice(0, 8000),
    location: String(b.location || "").slice(0, 1000),
    start,
    end,
    allDay: b.allDay ? 1 : 0,
    rrule,
    color: COLORS.has(b.color) ? b.color : null,
  };
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

export async function calendarFeed(env, userId, token) {
  const user = await env.DB.prepare("SELECT id, settings_json FROM users WHERE id = ?")
    .bind(userId)
    .first();
  const want = JSON.parse(user?.settings_json || "{}").calFeedToken;
  if (!want || want.length !== token.length) return error(404, "not found");
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ token.charCodeAt(i);
  if (diff) return error(404, "not found");
  const { results } = await env.DB.prepare(
    "SELECT * FROM events WHERE user_id = ? AND (my_status IS NULL OR my_status != 'declined') ORDER BY start_at LIMIT 5000",
  )
    .bind(userId)
    .all();
  const body = wrapCalendar((results || []).flatMap((r) => veventLines(r)));
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "private, max-age=300",
    },
  });
}

export async function routeCalendar(request, env, user, path, method) {
  let m;
  if (path === "/api/calendar/events" && method === "GET") {
    const url = new URL(request.url);
    const from = Number(url.searchParams.get("from")) || now() - 31 * DAY_MS;
    const to = Math.min(Number(url.searchParams.get("to")) || from + 62 * DAY_MS, from + MAX_RANGE);
    const { results } = await env.DB.prepare(
      "SELECT * FROM events WHERE user_id = ? AND start_at < ? AND (end_at > ? OR rrule IS NOT NULL) ORDER BY start_at LIMIT 2000",
    )
      .bind(user.id, to, from)
      .all();
    return json({
      from,
      to,
      events: (results || []).map(shape).flatMap((e) => expand(e, from, to)),
    });
  }
  if (path === "/api/calendar/events" && method === "POST") {
    const b = readEventBody(await request.json().catch(() => ({})));
    if (!b) return error(400, "invalid event");
    const id = uuid();
    const t = now();
    await env.DB.prepare(
      "INSERT INTO events (id, user_id, uid, title, description, location, start_at, end_at, all_day, rrule, color, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
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
        b.rrule,
        b.color,
        t,
        t,
      )
      .run();
    const row = await env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(id).first();
    return json({ event: shape(row) });
  }
  m = path.match(/^\/api\/calendar\/events\/([\w-]+)$/);
  if (m) {
    const row = await env.DB.prepare("SELECT * FROM events WHERE id = ? AND user_id = ?")
      .bind(m[1], user.id)
      .first();
    if (!row) return error(404, "event not found");
    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM events WHERE id = ?").bind(row.id).run();
      return json({ ok: true });
    }
    if (method === "PATCH" || method === "PUT") {
      const b = readEventBody({ ...shape(row), ...(await request.json().catch(() => ({}))) });
      if (!b) return error(400, "invalid event");
      await env.DB.prepare(
        "UPDATE events SET title = ?, description = ?, location = ?, start_at = ?, end_at = ?, all_day = ?, rrule = ?, color = ?, sequence = sequence + 1, updated_at = ? WHERE id = ?",
      )
        .bind(
          b.title,
          b.description,
          b.location,
          b.start,
          b.end,
          b.allDay,
          b.rrule,
          b.color,
          now(),
          row.id,
        )
        .run();
      const next = await env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(row.id).first();
      return json({ event: shape(next) });
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
    if (!row.organizer) return error(400, "event has no organizer");
    const me = row.my_address || user.address;
    const ics = wrapCalendar(
      veventLines({ ...row, description: "", location: "" }, [
        `ATTENDEE;PARTSTAT=${status.toUpperCase()};CN=${escapeText(user.display_name || user.username)}:mailto:${me}`,
      ]),
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
        html: `<p>${text.replace(/[<>&]/g, "")}</p>`,
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
    await env.DB.prepare("UPDATE events SET my_status = ?, updated_at = ? WHERE id = ?")
      .bind(status, now(), row.id)
      .run();
    const next = await env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(row.id).first();
    return json({ event: shape(next) });
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
    const origin = new URL(request.url).origin;
    return json({ url: `${origin}/api/cal/${user.id}/${token}.ics` });
  }
  if (path === "/api/calendar/agenda" && method === "GET") {
    const url = new URL(request.url);
    const days = clampInt(url.searchParams.get("days"), 1, 60, 14);
    const from = now();
    const to = from + days * DAY_MS;
    const { results } = await env.DB.prepare(
      "SELECT * FROM events WHERE user_id = ? AND start_at < ? AND (end_at > ? OR rrule IS NOT NULL) ORDER BY start_at LIMIT 500",
    )
      .bind(user.id, to, from)
      .all();
    return json({ events: (results || []).map(shape).flatMap((e) => expand(e, from, to)) });
  }
  return null;
}
