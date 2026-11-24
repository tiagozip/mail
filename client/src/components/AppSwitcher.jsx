import { DotsNine } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function AppSwitcher({ src, placement = "up" }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [height, setHeight] = useState(0);
  const root = useRef(null);
  const frame = useRef(null);
  const pop = useRef(null);
  const btn = useRef(null);
  const [pos, setPos] = useState(null);
  const origin = src ? new URL(src).origin : "";

  useEffect(() => {
    if (!src) return;
    const t = setTimeout(() => setLoaded(true), 1500);
    const onMsg = (e) => {
      if (e.origin !== origin || e.source !== frame.current?.contentWindow) return;
      if (e.data?.type !== "hrtid-switcher") return;
      if (e.data.height) setHeight(e.data.height);
      if (e.data.navigate || e.data.close) setOpen(false);
    };
    window.addEventListener("message", onMsg);
    return () => {
      clearTimeout(t);
      window.removeEventListener("message", onMsg);
    };
  }, [src, origin]);

  useEffect(() => {
    if (!open) return;
    frame.current?.contentWindow?.postMessage({ type: "hrtid-switcher-focus" }, origin);
    frame.current?.focus();
    const onDown = (e) => {
      if (!root.current?.contains(e.target) && !pop.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, origin]);

  if (!src) return null;
  const here = `${location.hostname}${location.pathname.startsWith("/calendar") ? "/calendar" : ""}`;
  const url = `${src}?current=${encodeURIComponent(here)}`;

  return (
    <div className="em-switcher" ref={root}>
      <button
        type="button"
        className={`em-switcher-btn${open ? " is-open" : ""}`}
        aria-label="Apps"
        aria-expanded={open}
        onPointerEnter={() => setLoaded(true)}
        onFocus={() => setLoaded(true)}
        ref={btn}
        onClick={() => {
          setLoaded(true);
          const r = btn.current.getBoundingClientRect();
          setPos(
            placement === "up"
              ? ((l) => ({ left: l, bottom: window.innerHeight - r.top + 8, transformOrigin: `${r.left + r.width / 2 - l}px 100%` }))(root.current.parentElement.getBoundingClientRect().left)
              : { right: window.innerWidth - r.right, top: r.bottom + 8, transformOrigin: `calc(100% - ${r.width / 2}px) 0` },
          );
          setOpen((o) => !o);
        }}
      >
        <DotsNine size={18} weight="bold" />
      </button>
      {createPortal(
        <div
          ref={pop}
          className={`em-switcher-pop${open ? " is-open" : ""}`}
          data-placement={placement}
          style={pos || { left: -9999, top: 0 }}
          aria-hidden={!open}
        >
          {loaded && (
            <iframe
              ref={frame}
              title="Apps"
              src={url}
              style={{ height: height || 160 }}
              tabIndex={open ? 0 : -1}
            />
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
