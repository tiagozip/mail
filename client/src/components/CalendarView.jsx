import { Button, Input, Select, Switch } from "@cloudflare/kumo";
import {
  CaretLeft,
  CaretRight,
  Check,
  Link as LinkIcon,
  List,
  MapPin,
  Plus,
  Question,
  Trash,
  UsersThree,
  X,
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
  rsvpEvent,
  startOfDay,
  startOfWeek,
  updateEvent,
  useRange,
} from "../calendar.js";
import { notify, notifyError } from "../toast.js";

const HOUR_PX = 48;
const COLORS = ["rose", "violet", "blue", "teal", "green", "amber", "gray"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const REPEAT = [
  ["none", "Does not repeat"],
  ["FREQ=DAILY", "Every day"],
  ["FREQ=WEEKLY", "Every week"],
  ["FREQ=MONTHLY", "Every month"],
  ["FREQ=YEARLY", "Every year"],
];

const hourFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const monthFmt = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
const shortFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

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
    for (const e of cluster) {
      let i = cols.findIndex((end) => end <= e.start);
      if (i < 0) i = cols.length;
      cols[i] = e.end;
      out.push({ e, col: i });
    }
    for (const o of out.slice(-cluster.length)) o.cols = cols.length;
    cluster = [];
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
  const c = e.color || (e.organizer ? "blue" : "rose");
  let cls = `em-cal-ev is-${c}`;
  if (e.myStatus === "needs-action") cls += " is-pending";
  if (e.myStatus === "declined" || e.status === "cancelled") cls += " is-declined";
  if (e.pending) cls += " is-saving";
  return cls;
}

export function CalendarView({ onMenu }) {
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
    if (mode === "week") {
      const from = startOfWeek(anchor);
      return { from, to: addDays(from, 7) };
    }
    return monthGrid(anchor);
  }, [mode, anchor]);

  const { events } = useRange(range.from, range.to);

  useEffect(() => {
    if (mode === "week") {
      loadRange(addDays(range.from, 7), addDays(range.from, 14));
      loadRange(addDays(range.from, -7), range.from);
    } else {
      const a = new Date(anchor);
      const next = monthGrid(new Date(a.getFullYear(), a.getMonth() + 1, 1).getTime());
      const prev = monthGrid(new Date(a.getFullYear(), a.getMonth() - 1, 1).getTime());
      loadRange(next.from, next.to);
      loadRange(prev.from, prev.to);
    }
  }, [mode, anchor, range.from]);

  function step(dir) {
    if (mode === "week") return setAnchor((a) => addDays(a, dir * 7));
    setAnchor((a) => {
      const d = new Date(a);
      return new Date(d.getFullYear(), d.getMonth() + dir, 1).getTime();
    });
  }

  function newAt(start, end, allDay) {
    const s = start ?? (() => {
      const d = new Date(anchor);
      const n = new Date();
      d.setHours(n.getHours() + 1, 0, 0, 0);
      return d.getTime();
    })();
    setEditing({ draft: true, title: "", start: s, end: end ?? s + 3600000, allDay: !!allDay, rrule: "", color: null, location: "", description: "" });
  }

  useEffect(() => {
    function onKey(e) {
      if (editing || feedOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t.closest?.("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      const k = e.key;
      if (k === "t") setAnchor(startOfDay(Date.now()));
      else if (k === "m") setMode("month");
      else if (k === "w") setMode("week");
      else if (k === "j" || k === "ArrowRight" || k === "n") step(1);
      else if (k === "k" || k === "ArrowLeft" || k === "p") step(-1);
      else if (k === "c") newAt();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const title =
    mode === "week"
      ? (() => {
          const a = new Date(range.from);
          const b = new Date(addDays(range.from, 6));
          return a.getMonth() === b.getMonth()
            ? monthFmt.format(a)
            : `${shortFmt.format(a)} to ${shortFmt.format(b)}, ${b.getFullYear()}`;
        })()
      : monthFmt.format(new Date(anchor));

  return (
    <div className="em-cal">
      <div className="em-cal-bar">
        <Button className="em-menu-btn" size="sm" variant="ghost" shape="square" aria-label="Menu" icon={List} onClick={onMenu} />
        <h1 className="em-cal-title">{title}</h1>
        <div className="em-cal-nav">
          <Button size="sm" variant="ghost" shape="square" aria-label="Previous" icon={CaretLeft} onClick={() => step(-1)} />
          <Button size="sm" variant="secondary" onClick={() => setAnchor(startOfDay(Date.now()))}>
            Today
          </Button>
          <Button size="sm" variant="ghost" shape="square" aria-label="Next" icon={CaretRight} onClick={() => step(1)} />
        </div>
        <div className="em-cal-seg" role="tablist" aria-label="View">
          {["month", "week"].map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "is-on" : ""} onClick={() => setMode(m)}>
              {m === "month" ? "Month" : "Week"}
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" shape="square" aria-label="Subscribe to calendar feed" icon={LinkIcon} onClick={() => setFeedOpen(true)} />
        <Button size="sm" variant="primary" icon={Plus} onClick={() => newAt()}>
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
            setMode("week");
          }}
          onOpen={(e) => setEditing(e)}
        />
      ) : (
        <WeekGrid from={range.from} events={events} nowTs={nowTs} onCreate={newAt} onOpen={(e) => setEditing(e)} />
      )}

      <EventDialog event={editing} onClose={() => setEditing(null)} />
      <FeedDialog open={feedOpen} onClose={() => setFeedOpen(false)} />
    </div>
  );
}

function MonthGrid({ from, anchor, events, nowTs, onPickDay, onOpenDay, onOpen }) {
  const month = new Date(anchor).getMonth();
  const today = startOfDay(nowTs);
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
              className={`em-cal-cell${out ? " is-out" : ""}${day === today ? " is-today" : ""}`}
              onDoubleClick={() => onPickDay(day)}
            >
              <button type="button" className="em-cal-daynum" aria-label={dayFmt.format(new Date(day))} onClick={() => onOpenDay(day)}>
                {new Date(day).getDate()}
              </button>
              {shown.map((e) => (
                <button key={`${e.id}:${e.start}`} type="button" className={`${eventClass(e)} is-chip${e.allDay ? " is-allday" : ""}`} onClick={() => onOpen(e)} title={e.title}>
                  {!e.allDay && eventDayStart(e) >= day && <span className="em-cal-ev-time">{timeFmt.format(new Date(e.start))}</span>}
                  <span className="em-cal-ev-title">{e.title || "Untitled"}</span>
                </button>
              ))}
              {list.length > 3 && (
                <button type="button" className="em-cal-more" onClick={() => onOpenDay(day)}>
                  {list.length - 3} more
                </button>
              )}
              <button type="button" className="em-cal-cell-add" aria-label={`New event on ${dayFmt.format(new Date(day))}`} onClick={() => onPickDay(day)}>
                <Plus size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({ from, events, nowTs, onCreate, onOpen }) {
  const scrollRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const today = startOfDay(nowTs);

  useEffect(() => {
    const h = new Date().getHours();
    if (scrollRef.current) scrollRef.current.scrollTop = HOUR_PX * Math.max(0, Math.min(h - 2, 14));
  }, []);

  function slotAt(day, e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mins = Math.max(0, Math.min(1440, ((e.clientY - rect.top) / HOUR_PX) * 60));
    return day + Math.floor(mins / 15) * 15 * 60000;
  }

  function onDown(day, e) {
    if (e.button !== 0 || e.target.closest(".em-cal-ev")) return;
    const t = slotAt(day, e);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ day, a: t, b: t + 1800000 });
  }

  function onMove(day, e) {
    if (!drag || drag.day !== day) return;
    const t = slotAt(day, e);
    setDrag((d) => ({ ...d, b: Math.max(t + 900000, d.a + 900000) }));
  }

  function onUp() {
    if (!drag) return;
    const { a, b } = drag;
    setDrag(null);
    onCreate(a, Math.max(b, a + 1800000));
  }

  return (
    <div className="em-cal-week">
      <div className="em-cal-weekhead">
        <div className="em-cal-gutter" />
        {days.map((d, i) => (
          <div key={d} className={`em-cal-weekday${d === today ? " is-today" : ""}`}>
            <span className="em-cal-weekday-name">{WEEKDAYS[i]}</span>
            <span className="em-cal-weekday-num">{new Date(d).getDate()}</span>
          </div>
        ))}
      </div>
      <div className="em-cal-allday">
        <div className="em-cal-gutter">All day</div>
        {days.map((d) => (
          <div key={d} className="em-cal-allday-col">
            {eventsOnDay(events, d)
              .filter((e) => e.allDay || eventDayEnd(e) - eventDayStart(e) >= 86400000)
              .map((e) => (
                <button key={`${e.id}:${e.start}`} type="button" className={`${eventClass(e)} is-chip is-allday`} onClick={() => onOpen(e)}>
                  <span className="em-cal-ev-title">{e.title || "Untitled"}</span>
                </button>
              ))}
          </div>
        ))}
      </div>
      <div className="em-cal-scroll" ref={scrollRef}>
        <div className="em-cal-hours">
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
            return (
              <div
                key={day}
                className={`em-cal-col${day === today ? " is-today" : ""}`}
                onPointerDown={(e) => onDown(day, e)}
                onPointerMove={(e) => onMove(day, e)}
                onPointerUp={onUp}
                onPointerCancel={() => setDrag(null)}
              >
                {layoutDay(timed).map(({ e, col, cols }) => {
                  const s = Math.max(e.start, day);
                  const en = Math.min(e.end, day + 86400000);
                  const top = ((s - day) / 3600000) * HOUR_PX;
                  const h = Math.max(20, ((en - s) / 3600000) * HOUR_PX - 2);
                  return (
                    <button
                      key={`${e.id}:${e.start}`}
                      type="button"
                      className={`${eventClass(e)} is-block${h < 40 ? " is-short" : ""}${h >= 72 ? " is-tall" : ""}`}
                      style={{ top, height: h, left: `${(col / cols) * 100}%`, width: `calc(${100 / cols}% - 3px)` }}
                      onClick={() => onOpen(e)}
                    >
                      <span className="em-cal-ev-title">{e.title || "Untitled"}</span>
                      <span className="em-cal-ev-time">
                        {timeFmt.format(new Date(e.start))}
                        {e.location && h >= 56 ? `, ${e.location}` : ""}
                      </span>
                    </button>
                  );
                })}
                {drag?.day === day && (
                  <div
                    className="em-cal-ev is-rose is-block is-ghost"
                    style={{ top: ((drag.a - day) / 3600000) * HOUR_PX, height: ((drag.b - drag.a) / 3600000) * HOUR_PX - 2, left: 0, width: "calc(100% - 3px)" }}
                  >
                    <span className="em-cal-ev-time">
                      {timeFmt.format(new Date(drag.a))} to {timeFmt.format(new Date(drag.b))}
                    </span>
                  </div>
                )}
                {day === today && <div className="em-cal-now" style={{ top: ((nowTs - day) / 3600000) * HOUR_PX }} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EventDialog({ event, onClose }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState("");
  const titleRef = useRef(null);
  const readOnly = !!event?.organizer;

  useEffect(() => {
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

  function body() {
    if (form.allDay) {
      const start = utcDay(form.date);
      const end = Math.max(utcDay(form.endDate || form.date), start) + 86400000;
      return { ...form, start, end };
    }
    const start = fromInputs(form.date, form.startTime);
    let end = fromInputs(form.endDate || form.date, form.endTime);
    if (end <= start) end = start + 1800000;
    return { ...form, start, end };
  }

  async function save(e) {
    e.preventDefault();
    const b = body();
    const shift = event.occurrence ? event.seriesStart - event.start : 0;
    const payload = {
      title: b.title.trim() || "Untitled",
      start: b.start + shift,
      end: b.end + shift,
      allDay: b.allDay,
      rrule: b.rrule === "none" ? null : b.rrule,
      color: b.color,
      location: b.location,
      description: b.description,
    };
    onClose();
    try {
      if (event.draft) await createEvent(payload);
      else await updateEvent(event.id, payload);
    } catch (err) {
      notifyError(err);
    }
  }

  async function remove() {
    onClose();
    try {
      await deleteEvent(event.id);
      notify("Event deleted", "", "success");
    } catch (err) {
      notifyError(err);
    }
  }

  async function rsvp(status) {
    setBusy(status);
    try {
      await rsvpEvent(event.id, status);
      notify(status === "accepted" ? "Invitation accepted" : status === "declined" ? "Invitation declined" : "Replied maybe", "", "success");
      onClose();
    } catch (err) {
      notifyError(err);
      setBusy("");
    }
  }

  return createPortal(
    <div
      className="em-modal-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form className="em-modal-panel em-cal-dialog" role="dialog" aria-label={event.draft ? "New event" : "Event"} onSubmit={save}>
        <div className="em-label-head">
          {readOnly ? (
            <h2 className="em-label-title">{event.title || "Untitled"}</h2>
          ) : (
            <input
              ref={titleRef}
              className="em-cal-titleinput"
              autoFocus={event.draft}
              placeholder="Add a title"
              aria-label="Title"
              value={form.title}
              onChange={set("title")}
            />
          )}
          <Button size="sm" variant="ghost" shape="square" aria-label="Close" icon={X} onClick={onClose} />
        </div>

        {readOnly ? (
          <InviteDetails event={event} busy={busy} onRsvp={rsvp} />
        ) : (
          <div className="em-cal-form">
            <label className="em-cal-switch">
              <Switch aria-label="All day" checked={form.allDay} onCheckedChange={set("allDay")} />
              <span>All day</span>
            </label>
            <div className="em-cal-when">
              <Input type="date" aria-label="Start date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value, endDate: f.endDate < e.target.value ? e.target.value : f.endDate }))} />
              {!form.allDay && <Input type="time" aria-label="Start time" step={900} value={form.startTime} onChange={set("startTime")} />}
              <span className="em-cal-to">to</span>
              {!form.allDay && <Input type="time" aria-label="End time" step={900} value={form.endTime} onChange={set("endTime")} />}
              {(form.allDay || form.endDate !== form.date) && (
                <Input type="date" aria-label="End date" value={form.endDate} min={form.date} onChange={set("endDate")} />
              )}
            </div>
            <Select aria-label="Repeat" size="sm" value={form.rrule} onValueChange={set("rrule")}>
              {REPEAT.map(([v, l]) => (
                <Select.Option key={v} value={v}>
                  {l}
                </Select.Option>
              ))}
            </Select>
            <Input placeholder="Add a location" aria-label="Location" value={form.location} onChange={set("location")} />
            <textarea className="em-cal-notes" placeholder="Add notes" aria-label="Notes" rows={3} value={form.description} onChange={set("description")} />
            <div className="em-swatch-grid" role="radiogroup" aria-label="Color">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={(form.color || "rose") === c}
                  aria-label={c}
                  className={`em-swatch em-cal-swatch is-${c}${(form.color || "rose") === c ? " is-selected" : ""}`}
                  onClick={() => set("color")(c)}
                >
                  {(form.color || "rose") === c && <Check size={14} weight="bold" color="#fff" />}
                </button>
              ))}
            </div>
            {event.occurrence && <p className="em-card-sub">Changes apply to every event in this series.</p>}
            <div className="em-cal-actions">
              {!event.draft && (
                <Button variant="secondary-destructive" icon={Trash} onClick={remove}>
                  Delete
                </Button>
              )}
              <span className="em-cal-spacer" />
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                {event.draft ? "Create event" : "Save event"}
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
  const going = event.attendees?.filter((a) => a.status === "accepted").length || 0;
  const cancelled = event.status === "cancelled";
  return (
    <div className={`em-cal-invite${compact ? " is-compact" : ""}`}>
      {compact && <div className="em-cal-invite-title">{event.title || "Untitled"}</div>}
      <div className="em-cal-invite-when">{cancelled ? `Cancelled: ${whenLine(event)}` : whenLine(event)}</div>
      {event.location && (
        <div className="em-cal-invite-row">
          <MapPin size={15} />
          <span>{event.location}</span>
        </div>
      )}
      {event.attendees?.length > 0 && (
        <div className="em-cal-invite-row">
          <UsersThree size={15} />
          <span>
            {event.organizerName || event.organizer} invited {event.attendees.length}{" "}
            {event.attendees.length === 1 ? "person" : "people"}, {going} going
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
          <Button size="sm" variant="ghost" shape="square" aria-label="Close" icon={X} onClick={onClose} />
        </div>
        <p className="em-card-sub">
          Paste this link into Apple Calendar, Google Calendar or Thunderbird to see your events there. Anyone with the link can read your calendar.
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
        </div>
      </div>
    </div>,
    document.body,
  );
}
