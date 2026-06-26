import { Button, DropdownMenu, Loader, Tooltip } from "@cloudflare/kumo";
import {
  Archive,
  ArrowBendUpLeft,
  ArrowBendDoubleUpLeft,
  ArrowLeft,
  ArrowRight,
  DotsThree,
  DownloadSimple,
  Envelope,
  Image,
  PaperPlaneTilt,
  Star,
  Trash,
  Tray,
  Warning,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { notifyError } from "../toast.js";
import {
  FOLDER_LABELS,
  fullDate,
  htmlHasBlockedImages,
  humanSize,
  imagesDefaultOn,
  initials,
  linkifyParts,
  monoColor,
  recipientLine,
  relativeTime,
  splitQuoted,
} from "../util.js";

const CSP_STRICT =
  "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src data:";
const CSP_LOOSE = "default-src 'none'; img-src * data:; style-src 'unsafe-inline'; font-src data:";
const PAPER_STYLE =
  "html,body{background:#faf8f5;color:#222;margin:0;padding:14px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.5;word-break:break-word;}img{max-width:100%;height:auto;}a{color:#bf3264;}";

function buildSrcdoc(html, allowRemote) {
  const csp = allowRemote ? CSP_LOOSE : CSP_STRICT;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>${PAPER_STYLE}</style></head><body>${html}</body></html>`;
}

function HtmlBody({ html, allowRemote }) {
  const ref = useRef(null);
  const [height, setHeight] = useState(240);

  function resize() {
    const f = ref.current;
    if (!f?.contentDocument) return;
    const h = f.contentDocument.documentElement.scrollHeight;
    if (h) setHeight(h + 8);
  }

  useEffect(() => {
    function onResize() {
      resize();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="em-paper">
      <iframe
        ref={ref}
        className="em-iframe"
        title="message"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        srcDoc={buildSrcdoc(html, allowRemote)}
        style={{ height }}
        onLoad={resize}
      />
    </div>
  );
}

function Linkified({ text }) {
  return linkifyParts(text).map((p, i) =>
    p.t === "link" ? (
      <a key={i} href={p.v} target="_blank" rel="noopener noreferrer">
        {p.v}
      </a>
    ) : (
      <span key={i}>{p.v}</span>
    ),
  );
}

function PlainBody({ text }) {
  const { main, quoted } = splitQuoted(text);
  const [showQuoted, setShowQuoted] = useState(false);
  return (
    <div className="em-text-body">
      <Linkified text={main} />
      {quoted && (
        <div className="em-quoted">
          <button type="button" className="em-quote-toggle" onClick={() => setShowQuoted((s) => !s)}>
            {showQuoted ? "Hide quoted text" : "Show quoted text"}
          </button>
          {showQuoted && (
            <div className="em-quoted-body">
              <Linkified text={quoted} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MessageCard({ message, expanded, onToggle, onShowImages }) {
  const remoteShown = message._imagesShown;
  const hasBlocked = !remoteShown && htmlHasBlockedImages(message.bodyHtml);
  const seed = message.from?.address || message.from?.name;
  return (
    <div className={`em-msg${expanded ? "" : " is-collapsed"}`}>
      <div className="em-msg-head" onClick={onToggle}>
        <span className="em-avatar" style={{ background: monoColor(seed) }}>
          {initials(message.from)}
        </span>
        <div className="em-msg-head-main">
          <div className="em-msg-from">
            {message.from?.name || message.from?.address}
            {message.from?.name && (
              <span className="em-msg-from-addr"> &lt;{message.from?.address}&gt;</span>
            )}
          </div>
          {expanded ? (
            <div className="em-msg-to">
              to {recipientLine(message.to) || "(no recipient)"}
              {message.cc?.length > 0 && `, cc ${recipientLine(message.cc)}`}
            </div>
          ) : (
            <div className="em-msg-collapsed-snip">{message.snippet}</div>
          )}
        </div>
        <Tooltip content={fullDate(message.date)}>
          <span className="em-msg-date">{relativeTime(message.date)}</span>
        </Tooltip>
      </div>

      {expanded && (
        <div className="em-msg-body">
          {hasBlocked && (
            <div className="em-images-bar">
              <Image size={15} />
              <span style={{ flex: 1 }}>Remote images blocked</span>
              <button type="button" className="em-quote-toggle" onClick={onShowImages}>
                Show images
              </button>
            </div>
          )}
          {message.bodyHtml ? (
            <HtmlBody html={message.bodyHtml} allowRemote={!!remoteShown} />
          ) : (
            <PlainBody text={message.bodyText} />
          )}
          {message.attachments?.length > 0 && (
            <div className="em-att-row">
              {message.attachments.map((a) => (
                <a
                  key={a.id}
                  className="em-att-chip"
                  href={`/api/attachments/${a.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <DownloadSimple size={14} />
                  {a.filename}
                  <span className="em-att-size">{humanSize(a.size)}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function pickFromAddress(message, user) {
  const selves = new Set((user?.addresses?.map((a) => a.address) || []).map((a) => a.toLowerCase()));
  const candidates = [...(message.to || []), ...(message.cc || [])];
  const match = candidates.find((p) => p.address && selves.has(p.address.toLowerCase()));
  return match?.address || user?.address;
}

function QuickReply({ store, last, onReply, onForward }) {
  const { user, thread, reloadThread, openMessage } = store;
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const selves = new Set((user?.addresses?.map((a) => a.address) || [user?.address]).filter(Boolean).map((a) => a.toLowerCase()));
  const lastExternalSender =
    [...thread.messages].reverse().find((m) => m.from?.address && !selves.has(m.from.address.toLowerCase())) || last;
  const replyTo = lastExternalSender.from?.address;
  const replyName = lastExternalSender.from?.name || replyTo || "sender";

  async function send() {
    const body = text.trim();
    if (!body || !replyTo) return;
    setSending(true);
    const subj = lastExternalSender.subject || "";
    try {
      await api.send({
        from: pickFromAddress(lastExternalSender, user),
        to: [replyTo],
        subject: /^re:/i.test(subj) ? subj : `Re: ${subj}`,
        text: body,
        inReplyTo: last.rfcMessageId,
        references: [...(last.references || []), last.rfcMessageId].filter(Boolean),
      });
      setText("");
      if (reloadThread) reloadThread(thread.threadId);
      else openMessage({ id: store.openId, threadId: thread.threadId });
    } catch (e) {
      notifyError(e);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="em-quickreply">
      <textarea
        className="em-quickreply-input"
        placeholder={`Reply to ${replyName}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="em-quickreply-actions">
        <Button
          size="sm"
          variant="primary"
          icon={PaperPlaneTilt}
          loading={sending}
          disabled={!text.trim() || !replyTo}
          onClick={send}
        >
          Send
        </Button>
        <button type="button" className="em-quote-toggle" onClick={() => onReply(last, "replyAll")}>
          Reply all
        </button>
        <button type="button" className="em-quote-toggle" onClick={() => onForward(last)}>
          Forward
        </button>
      </div>
    </div>
  );
}

function BackBar({ onBack, label }) {
  return (
    <div className="em-reader-topbar">
      <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={onBack}>
        {label}
      </Button>
    </div>
  );
}

export function ThreadView({ store, onReply, onForward, onBack }) {
  const { user, thread, threadLoading, openId, view, messages, toggleStar, moveMessage, setReadState, deleteForever, setThread } =
    store;
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  const listItem = messages.find((m) => m.id === openId);
  const backLabel = FOLDER_LABELS[view?.folder] || (view?.kind === "starred" ? "Starred" : view?.name) || "Back";

  useEffect(() => {
    if (thread?.messages?.length) {
      const list = thread.messages;
      const last = list[list.length - 1];
      const next = new Set([last.id]);
      for (const m of list) {
        if (!m.isRead) next.add(m.id);
      }
      setExpandedIds(next);
    }
  }, [thread]);

  useEffect(() => {
    if (!thread?.messages?.length || !imagesDefaultOn(user)) return;
    const targets = thread.messages.filter((m) => !m._imagesShown && htmlHasBlockedImages(m.bodyHtml));
    if (!targets.length) return;
    let cancelled = false;
    Promise.all(targets.map((m) => api.message(m.id, true).catch(() => null))).then((results) => {
      if (cancelled) return;
      const byId = new Map();
      for (const r of results) {
        if (r?.message) byId.set(r.message.id, r.message);
      }
      if (!byId.size) return;
      setThread({
        threadId: thread.threadId,
        messages: thread.messages.map((x) => (byId.has(x.id) ? { ...byId.get(x.id), _imagesShown: true } : x)),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [thread, user, setThread]);

  if (!openId) {
    return (
      <div className="em-pane em-pane-reader">
        <div className="em-empty">
          <Tray className="em-empty-icon" size={38} weight="thin" />
          <div className="em-empty-title">No message selected</div>
          <div className="em-empty-sub">Pick a message from the list to read it here.</div>
        </div>
      </div>
    );
  }

  if (threadLoading || !thread) {
    return (
      <div className="em-pane em-pane-reader">
        <BackBar onBack={onBack} label={backLabel} />
        <div className="em-center">
          <Loader />
        </div>
      </div>
    );
  }

  const msgs = thread.messages;
  const subject = msgs[0]?.subject || "(no subject)";
  const last = msgs[msgs.length - 1];
  const inTrash = listItem?.folder === "trash";

  function toggle(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function showImages(m) {
    try {
      const data = await api.message(m.id, true);
      setThread({
        threadId: thread.threadId,
        messages: msgs.map((x) => (x.id === m.id ? { ...data.message, _imagesShown: true } : x)),
      });
    } catch (e) {
      notifyError(e);
    }
  }

  const headerItem = listItem || {
    id: openId,
    folder: last?.folder,
    isStarred: last?.isStarred,
    isRead: true,
    threadId: thread.threadId,
  };

  return (
    <div className="em-pane em-pane-reader">
      <div className="em-reader-topbar">
        <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={onBack}>
          {backLabel}
        </Button>
        <div className="em-spacer" />
        <Button size="sm" variant="ghost" icon={ArrowBendUpLeft} onClick={() => onReply(last, "reply")}>
          Reply
        </Button>
        <Button size="sm" variant="ghost" icon={ArrowBendDoubleUpLeft} onClick={() => onReply(last, "replyAll")}>
          Reply all
        </Button>
        <Button size="sm" variant="ghost" icon={ArrowRight} onClick={() => onForward(last)}>
          Forward
        </Button>
        <div className="em-spacer" />
        <Tooltip content={headerItem.isStarred ? "Unstar" : "Star"}>
          <Button
            size="sm"
            variant="ghost"
            shape="square"
            aria-label="Star"
            icon={Star}
            onClick={() => toggleStar(headerItem)}
          />
        </Tooltip>
        <Tooltip content="Archive">
          <Button
            size="sm"
            variant="ghost"
            shape="square"
            aria-label="Archive"
            icon={Archive}
            onClick={() => moveMessage(headerItem, "archive")}
          />
        </Tooltip>
        <Tooltip content="Trash">
          <Button
            size="sm"
            variant="ghost"
            shape="square"
            aria-label="Trash"
            icon={Trash}
            onClick={() => moveMessage(headerItem, "trash")}
          />
        </Tooltip>
        <DropdownMenu>
          <DropdownMenu.Trigger
            render={(p) => (
              <Button {...p} size="sm" variant="ghost" shape="square" aria-label="More" icon={DotsThree} />
            )}
          />
          <DropdownMenu.Content>
            <DropdownMenu.Item icon={Envelope} onClick={() => setReadState(headerItem, false)}>
              Mark unread
            </DropdownMenu.Item>
            <DropdownMenu.Item icon={Warning} onClick={() => moveMessage(headerItem, "spam")}>
              Move to spam
            </DropdownMenu.Item>
            <DropdownMenu.Item icon={Tray} onClick={() => moveMessage(headerItem, "inbox")}>
              Move to inbox
            </DropdownMenu.Item>
            {inTrash && (
              <>
                <DropdownMenu.Separator />
                <DropdownMenu.Item icon={Trash} variant="danger" onClick={() => deleteForever(headerItem)}>
                  Delete permanently
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu>
      </div>

      <div className="em-thread">
        <div className="em-thread-inner">
          <h1 className="em-thread-subject">{subject}</h1>
          {msgs.map((m) => (
            <MessageCard
              key={m.id}
              message={m}
              expanded={expandedIds.has(m.id)}
              onToggle={() => toggle(m.id)}
              onShowImages={() => showImages(m)}
            />
          ))}
          {headerItem.folder !== "drafts" && (
            <QuickReply store={store} last={last} onReply={onReply} onForward={onForward} />
          )}
        </div>
      </div>
    </div>
  );
}
