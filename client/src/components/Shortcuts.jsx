const SHORTCUTS = [
  [["c"], "Compose"],
  [["/"], "Focus search"],
  [["j"], "Next message"],
  [["k"], "Previous message"],
  [["Enter"], "Open selected"],
  [["e"], "Archive"],
  [["#"], "Trash"],
  [["s"], "Star"],
  [["r"], "Reply"],
  [["u"], "Back / mark unread"],
  [["g", "i"], "Go to inbox"],
  [["?"], "Toggle this help"],
];

export function Shortcuts({ open, onClose }) {
  return (
    <div className={`em-kbd-overlay${open ? " is-open" : ""}`} onClick={onClose}>
      <div className="em-kbd-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="em-kbd-title em-display">Keyboard shortcuts</h2>
        {SHORTCUTS.map(([keys, label]) => (
          <div key={label} className="em-kbd-row">
            <span>{label}</span>
            <span className="em-kbd-keys">
              {keys.map((k) => (
                <span key={k} className="em-kbd-key">{k}</span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
