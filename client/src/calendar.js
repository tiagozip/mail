import { useEffect, useSyncExternalStore } from "react";
import { api } from "./api.js";

const KEY = "em-cal-v1";
const DAY = 86400000;
let ranges = {};
try {
  ranges = JSON.parse(localStorage.getItem(KEY) || "{}");
} catch {}
const inflight = new Map();
const listeners = new Set();
let version = 0;

function emit() {
  version++;
  for (const l of listeners) l();
  try {
    const keys = Object.keys(ranges).slice(-24);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(keys.map((k) => [k, ranges[k]]))));
  } catch {}
}

function subscribe(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function rangeKey(from, to) {
  return `${from}-${to}`;
}

export function loadRange(from, to) {
  const key = rangeKey(from, to);
  if (inflight.has(key)) return inflight.get(key);
  const p = api
    .calendarEvents(from, to)
    .then((d) => {
      ranges[key] = d.events || [];
      emit();
    })
    .catch(() => {})
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export function useRange(from, to) {
  const key = rangeKey(from, to);
  useSyncExternalStore(subscribe, () => version);
  useEffect(() => {
    loadRange(from, to);
  }, [from, to]);
  return { events: ranges[key] || [], ready: key in ranges };
}

function refreshAll() {
  for (const key of Object.keys(ranges)) {
    const [from, to] = key.split("-").map(Number);
    loadRange(from, to);
  }
}

function patchAll(fn) {
  for (const key of Object.keys(ranges)) ranges[key] = fn(ranges[key], key);
  emit();
}

export async function createEvent(body) {
  const temp = { ...body, id: `tmp-${Date.now()}`, pending: true };
  patchAll((list, key) => {
    const [from, to] = key.split("-").map(Number);
    return !body.rrule && body.end > from && body.start < to ? [...list, temp] : list;
  });
  try {
    const { event } = await api.createEvent(body);
    patchAll((list) => list.map((e) => (e.id === temp.id ? event : e)));
    if (body.rrule) refreshAll();
    return event;
  } catch (e) {
    patchAll((list) => list.filter((x) => x.id !== temp.id));
    throw e;
  }
}

export async function updateEvent(id, body) {
  const before = JSON.stringify(ranges);
  patchAll((list) =>
    list.map((e) => {
      if (e.id !== id) return e;
      const shift = e.occurrence ? e.start - e.seriesStart : 0;
      return { ...e, ...body, start: body.start + shift, end: body.end + shift, seriesStart: body.start };
    }),
  );
  try {
    const { event } = await api.updateEvent(id, body);
    refreshAll();
    return event;
  } catch (e) {
    ranges = JSON.parse(before);
    emit();
    throw e;
  }
}

export async function deleteEvent(id) {
  const before = JSON.stringify(ranges);
  patchAll((list) => list.filter((e) => e.id !== id));
  try {
    await api.deleteEvent(id);
  } catch (e) {
    ranges = JSON.parse(before);
    emit();
    throw e;
  }
}

export async function rsvpEvent(id, status) {
  const { event } = await api.rsvpEvent(id, status);
  patchAll((list) => list.map((e) => (e.id === id ? { ...e, myStatus: event.myStatus } : e)));
  return event;
}

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(ts, n) {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function startOfWeek(ts) {
  const d = new Date(startOfDay(ts));
  const shift = (d.getDay() + 6) % 7;
  return addDays(d.getTime(), -shift);
}

export function monthGrid(ts) {
  const d = new Date(ts);
  const first = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const from = startOfWeek(first);
  return { from, to: addDays(from, 42) };
}

export function eventDayStart(e) {
  if (!e.allDay) return e.start;
  const d = new Date(e.start);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime();
}

export function eventDayEnd(e) {
  if (!e.allDay) return e.end;
  const d = new Date(e.end);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime();
}

export function eventsOnDay(events, day) {
  const end = day + DAY;
  return events
    .filter((e) => eventDayStart(e) < end && Math.max(eventDayEnd(e), eventDayStart(e) + 1) > day)
    .sort((a, b) => b.allDay - a.allDay || a.start - b.start || b.end - a.end);
}
