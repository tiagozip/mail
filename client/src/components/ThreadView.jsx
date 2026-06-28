import { Button, DropdownMenu, Input, Loader, Tooltip } from "@cloudflare/kumo";
import {
  Archive,
  ArrowBendUpLeft,
  ArrowBendDoubleUpLeft,
  ArrowLeft,
  ArrowRight,
  DotsThree,
  DownloadSimple,
  Envelope,
  FileArrowDown,
  Printer,
  File as FileIcon,
  FileDoc,
  FileImage,
  FilePdf,
  FileText,
  FileZip,
  Image,
  Lock,
  LockKeyOpen,
  PaperPlaneTilt,
  ShieldCheck,
  Star,
  Trash,
  Tray,
  Warning,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { sanitize } from "lettersanitizer";
import { Letter } from "react-letter";
import { api } from "../api.js";
import * as pgp from "../pgp.js";
import { RichEditor } from "./RichEditor.jsx";
import { notifyError } from "../toast.js";
import {
  escapeHtml,
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

const ALLOWED_SCHEMAS = ["http", "https", "mailto", "cid", "tel", "data"];

function blockResource() {
  return "";
}

function passResource(url) {
  return url;
}

function LetterBody({ html, allowRemote }) {
  return (
    <div className="em-letter">
      <Letter
        html={html || ""}
        allowedSchemas={ALLOWED_SCHEMAS}
        rewriteExternalResources={allowRemote ? passResource : blockResource}
        className="em-letter-inner"
      />
    </div>
  );
}

function PgpLock({ onUnlocked }) {
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);

  async function submit(e) {
    e.preventDefault();
    if (!pass) return;
    setBusy(true);
    setError("");
    try {
      let privateKeyEnc = null;
      try {
        const d = await api.getPgp();
        privateKeyEnc = d.privateKeyEnc;
      } catch {
        privateKeyEnc = null;
      }
      if (!privateKeyEnc) {
        setError("No encryption key found for this account.");
        return;
      }
      await pgp.unlock(privateKeyEnc, pass);
      if (remember) pgp.rememberPass(pass);
      else pgp.forgetPass();
      setPass("");
      onUnlocked();
    } catch {
      setError("Wrong passphrase, try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="em-pgp-lock" onSubmit={submit}>
      <div className="em-pgp-lock-head">
        <Lock size={16} weight="fill" />
        <span>This message is encrypted. Enter your passphrase to read it.</span>
      </div>
      <div className="em-pgp-lock-row">
        <Input
          type="password"
          aria-label="Passphrase"
          placeholder="Passphrase"
          value={pass}
          onChange={(e) => {
            setPass(e.target.value);
            setError("");
          }}
        />
        <Button type="submit" variant="primary" icon={LockKeyOpen} loading={busy} disabled={!pass}>
          Unlock
        </Button>
      </div>
      <label className="em-pgp-remember">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>Remember on this device</span>
      </label>
      {error && <div className="em-form-error">{error}</div>}
    </form>
  );
}

function PgpBody({ message, onUnlocked }) {
  const [error, setError] = useState(false);
  const [decrypted, setDecrypted] = useState(null);
  const unlocked = !!pgp.getUnlocked();

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    setError(false);
    pgp
      .decryptArmored(message.bodyText || "")
      .then((data) => {
        if (!cancelled) setDecrypted(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [unlocked, message.bodyText]);

  if (!unlocked) return <PgpLock onUnlocked={onUnlocked} />;

  if (error) {
    return (
      <div className="em-pgp-note">
        <Lock size={15} weight="fill" />
        <span>Could not decrypt this message.</span>
      </div>
    );
  }

  if (decrypted === null) {
    return (
      <div className="em-pgp-note">
        <Lock size={15} weight="fill" />
        <span>Decrypting...</span>
      </div>
    );
  }

  return message.hasHtml ? (
    <LetterBody html={decrypted} allowRemote={false} />
  ) : (
    <PlainBody text={decrypted} />
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

function attIcon(mime) {
  const m = mime || "";
  if (m.startsWith("image/")) return FileImage;
  if (m === "application/pdf") return FilePdf;
  if (m.includes("zip") || m.includes("compressed") || m.includes("tar") || m.includes("rar")) return FileZip;
  if (m.includes("word") || m.includes("opendocument.text") || m.includes("msword")) return FileDoc;
  if (m.startsWith("text/")) return FileText;
  return FileIcon;
}

function Attachment({ att }) {
  const mime = att.mime || att.contentType || "";
  const isImage = mime.startsWith("image/");
  const downloadHref = `/api/attachments/${att.id}`;
  const inlineHref = `/api/attachments/${att.id}/inline`;

  if (isImage) {
    return (
      <div className="em-att-image">
        <a href={inlineHref} target="_blank" rel="noopener noreferrer" className="em-att-image-thumb">
          <img src={inlineHref} alt={att.filename} loading="lazy" />
        </a>
        <a className="em-att-image-bar" href={downloadHref} target="_blank" rel="noopener noreferrer">
          <DownloadSimple size={13} />
          <span className="em-att-name">{att.filename}</span>
          <span className="em-att-size">{humanSize(att.size)}</span>
        </a>
      </div>
    );
  }

  const Glyph = attIcon(mime);
  return (
    <a className="em-att-chip" href={downloadHref} target="_blank" rel="noopener noreferrer">
      <Glyph size={18} className="em-att-glyph" />
      <span className="em-att-name">{att.filename}</span>
      <span className="em-att-size">{humanSize(att.size)}</span>
      <DownloadSimple size={14} className="em-att-dl" />
    </a>
  );
}

function MessageCard({ message, expanded, onToggle, onShowImages, onUnlocked }) {
  const remoteShown = message._imagesShown;
  const hasBlocked = !message.pgp && !remoteShown && htmlHasBlockedImages(message.bodyHtml);
  const seed = message.from?.address || message.from?.name;
  const [decSnip, setDecSnip] = useState(null);
  useEffect(() => {
    if (!message.pgp || expanded || !pgp.getUnlocked()) return;
    let cancelled = false;
    pgp
      .decryptArmored(message.bodyText || "")
      .then((t) => {
        if (!cancelled) {
          setDecSnip(
            t
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 160),
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [message.pgp, message.bodyText, expanded]);
  const collapsedSnip = message.pgp ? decSnip || message.snippet : message.snippet;
  return (
    <div className={`em-msg${expanded ? "" : " is-collapsed"}`}>
      <div className="em-msg-head" onClick={onToggle}>
        {message.from?.avatar ? (
          <img className="em-avatar em-avatar-img" src={message.from.avatar} alt="" />
        ) : (
          <span className="em-avatar" style={{ background: monoColor(seed) }}>
            {initials(message.from)}
          </span>
        )}
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
            <div className="em-msg-collapsed-snip">{collapsedSnip}</div>
          )}
        </div>
        <div className="em-msg-meta">
          {message.pgp && (
            <Tooltip content="End-to-end encrypted, decrypted on this device">
              <span className="em-msg-enc" aria-label="End-to-end encrypted">
                <Lock size={13} weight="fill" />
              </span>
            </Tooltip>
          )}
          <Tooltip content={fullDate(message.date)}>
            <span className="em-msg-date">{relativeTime(message.date)}</span>
          </Tooltip>
        </div>
      </div>

      {expanded && (
        <div className="em-msg-body">
          {message.authStatus === "fail" && (
            <div className="em-spoof-banner">
              <Warning size={24} weight="fill" />
              <div className="em-spoof-copy">
                <div className="em-spoof-title">Warning: this message may be spoofed</div>
                <div className="em-spoof-text">
                  The sender's identity could not be verified, the From address may be forged
                  (SPF, DKIM, and DMARC checks failed). Do not trust links, attachments, or any
                  request to log in, pay, or share information in this message.
                  {message.authDetail && (
                    <span className="em-spoof-detail">
                      {" "}
                      SPF {message.authDetail.spf || "none"} / DKIM{" "}
                      {message.authDetail.dkim || "none"} / DMARC{" "}
                      {message.authDetail.dmarc || "none"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
          {hasBlocked && (
            <div className="em-images-bar">
              <Image size={15} />
              <span style={{ flex: 1 }}>Remote images blocked</span>
              <button type="button" className="em-quote-toggle" onClick={onShowImages}>
                Show images
              </button>
            </div>
          )}
          {message.trackersBlocked > 0 && (
            <Tooltip content="Hidden images used to track when you open an email were removed and cannot load.">
              <div className="em-tracker-bar">
                <ShieldCheck size={15} weight="fill" />
                <span>
                  Blocked {message.trackersBlocked} tracking{" "}
                  {message.trackersBlocked === 1 ? "pixel" : "pixels"}
                </span>
              </div>
            </Tooltip>
          )}
          {message.pgp ? (
            <PgpBody message={message} onUnlocked={onUnlocked} />
          ) : message.bodyHtml ? (
            <LetterBody html={message.bodyHtml} allowRemote={!!remoteShown} />
          ) : (
            <PlainBody text={message.bodyText} />
          )}
          {message.attachments?.length > 0 && (
            <div className="em-att-row">
              {message.attachments.map((a) => (
                <Attachment key={a.id} att={a} />
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
  const [html, setHtml] = useState("");
  const [sending, setSending] = useState(false);
  const editorRef = useRef(null);

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
        html,
        inReplyTo: last.rfcMessageId,
        references: [...(last.references || []), last.rfcMessageId].filter(Boolean),
      });
      setText("");
      setHtml("");
      editorRef.current?.commands.clearContent();
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
      <RichEditor
        placeholder={`Reply to ${replyName}`}
        onUpdate={({ html: h, text: t }) => {
          setHtml(h);
          setText(t);
        }}
        onEditorReady={(ed) => {
          editorRef.current = ed;
        }}
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
  const [, setPgpTick] = useState(0);

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

  function downloadEml(m) {
    const a = document.createElement("a");
    a.href = api.emlUrl(m.id);
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function printMessage(m) {
    let bodyMarkup;
    if (m.pgp) {
      let plain = m.bodyText || "";
      if (pgp.getUnlocked()) {
        try {
          plain = await pgp.decryptArmored(m.bodyText || "");
        } catch {}
      }
      bodyMarkup = m.hasHtml && plain.startsWith("<")
        ? plain
        : `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(plain)}</pre>`;
    } else if (m.bodyHtml) {
      bodyMarkup = m.bodyHtml;
    } else {
      bodyMarkup = `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(m.bodyText || "")}</pre>`;
    }
    const safeBody = sanitize(bodyMarkup, undefined, {
      allowedSchemas: ["http", "https", "mailto", "tel", "cid", "data"],
    });
    const win = window.open("", "_blank", "width=820,height=900");
    if (!win) return;
    const head = [
      `<strong>From:</strong> ${escapeHtml(m.from?.name || "")} &lt;${escapeHtml(m.from?.address || "")}&gt;`,
      `<strong>To:</strong> ${escapeHtml(recipientLine(m.to) || "")}`,
      m.cc?.length ? `<strong>Cc:</strong> ${escapeHtml(recipientLine(m.cc))}` : "",
      `<strong>Date:</strong> ${escapeHtml(fullDate(m.date))}`,
    ]
      .filter(Boolean)
      .join("<br>");
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8">` +
        `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'">` +
        `<title>${escapeHtml(m.subject || "(no subject)")}</title>` +
        `<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111;margin:32px;line-height:1.5}` +
        `h1{font-size:18px;margin:0 0 12px}.em-print-meta{font-size:13px;color:#444;border-bottom:1px solid #ddd;padding-bottom:12px;margin-bottom:16px}` +
        `img{max-width:100%}a{color:#1257b8}</style></head><body>` +
        `<h1>${escapeHtml(m.subject || "(no subject)")}</h1>` +
        `<div class="em-print-meta">${head}</div>` +
        `<div class="em-print-body">${safeBody}</div>` +
        `</body></html>`,
    );
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
  }

  return (
    <div className="em-pane em-pane-reader">
      <div className="em-reader-topbar">
        <Button className="em-reader-back" size="sm" variant="ghost" icon={ArrowLeft} onClick={onBack}>
          {backLabel}
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
            <DropdownMenu.Item icon={Printer} onClick={() => printMessage(last)}>
              Print
            </DropdownMenu.Item>
            <DropdownMenu.Item icon={FileArrowDown} onClick={() => downloadEml(last)}>
              Download .eml
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
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
              onUnlocked={() => setPgpTick((t) => t + 1)}
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
