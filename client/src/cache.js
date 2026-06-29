const DB_NAME = "em-mail-cache";
const VERSION = 1;
const MSGS = "messages";
const META = "meta";
const THREADS = "threads";
const CAP = 500;
const CURSOR_KEY = "syncCursor";

let dbp = null;

function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(MSGS)) d.createObjectStore(MSGS, { keyPath: "id" });
      if (!d.objectStoreNames.contains(META)) d.createObjectStore(META);
      if (!d.objectStoreNames.contains(THREADS)) d.createObjectStore(THREADS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function reqP(r) {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function writeStore(store, fn) {
  try {
    const d = await db();
    await new Promise((res, rej) => {
      const t = d.transaction(store, "readwrite");
      fn(t.objectStore(store));
      t.oncomplete = res;
      t.onerror = () => rej(t.error);
    });
  } catch {}
}

export async function allMessages() {
  try {
    const d = await db();
    return (await reqP(d.transaction(MSGS, "readonly").objectStore(MSGS).getAll())) || [];
  } catch {
    return [];
  }
}

export function putMessages(items) {
  const list = (items || []).filter((it) => it?.id);
  if (!list.length) return Promise.resolve();
  return writeStore(MSGS, (s) => {
    for (const it of list) s.put(it);
  });
}

export function removeMessages(ids) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return Promise.resolve();
  return writeStore(MSGS, (s) => {
    for (const id of list) s.delete(id);
  });
}

export async function getCursor() {
  try {
    const d = await db();
    return (await reqP(d.transaction(META, "readonly").objectStore(META).get(CURSOR_KEY))) || 0;
  } catch {
    return 0;
  }
}

export function setCursor(value) {
  return writeStore(META, (s) => s.put(value, CURSOR_KEY));
}

export async function initCursor(value) {
  const existing = await getCursor();
  if (!existing && value != null) await setCursor(value);
}

export async function getThread(threadId) {
  try {
    const d = await db();
    return await reqP(d.transaction(THREADS, "readonly").objectStore(THREADS).get(threadId));
  } catch {
    return undefined;
  }
}

export function putThread(threadId, msgs) {
  if (!threadId || !msgs) return Promise.resolve();
  return writeStore(THREADS, (s) => s.put(msgs, threadId));
}

export function deleteThread(threadId) {
  if (!threadId) return Promise.resolve();
  return writeStore(THREADS, (s) => s.delete(threadId));
}

export async function pruneToCap(cap = CAP) {
  try {
    const all = await allMessages();
    if (all.length <= cap) return;
    all.sort((a, b) => (b.date || 0) - (a.date || 0));
    await removeMessages(all.slice(cap).map((m) => m.id));
  } catch {}
}

export function matchView(item, view, nowTs) {
  const snoozed = item.snoozeUntil && item.snoozeUntil > nowTs;
  if (view.kind === "folder" && view.folder === "snoozed") return !!snoozed;
  if (snoozed) return false;
  if (view.kind === "folder") return item.folder === view.folder;
  if (view.kind === "starred") return item.isStarred && item.folder !== "trash";
  if (view.kind === "label") return (item.labels || []).some((l) => l.id === view.labelId);
  return false;
}

export async function viewFromCache(view, limit = 50) {
  if (view.kind === "search") return [];
  const all = await allMessages();
  const nowTs = Date.now();
  return all
    .filter((m) => matchView(m, view, nowTs))
    .sort((a, b) => b.date - a.date || (a.id < b.id ? 1 : -1))
    .slice(0, limit);
}

export async function clearAll() {
  try {
    const d = await db();
    await Promise.all(
      [MSGS, META, THREADS].map(
        (store) =>
          new Promise((res, rej) => {
            const t = d.transaction(store, "readwrite");
            t.objectStore(store).clear();
            t.oncomplete = res;
            t.onerror = () => rej(t.error);
          }),
      ),
    );
  } catch {}
}
