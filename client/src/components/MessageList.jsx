import { Button, Checkbox, Loader, SkeletonLine, Tooltip } from "@cloudflare/kumo";
import {
  Archive,
  Envelope,
  EnvelopeOpen,
  List,
  MagnifyingGlass,
  NotePencil,
  Paperclip,
  PaperPlaneTilt,
  PencilSimpleLine,
  ShieldWarning,
  Star,
  Tray,
  Trash,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import * as pgp from "../pgp.js";
import { FOLDER_LABELS, groupThreads, initials, monoColor, relativeTime, senderLabel } from "../util.js";

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

function Row({ item, active, selected, selfAddresses, decSnippet, onOpen, onToggleSelect, onToggleStar }) {
  const sender = senderLabel(item, selfAddresses);
  const addr = item.from?.address || "";
  const handle = addr.includes("@") ? `@${addr.split("@")[1]}` : addr;
  const snip = item.pgp ? decSnippet || item.snippet : item.snippet;
  return (
    <div
      className={`em-row${active ? " is-active" : ""}${selected ? " is-selected" : ""}${item.isRead ? "" : " is-unread"}`}
      onClick={() => onOpen(item)}
    >
      <div className="em-row-avatar">
        {item.from?.avatar ? (
          <img className="em-avatar em-avatar-img" src={item.from.avatar} alt="" />
        ) : (
          <span className="em-avatar" style={{ background: monoColor(addr || sender) }}>
            {initials({ name: sender, address: addr })}
          </span>
        )}
        {!item.isRead && <span className="em-row-unread" />}
      </div>
      <div className="em-row-body">
        <div className="em-row-line">
          <span className="em-row-sender">{sender}</span>
          {handle && <span className="em-row-handle">{handle}</span>}
          <span className="em-row-sep">·</span>
          <span className="em-row-date">{relativeTime(item.date)}</span>
          {item._count > 1 && <span className="em-row-count">{item._count}</span>}
          {item.hasAttachments && <Paperclip className="em-row-clip" size={14} weight="bold" />}
        </div>
        <div className="em-row-subject">{item.subject || "(no subject)"}</div>
        {snip && <div className="em-row-snippet">{snip}</div>}
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
      <div className="em-row-actions" onClick={(e) => e.stopPropagation()}>
        <StarToggle on={item.isStarred} onClick={() => onToggleStar(item)} />
        <div className="em-row-check">
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect(item.id)}
            aria-label="Select message"
          />
        </div>
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

export function MessageList({ store, searchRef, onMenu, onCompose }) {
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
  const [decSnippets, setDecSnippets] = useState({});
  const scrollRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    async function run() {
      if (cancelled) return;
      if (!pgp.getUnlocked()) {
        if (tries++ < 6) setTimeout(run, 700);
        return;
      }
      const pending = messages.filter((m) => m.pgp && decSnippets[m.id] === undefined);
      if (!pending.length) return;
      const updates = {};
      for (const m of pending) {
        try {
          if (m.snippetEnc) {
            updates[m.id] = await pgp.decryptArmored(m.snippetEnc);
          } else {
            const full = await api.message(m.id);
            const dec = await pgp.decryptArmored(full.message?.bodyText || "");
            updates[m.id] = dec
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 140);
          }
        } catch {
          updates[m.id] = null;
        }
      }
      if (!cancelled) setDecSnippets((prev) => ({ ...prev, ...updates }));
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [messages]);

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
      </div>

      {selecting && <BulkBar store={store} />}

      <div className="em-list-scroll" ref={scrollRef} onScroll={onScroll}>
        {listLoading ? (
          <div className="em-skel">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="em-skel-row">
                <div className="em-skel-avatar" />
                <div className="em-skel-lines">
                  <SkeletonLine style={{ width: "38%" }} />
                  <SkeletonLine style={{ width: "62%" }} />
                  <SkeletonLine style={{ width: "85%" }} />
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
              spam: [ShieldWarning, "No spam", "Suspected spam and spoofed mail lands here."],
              trash: [Trash, "Trash is empty", "Deleted messages stay here before removal."],
            };
            const [Icon, title, sub] = states[view.kind === "folder" ? view.folder : view.kind] || [
              Tray,
              "Nothing here",
              "This folder is empty.",
            ];
            return (
              <div className="em-empty">
                <Icon className="em-empty-icon" size={34} weight="thin" />
                <div className="em-empty-title">{title}</div>
                <div className="em-empty-sub">{sub}</div>
              </div>
            );
          })()
        ) : (
          <>
            {threads.map((item) => (
              <Row
                key={item.id}
                item={item}
                active={item._members?.some((m) => m.id === openId)}
                selected={selectedIds.has(item.id)}
                selfAddresses={selfAddresses}
                decSnippet={decSnippets[item.id]}
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

      <div className="em-floatbar">
        <form className="em-floatbar-search" onSubmit={onSearch}>
          <MagnifyingGlass className="em-floatbar-icon" size={18} />
          <input
            ref={searchRef}
            className="em-floatbar-input"
            placeholder="Search"
            aria-label="Search mail"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>
        <button type="button" className="em-floatbar-compose" onClick={onCompose}>
          <PencilSimpleLine size={18} weight="bold" />
          <span>Write</span>
        </button>
      </div>
    </div>
  );
}
