import { Button, DropdownMenu, Input, Loader, Select, Tooltip } from "@cloudflare/kumo";
import spamton from "../assets/spamton.webp";

import {
  Archive,
  ArrowBendDoubleUpLeft,
  ArrowBendUpLeft,
  ArrowLeft,
  ArrowRight,
  CalendarBlank,
  CaretDown,
  CaretUp,
  CaretLeft,
  CaretRight,
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
  Folder,
  Image as ImageIcon,
  Lock,
  Paperclip,
  PaperPlaneTilt,
  Printer,
  ShieldCheck,
  Star,
  Trash,
  Tray,
  Warning,
  X,
  Check,
  Checks,
} from "@phosphor-icons/react";
import { sanitize } from "lettersanitizer";
import { rsvpEvent } from "../calendar.js";
import { InviteDetails } from "./CalendarView.jsx";
import { createPortal } from "react-dom";
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import * as pgp from "../pgp.js";
import { expandHtmlBlocks, stripTrackers } from "../../../src/sanitize.js";
import { notify, notifyError } from "../toast.js";
import { SendAtDialog } from "./SendAtDialog.jsx";
import { SenderAvatar } from "./SenderAvatar.jsx";
import {
  escapeHtml,
  FOLDER_LABELS,
  fullDate,
  hasBodyContent,
  htmlHasBlockedImages,
  humanSize,
  imagesDefaultOn,
  initials,
  linkifyParts,
  monoColor,
  pickFromAddress,
  recipientLine,
  sendIdentities,
  relativeTime,
  sendLaterPresets,
  snoozePresets,
  splitQuoted,
} from "../util.js";
const RichEditor = lazy(() => import("./RichEditor.jsx").then((m) => ({ default: m.RichEditor })));
setTimeout(() => import("./RichEditor.jsx"), 1500);

const CodeHighlight = lazy(() => import("../CodeHighlight.jsx"));

const ALLOWED_SCHEMAS = ["http", "https", "mailto", "cid", "tel", "data"];

function blockResource(url) {
  return /^\/api\/attachments\/[\w-]+\/inline/.test(url) ? url : "";
}

function passResource(url) {
  return url;
}

const FRAME_CSP = [
  "default-src 'none'",
  "img-src 'self' data: blob:",
  "style-src 'unsafe-inline'",
  "font-src 'self' data:",
  "script-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
].join("; ");

function frameCss() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fallback) => (cs.getPropertyValue(name) || "").trim() || fallback;
  return `html{color-scheme:dark;overflow-y:hidden;overflow-x:auto}
html,body{margin:0;padding:0;background:transparent}
body{color:${v("--text-color-kumo-default", "#e8e8e8")};font-family:${v("--font-sans", "system-ui, sans-serif")};font-size:0.9rem;line-height:1.6;overflow-wrap:break-word;font-optical-sizing:auto;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
a{color:${v("--text-color-kumo-link", "#7aa2f7")}}
img{max-width:100%;height:auto}
table{max-width:100%}
blockquote{margin:0 0 0 12px;padding-left:12px;border-left:2px solid ${v("--color-kumo-line", "#333")}}
.em-shiki{margin:12px 0;padding:12px 16px;border-radius:10px;overflow-x:auto;font-size:0.85rem;line-height:1.55;border:1px solid ${v("--color-kumo-hairline", "#333")};background-color:var(--shiki-dark-bg)!important}
.em-shiki code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:none;padding:0}
.em-shiki,.em-shiki span{color:var(--shiki-dark)!important}
html.is-paper{color-scheme:light}
html.is-paper body{color:#1f1a21}
html.is-paper a{color:#1a5fd0}`;
}

function markPaper(doc) {
  const width = doc.body.clientWidth || 1;
  const paper = [...doc.body.querySelectorAll("*")].some((el) => {
    const bg = doc.defaultView.getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
    if (!bg || (bg[3] !== undefined && Number(bg[3]) < 0.5)) return false;
    const [r, g, b] = bg.map(Number);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 160 && el.getBoundingClientRect().width > width * 0.5;
  });
  doc.documentElement.classList.toggle("is-paper", paper);
}

const letterHeightCache = new Map();

function LetterBody({ html, allowRemote, resource }) {
  const frameRef = useRef(null);
  const [height, setHeight] = useState(() => letterHeightCache.get(html) || 0);
  const [frameBody, setFrameBody] = useState(null);
  const hasCode = useMemo(() => /<pre[\s>]/i.test(html || ""), [html]);

  const srcDoc = useMemo(() => {
    const clean = sanitize(html || "", undefined, {
      allowedSchemas: ALLOWED_SCHEMAS,
      rewriteExternalResources: resource || (allowRemote ? passResource : blockResource),
      noWrapper: true,
    });
    return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}"><style>${frameCss()}</style></head><body>${clean}</body></html>`;
  }, [html, allowRemote, resource]);

  useLayoutEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc?.body) return;
    setFrameBody(doc.body);
    markPaper(doc);
    const measure = () => {
      const h = doc.documentElement.scrollHeight;
      if (!h) return;
      letterHeightCache.set(html, h);
      setHeight((prev) => (Math.abs(prev - h) > 1 ? h : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(doc.documentElement);
    ro.observe(doc.body);
    doc.addEventListener("load", measure, true);
    return () => {
      ro.disconnect();
      doc.removeEventListener("load", measure, true);
    };
  }, [srcDoc, html]);

  return (
    <div className="em-letter">
      <iframe
        ref={frameRef}
        title="Message body"
        className="em-letter-frame"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={srcDoc}
        style={{ height: height ? `${height}px` : "0px" }}
        onLoad={() => {
          const doc = frameRef.current?.contentDocument;
          if (!doc) return;
          markPaper(doc);
          setFrameBody(doc.body);
          const h = doc.documentElement.scrollHeight;
          if (h) {
            letterHeightCache.set(html, h);
            setHeight(h);
          }
        }}
      />
      {hasCode && frameBody && (
        <Suspense fallback={null}>
          <CodeHighlight rootRef={{ current: frameBody }} signal={html} />
        </Suspense>
      )}
    </div>
  );
}

function proxied(url) {
  return `/api/img?url=${encodeURIComponent(url)}`;
}

function inlineResource(blobMap, allowRemote) {
  return (url) => {
    if (blobMap[url]) return blobMap[url];
    if (url.startsWith("data:")) return url;
    if (url.startsWith("/api/")) return url;
    if (!allowRemote || !/^https?:\/\//i.test(url)) return "";
    return proxied(url);
  };
}

function hasRemoteRefs(html) {
  return /<img\b[^>]*\ssrc\s*=\s*["']?https?:/i.test(html) || /url\(\s*["']?https?:/i.test(html);
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
      <div className="em-pgp-lock-row">
        <Lock size={16} className="em-pgp-lock-icon" />
        <input
          className="em-pgp-lock-input"
          type="password"
          aria-label="Passphrase"
          aria-invalid={!!error}
          placeholder="Passphrase to decrypt"
          value={pass}
          onChange={(e) => {
            setPass(e.target.value);
            setError("");
          }}
        />
        <label className="em-pgp-remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>Remember</span>
        </label>
        <Button type="submit" size="sm" variant="secondary" loading={busy}>
          Unlock
        </Button>
      </div>
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

function PgpBody({ message, onUnlocked, allowRemote, onScan }) {
  const [error, setError] = useState(false);
  const [decrypted, setDecrypted] = useState(null);
  const [blobMap, setBlobMap] = useState({});
  const unlocked = !!pgp.getUnlocked();
  const resource = useMemo(() => inlineResource(blobMap, allowRemote), [blobMap, allowRemote]);

  useEffect(() => {
    if (!unlocked) return;
    const ref = { cancelled: false };
    let made = [];
    setError(false);
    setBlobMap({});
    pgp
      .decryptArmored(message.bodyText || "")
      .then(async (raw) => {
        if (ref.cancelled) return;
        const scanned = message.hasHtml ? stripTrackers(raw) : { html: raw, count: 0 };
        const data = scanned.html;
        onScan(scanned.count, message.hasHtml && hasRemoteRefs(data), scanned.names || []);
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
    <LetterBody html={decrypted} resource={resource} />
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

function attKind(att) {
  const mime = (att.mime || att.contentType || "").toLowerCase();
  const name = (att.filename || "").toLowerCase();
  if (mime.startsWith("image/") && !mime.includes("svg")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("text/") || /\.(txt|md|csv|log|json|ics|vcf)$/.test(name)) return "text";
  return "file";
}

function attExt(att) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(att.filename || "");
  return m ? m[1].toLowerCase() : "file";
}

function useTextSnippet(att, enabled, limit) {
  const [text, setText] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetch(`/api/attachments/${att.id}`)
      .then((r) => (r.ok ? r.text() : ""))
      .then((t) => alive && setText(t.slice(0, limit)))
      .catch(() => alive && setText(""));
    return () => {
      alive = false;
    };
  }, [att.id, enabled, limit]);
  return text;
}

function Attachment({ att, onOpen }) {
  const kind = attKind(att);
  const snippet = useTextSnippet(att, kind === "text" && att.size < 256000, 600);
  const Glyph = attIcon(att.mime || att.contentType);
  return (
    <div className={`em-att-card is-${kind}`}>
      <button
        type="button"
        className="em-att-preview"
        onClick={onOpen}
        aria-label={`Preview ${att.filename}`}
      >
        {kind === "image" ? (
          <img src={`/api/attachments/${att.id}/inline`} alt="" loading="lazy" />
        ) : kind === "text" && snippet ? (
          <pre>{snippet}</pre>
        ) : (
          <span className="em-att-type">
            <Glyph size={28} />
            {Glyph === FileIcon && <span>{attExt(att)}</span>}
          </span>
        )}
      </button>
      <div className="em-att-foot">
        <span className="em-att-meta">
          <span className="em-att-name" title={att.filename}>
            {att.filename}
          </span>
          <span className="em-att-size">{humanSize(att.size)}</span>
        </span>
        <a className="em-att-dl" href={`/api/attachments/${att.id}`} aria-label={`Download ${att.filename}`} download>
          <DownloadSimple size={16} />
        </a>
      </div>
    </div>
  );
}

function AttViewer({ list, index, onIndex, onClose }) {
  const att = list[index];
  const kind = att ? attKind(att) : null;
  const text = useTextSnippet(att || { id: "" }, kind === "text", 200000);
  useEffect(() => {
    if (!att) return;
    function onKey(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowRight" && index < list.length - 1) onIndex(index + 1);
      else if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    }
    addEventListener("keydown", onKey, true);
    return () => removeEventListener("keydown", onKey, true);
  }, [att, index, list.length, onIndex, onClose]);
  if (!att) return null;
  const Glyph = attIcon(att.mime || att.contentType);
  return createPortal(
    <div className="em-viewer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <header className="em-viewer-bar">
        <span className="em-viewer-title">
          <span className="em-att-name">{att.filename}</span>
          <span className="em-att-size">
            {humanSize(att.size)}
            {list.length > 1 && ` · ${index + 1} of ${list.length}`}
          </span>
        </span>
        <a className="em-viewer-btn" href={`/api/attachments/${att.id}`} download aria-label="Download">
          <DownloadSimple size={18} />
        </a>
        <button type="button" className="em-viewer-btn" onClick={onClose} aria-label="Close preview">
          <X size={18} />
        </button>
      </header>
      <div className="em-viewer-stage" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {index > 0 && (
          <button type="button" className="em-viewer-nav is-prev" onClick={() => onIndex(index - 1)} aria-label="Previous attachment">
            <CaretLeft size={18} />
          </button>
        )}
        {kind === "image" ? (
          <img key={att.id} src={`/api/attachments/${att.id}/inline`} alt={att.filename} />
        ) : kind === "pdf" ? (
          <iframe key={att.id} className="em-viewer-pdf" src={`/api/attachments/${att.id}/inline#navpanes=0&view=FitH`} title={att.filename} />
        ) : kind === "text" ? (
          <pre className="em-viewer-text">{text ?? ""}</pre>
        ) : (
          <div className="em-viewer-file">
            <Glyph size={40} />
            <span className="em-att-name">{att.filename}</span>
            {kind === "pdf" ? (
              <a className="em-viewer-open" href={`/api/attachments/${att.id}/inline`} target="_blank" rel="noopener noreferrer">
                Open PDF in a new tab
              </a>
            ) : (
              <a className="em-viewer-open" href={`/api/attachments/${att.id}`} download>
                Download file
              </a>
            )}
          </div>
        )}
        {index < list.length - 1 && (
          <button type="button" className="em-viewer-nav is-next" onClick={() => onIndex(index + 1)} aria-label="Next attachment">
            <CaretRight size={18} />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

function UnsubscribeBar({ message }) {
  const [state, setState] = useState(message.unsubscribe.done ? "done" : "idle");
  async function run() {
    setState("busy");
    try {
      const res = await api.unsubscribe(message.id);
      if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
      setState("done");
      notify(
        res.method === "link" ? "Finish unsubscribing on the sender's page" : "Unsubscribed",
        "",
        "success",
      );
    } catch (e) {
      notifyError(e);
      setState("idle");
    }
  }
  return (
    <div className="em-unsub-bar">
      <span>
        {state === "done"
          ? `You unsubscribed from ${message.from?.name || message.from?.address}.`
          : `Mailing list from ${message.from?.name || message.from?.address}.`}
      </span>
      {state !== "done" && (
        <Button size="sm" variant="secondary" loading={state === "busy"} onClick={run}>
          Unsubscribe
        </Button>
      )}
    </div>
  );
}

function InviteCard({ messageId }) {
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    let live = true;
    api
      .messageEvents(messageId)
      .then((d) => live && setEvents(d.events || []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [messageId]);
  async function reply(ev, status) {
    setBusy(status);
    try {
      const next = await rsvpEvent(ev.id, status);
      setEvents((list) => list.map((e) => (e.id === ev.id ? { ...e, myStatus: next.myStatus } : e)));
      notify(status === "accepted" ? "Invitation accepted" : status === "declined" ? "Invitation declined" : "Replied maybe", "", "success");
    } catch (e) {
      notifyError(e);
    }
    setBusy("");
  }
  return events.map((ev) => (
    <InviteDetails key={ev.id} event={ev} busy={busy} compact onRsvp={(s) => reply(ev, s)} />
  ));
}

function MessageCard({ message, expanded, onToggle, onShowImages, onUnlocked, onScreen, reader }) {
  const [pgpScan, setPgpScan] = useState({ trackers: 0, hasRemote: false, names: [] });
  const [pgpShown, setPgpShown] = useState(false);
  const [viewing, setViewing] = useState(-1);
  const remoteShown = message.pgp ? pgpShown : message._imagesShown;
  const hasBlocked = message.pgp
    ? pgpScan.hasRemote && !pgpShown
    : !remoteShown && htmlHasBlockedImages(message.bodyHtml);
  const trackers = Math.max(message.trackersBlocked || 0, pgpScan.trackers);
  const trackerNames = message.trackerNames?.length ? message.trackerNames : pgpScan.names;
  const shownAttachments = (message.attachments || []).filter(
    (a) => !message.bodyHtml?.includes(`/api/attachments/${a.id}/inline`),
  );
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
        <SenderAvatar from={message.from} auth={message.authStatus} />
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
          {message.opens && (
            <Tooltip
              content={
                <div className="em-opens-tip">
                  <strong>
                    {message.opens.opens
                      ? `Opened ${message.opens.opens} ${message.opens.opens === 1 ? "time" : "times"}`
                      : message.opens.autoOpens
                        ? "Maybe opened"
                        : "Sent, not opened yet"}
                  </strong>
                  {message.opens.opens > 1 && <span>First {fullDate(message.opens.firstOpenAt)}</span>}
                  {message.opens.lastOpenAt && (
                    <span>
                      {message.opens.opens > 1 ? "Last" : "At"} {fullDate(message.opens.lastOpenAt)}
                    </span>
                  )}
                  {message.opens.autoOpens > 0 && (
                    <span>
                      {message.opens.autoOpens} automatic{" "}
                      {message.opens.autoOpens === 1 ? "load" : "loads"} by a privacy proxy or scanner
                    </span>
                  )}
                </div>
              }
            >
              <span
                className={`em-msg-opens${message.opens.opens ? " is-open" : ""}`}
                aria-label={
                  message.opens.opens ? "Opened" : message.opens.autoOpens ? "Maybe opened" : "Sent"
                }
              >
                {message.opens.opens || message.opens.autoOpens ? (
                  <Checks size={16} weight="bold" />
                ) : (
                  <Check size={16} weight="bold" />
                )}
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
          {message.folder === "screener" && (
            <div className="em-screen-banner">
              <div className="em-screen-copy">
                <div className="em-screen-title">First message from {message.from?.address}</div>
                <div className="em-screen-text">
                  Let them in and their mail goes to your inbox from now on. Block them and it goes to spam.
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => onScreen(false)}>
                Block
              </Button>
              <Button size="sm" variant="primary" onClick={() => onScreen(true)}>
                Let in
              </Button>
            </div>
          )}
          {(message.authStatus === "fail" || message.folder === "spam") && (
            <div className="em-spoof-banner">
              <img src={spamton} className="em-spoof-image" alt="Spamton" />
              <div className="em-spoof-copy">
                {message.authStatus === "fail" ? (
                  <>
                    <div className="em-spoof-title">This message may be [[spoofed]]</div>
                    <div className="em-spoof-text">
                      The sender's identity could not be verified and may be forged. Do not trust
                      links, attachments, or any request to log in, pay, or share information in
                      this message.
                      {message.authDetail && (
                        <span className="em-spoof-detail">
                          {" "}
                          SPF {message.authDetail.spf || "none"} / DKIM{" "}
                          {message.authDetail.dkim || "none"} / DMARC{" "}
                          {message.authDetail.dmarc || "none"}
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="em-spoof-title">This message looks like [[SPAM]]</div>
                    <div className="em-spoof-text">
                      It was flagged as junk. Be careful with links, attachments, or any request to
                      log in, pay, or share information in this message.
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          {hasBlocked && (
            <div className="em-images-bar">
              <ImageIcon size={15} />
              <span style={{ flex: 1 }}>Remote images blocked</span>
              <button
                type="button"
                className="em-quote-toggle"
                onClick={message.pgp ? () => setPgpShown(true) : onShowImages}
              >
                Show images
              </button>
            </div>
          )}
          {trackers > 0 && (
            <Tooltip content="Hidden images used to track when you open an email were removed and cannot load.">
              <div className="em-tracker-bar">
                <ShieldCheck size={15} weight="fill" />
                <span>
                  Blocked {trackers} tracking {trackers === 1 ? "pixel" : "pixels"}
                  {trackerNames.length > 0 && ` from ${trackerNames.join(", ")}`}
                </span>
              </div>
            </Tooltip>
          )}
          {(message.attachments || []).some(
            (a) => /^text\/calendar/i.test(a.mime || "") || /\.ics$/i.test(a.filename || ""),
          ) && <InviteCard messageId={message.id} />}
          {message.unsubscribe && !reader && <UnsubscribeBar message={message} />}
          {message.pgp ? (
            <PgpBody
              message={message}
              onUnlocked={onUnlocked}
              allowRemote={pgpShown}
              onScan={(t, r, n) => setPgpScan({ trackers: t, hasRemote: r, names: n })}
            />
          ) : message.bodyHtml ? (
            <LetterBody html={message.bodyHtml} allowRemote={!!remoteShown} />
          ) : (
            <PlainBody text={message.bodyText} />
          )}
          {shownAttachments.length > 0 && (
            <div className="em-att-row">
              {shownAttachments.map((a, i) => (
                <Attachment key={a.id} att={a} onOpen={() => setViewing(i)} />
              ))}
            </div>
          )}
          <AttViewer list={shownAttachments} index={viewing} onIndex={setViewing} onClose={() => setViewing(-1)} />
        </div>
      )}
    </div>
  );
}

function QuickReply({ store, last, onReply, onForward, onSent }) {
  const { user, thread, reloadThread, openMessage } = store;
  const [text, setText] = useState("");
  const [html, setHtml] = useState("");
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [sending, setSending] = useState(false);
  const [pickSendAt, setPickSendAt] = useState(false);
  const [atts, setAtts] = useState([]);
  const [dropImages, setDropImages] = useState(null);
  const [recipKey, setRecipKey] = useState(null);
  const [open, setOpen] = useState(false);
  const editorRef = useRef(null);
  const fileInput = useRef(null);
  const ownKeyRef = useRef(null);

  const selves = new Set(
    sendIdentities(user)
      .map((a) => a.address)
      .filter(Boolean)
      .map((a) => a.toLowerCase()),
  );
  const lastExternalSender =
    [...thread.messages]
      .reverse()
      .find((m) => m.from?.address && !selves.has(m.from.address.toLowerCase())) || last;
  const replyTo = lastExternalSender.from?.address;
  const replyName = lastExternalSender.from?.name || replyTo || "sender";

  const addresses = sendIdentities(user);
  const [fromPick, setFromPick] = useState("");
  const fromAddr =
    fromPick && addresses.some((a) => a.address === fromPick)
      ? fromPick
      : pickFromAddress(lastExternalSender, user);

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
  const pgpDefault = user.settings?.pgpDefault === true;
  const [manualKey, setManualKey] = useState("");
  const effectiveKey =
    recipKey || (/-----BEGIN PGP PUBLIC KEY BLOCK-----/.test(manualKey) ? manualKey.trim() : null);
  const canEncrypt = !!effectiveKey && !ccAddrs.length && !atts.length;

  async function uploadFiles(files) {
    for (const file of files) {
      const tmpId = `pending-${Math.random()}`;
      const thumb = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
      setAtts((p) => [
        ...p,
        { id: tmpId, filename: file.name, size: file.size, pending: true, thumb },
      ]);
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
    setOpen(false);
    editorRef.current?.commands.clearContent();
  }

  async function saveManualKey() {
    const key = manualKey.trim();
    if (!replyTo || !key) return;
    try {
      await api.addPgpKey(replyTo, key);
      setRecipKey(key);
      setManualKey("");
      notify("Key saved", `Saved ${replyName}'s key to your keyring.`, "success");
    } catch (err) {
      notifyError(err);
    }
  }

  async function send(sendAt, doEncrypt) {
    const ed = editorRef.current?.isDestroyed === false ? editorRef.current : null;
    ed?.commands.linkifyAll();
    const liveHtml = ed ? ed.getHTML() : html;
    const body = (ed ? ed.getText() : text).trim();
    const filled = hasBodyContent(liveHtml, body);
    if ((!filled && !atts.length) || !replyTo) return;
    const e2e = doEncrypt && canEncrypt;
    setSending(true);
    const subj = lastExternalSender.subject || "";
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
      if (e2e) {
        if (!ownKeyRef.current && user.pgpEnabled) {
          const own = await api.getPgp();
          ownKeyRef.current = own?.publicKey || null;
        }
        const keys = [effectiveKey, ownKeyRef.current].filter(Boolean);
        let armored;
        try {
          armored = await pgp.encryptFor(keys, body);
        } catch {
          notify("Cannot encrypt", "That public key could not be read.", "warning");
          setSending(false);
          return;
        }
        payload = { ...base, pgp: true, text: armored };
      } else {
        payload = {
          ...base,
          text: body,
          html: filled ? liveHtml : "",
          attachmentIds: atts.filter((a) => !a.pending).map((a) => a.id),
        };
      }

      if (!sendAt) {
        const undoMs = Math.min(120, Math.max(0, Number(user.settings?.undoSend) || 0)) * 1000;
        const optimistic = {
          id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          threadId: thread.threadId,
          folder: "sent",
          from: {
            address: fromAddr,
            name:
              addresses.find((a) => a.address === fromAddr)?.displayName ||
              user.displayName ||
              user.username,
          },
          to: [{ address: replyTo, name: "" }],
          cc: ccAddrs.map((a) => ({ address: a, name: "" })),
          subject: base.subject,
          snippet: body.replace(/\s+/g, " ").trim().slice(0, 140),
          bodyText: body,
          bodyHtml: !e2e && filled ? expandHtmlBlocks(liveHtml) : null,
          hasHtml: !e2e && filled ? 1 : 0,
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
    (hasBodyContent(html, text) || atts.length > 0) &&
    !!replyTo &&
    !atts.some((a) => a.pending);
  const mainDisabled = !canSend || (pgpDefault && !canEncrypt);

  useEffect(() => {
    if (open) return;
    const onKey = (e) => {
      if (e.key !== "r" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest?.("input, textarea, [contenteditable=true]")) return;
      e.preventDefault();
      setOpen(true);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open]);

  const me = user.avatarUrl ? (
    <img className="em-avatar em-avatar-img em-tl-me" src={user.avatarUrl} alt="" />
  ) : (
    <span className="em-avatar em-tl-me">{initials({ name: user.displayName, address: user.address })}</span>
  );

  if (!open && !hasBodyContent(html, text) && !atts.length) {
    return (
      <div className="em-replybar">
        {me}
        <div className="em-replybar-box">
        <button type="button" className="em-replybar-main" onClick={() => setOpen(true)}>
          <ArrowBendUpLeft size={16} />
          <span>Reply to {replyName}</span>
          <kbd className="em-kbd-hint">R</kbd>
        </button>
        <button type="button" className="em-replybar-chip" onClick={() => onReply(last, "replyAll")}>
          Reply all
        </button>
        <button type="button" className="em-replybar-chip" onClick={() => onForward(last)}>
          Forward
        </button>
        </div>
      </div>
    );
  }

  return (
    <div className="em-replybar is-open">
      {me}
    <div
      className="em-quickreply"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !mainDisabled && !sending) {
          e.preventDefault();
          send(undefined, pgpDefault);
        }
        if (e.key === "Escape" && !hasBodyContent(html, text) && !atts.length) setOpen(false);
      }}
    >
      <div className="em-reply-head">
        <ArrowBendUpLeft size={16} className="em-reply-head-icon" />
        <span className="em-reply-head-to">Reply to {replyName}</span>
        <span className="em-reply-head-from">
          from
          {addresses.length > 1 ? (
            <select aria-label="From address" value={fromAddr} onChange={(e) => setFromPick(e.target.value)}>
              {addresses.map((a) => (
                <option key={a.address} value={a.address}>
                  {a.address}
                </option>
              ))}
            </select>
          ) : (
            <span>{fromAddr}</span>
          )}
        </span>
      </div>
      {pgpDefault && (
        <div className="em-encrypt-box">
          {effectiveKey ? (
            <div className="em-encrypt-status">
              <Lock size={13} weight="fill" /> Encrypted to {replyName}
              {(ccAddrs.length > 0 || atts.length > 0) && (
                <span className="em-encrypt-warn"> · remove Cc/attachments to encrypt</span>
              )}
              {!recipKey && manualKey.trim() && (
                <button
                  type="button"
                  className="em-linkbtn em-encrypt-save"
                  onClick={saveManualKey}
                >
                  Save to keyring
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="em-encrypt-status">
                Paste {replyName}'s PGP public key to encrypt for them
              </div>
              <textarea
                className="em-textarea em-encrypt-key"
                placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"
                value={manualKey}
                onChange={(e) => setManualKey(e.target.value)}
              />
            </>
          )}
        </div>
      )}
      {showCc && (
        <input
          className="em-quickreply-cc"
          aria-label="Cc"
          placeholder="Cc"
          value={cc}
          onChange={(e) => setCc(e.target.value)}
        />
      )}
      <Suspense fallback={<div className="em-editor-loading" />}>
        <RichEditor
          placeholder={
            pgpDefault && canEncrypt ? "Write an encrypted reply" : "Write a reply"
          }
          onUpdate={({ html: h, text: t }) => {
            setHtml(h);
            setText(t);
          }}
          onEditorReady={(ed) => {
            editorRef.current = ed;
            requestAnimationFrame(() => !ed.isDestroyed && ed.commands.focus("end"));
          }}
          onFiles={handleFiles}
          onPickImage={() => fileInput.current?.click()}
        />
      </Suspense>
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
           
            variant="primary"
            icon={pgpDefault ? Lock : PaperPlaneTilt}
            loading={sending}
            disabled={mainDisabled}
            onClick={() => send(undefined, pgpDefault)}
          >
            {pgpDefault ? "Send encrypted" : "Send"}
          </Button>
          <DropdownMenu>
            <DropdownMenu.Trigger
              render={(p) => (
                <Button
                  {...p}
                  className="em-split-caret"
                 
                  variant="primary"
                  shape="square"
                  aria-label="More send options"
                  icon={CaretDown}
                />
              )}
            />
            <DropdownMenu.Content style={{ zIndex: 200 }}>
              {pgpDefault && (
                <DropdownMenu.Item icon={PaperPlaneTilt} onClick={() => send(undefined, false)}>
                  Send without encryption
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Item icon={ArrowBendUpLeft} onClick={() => onReply(last, "replyAll")}>
                Reply all
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              {sendLaterPresets().map((p) => (
                <DropdownMenu.Item key={p.key} onClick={() => send(p.sendAt, pgpDefault)}>
                  {p.label}
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Item icon={CalendarBlank} onClick={() => setPickSendAt(true)}>
                Pick date &amp; time
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu>
        </div>
        <SendAtDialog
          open={pickSendAt}
          onClose={() => setPickSendAt(false)}
          onConfirm={(ts) => {
            setPickSendAt(false);
            send(ts, pgpDefault);
          }}
        />
        <Button
         
          variant="ghost"
          shape="square"
          aria-label="Attach files"
          icon={Paperclip}
          onClick={() => fileInput.current?.click()}
        />
        {!showCc && (
          <Button variant="ghost" onClick={() => setShowCc(true)}>
            Cc
          </Button>
        )}
        <Button
          className="em-quickreply-discard"
         
          variant="ghost"
          shape="square"
          aria-label="Discard reply"
          icon={Trash}
          onClick={clearReply}
        />
      </div>
    </div>
    </div>
  );
}

function BackBar({ onBack, label }) {
  return (
    <div className="em-reader-topbar">
      <Tooltip content={`Back to ${label}`}>
        <Button size="sm" variant="ghost" shape="square" icon={ArrowLeft} onClick={onBack} aria-label={`Back to ${label}`} />
      </Tooltip>
    </div>
  );
}

export function ThreadView({ store, onReply, onForward, onBack, onSent, onStep, stepState }) {
  const {
    user,
    thread,
    threadLoading,
    openId,
    view,
    messages,
    toggleStar,
    moveMessage,
    moveToFolder,
    userFolders,
    snooze,
    setReadState,
    deleteForever,
    setThread,
  } = store;
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [showAll, setShowAll] = useState(false);
  useEffect(() => setShowAll(false), [thread?.threadId]);
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
        <div className="em-thread">
          <div className="em-thread-inner">
            <h1 className="em-thread-subject em-display">{listItem?.subject || "\u00a0"}</h1>
            <div className="em-msg em-msg-ghost">
              <div className="em-msg-head">
                <div className="em-msg-from">{listItem?.from?.name || listItem?.from?.address}</div>
              </div>
              <div className="em-msg-body">
                {listItem?.snippet && !listItem.pgp ? (
                  <p className="em-msg-shell">{listItem.snippet}</p>
                ) : (
                  <>
                    <div className="em-ghost-line" />
                    <div className="em-ghost-line" />
                    <div className="em-ghost-line em-ghost-short" />
                  </>
                )}
              </div>
            </div>
          </div>
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

  function triggerDownload(href, filename, revoke) {
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (revoke) URL.revokeObjectURL(href);
  }

  async function downloadEml(m) {
    const safe =
      String(m.subject || "message")
        .replace(/[^\w.\- ]+/g, "_")
        .trim()
        .slice(0, 80) || "message";
    const filename = `${safe}.eml`;

    if (m.pgp && pgp.getUnlocked()) {
      const END = "-----END PGP MESSAGE-----";
      try {
        const res = await fetch(api.emlUrl(m.id), { credentials: "same-origin" });
        if (!res.ok) throw new Error(`raw fetch ${res.status}`);
        const armored = await res.text();
        const start = armored.indexOf("-----BEGIN PGP MESSAGE-----");
        const end = armored.indexOf(END);
        if (start !== -1 && end !== -1) {
          const block = armored.slice(start, end + END.length);
          const decoded = await pgp.decryptBytes(block);
          const prefix = armored.slice(0, start).trim();
          const blob = prefix
            ? new Blob(
                [armored.slice(0, start), new TextDecoder().decode(decoded), armored.slice(end + END.length)],
                { type: "message/rfc822" },
              )
            : new Blob([decoded], { type: "message/rfc822" });
          triggerDownload(URL.createObjectURL(blob), filename, true);
          return;
        }
      } catch (err) {
        notify("Download", "Could not decrypt; downloading encrypted copy", "error");
      }
    }

    triggerDownload(api.emlUrl(m.id), filename, false);
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

  if (listItem?.folder === "newsletters" || (!listItem && last?.folder === "newsletters")) {
    const m = last;
    const words = String(m.bodyText || m.snippet || "").split(/\s+/).length;
    const minutes = Math.max(1, Math.round(words / 230));
    return (
      <div className="em-pane em-pane-reader em-news">
        <div className="em-reader-topbar">
          <Button
            className="em-reader-back"
            size="sm"
            variant="ghost"
            shape="square"
            icon={ArrowLeft}
            onClick={onBack}
            aria-label={`Back to ${backLabel}`}
          />
          <div className="em-spacer" />
          <Tooltip content="Previous issue">
            <Button
              size="sm"
              variant="ghost"
              shape="square"
              aria-label="Previous issue"
              icon={CaretUp}
              disabled={!stepState?.prev}
              onClick={() => onStep?.(-1)}
            />
          </Tooltip>
          <Tooltip content="Next issue">
            <Button
              size="sm"
              variant="ghost"
              shape="square"
              aria-label="Next issue"
              icon={CaretDown}
              disabled={!stepState?.next}
              onClick={() => onStep?.(1)}
            />
          </Tooltip>
          <Tooltip content={headerItem.isStarred ? "Unstar" : "Star"}>
            <Button
              size="sm"
              variant="ghost"
              shape="square"
              aria-label={headerItem.isStarred ? "Unstar" : "Star"}
              className={headerItem.isStarred ? "em-star-active" : ""}
              icon={<Star weight={headerItem.isStarred ? "fill" : "regular"} />}
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
        </div>
        <article className="em-news-page">
          <header className="em-news-mast">
            <SenderAvatar from={m.from} auth={m.authStatus} />
            <span className="em-news-sender">{m.from?.name || m.from?.address}</span>
            <span className="em-news-meta">
              {fullDate(m.date)}, {minutes} min read
            </span>
          </header>
          <h1 className="em-news-title">{subject}</h1>
          <MessageCard
            message={m}
            reader
            expanded
            onToggle={() => {}}
            onShowImages={() => showImages(m)}
            onUnlocked={() => setPgpTick((t) => t + 1)}
            onScreen={() => {}}
          />
          <footer className="em-news-foot">
            {m.unsubscribe && <UnsubscribeBar message={m} />}
            {stepState?.next && (
              <Button
                variant="secondary"
                icon={CaretDown}
                onClick={() => {
                  onStep?.(1, () => moveMessage(headerItem, "archive"));
                }}
              >
                Archive and read next
              </Button>
            )}
          </footer>
        </article>
      </div>
    );
  }

  return (
    <div className="em-pane em-pane-reader">
      <div className="em-reader-topbar">
        <Button
          className="em-reader-back"
          size="sm"
          variant="ghost"
          shape="square"
          icon={ArrowLeft}
          onClick={onBack}
          aria-label={`Back to ${backLabel}`}
        />
        <div className="em-spacer" />
        <Tooltip content={headerItem.isStarred ? "Unstar" : "Star"}>
          <Button
            size="sm"
            variant="ghost"
            shape="square"
            aria-label={headerItem.isStarred ? "Unstar" : "Star"}
            className={headerItem.isStarred ? "em-star-active" : ""}
            icon={<Star weight={headerItem.isStarred ? "fill" : "regular"} />}
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
            {(userFolders || []).length > 0 && (
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger icon={Folder}>Move to folder</DropdownMenu.SubTrigger>
                <DropdownMenu.SubContent>
                  {userFolders.map((f) => (
                    <DropdownMenu.Item key={f.id} onClick={() => moveToFolder(headerItem, f.id)}>
                      <span className="em-label-dot" style={{ background: f.color }} />
                      {f.name}
                    </DropdownMenu.Item>
                  ))}
                  {headerItem.folderId && (
                    <>
                      <DropdownMenu.Separator />
                      <DropdownMenu.Item onClick={() => moveMessage(headerItem, "inbox")}>
                        Remove from folder
                      </DropdownMenu.Item>
                    </>
                  )}
                </DropdownMenu.SubContent>
              </DropdownMenu.Sub>
            )}
            <DropdownMenu.Separator />
            <DropdownMenu.Item icon={Printer} onClick={() => printMessage(last)}>
              Print
            </DropdownMenu.Item>
            <DropdownMenu.Item icon={FileArrowDown} onClick={() => downloadEml(last)}>
              Download .eml
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            {headerItem.folder !== "spam" && (
              <DropdownMenu.Item icon={Warning} onClick={() => moveMessage(headerItem, "spam")}>
                Move to spam
              </DropdownMenu.Item>
            )}
            {headerItem.folder !== "inbox" && (
              <DropdownMenu.Item icon={Tray} onClick={() => moveMessage(headerItem, "inbox")}>
                Move to inbox
              </DropdownMenu.Item>
            )}
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
          {msgs.map((m, i) => {
            const folded = !showAll && msgs.length > 3 && i > 0 && i < msgs.length - 2;
            if (folded && i > 1) return null;
            if (folded)
              return (
                <button key="more" type="button" className="em-tl-more" onClick={() => setShowAll(true)}>
                  <svg className="em-tl-curl" viewBox="0 0 40 28" aria-hidden="true">
                    <path d="M3 0v10c0 6 2 10 7 10 4 0 6-3 5-6-1-3-5-3-7 0-3 5-1 12 8 12h22" />
                  </svg>
                  Show {msgs.length - 3} earlier
                </button>
              );
            return (
              <MessageCard
                key={m.id}
                message={m}
                expanded={expandedIds.has(m.id)}
                onToggle={() => toggle(m.id)}
                onShowImages={() => showImages(m)}
                onUnlocked={() => setPgpTick((t) => t + 1)}
                onScreen={(allow) => {
                  moveMessage(m, allow ? "inbox" : "spam");
                  api
                    .screenSender(allow, m.from?.address, m.from?.name)
                    .then(() => notify(allow ? "Sender let in" : "Sender blocked", "", "success"))
                    .catch(notifyError);
                }}
              />
            );
          })}
          {headerItem.folder !== "drafts" && (
            <QuickReply
              store={store}
              last={last}
              onReply={onReply}
              onForward={onForward}
              onSent={onSent}
            />
          )}
        </div>
      </div>
    </div>
  );
}
