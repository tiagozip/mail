import { Button, DropdownMenu, Tooltip } from "@cloudflare/kumo";
import spamton from "../assets/spamton.webp";
import {
  Archive,
  Check,
  Envelope,
  EnvelopeOpen,
  Folder,
  List,
  MagnifyingGlass,
  NotePencil,
  Paperclip,
  PaperPlaneTilt,
  PencilSimple,
  ShieldWarning,
  Star,
  Tray,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import * as cache from "../cache.js";
import * as pgp from "../pgp.js";
import { SenderAvatar } from "./SenderAvatar.jsx";
import { FOLDER_LABELS, initials, relativeTime, senderLabel } from "../util.js";

function StarToggle({ on, onClick }) {
  return (
    <button
      type="button"
      className={`em-star-btn${on ? " is-on" : ""}`}
      aria-label={on ? "Unstar" : "Star"}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Star size={15} weight={on ? "fill" : "regular"} />
    </button>
  );
}

function Row({
  item,
  active,
  selected,
  selfAddresses,
  decSnippet,
  onOpen,
  onPrefetch,
  onToggleSelect,
  onToggleStar,
  onQuick,
}) {
  const sender = senderLabel(item, selfAddresses);
  const addr = item.from?.address || "";
  const handle = addr.includes("@") ? `@${addr.split("@")[1]}` : addr;
  const snip = item.pgp ? decSnippet || item.snippet : item.snippet;
  const hoverTimer = useRef(null);
  const end = (
    <span className="em-lrow-end">
      {item.hasAttachments && <Paperclip size={15} className="em-lrow-icon" />}
      {item.isStarred && <Star size={15} weight="fill" className="em-lrow-icon em-lrow-star" />}
      <span className="em-lrow-date">{shortDate(item.date)}</span>
    </span>
  );
  return (
    <div
      className={`em-lrow${active ? " is-active" : ""}${selected ? " is-selected" : ""}${item.isRead ? "" : " is-unread"}`}
      onClick={() => onOpen(item)}
      onMouseEnter={() => {
        hoverTimer.current = setTimeout(() => onPrefetch(item.threadId), 200);
      }}
      onMouseLeave={() => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
      }}
      onPointerDown={() => onPrefetch(item.threadId)}
    >
      <span className="em-lrow-lead">
        <SenderAvatar from={{ ...item.from, name: sender, address: addr }} />
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label="Select message"
          className="em-check"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(item.id);
          }}
        >
          <Check size={12} weight="bold" />
        </button>
      </span>
      <span className="em-lrow-from" title={addr}>
        <span className="em-lrow-sender">{sender}</span>
        {item._count > 1 && <span className="em-lrow-count">{item._count}</span>}
      </span>
      <span className="em-lrow-main">
        {item.authStatus === "fail" && (
          <span className="em-spoof-tag">
            <ShieldWarning size={12} weight="fill" /> spoofed
          </span>
        )}
        {item.labels?.map((l) => (
          <span key={l.id} className="em-lrow-label" style={{ "--em-chip-color": l.color }}>
            {l.name}
          </span>
        ))}
        <span className="em-lrow-subject">{item.subject || "(no subject)"}</span>
        {snip && <span className="em-lrow-snippet">{snip}</span>}
      </span>
      {end}
      <span className="em-lrow-quick" onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Archive" title="Archive" onClick={() => onQuick(item, "move", "archive")}>
          <Archive size={16} />
        </button>
        <button type="button" aria-label={item.isRead ? "Mark unread" : "Mark read"} title={item.isRead ? "Mark unread" : "Mark read"} onClick={() => onQuick(item, "read", !item.isRead)}>
          {item.isRead ? <Envelope size={16} /> : <EnvelopeOpen size={16} />}
        </button>
        <button type="button" aria-label={item.isStarred ? "Unstar" : "Star"} title={item.isStarred ? "Unstar" : "Star"} onClick={() => onToggleStar(item)}>
          <Star size={16} weight={item.isStarred ? "fill" : "regular"} />
        </button>
        <button type="button" aria-label="Delete" title="Delete" onClick={() => onQuick(item, "move", "trash")}>
          <Trash size={16} />
        </button>
      </span>
    </div>
  );
}

const DAY = 86400000;

function shortDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

function dateGroup(ts) {
  const d = new Date(ts);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const t = start.getTime();
  if (ts >= t) return "Today";
  if (ts >= t - DAY) return "Yesterday";
  if (ts >= t - 7 * DAY) return "Last 7 days";
  if (d.getMonth() === start.getMonth() && d.getFullYear() === start.getFullYear()) return "Earlier this month";
  return d.toLocaleDateString([], {
    month: "long",
    ...(d.getFullYear() === start.getFullYear() ? {} : { year: "numeric" }),
  });
}

function BulkBar({ store, total }) {
  const { selectedIds, bulkAction, selectAll, userFolders } = store;
  return (
    <div className="em-bulkbar">
      <Tooltip content="Clear selection">
        <Button size="sm" variant="ghost" shape="square" aria-label="Clear selection" icon={X} onClick={() => selectAll(false)} />
      </Tooltip>
      <span className="em-bulkbar-count">{selectedIds.size} selected</span>
      {selectedIds.size < total && (
        <button type="button" className="em-selectall" onClick={() => selectAll(true)}>
          Select all {total}
        </button>
      )}
      <div className="em-bulkbar-spacer" />
      <Tooltip content="Archive">
        <Button size="sm" variant="ghost" shape="square" aria-label="Archive" icon={Archive} onClick={() => bulkAction("move", "archive")} />
      </Tooltip>
      <Tooltip content="Trash">
        <Button size="sm" variant="ghost" shape="square" aria-label="Trash" icon={Trash} onClick={() => bulkAction("move", "trash")} />
      </Tooltip>
      <Tooltip content="Mark read">
        <Button size="sm" variant="ghost" shape="square" aria-label="Mark read" icon={EnvelopeOpen} onClick={() => bulkAction("read", true)} />
      </Tooltip>
      <Tooltip content="Mark unread">
        <Button size="sm" variant="ghost" shape="square" aria-label="Mark unread" icon={Envelope} onClick={() => bulkAction("read", false)} />
      </Tooltip>
      <Tooltip content="Star">
        <Button size="sm" variant="ghost" shape="square" aria-label="Star" icon={Star} onClick={() => bulkAction("star", true)} />
      </Tooltip>
      <Tooltip content="Unstar">
        <Button size="sm" variant="ghost" shape="square" aria-label="Unstar" icon={<Star weight="regular" />} onClick={() => bulkAction("star", false)} />
      </Tooltip>
      {(userFolders || []).length > 0 && (
        <DropdownMenu>
          <DropdownMenu.Trigger
            render={(p) => (
              <Button {...p} size="sm" variant="ghost" shape="square" aria-label="Move to folder" icon={Folder} />
            )}
          />
          <DropdownMenu.Content>
            {userFolders.map((f) => (
              <DropdownMenu.Item key={f.id} onClick={() => bulkAction("movefolder", f.id)}>
                <span className="em-label-dot" style={{ background: f.color }} />
                {f.name}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu>
      )}
    </div>
  );
}

export function MessageList({
  store,
  threads,
  cursor,
  onCursorChange,
  searchRef,
  onMenu,
  onCompose,
  onOpenDraft,
  floatHidden,
}) {
  const {
    view,
    goView,
    labels,
    messages,
    counts,
    listLoading,
    loadingMore,
    loadMore,
    nextCursor,
    selectedIds,
    toggleSelect,
    selectAll,
    openId,
    openMessage,
    prefetchThread,
    toggleStar,
    emptyTrash,
    bulkAction,
  } = store;
  const [query, setQuery] = useState("");
  const [decSnippets, setDecSnippets] = useState({});
  const [emptying, setEmptying] = useState(false);
  const scrollRef = useRef(null);

  const inTrash = view.kind === "folder" && view.folder === "trash";
  const trashTotal = counts?.trash?.total ?? messages.length;

  async function onEmptyTrash() {
    if (emptying) return;
    if (!window.confirm(`Permanently delete all ${trashTotal} messages in Trash? This can't be undone.`))
      return;
    setEmptying(true);
    try {
      await emptyTrash();
    } finally {
      setEmptying(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    let tries = 0;

    async function seedFromCache() {
      const pending = messages.filter((m) => m.pgp && decSnippets[m.id] === undefined);
      if (!pending.length) return;
      const stored = await cache.getSnippets(pending.map((m) => m.id));
      const updates = {};
      for (const id of Object.keys(stored)) {
        try {
          updates[id] = await pgp.localDecrypt(stored[id]);
        } catch {}
      }
      if (!cancelled && Object.keys(updates).length) {
        setDecSnippets((prev) => ({ ...prev, ...updates }));
      }
    }

    async function decryptRest() {
      if (cancelled) return;
      if (!pgp.getUnlocked()) {
        if (tries++ < 8) setTimeout(decryptRest, 600);
        return;
      }
      const candidates = messages.filter((m) => m.pgp && decSnippets[m.id] === undefined);
      if (!candidates.length) return;
      const stored = await cache.getSnippets(candidates.map((m) => m.id));
      const pending = candidates.filter((m) => !stored[m.id]);
      if (!pending.length) return;
      const updates = {};
      const toPersist = [];
      for (const m of pending) {
        if (cancelled) return;
        try {
          let text;
          if (m.snippetEnc) {
            text = await pgp.decryptArmored(m.snippetEnc);
          } else {
            const full = await api.message(m.id);
            text = (await pgp.decryptArmored(full.message?.bodyText || ""))
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 140);
          }
          updates[m.id] = text;
          if (text) toPersist.push([m.id, text]);
        } catch {
          updates[m.id] = null;
        }
      }
      if (!cancelled) setDecSnippets((prev) => ({ ...prev, ...updates }));
      for (const [id, text] of toPersist) {
        try {
          cache.putSnippet(id, await pgp.localEncrypt(text));
        } catch {}
      }
    }

    seedFromCache();
    decryptRest();
    return () => {
      cancelled = true;
    };
  }, [messages]);

  const entries = useMemo(() => {
    const out = [];
    let last = null;
    threads.forEach((item, index) => {
      const g = dateGroup(item.date);
      if (g !== last) {
        out.push({ group: g, first: out.length === 0 });
        last = g;
      }
      out.push({ item, index });
    });
    return out;
  }, [threads]);

  const entryOf = useMemo(() => {
    const m = new Map();
    entries.forEach((e, i) => e.item && m.set(e.index, i));
    return m;
  }, [entries]);

  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (entries[i]?.group ? 54 : 52),
    overscan: 12,
  });

  useEffect(() => {
    if (cursor >= 0 && entryOf.has(cursor))
      rowVirtualizer.scrollToIndex(entryOf.get(cursor), { align: "auto" });
  }, [cursor, entryOf, rowVirtualizer]);

  const listTitle =
    view.kind === "search"
      ? "Search"
      : view.kind === "starred"
        ? "Starred"
        : view.kind === "folder"
          ? FOLDER_LABELS[view.folder]
          : view.name;


  const selfAddresses = useMemo(
    () => (store.user?.addresses?.map((a) => a.address) || [store.user?.address]).filter(Boolean),
    [store.user],
  );

  useEffect(() => {
    if (view.kind !== "search") setQuery("");
  }, [view]);

  function onSearch(e) {
    e.preventDefault();
    const q = query.trim();
    if (q) goView({ kind: "search", q });
    else goView({ kind: "folder", folder: "inbox" });
  }

  function onScroll() {
    const el = scrollRef.current;
    if (!el || !nextCursor || loadingMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) loadMore();
  }

  const selecting = selectedIds.size > 0;
  const [showSkel, setShowSkel] = useState(false);
  useEffect(() => {
    if (!listLoading) return setShowSkel(false);
    const t = setTimeout(() => setShowSkel(true), 300);
    return () => clearTimeout(t);
  }, [listLoading]);

  return (
    <div className={`em-pane em-pane-list${selecting ? " is-selecting" : ""}`}>
      <div className="em-pane-topbar">
        <Button
          className="em-menu-btn"
          size="sm"
          variant="ghost"
          shape="square"
          aria-label="Menu"
          icon={List}
          onClick={onMenu}
        />
        <h1 className="em-list-title">
          {listTitle}
        </h1>
      </div>

      {inTrash && trashTotal > 0 && (
        <div className="em-trash-banner">
          <Trash className="em-trash-banner-icon" size={16} weight="bold" />
          <span className="em-trash-banner-text">
            Messages in Trash are automatically deleted after 30 days.
          </span>
          <Button
            size="sm"
            variant="secondary-destructive"
            loading={emptying}
            onClick={onEmptyTrash}
          >
            Delete all
          </Button>
        </div>
      )}

      <div className="em-list-scroll" ref={scrollRef} onScroll={onScroll}>
        {listLoading ? (
          <div className={`em-skel${showSkel ? "" : " is-waiting"}`}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="em-skel-row">
                <div className="em-skel-avatar" />
                <div className="em-skel-lines">
                  <div className="em-skel-bar" style={{ width: "30%" }} />
                  <div className="em-skel-bar em-skel-bar-lg" style={{ width: "58%" }} />
                  <div className="em-skel-bar" style={{ width: "82%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : threads.length === 0 ? (
          (() => {
            const states = {
              search: [MagnifyingGlass, "No results", "No messages match your search."],
              starred: [Star, "No starred mail", "Star a message and it shows up here."],
              label: [Tray, "No mail with this label", "Messages you label will appear here."],
              inbox: [Tray, "Inbox zero", "Nothing new. Enjoy the quiet."],
              sent: [PaperPlaneTilt, "No sent mail", "Messages you send will appear here."],
              drafts: [NotePencil, "No drafts", "Start a message and your drafts save here."],
              archive: [Archive, "Archive is empty", "Archived messages live here."],
              spam: [spamton, "No spam", "Suspected spam and spoofed mail lands here."],
              trash: [Trash, "Trash is empty", "Deleted messages stay here for 30 days, then vanish."],
            };
            const [Icon, title, sub] = states[view.kind === "folder" ? view.folder : view.kind] || [
              Tray,
              "Nothing here",
              "This folder is empty.",
            ];
            return (
              <div className="em-empty">
                {typeof Icon === "string" ? (
                  <img src={Icon} className="em-empty-icon em-empty-spamton" alt="" />
                ) : (
                  <Icon className="em-empty-icon" size={34} weight="thin" />
                )}
                <div className="em-empty-title">{title}</div>
                <div className="em-empty-sub">{sub}</div>
              </div>
            );
          })()
        ) : (
          <>
            <div
              className="em-vlist"
              style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}
            >
              {rowVirtualizer.getVirtualItems().map((v) => {
                const entry = entries[v.index];
                if (entry.group)
                  return (
                    <div
                      key={`g:${entry.group}`}
                      data-index={v.index}
                      ref={rowVirtualizer.measureElement}
                      className={`em-lgroup${entry.first ? " is-first" : ""}`}
                      style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${v.start}px)` }}
                    >
                      {entry.group}
                    </div>
                  );
                const { item } = entry;
                return (
                  <div
                    key={item.id}
                    data-index={v.index}
                    ref={rowVirtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${v.start}px)`,
                    }}
                  >
                    <Row
                      item={item}
                      active={item._members?.some((m) => m.id === openId)}
                      selected={selectedIds.has(item.id)}
                      selfAddresses={selfAddresses}
                      decSnippet={decSnippets[item.id]}
                      onOpen={(...args) => {
                        onCursorChange?.(entry.index);
                        const target = item.isDraft && onOpenDraft ? onOpenDraft : openMessage;
                        target(...args);
                      }}
                      onPrefetch={prefetchThread}
                      onToggleSelect={toggleSelect}
                      onToggleStar={toggleStar}
                      onQuick={(it, a, v) => bulkAction(a, v, it._members?.length ? it._members.map((m) => m.id) : [it.id])}
                    />
                  </div>
                );
              })}
            </div>
            {nextCursor && (
              <div className="em-loadmore">
                {!loadingMore && <Button variant="ghost" size="sm" onClick={loadMore}>Load more</Button>}
              </div>
            )}
          </>
        )}
      </div>

      <div className={`em-floatbar${floatHidden ? " is-hidden" : ""}`}>
        {selecting ? (
          <BulkBar store={store} total={messages.length} />
        ) : (
        <>
        <form className="em-floatbar-search" onSubmit={onSearch}>
          <MagnifyingGlass className="em-floatbar-icon" size={18} />
          <input
            ref={searchRef}
            className="em-floatbar-input"
            placeholder="Search mail"
            aria-label="Search mail"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>
        <button type="button" className="em-floatbar-compose" onClick={onCompose}>
          <PencilSimple size={16} />
          <span>Write</span>
        </button>
        </>
        )}
      </div>
    </div>
  );
}
