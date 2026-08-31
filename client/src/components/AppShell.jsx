import { Loader } from "@cloudflare/kumo";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import * as pgp from "../pgp.js";
import { useMailStore } from "../store.js";
import { notify, notifyError } from "../toast.js";
import { groupThreads, pickFromAddress, recipientLine, sendIdentities } from "../util.js";
import { Compose } from "./Compose.jsx";
import { E2EPrompt, shouldPromptE2E } from "./E2EPrompt.jsx";
import { MailSidebar } from "./MailSidebar.jsx";
import { MessageList } from "./MessageList.jsx";
import { ScheduledModal } from "./ScheduledView.jsx";
import { Settings } from "./Settings.jsx";

const Admin = lazy(() => import("./Admin.jsx").then((m) => ({ default: m.Admin })));
const Shortcuts = lazy(() => import("./Shortcuts.jsx").then((m) => ({ default: m.Shortcuts })));
const ThreadView = lazy(() => import("./ThreadView.jsx").then((m) => ({ default: m.ThreadView })));

const readerFallback = (
  <div className="em-reader-loading">
    <Loader size="sm" />
  </div>
);

const PATH_FOLDERS = ["inbox", "sent", "drafts", "archive", "spam", "trash"];

function pathFor(view, openId) {
  if (openId) return `/message/${openId}`;
  if (!view) return "/inbox";
  if (view.kind === "starred") return "/starred";
  if (view.kind === "label") return `/label/${view.labelId}`;
  if (view.kind === "userfolder") return `/folder/${view.folderId}`;
  if (view.kind === "search") return `/search/${encodeURIComponent(view.q)}`;
  return `/${view.folder || "inbox"}`;
}

function parsePath(pathname) {
  const seg = pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (seg[0] === "message" && seg[1]) return { openId: decodeURIComponent(seg[1]) };
  if (seg[0] === "label" && seg[1])
    return { view: { kind: "label", labelId: decodeURIComponent(seg[1]) } };
  if (seg[0] === "folder" && seg[1])
    return { view: { kind: "userfolder", folderId: decodeURIComponent(seg[1]) } };
  if (seg[0] === "search" && seg[1])
    return { view: { kind: "search", q: decodeURIComponent(seg.slice(1).join("/")) } };
  if (seg[0] === "starred") return { view: { kind: "starred" } };
  if (PATH_FOLDERS.includes(seg[0])) return { view: { kind: "folder", folder: seg[0] } };
  return { view: { kind: "folder", folder: "inbox" } };
}

async function quotableText(msg) {
  if (!msg.pgp) return msg.bodyText || "";
  if (!pgp.getUnlocked()) return "";
  try {
    const raw = await pgp.decryptArmored(msg.bodyText || "");
    if (msg.hasHtml && raw.trimStart().startsWith("<")) {
      const withBreaks = raw.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6])>/gi, "\n");
      const doc = new DOMParser().parseFromString(withBreaks, "text/html");
      return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
    }
    return raw;
  } catch {
    return "";
  }
}

function quoteBody(msg, text) {
  const date = new Date(msg.date).toLocaleString();
  const who = msg.from?.name || msg.from?.address || "someone";
  const quoted = (text || "")
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  return `\n\nOn ${date}, ${who} wrote:\n${quoted}`;
}

export function AppShell({ initialUser, palette, onSetPalette }) {
  const store = useMailStore(initialUser);
  const { user, setUser } = store;
  useEffect(() => {
    try {
      localStorage.setItem("em-user", JSON.stringify(user));
    } catch {}
  }, [user]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeInitial, setComposeInitial] = useState(null);
  const [screen, setScreen] = useState("mail");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scheduledOpen, setScheduledOpen] = useState(false);
  const [e2ePrompt, setE2ePrompt] = useState(() => shouldPromptE2E(initialUser));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const threads = useMemo(() => groupThreads(store.messages), [store.messages]);
  const [undoBar, setUndoBar] = useState(null);
  const searchRef = useRef(null);
  const gPressed = useRef(false);
  const undoTimer = useRef(null);

  const openCompose = useCallback(
    (initial) => {
      let init = initial || null;
      if (!init?.from && store.view?.kind === "userfolder") {
        const f = (store.userFolders || []).find((x) => x.id === store.view.folderId);
        if (f?.alias) init = { ...(init || {}), from: f.alias };
      }
      setComposeInitial(init);
      setComposeOpen(true);
    },
    [store.view, store.userFolders],
  );

  const openDraft = useCallback(
    async (item) => {
      try {
        const { message: d } = await api.message(item.id);
        const chips = (list) => {
          const addrs = (list || []).map((t) => t.address).filter(Boolean);
          return addrs.length ? `${addrs.join(", ")}, ` : "";
        };
        openCompose({
          draftId: item.id,
          to: chips(d.to),
          cc: chips(d.cc),
          bcc: chips(d.bcc),
          subject: d.subject || "",
          body: d.bodyText || "",
          html: d.bodyHtml || "",
        });
      } catch (e) {
        notifyError(e);
      }
    },
    [openCompose],
  );

  useEffect(() => {
    const mailto = new URLSearchParams(window.location.search).get("mailto");
    if (!mailto) return;
    const raw = mailto.replace(/^mailto:/i, "");
    const qIdx = raw.indexOf("?");
    const qs = new URLSearchParams(qIdx === -1 ? "" : raw.slice(qIdx + 1));
    openCompose({
      to: decodeURIComponent(qIdx === -1 ? raw : raw.slice(0, qIdx)),
      cc: qs.get("cc") || "",
      subject: qs.get("subject") || "",
      body: qs.get("body") || "",
    });
    const url = new URL(window.location.href);
    url.searchParams.delete("mailto");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, [openCompose]);

  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const parsed = parsePath(window.location.pathname);
    if (parsed.openId) {
      api
        .message(parsed.openId)
        .then(
          (d) =>
            d?.message && store.openMessage({ id: d.message.id, threadId: d.message.threadId }),
        )
        .catch(() => {});
    } else if (parsed.view && !(parsed.view.kind === "folder" && parsed.view.folder === "inbox")) {
      store.goView(parsed.view);
    }
  }, [store]);

  useEffect(() => {
    const p = pathFor(store.view, store.openId);
    if (window.location.pathname !== p) {
      window.history.replaceState(window.history.state, "", p);
    }
  }, [store.view, store.openId]);

  async function hydrate(msg) {
    if (msg.bodyText !== undefined && msg.rfcMessageId) return msg;
    try {
      const { message } = await api.message(msg.id);
      return message || msg;
    } catch {
      return msg;
    }
  }

  async function startReply(item, kind) {
    const msg = await hydrate(item);
    const re = /^re:/i.test(msg.subject || "") ? msg.subject : `Re: ${msg.subject || ""}`;
    const toList =
      kind === "replyAll"
        ? [msg.from?.address, ...(msg.to || []).map((t) => t.address)]
        : [msg.from?.address];
    const ccList = kind === "replyAll" ? (msg.cc || []).map((c) => c.address) : [];
    const from = pickFromAddress(msg, user);
    const selfSet = new Set(
      sendIdentities(user)
        .map((a) => a.address?.toLowerCase())
        .filter(Boolean),
    );
    const notSelf = (a) => a && !selfSet.has(a.toLowerCase());
    const dedup = [...new Set(toList.filter(notSelf))];
    openCompose({
      from,
      to: dedup.join(", "),
      cc: ccList.filter(notSelf).join(", "),
      subject: re,
      body: quoteBody(msg, await quotableText(msg)),
      quoted: true,
      inReplyTo: msg.rfcMessageId,
      references: [...(msg.references || []), msg.rfcMessageId].filter(Boolean),
    });
  }

  async function startForward(item) {
    const msg = await hydrate(item);
    const fw = /^fwd:/i.test(msg.subject || "") ? msg.subject : `Fwd: ${msg.subject || ""}`;
    const header = `\n\n---------- Forwarded message ----------\nFrom: ${msg.from?.name || ""} <${msg.from?.address}>\nDate: ${new Date(msg.date).toLocaleString()}\nSubject: ${msg.subject}\nTo: ${recipientLine(msg.to)}\n\n${await quotableText(msg)}`;
    openCompose({ subject: fw, body: header, quoted: true });
  }

  function openByIndex(idx) {
    const item = threads[idx];
    if (!item) return;
    store.openMessage(item);
  }

  function closeReader() {
    window.history.back();
  }

  useEffect(() => {
    setCursor(-1);
  }, [store.view]);

  useEffect(() => {
    function onKey(e) {
      const tag = e.target?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable;
      if (typing) {
        if (e.key === "Escape") e.target.blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (composeOpen || settingsOpen) return;

      if (e.key === "?") {
        setShowHelp((s) => !s);
        return;
      }
      if (showHelp && e.key === "Escape") {
        setShowHelp(false);
        return;
      }
      if (gPressed.current) {
        gPressed.current = false;
        if (e.key === "i") store.goView({ kind: "folder", folder: "inbox" });
        return;
      }
      if (e.key === "g") {
        gPressed.current = true;
        setTimeout(() => {
          gPressed.current = false;
        }, 800);
        return;
      }
      if (e.key === "c") {
        openCompose();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "j") {
        const next = Math.min(threads.length - 1, cursor + 1);
        setCursor(next);
        openByIndex(next);
        return;
      }
      if (e.key === "k") {
        const next = Math.max(0, cursor - 1);
        setCursor(next);
        openByIndex(next);
        return;
      }
      const open = store.messages.find((m) => m.id === store.openId);
      if (e.key === "Enter" && cursor >= 0) {
        openByIndex(cursor);
        return;
      }
      if (!open) return;
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        closeReader();
        return;
      }
      if (e.key === "e") store.moveMessage(open, "archive");
      else if (e.key === "#") store.moveMessage(open, "trash");
      else if (e.key === "s") store.toggleStar(open);
      else if (e.key === "r") startReply(open, "reply");
      else if (e.key === "u") {
        store.setReadState(open, false);
        closeReader();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function signOut() {
    pgp.clearUnlocked();
    pgp.forgetPass();
    const res = await api.logout().catch(() => null);
    if (res?.logoutUrl) {
      window.location.href = res.logoutUrl;
      return;
    }
    setUser(null);
    window.location.reload();
  }

  function afterMutation() {
    store.reload();
    store.refreshCounts();
    store.syncNow();
  }

  async function commitHeldSend(payload, optimistic) {
    setUndoBar(null);
    try {
      const res = await api.send({ ...payload, skipUndo: true });
      store.swapOptimistic(optimistic.id, optimistic.threadId, res.id || optimistic.id);
      store.refreshCounts();
      store.syncNow();
    } catch (e) {
      store.removeOptimistic(optimistic.id, optimistic.threadId);
      notifyError(e);
    }
  }

  function onComposeSent(resp) {
    if (resp?.deferred) {
      store.addOptimistic(resp.optimistic);
      if (resp.undoMs > 0) {
        clearTimeout(undoTimer.current);
        setUndoBar({ hold: true, payload: resp.payload, optimistic: resp.optimistic });
        undoTimer.current = setTimeout(
          () => commitHeldSend(resp.payload, resp.optimistic),
          resp.undoMs,
        );
      } else {
        commitHeldSend(resp.payload, resp.optimistic);
      }
      return;
    }
    afterMutation();
    if (resp?.scheduled && resp.undoMs > 0 && resp.id) {
      clearTimeout(undoTimer.current);
      setUndoBar({ id: resp.id });
      undoTimer.current = setTimeout(() => setUndoBar(null), resp.undoMs);
    }
  }

  async function undoSend() {
    const bar = undoBar;
    clearTimeout(undoTimer.current);
    setUndoBar(null);
    if (bar?.hold) {
      store.removeOptimistic(bar.optimistic.id, bar.optimistic.threadId);
      notify("Send undone", "Your message was not sent.", "success");
      return;
    }
    if (!bar?.id) return;
    try {
      await api.cancelScheduled(bar.id);
      notify("Send undone", "", "success");
      afterMutation();
    } catch (e) {
      notifyError(e);
    }
  }

  useEffect(() => {
    return () => clearTimeout(undoTimer.current);
  }, []);

  const goBack = useCallback(() => window.history.back(), []);

  const pushed = useRef({});
  const navState = {
    reader: !!store.openId,
    compose: composeOpen,
    settings: settingsOpen,
    admin: screen === "admin",
    scheduled: scheduledOpen,
  };
  useEffect(() => {
    for (const k of Object.keys(navState)) {
      if (navState[k] && !pushed.current[k]) {
        window.history.pushState({ em: k }, "");
        pushed.current[k] = true;
      } else if (!navState[k] && pushed.current[k]) {
        pushed.current[k] = false;
      }
    }
  });

  useEffect(() => {
    function onPop() {
      if (composeOpen) return setComposeOpen(false);
      if (settingsOpen) return setSettingsOpen(false);
      if (scheduledOpen) return setScheduledOpen(false);
      if (screen === "admin") return setScreen("mail");
      if (store.openId) {
        store.closeMessage();
        setCursor(-1);
      }
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  });

  const readerOpen = !!store.openId;

  return (
    <div className="em-app">
      <div
        className={`em-sidebar-scrim${sidebarOpen ? " is-open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />
      <div className={`em-sidebar-wrap${sidebarOpen ? " is-open" : ""}`}>
        <MailSidebar
          store={store}
          onCompose={() => {
            setSidebarOpen(false);
            openCompose();
          }}
          onOpenSettings={() => {
            setSidebarOpen(false);
            setSettingsOpen(true);
          }}
          onOpenAdmin={() => {
            setSidebarOpen(false);
            setScreen("admin");
          }}
          onOpenScheduled={() => {
            setSidebarOpen(false);
            setScheduledOpen(true);
          }}
          onSignOut={signOut}
          onNavigate={() => setSidebarOpen(false)}
        />
      </div>

      {screen === "admin" ? (
        <Suspense fallback={readerFallback}>
          <Admin onBack={goBack} />
        </Suspense>
      ) : (
        <div className="em-main">
          <div className="em-column">
            {readerOpen ? (
              <Suspense fallback={readerFallback}>
                <ThreadView
                  key="reader"
                  store={store}
                  onReply={startReply}
                  onForward={startForward}
                  onBack={closeReader}
                  onSent={onComposeSent}
                />
              </Suspense>
            ) : (
              <MessageList
                key="list"
                store={store}
                threads={threads}
                cursor={cursor}
                onCursorChange={setCursor}
                searchRef={searchRef}
                onMenu={() => setSidebarOpen(true)}
                onCompose={() => openCompose()}
                onOpenDraft={openDraft}
                floatHidden={composeOpen || settingsOpen || !!e2ePrompt}
              />
            )}
          </div>
        </div>
      )}

      <Settings
        open={settingsOpen}
        user={user}
        setUser={setUser}
        palette={palette}
        onSetPalette={onSetPalette}
        onClose={goBack}
      />

      <ScheduledModal open={scheduledOpen} onClose={goBack} />

      <Compose
        open={composeOpen}
        initial={composeInitial}
        user={user}
        onClose={goBack}
        onSent={onComposeSent}
      />
      {undoBar && (
        <div className="em-undobar">
          <span className="em-undobar-text">Message sent</span>
          <button type="button" className="em-undobar-btn" onClick={undoSend}>
            Undo
          </button>
        </div>
      )}
      <Suspense fallback={null}>
        <Shortcuts open={showHelp} onClose={() => setShowHelp(false)} />
      </Suspense>
      {e2ePrompt && !user.pgpEnabled && (
        <E2EPrompt user={user} setUser={setUser} onClose={() => setE2ePrompt(false)} />
      )}
    </div>
  );
}
