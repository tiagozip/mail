import { MagnifyingGlass, PaperPlaneTilt } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api.js";

function score(label, q) {
  if (!q) return 1;
  const l = label.toLowerCase();
  const idx = l.indexOf(q);
  if (idx === 0) return 100 - l.length;
  if (idx > 0) return 60 - idx;
  let i = 0;
  for (const c of l) if (c === q[i]) i++;
  return i === q.length ? 20 - l.length / 10 : 0;
}

export function CommandPalette({ open, onClose, commands, onSearch, onWrite }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [people, setPeople] = useState([]);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setActive(0);
    setPeople([]);
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2) return setPeople([]);
    let live = true;
    const t = setTimeout(() => {
      api
        .contacts(term)
        .then((d) => live && setPeople((d.contacts || []).slice(0, 4)))
        .catch(() => {});
    }, 120);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, open]);

  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    const ranked = commands
      .map((c) => ({ ...c, s: Math.max(score(c.label, term), ...(c.keywords || []).map((k) => score(k, term) * 0.8)) }))
      .filter((c) => c.s > 0)
      .sort((a, b) => (term ? b.s - a.s : 0));
    const extra = [];
    for (const p of people)
      extra.push({
        id: `write:${p.address}`,
        label: `Write to ${p.name || p.address}`,
        hint: p.name ? p.address : "",
        icon: PaperPlaneTilt,
        run: () => onWrite(p.address),
      });
    if (term)
      extra.push({
        id: "search",
        label: `Search mail for "${q.trim()}"`,
        icon: MagnifyingGlass,
        run: () => onSearch(q.trim()),
      });
    return [...ranked.slice(0, 12), ...extra];
  }, [commands, q, people, onSearch, onWrite]);

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, items.length - 1)));
  }, [items.length]);

  useEffect(() => {
    listRef.current?.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  function run(item) {
    if (!item) return;
    onClose();
    item.run();
  }

  return createPortal(
    <div
      className="em-modal-scrim em-palette-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="em-palette" role="dialog" aria-label="Command palette">
        <div className="em-palette-field">
          <MagnifyingGlass size={18} />
          <input
            ref={inputRef}
            autoFocus
            value={q}
            placeholder="Type a command, a folder, or a person"
            aria-label="Command"
            role="combobox"
            aria-expanded="true"
            aria-controls="em-palette-list"
            aria-activedescendant={items[active] ? `em-cmd-${active}` : undefined}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(items[active]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
        </div>
        <div className="em-palette-list" id="em-palette-list" role="listbox" ref={listRef}>
          {items.length === 0 ? (
            <div className="em-palette-empty">No matching commands.</div>
          ) : (
            items.map((item, i) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  id={`em-cmd-${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={`em-palette-item${i === active ? " is-active" : ""}`}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(item)}
                >
                  {Icon && <Icon size={17} />}
                  <span className="em-palette-label">{item.label}</span>
                  {item.hint && <span className="em-palette-hint">{item.hint}</span>}
                  {item.keys && <kbd className="em-palette-kbd">{item.keys}</kbd>}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
