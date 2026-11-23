import { Button, Input, Select, Switch } from "@cloudflare/kumo";
import {
  CaretLeft,
  CaretRight,
  Check,
  CheckCircle,
  Circle,
  DownloadSimple,
  Link as LinkIcon,
  List,
  MapPin,
  Plus,
  Question,
  Trash,
  UploadSimple,
  UsersThree,
  X,
  XCircle,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api.js";
import {
  addDays,
  createEvent,
  deleteEvent,
  eventDayEnd,
  eventDayStart,
  eventsOnDay,
  loadRange,
  monthGrid,
  refreshCalendar,
  rsvpEvent,
  startOfDay,
  startOfWeek,
  updateEvent,
  useRange,
} from "../calendar.js";
import { notify, notifyError } from "../toast.js";

const HOUR_PX = 48;
const SNAP = 15 * 60000;
const COLORS = ["rose", "violet", "blue", "teal", "green", "amber", "gray"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MODES = [
  ["day", "Day"],
  ["week", "Week"],
  ["month", "Month"],
];
const REPEAT = [
  ["none", "Does not repeat"],
  ["FREQ=DAILY", "Every day"],
  ["FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "Every weekday"],
  ["FREQ=WEEKLY", "Every week"],
  ["FREQ=WEEKLY;INTERVAL=2", "Every two weeks"],
  ["FREQ=MONTHLY", "Every month"],
  ["FREQ=YEARLY", "Every year"],
];
const REMINDERS = [
  ["-1", "No reminder"],
  ["0", "Remind me when it starts"],
  ["5", "5 minutes before"],
  ["10", "10 minutes before"],
  ["30", "30 minutes before"],
  ["60", "1 hour before"],
  ["1440", "1 day before"],
];
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

const hourFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const monthFmt = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
const shortFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const agendaFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });

function pad(n) {
  return String(n).padStart(2, "0");
}

function toDateInput(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeInput(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromInputs(date, time) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = (time || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, h, mi).getTime();
}

function utcDay(date) {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function localDateOfUtc(ts) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function layoutDay(events) {
  const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let cluster = [];
  let clusterEnd = 0;
  const flush = () => {
    const cols = [];
    const placed = cluster.map((e) => {
      let i = cols.findIndex((end) => end <= e.start);
      if (i < 0) i = cols.length;
      cols[i] = e.end;
      return { e, col: i };
    });
    for (const p of placed) out.push({ ...p, cols: cols.length });
    cluster = [];
    clusterEnd = 0;
  };
  for (const e of sorted) {
    if (cluster.length && e.start >= clusterEnd) flush();
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, e.end);
  }
  if (cluster.length) flush();
  return out;
}

function eventClass(e) {
  const c = e.color || (e.owned === false ? "blue" : "rose");
  let cls = `em-cal-ev is-${c}`;
  if (e.myStatus === "needs-action") cls += " is-pending";
  if (e.myStatus === "declined" || e.status === "cancelled") cls += " is-declined";
  if (e.pending) cls += " is-saving";
  return cls;
}

function canEdit(e) {
  return e.owned !== false && !e.pending;
}

function payloadOf(e, start, end) {
  const shift = e.occurrence ? e.seriesStart - e.start : 0;
  return {
    title: e.title,
    description: e.description,
    location: e.location,
    allDay: e.allDay,
    rrule: e.rrule,
    color: e.color,
    reminder: e.reminder ?? 10,
    tz: e.tz || TZ,
    guests: (e.attendees || []).map((a) => a.address),
    start: start + shift,
    end: end + shift,
  };
}

function reportSend(res) {
  if (res?.sendError) notifyError(new Error(`Saved, but guests were not emailed: ${res.sendError}`));
  else if (res?.notified)
    notify(
      `Sent the ${res.invited ? "invitation" : "update"} to ${res.notified} ${res.notified === 1 ? "guest" : "guests"}`,
      "",
      "success",
    );
}

async function moveEvent(e, start, end) {
  try {
    reportSend(await updateEvent(e.id, payloadOf(e, start, end)));
  } catch (err) {
    notifyError(err);
  }
}

export function CalendarView({ onMenu, newEventTick }) {
  const [mode, setMode] = useState(() => {
    try {
      return localStorage.getItem("em-cal-mode") || "month";
    } catch {
      return "month";
    }
  });
  const [anchor, setAnchor] = useState(() => startOfDay(Date.now()));
  const [editing, setEditing] = useState(null);
  const [feedOpen, setFeedOpen] = useState(false);
  const [nowTs, setNowTs] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("em-cal-mode", mode);
    } catch {}
  }, [mode]);

  const range = useMemo(() => {
    if (mode === "day") return { from: anchor, to: addDays(anchor, 1) };
    if (mode === "week") {
      const from = startOfWeek(anchor);
      return { from, to: addDays(from, 7) };
    }
    return monthGrid(anchor);
  }, [mode, anchor]);

  const { events } = useRange(range.from, range.to);

  useEffect(() => {
    if (mode === "month") {
      const a = new Date(anchor);
      const next = monthGrid(new Date(a.getFullYear(), a.getMonth() + 1, 1).getTime());
      const prev = monthGrid(new Date(a.getFullYear(), a.getMonth() - 1, 1).getTime());
      loadRange(next.from, next.to);
      loadRange(prev.from, prev.to);
      return;
    }
    const span = range.to - range.from;
    loadRange(range.to, range.to + span);
    loadRange(range.from - span, range.from);
  }, [mode, anchor, range.from, range.to]);

  function step(dir) {
    if (mode === "day") return setAnchor((a) => addDays(a, dir));
    if (mode === "week") return setAnchor((a) => addDays(a, dir * 7));
    setAnchor((a) => {
      const d = new Date(a);
      return new Date(d.getFullYear(), d.getMonth() + dir, 1).getTime();
    });
  }

  function newAt(start, end, allDay) {
    let s = start;
    if (s === undefined) {
      const d = new Date(anchor);
      d.setHours(new Date().getHours() + 1, 0, 0, 0);
      s = d.getTime();
    }
    setEditing({
      draft: true,
      owned: true,
      title: "",
      start: s,
      end: end ?? s + 3600000,
      allDay: !!allDay,
      rrule: null,
      color: null,
      location: "",
      description: "",
      attendees: [],
    });
  }

  useEffect(() => {
    if (newEventTick) newAt();
  }, [newEventTick]);

  useEffect(() => {
    function onKey(e) {
      if (editing || feedOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest?.("input, textarea, select, [contenteditable=true], [role=dialog]"))
        return;
      const k = e.key;
      if (k === "t") setAnchor(startOfDay(Date.now()));
      else if (k === "m") setMode("month");
      else if (k === "w") setMode("week");
      else if (k === "d") setMode("day");
      else if (k === "j" || k === "ArrowRight" || k === "n") step(1);
      else if (k === "k" || k === "ArrowLeft" || k === "p") step(-1);
      else if (k === "c") newAt();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  let title = monthFmt.format(new Date(anchor));
  if (mode === "day") title = dayFmt.format(new Date(anchor));
  if (mode === "week") {
    const a = new Date(range.from);
    const b = new Date(addDays(range.from, 6));
    if (a.getMonth() !== b.getMonth())
      title = `${shortFmt.format(a)} to ${shortFmt.format(b)}, ${b.getFullYear()}`;
  }

  return (
    <div className="em-cal">
      <aside className="em-cal-side">
        <Button variant="primary" icon={Plus} onClick={() => newAt()}>
          New event
        </Button>
        <MiniMonth
          anchor={anchor}
          nowTs={nowTs}
          onPick={(d) => {
            setAnchor(d);
            if (mode === "month") setMode("day");
          }}
        />
        <Agenda nowTs={nowTs} onOpen={setEditing} />
      </aside>
      <div className="em-cal-main">
        <div className="em-cal-bar">
          <Button
            className="em-menu-btn"
            size="sm"
            variant="ghost"
            shape="square"
            aria-label="Menu"
            icon={List}
            onClick={onMenu}
          />
          <h1 className="em-cal-title">{title}</h1>
          <div className="em-cal-nav">
            <Button
              size="sm"
              variant="ghost"
              shape="square"
              aria-label="Previous"
              icon={CaretLeft}
              onClick={() => step(-1)}
            />
            <Button size="sm" variant="secondary" onClick={() => setAnchor(startOfDay(Date.now()))}>
              Today
            </Button>
            <Button
              size="sm"
              variant="ghost"
              shape="square"
              aria-label="Next"
              icon={CaretRight}
              onClick={() => step(1)}
            />
          </div>
          <div className="em-cal-seg" role="tablist" aria-label="View">
            {MODES.map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className={mode === m ? "is-on" : ""}
                onClick={() => setMode(m)}
              >
                {label}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            shape="square"
            aria-label="Subscribe, import or export"
            icon={LinkIcon}
            onClick={() => setFeedOpen(true)}
          />
          <Button
            className="em-cal-newbtn"
            size="sm"
            variant="primary"
            icon={Plus}
            onClick={() => newAt()}
          >
            New event
          </Button>
        </div>

        {mode === "month" ? (
          <MonthGrid
            from={range.from}
            anchor={anchor}
            events={events}
            nowTs={nowTs}
            onPickDay={(day) => {
              const d = new Date(day);
              d.setHours(9, 0, 0, 0);
              newAt(d.getTime(), d.getTime() + 3600000);
            }}
            onOpenDay={(day) => {
              setAnchor(day);
              setMode("day");
            }}
            onOpen={setEditing}
          />
        ) : (
          <TimeGrid
            key={mode}
            from={range.from}
            count={mode === "day" ? 1 : 7}
            events={events}
            nowTs={nowTs}
            onCreate={newAt}
            onOpen={setEditing}
            onDayHeader={(day) => {
              setAnchor(day);
              setMode("day");
            }}
          />
        )}
      </div>

      <EventDialog event={editing} onClose={() => setEditing(null)} />
      <FeedDialog open={feedOpen} onClose={() => setFeedOpen(false)} />
    </div>
  );
}

function MiniMonth({ anchor, nowTs, onPick }) {
  const [shown, setShown] = useState(anchor);
  useEffect(() => setShown(anchor), [anchor]);
  const grid = monthGrid(shown);
  const { events } = useRange(grid.from, grid.to);
  const month = new Date(shown).getMonth();
  const today = startOfDay(nowTs);
  const busy = useMemo(() => {
    const set = new Set();
    for (const e of events) {
      if (e.status === "cancelled" || e.myStatus === "declined") continue;
      for (let d = startOfDay(eventDayStart(e)); d < eventDayEnd(e); d = addDays(d, 1)) set.add(d);
    }
    return set;
  }, [events]);
  const shiftMonth = (n) => {
    const d = new Date(shown);
    setShown(new Date(d.getFullYear(), d.getMonth() + n, 1).getTime());
  };
  return (
    <div className="em-cal-mini">
      <div className="em-cal-mini-head">
        <span>{monthFmt.format(new Date(shown))}</span>
        <Button
          size="sm"
          variant="ghost"
          shape="square"
          aria-label="Previous month"
          icon={CaretLeft}
          onClick={() => shiftMonth(-1)}
        />
        <Button
          size="sm"
          variant="ghost"
          shape="square"
          aria-label="Next month"
          icon={CaretRight}
          onClick={() => shiftMonth(1)}
        />
      </div>
      <div className="em-cal-mini-grid">
        {WEEKDAYS.map((d) => (
          <span key={d} className="em-cal-mini-dow">
            {d[0]}
          </span>
        ))}
        {Array.from({ length: 42 }, (_, i) => {
          const day = addDays(grid.from, i);
          const cls = [
            "em-cal-mini-day",
            new Date(day).getMonth() !== month && "is-out",
            day === today && "is-today",
            day === anchor && "is-anchor",
            busy.has(day) && "is-busy",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={day}
              type="button"
              className={cls}
              aria-label={dayFmt.format(new Date(day))}
              onClick={() => onPick(day)}
            >
              {new Date(day).getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Agenda({ nowTs, onOpen }) {
  const from = startOfDay(nowTs);
  const { events } = useRange(from, addDays(from, 14));
  const upcoming = events
    .filter((e) => e.end > nowTs && e.status !== "cancelled" && e.myStatus !== "declined")
    .sort((a, b) => a.start - b.start)
    .slice(0, 8);
  return (
    <div className="em-cal-agenda">
      <h2 className="em-cal-agenda-title">Coming up</h2>
      {upcoming.length === 0 ? (
        <p className="em-cal-agenda-empty">Nothing in the next two weeks.</p>
      ) : (
        upcoming.map((e) => (
          <button
            key={`${e.id}:${e.start}`}
            type="button"
            className={`em-cal-agenda-item ${eventClass(e)}`}
            onClick={() => onOpen(e)}
          >
            <span className="em-cal-agenda-when">
              {startOfDay(eventDayStart(e)) === from
                ? "Today"
                : agendaFmt.format(new Date(eventDayStart(e)))}
              {!e.allDay && `, ${timeFmt.format(new Date(e.start))}`}
            </span>
            <span className="em-cal-ev-title">{e.title || "Untitled"}</span>
          </button>
        ))
      )}
    </div>
  );
}

function MonthGrid({ from, anchor, events, nowTs, onPickDay, onOpenDay, onOpen }) {
  const month = new Date(anchor).getMonth();
  const today = startOfDay(nowTs);
  const [dropDay, setDropDay] = useState(null);
  const dragged = useRef(null);
  const days = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  return (
    <div className="em-cal-month">
      <div className="em-cal-dow">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="em-cal-cells">
        {days.map((day) => {
          const list = eventsOnDay(events, day);
          const shown = list.slice(0, 3);
          const out = new Date(day).getMonth() !== month;
          return (
            <div
              key={day}
              className={`em-cal-cell${out ? " is-out" : ""}${day === today ? " is-today" : ""}${dropDay === day ? " is-drop" : ""}`}
              onDoubleClick={(e) => {
                if (!e.target.closest(".em-cal-ev")) onPickDay(day);
              }}
              onDragOver={(e) => {
                if (!dragged.current) return;
                e.preventDefault();
                setDropDay(day);
              }}
              onDragLeave={() => setDropDay((d) => (d === day ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                setDropDay(null);
                const ev = dragged.current;
                dragged.current = null;
                if (!ev) return;
                const shift = day - startOfDay(eventDayStart(ev));
                if (shift) moveEvent(ev, ev.start + shift, ev.end + shift);
              }}
            >
              <button
                type="button"
                className="em-cal-daynum"
                aria-label={dayFmt.format(new Date(day))}
                onClick={() => onOpenDay(day)}
              >
                {new Date(day).getDate()}
              </button>
              {shown.map((e) => (
                <button
                  key={`${e.id}:${e.start}`}
                  type="button"
                  draggable={canEdit(e)}
                  onDragStart={(ev) => {
                    dragged.current = e;
                    ev.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    dragged.current = null;
                    setDropDay(null);
                  }}
                  className={`${eventClass(e)} is-chip${e.allDay ? " is-allday" : ""}`}
                  onClick={() => onOpen(e)}
                  title={e.title}
                >
                  {!e.allDay && eventDayStart(e) >= day && (
                    <span className="em-cal-ev-time">{timeFmt.format(new Date(e.start))}</span>
                  )}
                  <span className="em-cal-ev-title">{e.title || "Untitled"}</span>
                </button>
              ))}
              {list.length > 3 && (
                <button type="button" className="em-cal-more" onClick={() => onOpenDay(day)}>
                  {list.length - 3} more
                </button>
              )}
              <button
                type="button"
                className="em-cal-cell-add"
                aria-label={`New event on ${dayFmt.format(new Date(day))}`}
                onClick={() => onPickDay(day)}
              >
                <Plus size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeGrid({ from, count, events, nowTs, onCreate, onOpen, onDayHeader }) {
  const scrollRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  dragRef.current = drag;
  const days = Array.from({ length: count }, (_, i) => addDays(from, i));
  const today = startOfDay(nowTs);

  useEffect(() => {
    const h = new Date().getHours();
    if (scrollRef.current)
      scrollRef.current.scrollTop = HOUR_PX * Math.max(0, Math.min(h - 2, 14));
  }, []);

  function pointAt(x, y) {
    const col = document.elementFromPoint(x, y)?.closest?.("[data-day]");
    if (!col) return null;
    const rect = col.getBoundingClientRect();
    const day = Number(col.dataset.day);
    const mins = Math.max(0, Math.min(1440, ((y - rect.top) / HOUR_PX) * 60));
    return { day, ts: day + Math.round((mins * 60000) / SNAP) * SNAP };
  }

  useEffect(() => {
    if (!drag) return;
    function onMove(e) {
      const d = dragRef.current;
      if (!d) return;
      const p = pointAt(e.clientX, e.clientY);
      const moved = d.moved || Math.abs(e.clientY - d.y0) + Math.abs(e.clientX - d.x0) > 4;
      if (d.kind === "create") {
        if (!p) return;
        const b = Math.max(d.day + (p.ts - p.day), d.a + SNAP);
        setDrag({ ...d, b: Math.min(b, d.day + 86400000), moved });
      } else if (d.kind === "resize") {
        if (!p) return;
        const end = Math.max(startOfDay(d.e.start) + (p.ts - p.day), d.e.start + SNAP);
        setDrag({ ...d, end, moved });
      } else if (d.kind === "move" && p) {
        const offset = Math.round((p.ts - p.day - d.grab) / SNAP) * SNAP;
        const start = p.day + offset;
        setDrag({ ...d, start, moved });
      }
    }
    function onUp() {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      if (d.kind === "create") return onCreate(d.a, Math.max(d.b, d.a + 1800000));
      if (!d.moved) return onOpen(d.e);
      if (d.kind === "resize" && d.end !== d.e.end) moveEvent(d.e, d.e.start, d.end);
      if (d.kind === "move" && d.start !== d.e.start)
        moveEvent(d.e, d.start, d.start + (d.e.end - d.e.start));
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag !== null]);

  function startCreate(day, e) {
    if (e.button !== 0 || e.target.closest(".em-cal-ev")) return;
    if (e.pointerType === "touch") return;
    const p = pointAt(e.clientX, e.clientY);
    if (!p) return;
    const a = Math.floor((p.ts - day) / SNAP) * SNAP + day;
    setDrag({ kind: "create", day, a, b: a + 1800000, x0: e.clientX, y0: e.clientY });
  }

  function startEvent(ev, kind, e) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!canEdit(ev) || e.pointerType === "touch") {
      if (kind === "move") return;
      return;
    }
    e.preventDefault();
    const p = pointAt(e.clientX, e.clientY);
    const grab = p ? p.ts - p.day - (ev.start - startOfDay(ev.start)) : 0;
    setDrag({ kind, e: ev, grab, start: ev.start, end: ev.end, x0: e.clientX, y0: e.clientY });
  }

  const allDayRows = days.map((d) =>
    eventsOnDay(events, d).filter(
      (e) => e.allDay || eventDayEnd(e) - eventDayStart(e) >= 86400000,
    ),
  );

  return (
    <div className={`em-cal-week is-${count === 1 ? "day" : "week"}`}>
      <div className="em-cal-weekhead">
        <div className="em-cal-gutter" />
        {days.map((d) => (
          <button
            key={d}
            type="button"
            className={`em-cal-weekday${d === today ? " is-today" : ""}`}
            onClick={() => onDayHeader(d)}
          >
            <span className="em-cal-weekday-name">{WEEKDAYS[(new Date(d).getDay() + 6) % 7]}</span>
            <span className="em-cal-weekday-num">{new Date(d).getDate()}</span>
          </button>
        ))}
      </div>
      <div className="em-cal-allday">
        <div className="em-cal-gutter">All day</div>
        {days.map((d, i) => (
          <div key={d} className="em-cal-allday-col">
            {allDayRows[i].map((e) => (
              <button
                key={`${e.id}:${e.start}`}
                type="button"
                className={`${eventClass(e)} is-chip is-allday`}
                onClick={() => onOpen(e)}
              >
                <span className="em-cal-ev-title">{e.title || "Untitled"}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="em-cal-scroll" ref={scrollRef}>
        <div className={`em-cal-hours${drag?.moved ? " is-dragging" : ""}`}>
          <div className="em-cal-gutter">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="em-cal-hourlabel">
                {h ? hourFmt.format(new Date(2000, 0, 1, h)) : ""}
              </div>
            ))}
          </div>
          {days.map((day) => {
            const timed = eventsOnDay(events, day).filter(
              (e) => !e.allDay && eventDayEnd(e) - eventDayStart(e) < 86400000,
            );
            const dragging = drag?.e && drag.moved ? `${drag.e.id}:${drag.e.start}` : null;
            let ghost = null;
            if (drag?.kind === "create" && drag.day === day) ghost = { a: drag.a, b: drag.b };
            if (drag?.moved && drag.kind === "move" && startOfDay(drag.start) === day)
              ghost = { a: drag.start, b: drag.start + (drag.e.end - drag.e.start), e: drag.e };
            if (drag?.moved && drag.kind === "resize" && startOfDay(drag.e.start) === day)
              ghost = { a: drag.e.start, b: drag.end, e: drag.e };
            return (
              <div
                key={day}
                data-day={day}
                className={`em-cal-col${day === today ? " is-today" : ""}`}
                onPointerDown={(e) => startCreate(day, e)}
              >
                {layoutDay(timed).map(({ e, col, cols }) => {
                  const s = Math.max(e.start, day);
                  const en = Math.min(e.end, day + 86400000);
                  const top = ((s - day) / 3600000) * HOUR_PX;
                  const h = Math.max(20, ((en - s) / 3600000) * HOUR_PX - 2);
                  const key = `${e.id}:${e.start}`;
                  return (
                    <div
                      key={key}
                      role="button"
                      tabIndex={0}
                      className={`${eventClass(e)} is-block${h < 40 ? " is-short" : ""}${h >= 72 ? " is-tall" : ""}${dragging === key ? " is-lifted" : ""}${canEdit(e) ? " is-movable" : ""}`}
                      style={{
                        top,
                        height: h,
                        left: `${(col / cols) * 100}%`,
                        width: `calc(${100 / cols}% - 3px)`,
                      }}
                      onPointerDown={(ev) => startEvent(e, "move", ev)}
                      onClick={(ev) => {
                        if (!canEdit(e) || ev.detail === 0) onOpen(e);
                      }}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          onOpen(e);
                        }
                      }}
                    >
                      <span className="em-cal-ev-title">{e.title || "Untitled"}</span>
                      <span className="em-cal-ev-time">
                        {timeFmt.format(new Date(e.start))}
                        {e.location && h >= 56 ? `, ${e.location}` : ""}
                      </span>
                      {canEdit(e) && en === e.end && (
                        <span
                          className="em-cal-resize"
                          aria-hidden="true"
                          onPointerDown={(ev) => startEvent(e, "resize", ev)}
                        />
                      )}
                    </div>
                  );
                })}
                {ghost && (
                  <div
                    className={`${ghost.e ? eventClass(ghost.e) : "em-cal-ev is-rose"} is-block is-ghost`}
                    style={{
                      top: ((ghost.a - day) / 3600000) * HOUR_PX,
                      height: Math.max(18, ((ghost.b - ghost.a) / 3600000) * HOUR_PX - 2),
                      left: 0,
                      width: "calc(100% - 3px)",
                    }}
                  >
                    {ghost.e && <span className="em-cal-ev-title">{ghost.e.title}</span>}
                    <span className="em-cal-ev-time">
                      {timeFmt.format(new Date(ghost.a))} to {timeFmt.format(new Date(ghost.b))}
                    </span>
                  </div>
                )}
                {day === today && (
                  <div
                    className="em-cal-now"
                    style={{ top: ((nowTs - day) / 3600000) * HOUR_PX }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GuestField({ guests, onChange }) {
  const [text, setText] = useState("");
  const [suggest, setSuggest] = useState([]);
  const timer = useRef(null);
  function add(raw) {
    const parts = String(raw)
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
    if (!parts.length) return false;
    const next = [...guests];
    for (const p of parts) if (!next.some((g) => g.address === p)) next.push({ address: p, status: "needs-action" });
    onChange(next);
    setText("");
    setSuggest([]);
    return true;
  }
  useEffect(() => {
    clearTimeout(timer.current);
    const q = text.trim();
    if (q.length < 2) return setSuggest([]);
    timer.current = setTimeout(() => {
      api
        .contacts(q)
        .then((d) => setSuggest((d.contacts || []).slice(0, 5)))
        .catch(() => {});
    }, 150);
    return () => clearTimeout(timer.current);
  }, [text]);
  const icon = { accepted: CheckCircle, declined: XCircle, tentative: Question };
  return (
    <div className="em-cal-guests">
      {guests.length > 0 && (
        <ul className="em-cal-guestlist">
          {guests.map((g) => {
            const Icon = icon[g.status] || Circle;
            return (
              <li key={g.address} className={`em-cal-guest is-${g.status || "needs-action"}`}>
                <Icon size={15} aria-label={g.status || "no reply"} />
                <span className="em-cal-guest-addr">{g.name || g.address}</span>
                <button
                  type="button"
                  className="em-cal-guest-x"
                  aria-label={`Remove ${g.address}`}
                  onClick={() => onChange(guests.filter((x) => x.address !== g.address))}
                >
                  <X size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="em-cal-guestinput">
        <Input
          placeholder="Add guests by email"
          aria-label="Add guests"
          type="email"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && text.trim()) {
              e.preventDefault();
              add(suggest[0]?.address && !text.includes("@") ? suggest[0].address : text);
            }
            if (e.key === "Backspace" && !text && guests.length) onChange(guests.slice(0, -1));
          }}
          onBlur={() => text && add(text)}
        />
        {suggest.length > 0 && (
          <div className="em-cal-suggest" role="listbox">
            {suggest.map((c) => (
              <button
                key={c.address}
                type="button"
                role="option"
                aria-selected="false"
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(c.address);
                }}
              >
                <span>{c.name || c.address}</span>
                {c.name && <span className="em-cal-suggest-addr">{c.address}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EventDialog({ event, onClose }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const readOnly = event?.owned === false;

  useEffect(() => {
    setConfirmDelete(false);
    if (!event) return setForm(null);
    setForm({
      title: event.title || "",
      allDay: !!event.allDay,
      date: event.allDay ? localDateOfUtc(event.start) : toDateInput(event.start),
      endDate: event.allDay ? localDateOfUtc(event.end - 86400000) : toDateInput(event.end),
      startTime: toTimeInput(event.start),
      endTime: toTimeInput(event.end),
      rrule: event.rrule || "none",
      color: event.color || null,
      location: event.location || "",
      description: event.description || "",
      guests: event.attendees || [],
      reminder: String(event.reminder ?? 10),
    });
    setBusy("");
  }, [event]);

  useEffect(() => {
    if (!event) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [event, onClose]);

  if (!event || !form) return null;
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));
  const repeatOptions = REPEAT.some(([v]) => v === form.rrule)
    ? REPEAT
    : [...REPEAT, [form.rrule, "Custom repeat"]];

  function times() {
    if (form.allDay) {
      const start = utcDay(form.date);
      const end = Math.max(utcDay(form.endDate || form.date), start) + 86400000;
      return { start, end };
    }
    const start = fromInputs(form.date, form.startTime);
    let end = fromInputs(form.endDate || form.date, form.endTime);
    if (end <= start) end = start + 1800000;
    return { start, end };
  }

  async function save(e) {
    e.preventDefault();
    const { start, end } = times();
    const shift = event.occurrence ? event.seriesStart - event.start : 0;
    const payload = {
      title: form.title.trim() || "Untitled",
      start: start + shift,
      end: end + shift,
      allDay: form.allDay,
      rrule: form.rrule === "none" ? null : form.rrule,
      color: form.color,
      location: form.location,
      description: form.description,
      guests: form.guests.map((g) => g.address),
      reminder: Number(form.reminder),
      tz: event.tz || TZ,
    };
    onClose();
    try {
      reportSend(event.draft ? await createEvent(payload) : await updateEvent(event.id, payload));
    } catch (err) {
      notifyError(err);
    }
  }

  async function remove(occurrence) {
    onClose();
    try {
      const res = await deleteEvent(event.id, occurrence);
      if (res?.sendError) notifyError(new Error(`Deleted, but guests were not emailed: ${res.sendError}`));
      else notify(occurrence ? "Event removed from the series" : "Event deleted", "", "success");
    } catch (err) {
      notifyError(err);
    }
  }

  async function rsvp(status) {
    setBusy(status);
    try {
      await rsvpEvent(event.id, status);
      notify(
        status === "accepted"
          ? "Invitation accepted"
          : status === "declined"
            ? "Invitation declined"
            : "Replied maybe",
        "",
        "success",
      );
      onClose();
    } catch (err) {
      notifyError(err);
      setBusy("");
    }
  }

  async function recolor(c) {
    setForm((f) => ({ ...f, color: c }));
    try {
      await updateEvent(event.id, { ...payloadOf(event, event.start, event.end), color: c });
    } catch (err) {
      notifyError(err);
    }
  }

  const swatches = (
    <div className="em-swatch-grid" role="radiogroup" aria-label="Color">
      {COLORS.map((c) => {
        const on = (form.color || (readOnly ? "blue" : "rose")) === c;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={c}
            className={`em-swatch em-cal-swatch is-${c}${on ? " is-selected" : ""}`}
            onClick={() => (readOnly ? recolor(c) : set("color")(c))}
          >
            {on && <Check size={14} weight="bold" color="#fff" />}
          </button>
        );
      })}
    </div>
  );

  const hasGuests = (event.attendees || []).length > 0;

  return createPortal(
    <div
      className="em-modal-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        className="em-modal-panel em-cal-dialog"
        role="dialog"
        aria-label={event.draft ? "New event" : "Event"}
        onSubmit={save}
      >
        <div className="em-label-head">
          {readOnly ? (
            <h2 className="em-label-title">{event.title || "Untitled"}</h2>
          ) : (
            <input
              className="em-cal-titleinput"
              autoFocus={event.draft}
              placeholder="Add a title"
              aria-label="Title"
              value={form.title}
              onChange={set("title")}
            />
          )}
          <Button
            size="sm"
            variant="ghost"
            shape="square"
            aria-label="Close"
            icon={X}
            onClick={onClose}
          />
        </div>

        {readOnly ? (
          <>
            <InviteDetails event={event} busy={busy} onRsvp={rsvp} />
            <div className="em-cal-form">{swatches}</div>
            <div className="em-cal-actions">
              <Button variant="secondary-destructive" icon={Trash} onClick={() => remove()}>
                Remove from calendar
              </Button>
            </div>
          </>
        ) : (
          <div className="em-cal-form">
            <label className="em-cal-switch">
              <Switch aria-label="All day" checked={form.allDay} onCheckedChange={set("allDay")} />
              <span>All day</span>
            </label>
            <div className="em-cal-when">
              <Input
                type="date"
                aria-label="Start date"
                value={form.date}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({ ...f, date: v, endDate: f.endDate < v || f.endDate === f.date ? v : f.endDate }));
                }}
              />
              {!form.allDay && (
                <Input
                  type="time"
                  aria-label="Start time"
                  step={900}
                  value={form.startTime}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => {
                      const dur = fromInputs(f.endDate, f.endTime) - fromInputs(f.date, f.startTime);
                      const next = fromInputs(f.date, v) + Math.max(dur, 900000);
                      return { ...f, startTime: v, endTime: toTimeInput(next), endDate: toDateInput(next) };
                    });
                  }}
                />
              )}
              <span className="em-cal-to">to</span>
              {!form.allDay && (
                <Input
                  type="time"
                  aria-label="End time"
                  step={900}
                  value={form.endTime}
                  onChange={set("endTime")}
                />
              )}
              {(form.allDay || form.endDate !== form.date) && (
                <Input
                  type="date"
                  aria-label="End date"
                  value={form.endDate}
                  min={form.date}
                  onChange={set("endDate")}
                />
              )}
            </div>
            <Select
              aria-label="Repeat"
              value={form.rrule}
              onValueChange={set("rrule")}
              renderValue={(v) => repeatOptions.find(([x]) => x === v)?.[1] || "Custom repeat"}
            >
              {repeatOptions.map(([v, l]) => (
                <Select.Option key={v} value={v}>
                  {l}
                </Select.Option>
              ))}
            </Select>
            {!form.allDay && (
              <Select
                aria-label="Reminder"
                value={form.reminder}
                onValueChange={set("reminder")}
                renderValue={(v) => REMINDERS.find(([x]) => x === v)?.[1] || `${v} minutes before`}
              >
                {REMINDERS.map(([v, l]) => (
                  <Select.Option key={v} value={v}>
                    {l}
                  </Select.Option>
                ))}
              </Select>
            )}
            <GuestField guests={form.guests} onChange={set("guests")} />
            <Input
              placeholder="Add a location"
              aria-label="Location"
              value={form.location}
              onChange={set("location")}
            />
            <textarea
              className="em-cal-notes"
              placeholder="Add notes"
              aria-label="Notes"
              rows={3}
              value={form.description}
              onChange={set("description")}
            />
            {swatches}
            {event.occurrence && (
              <p className="em-card-sub">Changes apply to every event in this series.</p>
            )}
            {form.guests.length > 0 && (
              <p className="em-card-sub">Guests get an email with the invitation or update.</p>
            )}
            <div className="em-cal-actions">
              {!event.draft &&
                (confirmDelete ? (
                  <>
                    <Button
                      variant="secondary-destructive"
                      onClick={() => remove(event.occurrence)}
                    >
                      Delete this one
                    </Button>
                    <Button variant="secondary-destructive" onClick={() => remove()}>
                      Delete all
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="secondary-destructive"
                    icon={Trash}
                    onClick={() => (event.occurrence ? setConfirmDelete(true) : remove())}
                  >
                    {hasGuests ? "Cancel event" : "Delete"}
                  </Button>
                ))}
              <span className="em-cal-spacer" />
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              <Button variant="primary" type="submit">
                {event.draft
                  ? form.guests.length
                    ? "Send invitations"
                    : "Create event"
                  : "Save event"}
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>,
    document.body,
  );
}

function whenLine(e) {
  if (e.allDay) {
    const s = new Date(eventDayStart(e));
    const last = new Date(eventDayEnd(e) - 86400000);
    return last > s ? `${dayFmt.format(s)} to ${dayFmt.format(last)}` : dayFmt.format(s);
  }
  const s = new Date(e.start);
  const en = new Date(e.end);
  const sameDay = startOfDay(e.start) === startOfDay(e.end);
  return sameDay
    ? `${dayFmt.format(s)}, ${timeFmt.format(s)} to ${timeFmt.format(en)}`
    : `${dayFmt.format(s)} ${timeFmt.format(s)} to ${dayFmt.format(en)} ${timeFmt.format(en)}`;
}

export function InviteDetails({ event, busy, onRsvp, compact }) {
  const attendees = event.attendees || [];
  const going = attendees.filter((a) => a.status === "accepted").length;
  const cancelled = event.status === "cancelled";
  return (
    <div className={`em-cal-invite${compact ? " is-compact" : ""}`}>
      {compact && <div className="em-cal-invite-title">{event.title || "Untitled"}</div>}
      <div className="em-cal-invite-when">
        {cancelled ? `Cancelled: ${whenLine(event)}` : whenLine(event)}
        {event.rrule ? ", repeats" : ""}
      </div>
      {event.location && (
        <div className="em-cal-invite-row">
          <MapPin size={15} />
          <span>{event.location}</span>
        </div>
      )}
      {attendees.length > 0 && (
        <div className="em-cal-invite-row">
          <UsersThree size={15} />
          <span>
            {event.organizerName || event.organizer} invited {attendees.length}{" "}
            {attendees.length === 1 ? "person" : "people"}, {going} going
          </span>
        </div>
      )}
      {!compact && event.description && <p className="em-cal-invite-desc">{event.description}</p>}
      {!cancelled && event.myStatus && (
        <div className="em-cal-rsvp" role="group" aria-label="Reply to invitation">
          <span className="em-cal-rsvp-label">Going?</span>
          {[
            ["accepted", "Yes", Check],
            ["tentative", "Maybe", Question],
            ["declined", "No", X],
          ].map(([s, label, Icon]) => (
            <Button
              key={s}
              size="sm"
              variant={event.myStatus === s ? "primary" : "secondary"}
              icon={Icon}
              loading={busy === s}
              disabled={!!busy && busy !== s}
              aria-pressed={event.myStatus === s}
              onClick={() => onRsvp(s)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function FeedDialog({ open, onClose }) {
  const [url, setUrl] = useState("");
  const fileRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    api
      .calendarFeed()
      .then((d) => setUrl(d.url))
      .catch(notifyError);
  }, [open]);
  if (!open) return null;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      notify("Feed link copied", "", "success");
    } catch (e) {
      notifyError(e);
    }
  }
  async function rotate() {
    try {
      const d = await api.calendarFeed(true);
      setUrl(d.url);
      notify("Old feed link turned off", "", "success");
    } catch (e) {
      notifyError(e);
    }
  }
  async function importFile(file) {
    if (!file) return;
    try {
      const res = await api.importCalendar(await file.text());
      if (res.error) throw new Error(res.error);
      notify(`Imported ${res.added} of ${res.total} events`, "", "success");
      refreshCalendar();
    } catch (e) {
      notifyError(e);
    }
  }
  return createPortal(
    <div
      className="em-modal-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="em-modal-panel" role="dialog" aria-label="Calendar feed">
        <div className="em-label-head">
          <h2 className="em-label-title">Subscribe from another app</h2>
          <Button
            size="sm"
            variant="ghost"
            shape="square"
            aria-label="Close"
            icon={X}
            onClick={onClose}
          />
        </div>
        <p className="em-card-sub">
          Paste this link into Apple Calendar, Google Calendar or Thunderbird to see your events
          there. Anyone with the link can read your calendar.
        </p>
        <div className="em-cal-feed">
          <Input readOnly aria-label="Feed link" value={url} onFocus={(e) => e.target.select()} />
          <Button variant="primary" onClick={copy} disabled={!url}>
            Copy link
          </Button>
        </div>
        <div className="em-cal-actions">
          <Button variant="secondary-destructive" onClick={rotate}>
            Reset link
          </Button>
          <span className="em-cal-spacer" />
          <input
            ref={fileRef}
            type="file"
            accept=".ics,text/calendar"
            hidden
            onChange={(e) => importFile(e.target.files?.[0])}
          />
          <Button variant="secondary" icon={UploadSimple} onClick={() => fileRef.current?.click()}>
            Import .ics
          </Button>
          <a className="em-cal-export" href="/api/calendar/export" download>
            <DownloadSimple size={16} />
            Export .ics
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}
