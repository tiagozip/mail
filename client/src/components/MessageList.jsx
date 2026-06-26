import { Button, Checkbox, InputGroup, Loader, SkeletonLine, Tooltip } from "@cloudflare/kumo";
import {
  Archive,
  Envelope,
  EnvelopeOpen,
  List,
  MagnifyingGlass,
  Paperclip,
  Star,
  Tray,
  Trash,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FOLDER_LABELS, groupThreads, relativeTime, senderLabel } from "../util.js";

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

function Row({ item, active, selected, selfAddresses, onOpen, onToggleSelect, onToggleStar }) {
  const sender = senderLabel(item, selfAddresses);
  return (
    <div
      className={`em-row${active ? " is-active" : ""}${selected ? " is-selected" : ""}${item.isRead ? "" : " is-unread"}`}
      onClick={() => onOpen(item)}
    >
      <div className="em-row-lead">
        <span className={`em-unread-dot${item.isRead ? " is-placeholder" : ""}`} />
        <div className="em-row-check" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect(item.id)}
            aria-label="Select message"
          />
        </div>
      </div>
      <div className="em-row-body">
        <div className="em-row-line">
          <span className="em-row-sender">{sender}</span>
          {item._count > 1 && <span className="em-row-count">{item._count}</span>}
          <span className="em-row-meta">
            {item.hasAttachments && <Paperclip size={13} weight="bold" />}
          </span>
          <span className="em-row-date">{relativeTime(item.date)}</span>
        </div>
        <div className="em-row-line">
          <span className="em-row-subject">{item.subject || "(no subject)"}</span>
          {item.snippet && <span className="em-row-snippet">{item.snippet}</span>}
          <StarToggle on={item.isStarred} onClick={() => onToggleStar(item)} />
        </div>
        {item.labels?.length > 0 && (
          <div className="em-row-labels">
            {item.labels.map((l) => (
              <span key={l.id} className="em-chip" style={{ "--em-chip-color": l.color }}>
                <span className="em-chip-dot" />
                {l.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BulkBar({ store }) {
  const { selectedIds, bulkAction, selectAll } = store;
  return (
    <div className="em-bulkbar">
      <Checkbox checked onCheckedChange={() => selectAll(false)} aria-label="Clear selection" />
      <span className="em-bulkbar-count">{selectedIds.size} selected</span>
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
    </div>
  );
}

function listTitle(view, labels) {
  if (view.kind === "search") return `Search: ${view.q}`;
  if (view.kind === "starred") return "Starred";
  if (view.kind === "label") return view.name || labels.find((l) => l.id === view.labelId)?.name || "Label";
  return FOLDER_LABELS[view.folder] || "Inbox";
}

export function MessageList({ store, searchRef, onMenu }) {
  const {
    view,
    goView,
    labels,
    messages,
    listLoading,
    loadingMore,
    loadMore,
    nextCursor,
    selectedIds,
    toggleSelect,
    selectAll,
    openId,
    openMessage,
    toggleStar,
  } = store;
  const [query, setQuery] = useState("");
  const scrollRef = useRef(null);

  const threads = useMemo(() => groupThreads(messages), [messages]);
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
  const allSelected = threads.length > 0 && threads.every((t) => selectedIds.has(t.id));
  const unread = threads.filter((t) => !t.isRead).length;

  function toggleSelectAll(on) {
    if (!on) {
      selectAll(false);
      return;
    }
    for (const t of threads) {
      if (!selectedIds.has(t.id)) toggleSelect(t.id);
    }
  }

  return (
    <div className="em-pane em-pane-list">
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
        <div className="em-pane-title">
          <span className="em-pane-title-text">{listTitle(view, labels)}</span>
          {unread > 0 && <span className="em-pane-title-count">{unread} unread</span>}
        </div>
        <form onSubmit={onSearch} className="em-pane-search">
          <InputGroup>
            <InputGroup.Addon>
              <MagnifyingGlass size={16} />
            </InputGroup.Addon>
            <InputGroup.Input
              ref={searchRef}
              placeholder="Search mail"
              aria-label="Search mail"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </InputGroup>
        </form>
      </div>

      {selecting ? (
        <BulkBar store={store} />
      ) : (
        <div className="em-listhead">
          <span className={`em-listhead-check${allSelected ? " is-shown" : ""}`}>
            <Checkbox
              checked={allSelected}
              onCheckedChange={() => toggleSelectAll(!allSelected)}
              aria-label="Select all"
            />
          </span>
          <span className="em-listhead-title">
            Select all
            {threads.length > 0 && <span className="em-listhead-count">{threads.length}</span>}
          </span>
        </div>
      )}

      <div className="em-list-scroll" ref={scrollRef} onScroll={onScroll}>
        {listLoading ? (
          <div className="em-skel">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="em-skel-row">
                <SkeletonLine style={{ width: "55%" }} />
                <SkeletonLine style={{ width: "85%" }} />
              </div>
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="em-empty">
            <Tray className="em-empty-icon" size={34} weight="thin" />
            <div className="em-empty-title">Nothing here</div>
            <div className="em-empty-sub">
              {view.kind === "search" ? "No messages match your search." : "This folder is empty."}
            </div>
          </div>
        ) : (
          <>
            {threads.map((item) => (
              <Row
                key={item.id}
                item={item}
                active={item._members?.some((m) => m.id === openId)}
                selected={selectedIds.has(item.id)}
                selfAddresses={selfAddresses}
                onOpen={openMessage}
                onToggleSelect={toggleSelect}
                onToggleStar={toggleStar}
              />
            ))}
            {nextCursor && (
              <div className="em-loadmore">
                {loadingMore ? <Loader size="sm" /> : <Button variant="ghost" size="sm" onClick={loadMore}>Load more</Button>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
