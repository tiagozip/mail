import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import * as pgp from "../pgp.js";
import { useMailStore } from "../store.js";
import { recipientLine } from "../util.js";
import { Admin } from "./Admin.jsx";
import { Compose } from "./Compose.jsx";
import { E2EPrompt, shouldPromptE2E } from "./E2EPrompt.jsx";
import { MailSidebar } from "./MailSidebar.jsx";
import { MessageList } from "./MessageList.jsx";
import { Settings } from "./Settings.jsx";
import { Shortcuts } from "./Shortcuts.jsx";
import { ThreadView } from "./ThreadView.jsx";

function quoteBody(msg) {
  const date = new Date(msg.date).toLocaleString();
  const who = msg.from?.name || msg.from?.address || "someone";
  const quoted = (msg.bodyText || "")
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  return `\n\nOn ${date}, ${who} wrote:\n${quoted}`;
}

export function AppShell({ initialUser, mode, onSetMode, palette, onSetPalette }) {
  const store = useMailStore(initialUser);
  const { user, setUser } = store;
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeInitial, setComposeInitial] = useState(null);
  const [screen, setScreen] = useState("mail");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [e2ePrompt, setE2ePrompt] = useState(() => shouldPromptE2E(initialUser));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const searchRef = useRef(null);
  const gPressed = useRef(false);

  const openCompose = useCallback((initial) => {
    setComposeInitial(initial || null);
    setComposeOpen(true);
  }, []);

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

  function startReply(msg, kind) {
    const re = /^re:/i.test(msg.subject || "") ? msg.subject : `Re: ${msg.subject || ""}`;
    const toList = kind === "replyAll" ? [msg.from?.address, ...(msg.to || []).map((t) => t.address)] : [msg.from?.address];
    const ccList = kind === "replyAll" ? (msg.cc || []).map((c) => c.address) : [];
    const dedup = [...new Set(toList.filter((a) => a && a !== user.address))];
    openCompose({
      to: dedup.join(", "),
      cc: ccList.filter((a) => a !== user.address).join(", "),
      subject: re,
      body: quoteBody(msg),
      inReplyTo: msg.rfcMessageId,
      references: [...(msg.references || []), msg.rfcMessageId].filter(Boolean),
    });
  }

  function startForward(msg) {
    const fw = /^fwd:/i.test(msg.subject || "") ? msg.subject : `Fwd: ${msg.subject || ""}`;
    const header = `\n\n---------- Forwarded message ----------\nFrom: ${msg.from?.name || ""} <${msg.from?.address}>\nDate: ${new Date(msg.date).toLocaleString()}\nSubject: ${msg.subject}\nTo: ${recipientLine(msg.to)}\n\n${msg.bodyText || ""}`;
    openCompose({ subject: fw, body: header });
  }

  function openByIndex(idx) {
    const item = store.messages[idx];
    if (!item) return;
    store.openMessage(item);
  }

  function closeReader() {
    window.history.back();
  }

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
        setCursor((c) => {
          const next = Math.min(store.messages.length - 1, c + 1);
          openByIndex(next);
          return next;
        });
        return;
      }
      if (e.key === "k") {
        setCursor((c) => {
          const next = Math.max(0, c - 1);
          openByIndex(next);
          return next;
        });
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
  }

  const goBack = useCallback(() => window.history.back(), []);

  const pushed = useRef({});
  const navState = {
    reader: !!store.openId,
    compose: composeOpen,
    settings: settingsOpen,
    admin: screen === "admin",
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
      {sidebarOpen && <div className="em-sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
      <div className={`em-sidebar-wrap${sidebarOpen ? " is-open" : ""}`}>
        <MailSidebar
          store={store}
          mode={mode}
          onToggleMode={() => onSetMode(mode === "dark" ? "light" : "dark")}
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
          onSignOut={signOut}
          onNavigate={() => setSidebarOpen(false)}
        />
      </div>

      {screen === "admin" ? (
        <Admin onBack={goBack} />
      ) : (
        <div className="em-main">
          <div className="em-column">
            {readerOpen ? (
              <ThreadView
                key="reader"
                store={store}
                onReply={startReply}
                onForward={startForward}
                onBack={closeReader}
              />
            ) : (
              <MessageList
                key="list"
                store={store}
                searchRef={searchRef}
                onMenu={() => setSidebarOpen(true)}
                onCompose={() => openCompose()}
              />
            )}
          </div>
        </div>
      )}

      <Settings
        open={settingsOpen}
        user={user}
        setUser={setUser}
        mode={mode}
        onSetMode={onSetMode}
        palette={palette}
        onSetPalette={onSetPalette}
        onClose={goBack}
      />

      <Compose
        open={composeOpen}
        initial={composeInitial}
        user={user}
        onClose={goBack}
        onSent={afterMutation}
      />
      {showHelp && <Shortcuts onClose={() => setShowHelp(false)} />}
      {e2ePrompt && !user.pgpEnabled && (
        <E2EPrompt user={user} setUser={setUser} onClose={() => setE2ePrompt(false)} />
      )}
    </div>
  );
}
