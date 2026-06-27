import { Loader, Toasty, TooltipProvider } from "@cloudflare/kumo";
import { useEffect, useState } from "react";
import { api } from "./api.js";
import { AppShell } from "./components/AppShell.jsx";
import { AuthView } from "./components/AuthView.jsx";
import * as pgp from "./pgp.js";
import { toastManager } from "./toast.js";

const THEMES = ["gold", "midnight", "sakura"];

function applyPalette(palette) {
  if (THEMES.includes(palette)) {
    document.documentElement.dataset.theme = palette;
    return;
  }
  delete document.documentElement.dataset.theme;
}

export function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState(() => localStorage.getItem("em-mode") || "dark");
  const [palette, setPalette] = useState(() => localStorage.getItem("em-palette") || "plum");

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
    localStorage.setItem("em-mode", mode);
  }, [mode]);

  useEffect(() => {
    applyPalette(palette);
    localStorage.setItem("em-palette", palette);
  }, [palette]);

  useEffect(() => {
    api
      .me()
      .then((d) => {
        if (d.user) {
          setUser(d.user);
          const t = d.user.settings?.theme;
          if (t === "dark" || t === "light") setMode(t);
          const p = d.user.settings?.palette;
          if (p) setPalette(THEMES.includes(p) ? p : "plum");
          if (d.user.settings?.imagesDefault !== undefined) {
            localStorage.setItem("em-images-default", d.user.settings.imagesDefault ? "1" : "0");
          }
          const savedPass = pgp.getRememberedPass();
          if (d.user.pgpEnabled && savedPass && !pgp.getUnlocked()) {
            api
              .getPgp()
              .then((p) => p.privateKeyEnc && pgp.unlock(p.privateKeyEnc, savedPass))
              .catch(() => pgp.forgetPass());
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <TooltipProvider>
      <Toasty toastManager={toastManager}>
        {loading ? (
          <div className="em-center">
            <Loader />
          </div>
        ) : user ? (
          <AppShell
            key={user.id}
            initialUser={user}
            mode={mode}
            onSetMode={setMode}
            palette={palette}
            onSetPalette={setPalette}
          />
        ) : (
          <AuthView />
        )}
      </Toasty>
    </TooltipProvider>
  );
}
