import { Button, DropdownMenu, Input, Loader, Tooltip } from "@cloudflare/kumo";
import {
  Archive,
  ArrowBendDoubleUpLeft,
  ArrowBendUpLeft,
  ArrowLeft,
  ArrowRight,
  CaretDown,
  Clock,
  DotsThree,
  DownloadSimple,
  Envelope,
  FileArrowDown,
  FileDoc,
  File as FileIcon,
  FileImage,
  FilePdf,
  FileText,
  FileZip,
  Image,
  Lock,
  LockKeyOpen,
  Paperclip,
  PaperPlaneTilt,
  Printer,
  ShieldCheck,
  Star,
  Trash,
  Tray,
  Warning,
  X,
} from "@phosphor-icons/react";
import { sanitize } from "lettersanitizer";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Letter } from "react-letter";
import { api } from "../api.js";
import * as pgp from "../pgp.js";
import { notify, notifyError } from "../toast.js";
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
  sendLaterPresets,
  snoozePresets,
  splitQuoted,
} from "../util.js";
import { RichEditor } from "./RichEditor.jsx";

const CodeHighlight = lazy(() => import("../CodeHighlight.jsx"));

const ALLOWED_SCHEMAS = ["http", "https", "mailto", "cid", "tel", "data"];

function blockResource(url) {
  return /^\/api\/attachments\/[\w-]+\/inline/.test(url) ? url : "";
}

function passResource(url) {
  return url;
}

function LetterBody({ html, allowRemote, resource }) {
  const ref = useRef(null);
  const hasCode = useMemo(() => /<pre[\s>]/i.test(html || ""), [html]);
  return (
    <div className="em-letter" ref={ref}>
      <Letter
        html={html || ""}
        allowedSchemas={ALLOWED_SCHEMAS}
        rewriteExternalResources={resource || (allowRemote ? passResource : blockResource)}
        className="em-letter-inner"
      />
      {hasCode && (
        <Suspense fallback={null}>
          <CodeHighlight rootRef={ref} signal={html} />
        </Suspense>
      )}
    </div>
  );
}

function inlineResource(blobMap) {
  return (url) => blobMap[url] || (url.startsWith("data:") ? url : "");
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
      if (remember) await pgp.rememberPass(pass);
      else await pgp.forgetPass();
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

async function decryptInlineImages(html, cancelledRef) {
  const ids = [
    ...new Set(
      [...String(html).matchAll(/\/api\/attachments\/([\w-]+)\/inline/g)].map((m) => m[1]),
    ),
  ];
  const map = {};
  const urls = [];
  await Promise.all(
    ids.map(async (id) => {
      const path = `/api/attachments/${id}/inline`;
      try {
        const res = await fetch(path, { credentials: "include" });
        if (!res.ok) return;
        const mime = res.headers.get("content-type") || "application/octet-stream";
        const armored = await res.text();
        const bytes = await pgp.decryptBytes(armored);
        if (cancelledRef.cancelled) return;
        const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
        urls.push(blobUrl);
        map[path] = blobUrl;
      } catch {}
    }),
  );
  return { map, urls };
}

function PgpBody({ message, onUnlocked }) {
  const [error, setError] = useState(false);
  const [decrypted, setDecrypted] = useState(null);
  const [blobMap, setBlobMap] = useState({});
  const unlocked = !!pgp.getUnlocked();

  useEffect(() => {
    if (!unlocked) return;
    const ref = { cancelled: false };
    let made = [];
    setError(false);
    setBlobMap({});
    pgp
      .decryptArmored(message.bodyText || "")
      .then(async (data) => {
        if (ref.cancelled) return;
        setDecrypted(data);
        if (!message.hasHtml) return;
        const { map, urls } = await decryptInlineImages(data, ref);
        made = urls;
        if (!ref.cancelled) setBlobMap(map);
        else urls.forEach((u) => URL.revokeObjectURL(u));
      })
      .catch(() => {
        if (!ref.cancelled) setError(true);
      });
    return () => {
      ref.cancelled = true;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [unlocked, message.bodyText, message.hasHtml]);

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
    <LetterBody html={decrypted} resource={inlineResource(blobMap)} />
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
          <button
            type="button"
            className="em-quote-toggle"
            onClick={() => setShowQuoted((s) => !s)}
          >
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
  if (m.includes("zip") || m.includes("compressed") || m.includes("tar") || m.includes("rar"))
    return FileZip;
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
        <a
          href={inlineHref}
          target="_blank"
          rel="noopener noreferrer"
          className="em-att-image-thumb"
        >
          <img src={inlineHref} alt={att.filename} loading="lazy" />
        </a>
        <a
          className="em-att-image-bar"
          href={downloadHref}
          target="_blank"
          rel="noopener noreferrer"
        >
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
            {message.authStatus === "fail" && (
              <span className="em-spoof-badge">
                <Warning size={12} weight="fill" /> Spoofed
              </span>
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
                <div className="em-spoof-title">This message may be spoofed</div>
                <div className="em-spoof-text">
                  The sender's identity could not be verified and may be forged. Do not trust links,
                  attachments, or any request to log in, pay, or share information in this message.
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
  const selves = new Set(
    (user?.addresses?.map((a) => a.address) || []).map((a) => a.toLowerCase()),
  );
  const candidates = [...(message.to || []), ...(message.cc || [])];
  const match = candidates.find((p) => p.address && selves.has(p.address.toLowerCase()));
  return match?.address || user?.address;
}

function QuickReply({ store, last, onReply, onForward, onSent }) {
  const { user, thread, reloadThread, openMessage } = store;
  const [text, setText] = useState("");
  const [html, setHtml] = useState("");
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [sending, setSending] = useState(false);
  const [atts, setAtts] = useState([]);
  const [dropImages, setDropImages] = useState(null);
  const [recipKey, setRecipKey] = useState(null);
  const editorRef = useRef(null);
  const fileInput = useRef(null);
  const ownKeyRef = useRef(null);

  const selves = new Set(
    (user?.addresses?.map((a) => a.address) || [user?.address])
      .filter(Boolean)
      .map((a) => a.toLowerCase()),
  );
  const lastExternalSender =
    [...thread.messages]
      .reverse()
      .find((m) => m.from?.address && !selves.has(m.from.address.toLowerCase())) || last;
  const replyTo = lastExternalSender.from?.address;
  const replyName = lastExternalSender.from?.name || replyTo || "sender";

  useEffect(() => {
    if (!user.pgpEnabled || !replyTo) {
      setRecipKey(null);
      return;
    }
    let cancelled = false;
    api
      .pgpPubkey(replyTo)
      .then((d) => !cancelled && setRecipKey(d?.publicKey || null))
      .catch(() => !cancelled && setRecipKey(null));
    return () => {
      cancelled = true;
    };
  }, [replyTo, user.pgpEnabled]);

  const ccAddrs = cc
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const canE2E = user.pgpEnabled === true && !!recipKey && !ccAddrs.length && !atts.length;

  async function uploadFiles(files) {
    for (const file of files) {
      const tmpId = `pending-${Math.random()}`;
      const thumb = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
      setAtts((p) => [...p, { id: tmpId, filename: file.name, size: file.size, pending: true, thumb }]);
      try {
        const d = await api.uploadAttachment(file);
        setAtts((p) => p.map((a) => (a.id === tmpId ? { ...d, thumb } : a)));
      } catch (err) {
        setAtts((p) => p.filter((a) => a.id !== tmpId));
        notifyError(err);
      }
    }
  }

  async function addInlineImages(files) {
    for (const file of files) {
      try {
        const d = await api.uploadAttachment(file);
        editorRef.current
          ?.chain()
          .focus()
          .setImage({ src: `/api/attachments/${d.id}/inline`, alt: file.name })
          .run();
      } catch (err) {
        notifyError(err);
      }
    }
  }

  function handleFiles(files, via) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    const others = files.filter((f) => !f.type.startsWith("image/"));
    if (others.length) uploadFiles(others);
    if (!images.length) return;
    if (via === "paste") addInlineImages(images);
    else setDropImages(images);
  }

  async function removeAtt(att) {
    setAtts((p) => p.filter((a) => a.id !== att.id));
    if (!att.pending) await api.deleteAttachment(att.id).catch(() => {});
  }

  function clearReply() {
    setText("");
    setHtml("");
    setCc("");
    setShowCc(false);
    setAtts([]);
    editorRef.current?.commands.clearContent();
  }

  async function send(sendAt) {
    const body = text.trim();
    const hasImg = /<img/i.test(html);
    if ((!body && !atts.length && !hasImg) || !replyTo) return;
    setSending(true);
    const subj = lastExternalSender.subject || "";
    const fromAddr = pickFromAddress(lastExternalSender, user);
    const base = {
      from: fromAddr,
      to: [replyTo],
      cc: ccAddrs,
      subject: /^re:/i.test(subj) ? subj : `Re: ${subj}`,
      inReplyTo: last.rfcMessageId,
      references: [...(last.references || []), last.rfcMessageId].filter(Boolean),
    };
    try {
      let payload;
      let plain = body;
      if (canE2E) {
        if (!ownKeyRef.current) {
          const own = await api.getPgp();
          ownKeyRef.current = own?.publicKey || null;
        }
        if (!ownKeyRef.current) {
          notify("Cannot encrypt", "Your encryption key is unavailable.", "warning");
          setSending(false);
          return;
        }
        plain = editorRef.current?.getText?.() ?? body;
        const armored = await pgp.encryptFor([recipKey, ownKeyRef.current], plain);
        payload = { ...base, pgp: true, text: armored };
      } else {
        payload = {
          ...base,
          text: body,
          html: body || hasImg ? html : "",
          attachmentIds: atts.filter((a) => !a.pending).map((a) => a.id),
        };
      }

      if (!sendAt) {
        const undoMs = Math.min(120, Math.max(0, Number(user.settings?.undoSend) || 0)) * 1000;
        const optimistic = {
          id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          threadId: thread.threadId,
          folder: "sent",
          from: { address: fromAddr, name: user.displayName || user.username },
          to: [{ address: replyTo, name: "" }],
          cc: ccAddrs.map((a) => ({ address: a, name: "" })),
          subject: base.subject,
          snippet: plain.replace(/\s+/g, " ").trim().slice(0, 140),
          bodyText: plain,
          bodyHtml: !canE2E && (body || hasImg) ? html : null,
          hasHtml: !canE2E && html ? 1 : 0,
          date: Date.now(),
          isRead: 1,
          pgp: 0,
          attachments: [],
          optimistic: true,
        };
        onSent?.({ deferred: true, undoMs, payload, optimistic });
        clearReply();
        setSending(false);
        return;
      }

      const resp = await api.send({ ...payload, sendAt, skipUndo: true });
      onSent?.(resp);
      notify("Scheduled", `Will send ${fullDate(sendAt || resp?.sendAt)}.`, "success");
      clearReply();
      if (reloadThread) reloadThread(thread.threadId);
      else openMessage({ id: store.openId, threadId: thread.threadId });
    } catch (e) {
      notifyError(e);
    } finally {
      setSending(false);
    }
  }

  const canSend =
    (!!text.trim() || atts.length > 0 || /<img/i.test(html)) &&
    !!replyTo &&
    !atts.some((a) => a.pending);

  return (
    <div className="em-quickreply">
      {showCc && (
        <input
          className="em-quickreply-cc"
          aria-label="Cc"
          placeholder="Cc"
          value={cc}
          onChange={(e) => setCc(e.target.value)}
        />
      )}
      <RichEditor
        placeholder={canE2E ? `Reply encrypted to ${replyName}` : `Reply to ${replyName}`}
        onUpdate={({ html: h, text: t }) => {
          setHtml(h);
          setText(t);
        }}
        onEditorReady={(ed) => {
          editorRef.current = ed;
        }}
        onFiles={handleFiles}
      />
      {dropImages && (
        <div className="em-img-choose">
          <span className="em-img-choose-label">
            Add {dropImages.length} image{dropImages.length > 1 ? "s" : ""} as
          </span>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              addInlineImages(dropImages);
              setDropImages(null);
            }}
          >
            Inline
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              uploadFiles(dropImages);
              setDropImages(null);
            }}
          >
            Attachment
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDropImages(null)}>
            Cancel
          </Button>
        </div>
      )}
      {atts.length > 0 && (
        <div className="em-pending-atts">
          {atts.map((a) => (
            <span key={a.id} className="em-pending-chip">
              <span className="em-pending-thumb">
                {a.pending ? (
                  <Loader size="sm" />
                ) : a.thumb ? (
                  <img src={a.thumb} alt="" />
                ) : (
                  <FileIcon size={18} />
                )}
              </span>
              <span className="em-pending-meta">
                <span className="em-pending-name">{a.filename}</span>
                <span className="em-pending-size">
                  {a.pending ? "Uploading…" : humanSize(a.size)}
                </span>
              </span>
              <button
                type="button"
                className="em-pending-x"
                aria-label="Remove"
                onClick={() => removeAtt(a)}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const f = [...(e.target.files || [])];
          e.target.value = "";
          uploadFiles(f);
        }}
      />
      <div className="em-quickreply-actions">
        <div className="em-split">
          <Button
            className="em-split-main"
            size="sm"
            variant="primary"
            icon={PaperPlaneTilt}
            loading={sending}
            disabled={!canSend}
            onClick={() => send()}
          >
            Send
          </Button>
          <DropdownMenu>
            <DropdownMenu.Trigger
              render={(p) => (
                <Button
                  {...p}
                  className="em-split-caret"
                  size="sm"
                  variant="primary"
                  shape="square"
                  aria-label="Send later"
                  icon={CaretDown}
                  disabled={!canSend}
                />
              )}
            />
            <DropdownMenu.Content style={{ zIndex: 200 }}>
              {sendLaterPresets().map((p) => (
                <DropdownMenu.Item key={p.key} onClick={() => send(p.sendAt)}>
                  {p.label}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu>
        </div>
        <Button size="sm" variant="ghost" icon={Paperclip} onClick={() => fileInput.current?.click()}>
          Attach
        </Button>
        {!showCc && (
          <button type="button" className="em-quote-toggle" onClick={() => setShowCc(true)}>
            Cc
          </button>
        )}
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

export function ThreadView({ store, onReply, onForward, onBack, onSent }) {
  const {
    user,
    thread,
    threadLoading,
    openId,
    view,
    messages,
    toggleStar,
    moveMessage,
    snooze,
    setReadState,
    deleteForever,
    setThread,
  } = store;
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [, setPgpTick] = useState(0);

  const listItem = messages.find((m) => m.id === openId);
  const backLabel =
    FOLDER_LABELS[view?.folder] || (view?.kind === "starred" ? "Starred" : view?.name) || "Back";

  useEffect(() => {
    if (thread?.messages?.length) {
      setExpandedIds(new Set(thread.messages.map((m) => m.id)));
    }
  }, [thread]);

  useEffect(() => {
    if (!thread?.messages?.length || !imagesDefaultOn(user)) return;
    const targets = thread.messages.filter(
      (m) => !m._imagesShown && htmlHasBlockedImages(m.bodyHtml),
    );
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
        messages: thread.messages.map((x) =>
          byId.has(x.id) ? { ...byId.get(x.id), _imagesShown: true } : x,
        ),
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
      bodyMarkup =
        m.hasHtml && plain.startsWith("<")
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
        <Button
          className="em-reader-back"
          size="sm"
          variant="ghost"
          icon={ArrowLeft}
          onClick={onBack}
        >
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
              <Button
                {...p}
                size="sm"
                variant="ghost"
                shape="square"
                aria-label="More"
                icon={DotsThree}
              />
            )}
          />
          <DropdownMenu.Content>
            <DropdownMenu.Item icon={Envelope} onClick={() => setReadState(headerItem, false)}>
              Mark unread
            </DropdownMenu.Item>
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger icon={Clock}>Snooze</DropdownMenu.SubTrigger>
              <DropdownMenu.SubContent>
                {snoozePresets().map((p) => (
                  <DropdownMenu.Item key={p.key} onClick={() => snooze(headerItem, p.until)}>
                    <span className="em-snooze-item">
                      <span>{p.label}</span>
                      <span className="em-snooze-when">{fullDate(p.until)}</span>
                    </span>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Sub>
            <DropdownMenu.Separator />
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
                <DropdownMenu.Item
                  icon={Trash}
                  variant="danger"
                  onClick={() => deleteForever(headerItem)}
                >
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
            <QuickReply store={store} last={last} onReply={onReply} onForward={onForward} onSent={onSent} />
          )}
        </div>
      </div>
    </div>
  );
}
