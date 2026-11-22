import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import * as cache from "./cache.js";
import { notifyError } from "./toast.js";

const POLL_ACTIVE_MIN = 5000;
const POLL_ACTIVE_MAX = 30000;
const POLL_HIDDEN = 60000;
const POLL_DECAY = 1.6;
const ACTIVITY_THROTTLE = 5000;
const LOCAL = "local";
const LOCAL_PAGE = 100;
const BODY_PREFETCH = 100;

function sortMessages(list) {
  return list.sort((a, b) => b.date - a.date || (a.id < b.id ? 1 : -1));
}

export function useMailStore(initialUser) {
  const [user, setUser] = useState(initialUser);
  const [view, setView] = useState({ kind: "folder", folder: "inbox" });
  const [counts, setCounts] = useState(null);
  const [labels, setLabels] = useState([]);
  const [userFolders, setUserFolders] = useState([]);

  const [messages, setMessages] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const [openId, setOpenId] = useState(null);
  const [thread, setThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);

  const reqSeq = useRef(0);
  const threadSeq = useRef(0);
  const threadCache = useRef(new Map());
  const listCache = useRef(new Map());
  const inflight = useRef(new Set());
  const viewRef = useRef(view);
  const syncing = useRef(false);
  const countsTimer = useRef(null);
  const localReady = useRef(false);
  const threadSeqOpen = useRef(null);
  const refetchOpen = useRef(null);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const prefetchThread = useCallback((threadId) => {
    if (!threadId) return;
    if (threadCache.current.has(threadId) || inflight.current.has(threadId)) return;
    inflight.current.add(threadId);
    cache.getThread(threadId).then((persisted) => {
      if (persisted && !threadCache.current.has(threadId)) threadCache.current.set(threadId, persisted);
    });
    api
      .threadsBulk([threadId])
      .then((d) => {
        const msgs = d.threads?.[threadId];
        if (msgs) {
          threadCache.current.set(threadId, msgs);
          cache.putThread(threadId, msgs);
        }
      })
      .catch(() => {})
      .finally(() => inflight.current.delete(threadId));
  }, []);

  const refreshCounts = useCallback(() => {
    clearTimeout(countsTimer.current);
    countsTimer.current = setTimeout(() => {
      api
        .folders()
        .then((d) => {
          setCounts(d.counts);
          setUserFolders(d.folders || []);
          cache.setSkipInboxFolders((d.folders || []).filter((f) => f.skipInbox).map((f) => f.id));
        })
        .catch(() => {});
    }, 500);
  }, []);

  const refreshLabels = useCallback(() => {
    api
      .labels()
      .then((d) => setLabels(d.labels || []))
      .catch(() => {});
  }, []);

  const queryFor = useCallback((v, cursor) => {
    const p = { limit: 50 };
    if (cursor) p.cursor = cursor;
    if (v.kind === "search") p.q = v.q;
    else if (v.kind === "starred") p.starred = 1;
    else if (v.kind === "label") p.label = v.labelId;
    else if (v.kind === "userfolder") p.folderId = v.folderId;
    else p.folder = v.folder;
    return p;
  }, []);

  const loadList = useCallback(
    (v) => {
      const seq = ++reqSeq.current;
      const key = JSON.stringify(v);
      const mem = listCache.current.get(key);
      setSelectedIds(new Set());
      if (localReady.current && v.kind !== "search") {
        cache.viewFromCache(v, LOCAL_PAGE + 1).then((list) => {
          if (seq !== reqSeq.current) return;
          setMessages(list.slice(0, LOCAL_PAGE));
          setNextCursor(list.length > LOCAL_PAGE ? LOCAL : null);
          setListLoading(false);
        });
        return;
      }
      setListLoading(!mem);
      setMessages(mem?.messages || []);
      setNextCursor(mem?.nextCursor || null);
      cache.viewFromCache(v).then((cached) => {
        if (seq !== reqSeq.current || !cached.length || listCache.current.has(key)) return;
        setMessages(cached);
        setListLoading(false);
      });
      api
        .messages(queryFor(v))
        .then((d) => {
          if (seq !== reqSeq.current) return;
          const list = d.messages || [];
          setMessages(list);
          setNextCursor(d.nextCursor || null);
          listCache.current.set(key, { messages: list, nextCursor: d.nextCursor || null });
          cache.putMessages(list);
        })
        .catch((e) => {
          if (seq === reqSeq.current) notifyError(e);
        })
        .finally(() => {
          if (seq === reqSeq.current) setListLoading(false);
        });
    },
    [queryFor],
  );

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    const seq = reqSeq.current;
    if (nextCursor === LOCAL) {
      const want = messages.length + LOCAL_PAGE;
      cache.viewFromCache(view, want + 1).then((list) => {
        if (seq !== reqSeq.current) return;
        setMessages(list.slice(0, want));
        setNextCursor(list.length > want ? LOCAL : null);
      });
      return;
    }
    setLoadingMore(true);
    api
      .messages(queryFor(view, nextCursor))
      .then((d) => {
        if (seq !== reqSeq.current) return;
        setMessages((prev) => [...prev, ...(d.messages || [])]);
        setNextCursor(d.nextCursor || null);
      })
      .catch(notifyError)
      .finally(() => setLoadingMore(false));
  }, [nextCursor, loadingMore, queryFor, view, messages.length]);

  const applyDelta = useCallback((upserts, deletes) => {
    if (!upserts.length && !deletes.length) return;
    cache.putMessages(upserts);
    cache.removeMessages(deletes);
    for (const id of deletes) {
      for (const [tid, msgs] of threadCache.current) {
        if (msgs.some((mm) => mm.id === id)) {
          threadCache.current.delete(tid);
          cache.deleteThread(tid);
        }
      }
    }
    const FLAGS = ["isRead", "isStarred", "labels", "folder", "folderId", "snoozeUntil"];
    for (const it of upserts) {
      const tid = it.threadId;
      const msgs = threadCache.current.get(tid);
      if (!msgs) {
        cache.getThread(tid).then((p) => {
          if (p && !p.some((x) => x.id === it.id)) cache.deleteThread(tid);
        });
        continue;
      }
      const idx = msgs.findIndex((x) => x.id === it.id);
      if (idx === -1) {
        threadCache.current.delete(tid);
        cache.deleteThread(tid);
        if (threadSeqOpen.current === tid) refetchOpen.current?.(tid);
        continue;
      }
      const patch = Object.fromEntries(FLAGS.filter((k) => k in it).map((k) => [k, it[k]]));
      const next = msgs.map((x, i) => (i === idx ? { ...x, ...patch } : x));
      threadCache.current.set(tid, next);
      cache.putThread(tid, next);
    }
    const delSet = new Set(deletes);
    const nowTs = Date.now();
    setMessages((prev) => {
      const byId = new Map(prev.filter((m) => !delSet.has(m.id)).map((m) => [m.id, m]));
      const threads = cache.inboxThreadsOf([...byId.values(), ...upserts]);
      for (const it of upserts) {
        if (cache.matchView(it, viewRef.current, nowTs, threads)) byId.set(it.id, it);
        else byId.delete(it.id);
      }
      return sortMessages([...byId.values()]);
    });
  }, []);

  const syncNow = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      let cursor = await cache.getCursor();
      let changed = false;
      for (let guard = 0; guard < 20; guard++) {
        const d = await api.sync(cursor);
        if (d.upserts?.length || d.deletes?.length) {
          applyDelta(d.upserts || [], d.deletes || []);
          changed = true;
        }
        if (d.cursor > cursor) {
          cursor = d.cursor;
          await cache.setCursor(cursor);
        }
        if (!d.more) break;
      }
      if (changed) refreshCounts();
    } catch {
    } finally {
      syncing.current = false;
    }
  }, [applyDelta, refreshCounts]);

  useEffect(() => {
    loadList(view);
  }, [view, loadList]);

  useEffect(() => {
    let stopped = false;
    const idle = () =>
      new Promise((res) =>
        window.requestIdleCallback ? requestIdleCallback(res, { timeout: 2000 }) : setTimeout(res, 200),
      );
    (async () => {
      if (!user?.id) return;
      if ((await cache.getMeta("userId")) !== user.id) {
        await cache.clearAll();
        await cache.setMeta("userId", user.id);
      }
      if (await cache.getMeta("backfillDone")) {
        localReady.current = true;
        loadList(viewRef.current);
      } else {
        let before = (await cache.getMeta("backfillBefore")) || 0;
        while (!stopped) {
          const d = await api.backfill(before).catch(() => null);
          if (!d) return;
          if (d.seq != null && !(await cache.getCursor())) await cache.setCursor(d.seq);
          await cache.putMessages(d.messages || []);
          if (!d.before) break;
          before = d.before;
          await cache.setMeta("backfillBefore", before);
        }
        if (stopped) return;
        await cache.setMeta("backfillDone", true);
        localReady.current = true;
        await syncNow();
        loadList(viewRef.current);
      }
      const all = await cache.allMessages();
      const inbox = await cache.viewFromCache({ kind: "folder", folder: "inbox" }, BODY_PREFETCH);
      const want = [
        ...new Set([
          ...all.filter((m) => !m.isRead && m.folder !== "trash" && m.folder !== "spam").map((m) => m.threadId),
          ...inbox.map((m) => m.threadId),
        ]),
      ].filter(Boolean);
      const gaps = [];
      for (const id of want) if (!threadCache.current.has(id) && !(await cache.getThread(id))) gaps.push(id);
      for (let i = 0; i < gaps.length && !stopped; i += 10) {
        await idle();
        const batch = gaps.slice(i, i + 10).filter((id) => !threadCache.current.has(id));
        if (!batch.length) continue;
        const r = await api.threadsBulk(batch).catch(() => null);
        if (!r) break;
        for (const id of batch) {
          const msgs = r.threads?.[id];
          if (!msgs) continue;
          threadCache.current.set(id, msgs);
          cache.putThread(id, msgs);
        }
      }
    })();
    return () => {
      stopped = true;
    };
  }, [user?.id, loadList, syncNow]);

  useEffect(() => {
    refreshCounts();
    refreshLabels();
    syncNow();

    let delay = POLL_ACTIVE_MIN;
    let timer;
    let lastActivity = 0;
    const active = () => document.visibilityState === "visible";
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(tick, active() ? delay : POLL_HIDDEN);
    };
    async function tick() {
      await syncNow();
      if (active()) delay = Math.min(POLL_ACTIVE_MAX, Math.round(delay * POLL_DECAY));
      schedule();
    }
    const reactivate = () => {
      delay = POLL_ACTIVE_MIN;
      if (active()) syncNow();
      schedule();
    };
    const onActivity = () => {
      const t = Date.now();
      if (t - lastActivity < ACTIVITY_THROTTLE) return;
      lastActivity = t;
      delay = POLL_ACTIVE_MIN;
      schedule();
    };

    schedule();
    document.addEventListener("visibilitychange", reactivate);
    window.addEventListener("focus", reactivate);
    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", reactivate);
      window.removeEventListener("focus", reactivate);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, [refreshCounts, refreshLabels, syncNow]);

  const goView = useCallback((v) => {
    threadSeq.current++;
    if (threadCache.current.size > 1000) threadCache.current.clear();
    setOpenId(null);
    setThread(null);
    setView(v);
  }, []);

  const openMessage = useCallback(
    (item) => {
      const seq = ++threadSeq.current;
      const cached = threadCache.current.get(item.threadId);
      setOpenId(item.id);
      if (cached) {
        setThreadLoading(false);
        setThread({ threadId: item.threadId, messages: cached });
      } else {
        setThreadLoading(true);
        setThread(null);
        cache.getThread(item.threadId).then((persisted) => {
          if (seq !== threadSeq.current || !persisted) return;
          threadCache.current.set(item.threadId, persisted);
          setThread((cur) => (cur ? cur : { threadId: item.threadId, messages: persisted }));
          setThreadLoading(false);
        });
      }
      const unread = (item._members || [item]).filter((m) => !m.isRead && m.folder !== "sent");
      if (unread.length) {
        const ids = new Set(unread.map((m) => m.id));
        setMessages((prev) => prev.map((m) => (ids.has(m.id) ? { ...m, isRead: true } : m)));
        setCounts((c) => {
          if (!c) return c;
          const next = { ...c };
          for (const m of unread) {
            if (next[m.folder]) next[m.folder] = { ...next[m.folder], unread: Math.max(0, (next[m.folder].unread || 0) - 1) };
          }
          return next;
        });
      }
      if (unread.length) {
        const ids = unread.map((m) => m.id);
        cache.putMessages(unread.map((m) => ({ ...m, isRead: true, _members: undefined })));
        (ids.length > 1 ? api.bulk(ids, "read", true) : api.setRead(ids[0], true))
          .then(() => refreshCounts())
          .catch(() => refreshCounts());
      }
      if (cached) return;
      (async () => {
        const persisted = await cache.getThread(item.threadId);
        if (persisted) return;
        try {
          const d = await api.thread(item.threadId);
          const msgs = d.messages || [];
          threadCache.current.set(item.threadId, msgs);
          cache.putThread(item.threadId, msgs);
          if (seq === threadSeq.current) setThread({ threadId: item.threadId, messages: msgs });
        } catch (e) {
          if (seq === threadSeq.current) notifyError(e);
        } finally {
          if (seq === threadSeq.current) setThreadLoading(false);
        }
      })();
    },
    [refreshCounts],
  );

  useEffect(() => {
    threadSeqOpen.current = thread?.threadId || null;
  }, [thread?.threadId]);

  refetchOpen.current = (tid) => {
    api
      .thread(tid)
      .then((d) => {
        const msgs = d.messages || [];
        threadCache.current.set(tid, msgs);
        cache.putThread(tid, msgs);
        setThread((cur) => (cur?.threadId === tid ? { threadId: tid, messages: msgs } : cur));
      })
      .catch(() => {});
  };

  const closeMessage = useCallback(() => {
    threadSeq.current++;
    setOpenId(null);
    setThread(null);
  }, []);

  const reloadThread = useCallback((threadId, images) => {
    api
      .thread(threadId)
      .then((d) => setThread({ threadId, messages: d.messages || [] }))
      .catch(notifyError);
  }, []);

  const patchMessage = useCallback((id, patch) => {
    setMessages((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, ...patch } : m));
      const updated = next.find((m) => m.id === id);
      if (updated) cache.putMessages([updated]);
      return next;
    });
  }, []);

  const addOptimistic = useCallback((msg) => {
    setThread((cur) =>
      cur && cur.threadId === msg.threadId
        ? { ...cur, messages: [...cur.messages.filter((m) => m.id !== msg.id), msg] }
        : cur,
    );
    const cached = threadCache.current.get(msg.threadId);
    if (cached) threadCache.current.set(msg.threadId, [...cached.filter((m) => m.id !== msg.id), msg]);
    setMessages((prev) =>
      cache.matchView(msg, viewRef.current, Date.now(), cache.inboxThreadsOf(prev))
        ? sortMessages([msg, ...prev.filter((m) => m.id !== msg.id)])
        : prev,
    );
  }, []);

  const removeOptimistic = useCallback((id, threadId) => {
    setThread((cur) =>
      cur && cur.threadId === threadId
        ? { ...cur, messages: cur.messages.filter((m) => m.id !== id) }
        : cur,
    );
    const cached = threadCache.current.get(threadId);
    if (cached) threadCache.current.set(threadId, cached.filter((m) => m.id !== id));
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const swapOptimistic = useCallback((tempId, threadId, realId) => {
    const swap = (m) => (m.id === tempId ? { ...m, id: realId, optimistic: false } : m);
    setThread((cur) =>
      cur && cur.threadId === threadId ? { ...cur, messages: cur.messages.map(swap) } : cur,
    );
    const cached = threadCache.current.get(threadId);
    if (cached) threadCache.current.set(threadId, cached.map(swap));
    setMessages((prev) => prev.map(swap));
  }, []);

  const removeFromList = useCallback((ids) => {
    const set = new Set(ids);
    setMessages((prev) => prev.filter((m) => !set.has(m.id)));
  }, []);

  const toggleStar = useCallback(
    (item) => {
      const next = !item.isStarred;
      const ids = item._members?.length ? item._members.map((m) => m.id) : [item.id];
      for (const id of ids) patchMessage(id, { isStarred: next });
      const req = ids.length > 1 ? api.bulk(ids, "star", next) : api.setStar(ids[0], next);
      req
        .then(() => refreshCounts())
        .catch((e) => {
          for (const id of ids) patchMessage(id, { isStarred: item.isStarred });
          notifyError(e);
        });
    },
    [patchMessage, refreshCounts],
  );

  const setReadState = useCallback(
    (item, read) => {
      const members = (item._members || [item]).filter((m) => m.isRead !== read && m.folder !== "sent");
      if (!members.length) return;
      const ids = members.map((m) => m.id);
      for (const id of ids) patchMessage(id, { isRead: read });
      setCounts((c) => {
        if (!c) return c;
        const next = { ...c };
        for (const m of members) {
          if (next[m.folder]) next[m.folder] = { ...next[m.folder], unread: Math.max(0, (next[m.folder].unread || 0) + (read ? -1 : 1)) };
        }
        return next;
      });
      const req = ids.length > 1 ? api.bulk(ids, "read", read) : api.setRead(ids[0], read);
      req
        .then(() => refreshCounts())
        .catch((e) => {
          for (const m of members) patchMessage(m.id, { isRead: m.isRead });
          refreshCounts();
          notifyError(e);
        });
    },
    [patchMessage, refreshCounts],
  );

  const moveMessage = useCallback(
    (item, folder) => {
      threadCache.current.delete(item.threadId);
      cache.putMessages([{ ...item, folder }]);
      removeFromList([item.id]);
      if (openId === item.id) {
        setOpenId(null);
        setThread(null);
      }
      api
        .moveMessage(item.id, folder)
        .then(() => refreshCounts())
        .catch((e) => {
          notifyError(e);
          loadList(view);
        });
    },
    [removeFromList, openId, refreshCounts, loadList, view],
  );

  const moveToFolder = useCallback(
    (item, folderId) => {
      threadCache.current.delete(item.threadId);
      cache.putMessages([{ ...item, folder: "inbox", folderId }]);
      removeFromList([item.id]);
      if (openId === item.id) {
        setOpenId(null);
        setThread(null);
      }
      api
        .moveToFolder(item.id, folderId)
        .then(() => refreshCounts())
        .catch((e) => {
          notifyError(e);
          loadList(view);
        });
    },
    [removeFromList, openId, refreshCounts, loadList, view],
  );

  const snooze = useCallback(
    (item, until) => {
      threadCache.current.delete(item.threadId);
      cache.putMessages([{ ...item, snoozeUntil: until }]);
      removeFromList([item.id]);
      if (openId === item.id) {
        setOpenId(null);
        setThread(null);
      }
      api
        .snoozeMessage(item.id, until)
        .then(() => refreshCounts())
        .catch((e) => {
          notifyError(e);
          loadList(view);
        });
    },
    [removeFromList, openId, refreshCounts, loadList, view],
  );

  const deleteForever = useCallback(
    (item) => {
      threadCache.current.delete(item.threadId);
      cache.removeMessages([item.id]);
      cache.deleteThread(item.threadId);
      removeFromList([item.id]);
      if (openId === item.id) {
        setOpenId(null);
        setThread(null);
      }
      api
        .deleteMessage(item.id)
        .then(() => refreshCounts())
        .catch((e) => {
          notifyError(e);
          loadList(view);
        });
    },
    [removeFromList, openId, refreshCounts, loadList, view],
  );

  const emptyTrash = useCallback(() => {
    const ids = messages.map((m) => m.id);
    cache.removeMessages(ids);
    setMessages([]);
    setSelectedIds(new Set());
    setOpenId(null);
    setThread(null);
    threadCache.current.clear();
    return api
      .emptyTrash()
      .then(() => refreshCounts())
      .catch((e) => {
        notifyError(e);
        loadList(view);
      });
  }, [messages, refreshCounts, loadList, view]);

  const bulkAction = useCallback(
    (action, value, only) => {
      const sentIds =
        viewRef.current.folder === "inbox"
          ? new Set(messages.filter((m) => m.folder === "sent").map((m) => m.id))
          : null;
      const ids = (only ?? [...selectedIds]).filter((id) => !sentIds?.has(id));
      if (!ids.length) return;
      const idSet = new Set(ids);
      if (action === "read" || action === "star") {
        const field = action === "read" ? "isRead" : "isStarred";
        setMessages((prev) => {
          const next = prev.map((m) => (idSet.has(m.id) ? { ...m, [field]: value } : m));
          cache.putMessages(next.filter((m) => idSet.has(m.id)));
          return next;
        });
      } else if (action === "move" || action === "movefolder") {
        const patch =
          action === "movefolder" ? { folder: "inbox", folderId: value } : { folder: value };
        setMessages((prev) => {
          cache.putMessages(prev.filter((m) => idSet.has(m.id)).map((m) => ({ ...m, ...patch })));
          return prev;
        });
        for (const id of ids) threadCache.current.delete(messages.find((m) => m.id === id)?.threadId);
        removeFromList(ids);
      } else {
        cache.removeMessages(ids);
        removeFromList(ids);
      }
      if (!only) setSelectedIds(new Set());
      api
        .bulk(ids, action, value)
        .then(() => refreshCounts())
        .catch((e) => {
          notifyError(e);
          loadList(view);
        });
    },
    [selectedIds, removeFromList, refreshCounts, loadList, view, messages],
  );

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(
    (on) => {
      setSelectedIds(on ? new Set(messages.map((m) => m.id)) : new Set());
    },
    [messages],
  );

  return {
    user,
    setUser,
    view,
    goView,
    counts,
    refreshCounts,
    labels,
    refreshLabels,
    userFolders,
    messages,
    nextCursor,
    listLoading,
    loadingMore,
    loadMore,
    reload: () => {
      threadCache.current.clear();
      inflight.current.clear();
      loadList(view);
    },
    syncNow,
    prefetchThread,
    selectedIds,
    toggleSelect,
    selectAll,
    openId,
    thread,
    threadLoading,
    openMessage,
    closeMessage,
    reloadThread,
    setThread,
    toggleStar,
    setReadState,
    moveMessage,
    moveToFolder,
    snooze,
    deleteForever,
    emptyTrash,
    bulkAction,
    patchMessage,
    addOptimistic,
    removeOptimistic,
    swapOptimistic,
  };
}
