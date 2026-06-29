import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { notifyError } from "./toast.js";

function runViewTransition(apply) {
  apply();
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

  const prefetchThread = useCallback((threadId) => {
    if (!threadId) return;
    if (threadCache.current.has(threadId) || inflight.current.has(threadId)) return;
    inflight.current.add(threadId);
    api
      .threadsBulk([threadId])
      .then((d) => {
        const msgs = d.threads?.[threadId];
        if (msgs) threadCache.current.set(threadId, msgs);
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
      api
        .messages(queryFor(v))
        .then((d) => {
          if (seq !== reqSeq.current) return;
          const list = d.messages || [];
          setMessages(list);
          setNextCursor(d.nextCursor || null);
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

  useEffect(() => {
    loadList(view);
  }, [view, loadList]);

  useEffect(() => {
    refreshCounts();
    refreshLabels();
  }, [refreshCounts, refreshLabels]);

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
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
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
      if (action === "read") {
        setMessages((prev) =>
          prev.map((m) => (selectedIds.has(m.id) ? { ...m, isRead: value } : m)),
        );
      } else if (action === "star") {
        setMessages((prev) =>
          prev.map((m) => (selectedIds.has(m.id) ? { ...m, isStarred: value } : m)),
        );
      } else {
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
    [selectedIds, removeFromList, refreshCounts, loadList, view],
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
