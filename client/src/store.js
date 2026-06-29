import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import * as cache from "./cache.js";
import { notifyError } from "./toast.js";

function runViewTransition(apply) {
  apply();
}

const SYNC_INTERVAL = 25000;

function sortMessages(list) {
  return list.sort((a, b) => b.date - a.date || (a.id < b.id ? 1 : -1));
}

export function useMailStore(initialUser) {
  const [user, setUser] = useState(initialUser);
  const [view, setView] = useState({ kind: "folder", folder: "inbox" });
  const [counts, setCounts] = useState(null);
  const [labels, setLabels] = useState([]);

  const [messages, setMessages] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const [openId, setOpenId] = useState(null);
  const [thread, setThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);

  const reqSeq = useRef(0);
  const threadCache = useRef(new Map());
  const inflight = useRef(new Set());
  const viewRef = useRef(view);
  const syncing = useRef(false);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const prefetchThread = useCallback((threadId) => {
    if (!threadId) return;
    if (threadCache.current.has(threadId) || inflight.current.has(threadId)) return;
    inflight.current.add(threadId);
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
    api
      .folders()
      .then((d) => setCounts(d.counts))
      .catch(() => {});
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
    else p.folder = v.folder;
    return p;
  }, []);

  const loadList = useCallback(
    (v) => {
      const seq = ++reqSeq.current;
      setListLoading(true);
      setMessages([]);
      setNextCursor(null);
      setSelectedIds(new Set());
      cache.viewFromCache(v).then((cached) => {
        if (seq !== reqSeq.current || !cached.length) return;
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
          cache.putMessages(list).then(() => cache.pruneToCap());
          const ids = [
            ...new Set(list.slice(0, 3).map((mm) => mm.threadId).filter(Boolean)),
          ].filter((id) => !threadCache.current.has(id) && !inflight.current.has(id));
          if (ids.length) {
            for (const id of ids) inflight.current.add(id);
            api
              .threadsBulk(ids)
              .then((r) => {
                for (const id of ids) {
                  const msgs = r.threads?.[id];
                  if (msgs) threadCache.current.set(id, msgs);
                }
              })
              .catch(() => {})
              .finally(() => {
                for (const id of ids) inflight.current.delete(id);
              });
          }
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
    setLoadingMore(true);
    const seq = reqSeq.current;
    api
      .messages(queryFor(view, nextCursor))
      .then((d) => {
        if (seq !== reqSeq.current) return;
        setMessages((prev) => [...prev, ...(d.messages || [])]);
        setNextCursor(d.nextCursor || null);
      })
      .catch(notifyError)
      .finally(() => setLoadingMore(false));
  }, [nextCursor, loadingMore, queryFor, view]);

  const applyDelta = useCallback((upserts, deletes) => {
    if (!upserts.length && !deletes.length) return;
    cache.putMessages(upserts);
    cache.removeMessages(deletes);
    cache.pruneToCap();
    for (const id of deletes) {
      for (const [tid, msgs] of threadCache.current) {
        if (msgs.some((mm) => mm.id === id)) {
          threadCache.current.delete(tid);
          cache.deleteThread(tid);
        }
      }
    }
    const delSet = new Set(deletes);
    const nowTs = Date.now();
    setMessages((prev) => {
      const byId = new Map(prev.filter((m) => !delSet.has(m.id)).map((m) => [m.id, m]));
      for (const it of upserts) {
        if (cache.matchView(it, viewRef.current, nowTs)) byId.set(it.id, it);
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
    refreshCounts();
    refreshLabels();
    syncNow();
    const timer = setInterval(syncNow, SYNC_INTERVAL);
    const onVisible = () => {
      if (document.visibilityState === "visible") syncNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", syncNow);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", syncNow);
    };
  }, [refreshCounts, refreshLabels, syncNow]);

  const goView = useCallback((v) => {
    threadCache.current.clear();
    inflight.current.clear();
    setOpenId(null);
    setThread(null);
    setView(v);
  }, []);

  const openMessage = useCallback(
    (item) => {
      const cached = threadCache.current.get(item.threadId);
      runViewTransition(() => {
        setOpenId(item.id);
        if (cached) {
          setThreadLoading(false);
          setThread({ threadId: item.threadId, messages: cached });
        } else {
          setThreadLoading(true);
          setThread(null);
          cache.getThread(item.threadId).then((persisted) => {
            if (!persisted || threadCache.current.has(item.threadId)) return;
            setThread((cur) => (cur ? cur : { threadId: item.threadId, messages: persisted }));
            setThreadLoading(false);
          });
        }
        if (!item.isRead) {
          setMessages((prev) => prev.map((m) => (m.id === item.id ? { ...m, isRead: true } : m)));
          setCounts((c) => {
            if (!c) return c;
            const folder = item.folder;
            if (!c[folder]) return c;
            return {
              ...c,
              [folder]: { ...c[folder], unread: Math.max(0, (c[folder].unread || 0) - 1) },
            };
          });
        }
      });
      api
        .thread(item.threadId)
        .then((d) => {
          const msgs = d.messages || [];
          threadCache.current.set(item.threadId, msgs);
          cache.putThread(item.threadId, msgs);
          setThread({ threadId: item.threadId, messages: msgs });
          setMessages((prev) =>
            prev.map((m) =>
              m.threadId === item.threadId && m.folder !== "sent" ? { ...m, isRead: true } : m,
            ),
          );
          refreshCounts();
        })
        .catch((e) => {
          if (!cached) notifyError(e);
        })
        .finally(() => setThreadLoading(false));
    },
    [refreshCounts],
  );

  const closeMessage = useCallback(() => {
    runViewTransition(() => {
      setOpenId(null);
      setThread(null);
    });
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

  const removeFromList = useCallback((ids) => {
    const set = new Set(ids);
    setMessages((prev) => prev.filter((m) => !set.has(m.id)));
  }, []);

  const toggleStar = useCallback(
    (item) => {
      const next = !item.isStarred;
      patchMessage(item.id, { isStarred: next });
      api
        .setStar(item.id, next)
        .then(() => refreshCounts())
        .catch((e) => {
          patchMessage(item.id, { isStarred: item.isStarred });
          notifyError(e);
        });
    },
    [patchMessage, refreshCounts],
  );

  const setReadState = useCallback(
    (item, read) => {
      patchMessage(item.id, { isRead: read });
      api
        .setRead(item.id, read)
        .then(() => refreshCounts())
        .catch((e) => {
          patchMessage(item.id, { isRead: item.isRead });
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

  const bulkAction = useCallback(
    (action, value) => {
      const ids = [...selectedIds];
      if (!ids.length) return;
      const idSet = new Set(ids);
      if (action === "read" || action === "star") {
        const field = action === "read" ? "isRead" : "isStarred";
        setMessages((prev) => {
          const next = prev.map((m) => (idSet.has(m.id) ? { ...m, [field]: value } : m));
          cache.putMessages(next.filter((m) => idSet.has(m.id)));
          return next;
        });
      } else if (action === "move") {
        setMessages((prev) => {
          cache.putMessages(prev.filter((m) => idSet.has(m.id)).map((m) => ({ ...m, folder: value })));
          return prev;
        });
        for (const id of ids) threadCache.current.delete(messages.find((m) => m.id === id)?.threadId);
        removeFromList(ids);
      } else {
        cache.removeMessages(ids);
        removeFromList(ids);
      }
      setSelectedIds(new Set());
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
    snooze,
    deleteForever,
    bulkAction,
    patchMessage,
  };
}
