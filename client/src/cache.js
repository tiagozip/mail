const DB_NAME = "em-mail-cache";
const VERSION = 2;
const MSGS = "messages";
const META = "meta";
const THREADS = "threads";
const SNIPPETS = "snippets";
const CAP = 50000;
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
      if (!d.objectStoreNames.contains(SNIPPETS)) d.createObjectStore(SNIPPETS);
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

let memp = null;

function mem() {
  if (memp) return memp;
  memp = (async () => {
    try {
      const d = await db();
      const rows = (await reqP(d.transaction(MSGS, "readonly").objectStore(MSGS).getAll())) || [];
      return new Map(rows.map((r) => [r.id, r]));
    } catch {
      return new Map();
    }
  })();
  return memp;
}

export async function allMessages() {
  return [...(await mem()).values()];
}

export async function getMeta(key) {
  try {
    const d = await db();
    return await reqP(d.transaction(META, "readonly").objectStore(META).get(key));
  } catch {
    return undefined;
  }
}

export function setMeta(key, value) {
  return writeStore(META, (s) => s.put(value, key));
}

export function putMessages(items) {
  const list = (items || []).filter((it) => it?.id);
  if (!list.length) return Promise.resolve();
  mem().then((m) => {
    for (const it of list) m.set(it.id, it);
  });
  return writeStore(MSGS, (s) => {
    for (const it of list) s.put(it);
  });
}

export function removeMessages(ids) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return Promise.resolve();
  mem().then((m) => {
    for (const id of list) m.delete(id);
  });
  writeStore(SNIPPETS, (s) => {
    for (const id of list) s.delete(id);
  });
  return writeStore(MSGS, (s) => {
    for (const id of list) s.delete(id);
  });
}

export async function getSnippets(ids) {
  const out = {};
  try {
    const d = await db();
    await Promise.all(
      (ids || []).map(
        (id) =>
          new Promise((res) => {
            const r = d.transaction(SNIPPETS, "readonly").objectStore(SNIPPETS).get(id);
            r.onsuccess = () => {
              if (r.result) out[id] = r.result;
              res();
            };
            r.onerror = () => res();
          }),
      ),
    );
  } catch {}
  return out;
}

export function putSnippet(id, blob) {
  if (!id || !blob) return Promise.resolve();
  return writeStore(SNIPPETS, (s) => s.put(blob, id));
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

let skipInboxFolderIds = new Set();
export function setSkipInboxFolders(ids) {
  skipInboxFolderIds = new Set(ids || []);
}

const HIDDEN_IN_FOLDER = ["trash", "spam", "drafts", "screener", "newsletters"];

export function matchView(item, view, nowTs, inboxThreads) {
  const snoozed = item.snoozeUntil && item.snoozeUntil > nowTs;
  if (view.kind === "folder" && view.folder === "snoozed") return !!snoozed;
  if (snoozed) return false;
  if (view.kind === "userfolder")
    return item.folderId === view.folderId && !HIDDEN_IN_FOLDER.includes(item.folder);
  if (view.kind === "folder" && view.folder === "inbox") {
    if (item.folder === "sent") return !!inboxThreads?.has(item.threadId);
    return item.folder === "inbox" && !(item.folderId && skipInboxFolderIds.has(item.folderId));
  }
  if (view.kind === "folder") return item.folder === view.folder;
  if (view.kind === "starred") return item.isStarred && item.folder !== "trash";
  if (view.kind === "label") return (item.labels || []).some((l) => l.id === view.labelId);
  return false;
}

export function inboxThreadsOf(list) {
  const out = new Set();
  for (const m of list) if (m.folder === "inbox" && m.threadId) out.add(m.threadId);
  return out;
}

export async function viewFromCache(view, limit = 50) {
  if (view.kind === "search") return [];
  const all = await allMessages();
  const nowTs = Date.now();
  const threads = view.folder === "inbox" ? inboxThreadsOf(all) : null;
  return all
    .filter((m) => matchView(m, view, nowTs, threads))
    .sort((a, b) => b.date - a.date || (a.id < b.id ? 1 : -1))
    .slice(0, limit);
}

export async function clearAll() {
  memp = null;
  try {
    const d = await db();
    await Promise.all(
      [MSGS, META, THREADS, SNIPPETS].map(
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
