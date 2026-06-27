import { DropdownMenu, Input } from "@cloudflare/kumo";
import {
  Archive,
  CaretUpDown,
  FileText,
  Gear,
  Moon,
  PaperPlaneTilt,
  ShieldCheck,
  SignOut,
  Star,
  Sun,
  Tag,
  Trash,
  Tray,
  Warning,
} from "@phosphor-icons/react";
import { useState } from "react";
import { api } from "../api.js";
import { FOLDER_LABELS, initials, monoColor } from "../util.js";

const FOLDERS = [
  { key: "inbox", icon: Tray },
  { key: "starred", icon: Star },
  { key: "sent", icon: PaperPlaneTilt },
  { key: "drafts", icon: FileText },
  { key: "archive", icon: Archive },
  { key: "spam", icon: Warning },
  { key: "trash", icon: Trash },
];

function activeKey(view) {
  if (view.kind === "folder") return view.folder;
  if (view.kind === "starred") return "starred";
  if (view.kind === "label") return `label:${view.labelId}`;
  return null;
}

export function MailSidebar({
  store,
  mode,
  onToggleMode,
  onOpenSettings,
  onOpenAdmin,
  onSignOut,
  onNavigate,
}) {
  const { user, view, goView, counts, labels, refreshLabels } = store;
  const [addingLabel, setAddingLabel] = useState(false);
  const [labelName, setLabelName] = useState("");
  const active = activeKey(view);

  function navigate(v) {
    goView(v);
    onNavigate?.();
  }

  function selectFolder(key) {
    if (key === "starred") navigate({ kind: "starred" });
    else navigate({ kind: "folder", folder: key });
  }

  async function createLabel(e) {
    e.preventDefault();
    const name = labelName.trim();
    if (!name) return;
    const palette = ["#bf3264", "#e0789f", "#8b7fd6", "#5aa9e6", "#5fcf80", "#e6b450"];
    const color = palette[Math.floor(Math.random() * palette.length)];
    try {
      await api.createLabel(name, color);
      setLabelName("");
      setAddingLabel(false);
      refreshLabels();
    } catch {
      setAddingLabel(false);
    }
  }

  return (
    <div className="em-nav">
      <div className="em-nav-list">
        {FOLDERS.map(({ key, icon: Icon }) => {
          const unread = key === "inbox" ? counts?.[key]?.unread : 0;
          const on = active === key;
          return (
            <button
              key={key}
              type="button"
              className={`em-nav-item${on ? " is-active" : ""}`}
              onClick={() => selectFolder(key)}
            >
              <Icon size={18} weight={on ? "fill" : "regular"} />
              <span className="em-nav-label">{FOLDER_LABELS[key]}</span>
              {unread > 0 && <span className="em-nav-badge">{unread}</span>}
            </button>
          );
        })}
      </div>

      <div className="em-nav-list">
        {labels.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`em-nav-item${active === `label:${l.id}` ? " is-active" : ""}`}
            onClick={() => navigate({ kind: "label", labelId: l.id, name: l.name })}
          >
            <span className="em-label-dot" style={{ background: l.color }} />
            <span className="em-nav-label">{l.name}</span>
          </button>
        ))}
        {addingLabel ? (
          <form className="em-nav-labelform" onSubmit={createLabel}>
            <Input
              size="sm"
              autoFocus
              placeholder="Label name"
              aria-label="New label name"
              value={labelName}
              onChange={(e) => setLabelName(e.target.value)}
              onBlur={() => !labelName && setAddingLabel(false)}
            />
          </form>
        ) : (
          <button type="button" className="em-nav-item em-nav-muted" onClick={() => setAddingLabel(true)}>
            <Tag size={18} />
            <span className="em-nav-label">Add label</span>
          </button>
        )}
      </div>

      <div className="em-nav-foot">
        <DropdownMenu>
          <DropdownMenu.Trigger
            render={(p) => (
              <button {...p} className="em-account-chip" type="button">
                {user.avatarUrl ? (
                  <img className="em-account-avatar" src={user.avatarUrl} alt="" />
                ) : (
                  <span className="em-account-mono" style={{ background: monoColor(user.address) }}>
                    {initials({ name: user.displayName, address: user.address })}
                  </span>
                )}
                <span className="em-account-meta">
                  <span className="em-account-name">{user.displayName || user.username}</span>
                  <span className="em-account-addr">{user.address}</span>
                </span>
                <CaretUpDown className="em-account-caret" size={15} />
              </button>
            )}
          />
          <DropdownMenu.Content className="em-account-menu" style={{ zIndex: 200 }}>
            <DropdownMenu.Item icon={Gear} onClick={onOpenSettings}>
              Settings
            </DropdownMenu.Item>
            {user.isAdmin && (
              <DropdownMenu.Item icon={ShieldCheck} onClick={onOpenAdmin}>
                Admin
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Item icon={mode === "dark" ? Sun : Moon} onClick={onToggleMode}>
              {mode === "dark" ? "Light mode" : "Dark mode"}
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item icon={SignOut} variant="danger" onClick={onSignOut}>
              Sign out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      </div>
    </div>
  );
}
