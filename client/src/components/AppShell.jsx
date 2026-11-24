import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import * as pgp from "../pgp.js";
import { useMailStore } from "../store.js";
import { notify, notifyError } from "../toast.js";
import {
  FOLDER_LABELS,
  groupThreads,
  pickFromAddress,
  recipientLine,
  sendIdentities,
} from "../util.js";
import {
  Archive,
  ArrowBendUpLeft,
  CalendarBlank,
  CalendarPlus,
  ClockCountdown,
  EnvelopeSimple,
  Folder,
  Gear,
  Keyboard,
  PencilSimple,
  Star,
  Tag,
  Trash,
} from "@phosphor-icons/react";
import { CommandPalette } from "./CommandPalette.jsx";
import { Compose } from "./Compose.jsx";
import { E2EPrompt, shouldPromptE2E } from "./E2EPrompt.jsx";
import { MailSidebar } from "./MailSidebar.jsx";
import { MessageList } from "./MessageList.jsx";
import { ScheduledModal } from "./ScheduledView.jsx";
import { Settings } from "./Settings.jsx";

const Admin = lazy(() => import("./Admin.jsx").then((m) => ({ default: m.Admin })));
const CalendarView = lazy(() =>
  import("./CalendarView.jsx").then((m) => ({ default: m.CalendarView })),
);
const Shortcuts = lazy(() => import("./Shortcuts.jsx").then((m) => ({ default: m.Shortcuts })));
const ThreadView = lazy(() => import("./ThreadView.jsx").then((m) => ({ default: m.ThreadView })));

const readerFallback = <div className="em-reader-loading" />;
setTimeout(() => {
  import("./ThreadView.jsx");
  import("./RichEditor.jsx");
  import("./CalendarView.jsx");
}, 800);

const PATH_FOLDERS = ["inbox", "screener", "newsletters", "sent", "drafts", "archive", "spam", "trash"];

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
  const [screen, setScreen] = useState(() =>
    window.location.pathname.startsWith("/calendar") ? "calendar" : "mail",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scheduledOpen, setScheduledOpen] = useState(false);
  const [e2ePrompt, setE2ePrompt] = useState(() => shouldPromptE2E(initialUser));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newEventTick, setNewEventTick] = useState(0);
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
    const p = screen === "calendar" ? "/calendar" : pathFor(store.view, store.openId);
    if (window.location.pathname !== p) {
      window.history.replaceState(window.history.state, "", p);
    }
  }, [store.view, store.openId, screen]);

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
      if (composeOpen || settingsOpen || paletteOpen) return;

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
        if (e.key === "i") {
          setScreen("mail");
          store.goView({ kind: "folder", folder: "inbox" });
        } else if (e.key === "c") setScreen("calendar");
        return;
      }
      if (e.key === "g") {
        gPressed.current = true;
        setTimeout(() => {
          gPressed.current = false;
        }, 800);
        return;
      }
      if (screen === "calendar") return;
      if (e.key === "c") {
        e.preventDefault();
        openCompose();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      const openIdx = threads.findIndex((t) => t.id === store.openId || t._members?.some((m) => m.id === store.openId));
      const at = openIdx >= 0 ? openIdx : cursor;
      if (e.key === "j") {
        const next = Math.min(threads.length - 1, at + 1);
        setCursor(next);
        openByIndex(next);
        return;
      }
      if (e.key === "k") {
        const next = Math.max(0, at - 1);
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
      else if (e.key === "r") return;
      else if (e.key === "u") {
        store.setReadState(open, false);
        closeReader();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openMessage = store.messages.find((m) => m.id === store.openId);
  const commands = useMemo(() => {
    const go = (view) => () => {
      setScreen("mail");
      store.goView(view);
    };
    const list = [
      { id: "compose", label: "Write a message", icon: PencilSimple, keys: "c", run: () => openCompose() },
      {
        id: "new-event",
        label: "New event",
        keywords: ["calendar", "meeting", "schedule"],
        icon: CalendarPlus,
        run: () => {
          setScreen("calendar");
          setNewEventTick((t) => t + 1);
        },
      },
      { id: "calendar", label: "Go to calendar", icon: CalendarBlank, keys: "g c", run: () => setScreen("calendar") },
    ];
    for (const key of ["inbox", "screener", "newsletters", "starred", "sent", "drafts", "snoozed", "archive", "spam", "trash"]) {
      if (key === "screener" && !user.settings?.screenSenders) continue;
      if (key === "newsletters" && user.settings?.newsletterFolder === false) continue;
      list.push({
        id: `go:${key}`,
        label: `Go to ${FOLDER_LABELS[key]}`,
        icon: key === "starred" ? Star : EnvelopeSimple,
        keys: key === "inbox" ? "g i" : undefined,
        run: go(key === "starred" ? { kind: "starred" } : { kind: "folder", folder: key }),
      });
    }
    for (const l of store.labels || [])
      list.push({ id: `label:${l.id}`, label: `Go to label ${l.name}`, icon: Tag, run: go({ kind: "label", labelId: l.id }) });
    for (const f of store.userFolders || [])
      list.push({ id: `folder:${f.id}`, label: `Go to folder ${f.name}`, icon: Folder, run: go({ kind: "userfolder", folderId: f.id }) });
    if (openMessage && screen === "mail") {
      list.unshift(
        { id: "reply", label: "Reply", icon: ArrowBendUpLeft, keys: "r", run: () => startReply(openMessage) },
        { id: "reply-all", label: "Reply all", icon: ArrowBendUpLeft, run: () => startReply(openMessage, "replyAll") },
        { id: "archive", label: "Archive this conversation", icon: Archive, keys: "e", run: () => store.moveMessage(openMessage, "archive") },
        { id: "trash", label: "Move this conversation to trash", icon: Trash, keys: "#", run: () => store.moveMessage(openMessage, "trash") },
        { id: "star", label: openMessage.isStarred ? "Remove star" : "Star this message", icon: Star, keys: "s", run: () => store.toggleStar(openMessage) },
      );
    }
    list.push(
      { id: "scheduled", label: "Show scheduled messages", icon: ClockCountdown, run: () => setScheduledOpen(true) },
      { id: "settings", label: "Open settings", keywords: ["preferences"], icon: Gear, run: () => setSettingsOpen(true) },
      { id: "shortcuts", label: "Show keyboard shortcuts", icon: Keyboard, keys: "?", run: () => setShowHelp(true) },
    );
    return list;
  }, [store, user, openMessage, screen, openCompose]);

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
          calendarActive={screen === "calendar"}
          onOpenCalendar={() => {
            setSidebarOpen(false);
            setScreen("calendar");
          }}
          onNavigate={() => {
            setSidebarOpen(false);
            setScreen("mail");
          }}
        />
      </div>

      {screen === "calendar" ? (
        <Suspense fallback={readerFallback}>
          <CalendarView onMenu={() => setSidebarOpen(true)} newEventTick={newEventTick} />
        </Suspense>
      ) : screen === "admin" ? (
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

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
        onSearch={(q) => {
          setScreen("mail");
          store.goView({ kind: "search", q });
        }}
        onWrite={(address) => openCompose({ to: `${address}, ` })}
      />

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
