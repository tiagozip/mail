import { DropdownMenu } from "@cloudflare/kumo";
import {
  Archive,
  CaretUpDown,
  Clock,
  ClockCountdown,
  FileText,
  Gear,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  ShieldCheck,
  SignOut,
  Star,
  Trash,
  Tray,
  Warning,
  UserCircleIcon
} from "@phosphor-icons/react";
import { useState } from "react";
import { FOLDER_LABELS, initials, monoColor } from "../util.js";
import { LabelModal } from "./LabelModal.jsx";

const FOLDERS = [
  { key: "inbox", icon: Tray },
  { key: "starred", icon: Star },
  { key: "sent", icon: PaperPlaneTilt },
  { key: "drafts", icon: FileText },
  { key: "snoozed", icon: Clock },
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
  onOpenSettings,
  onOpenAdmin,
  onOpenScheduled,
  onSignOut,
  onNavigate,
}) {
  const { user, view, goView, counts, labels, refreshLabels } = store;
  const [modalOpen, setModalOpen] = useState(false);
  const [editLabel, setEditLabel] = useState(null);
  const active = activeKey(view);

  function navigate(v) {
    goView(v);
    onNavigate?.();
  }

  function selectFolder(key) {
    if (key === "starred") navigate({ kind: "starred" });
    else navigate({ kind: "folder", folder: key });
  }

  function openCreate() {
    setEditLabel(null);
    setModalOpen(true);
  }

  function openEdit(label, e) {
    e.stopPropagation();
    setEditLabel(label);
    setModalOpen(true);
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
          <div
            key={l.id}
            className={`em-nav-item em-nav-labelrow${active === `label:${l.id}` ? " is-active" : ""}`}
          >
            <button
              type="button"
              className="em-nav-labelmain"
              onClick={() => navigate({ kind: "label", labelId: l.id, name: l.name })}
            >
              <span className="em-label-dot" style={{ background: l.color }} />
              <span className="em-nav-label">{l.name}</span>
              {l.rule?.conditions?.length > 0 && (
                <span className="em-label-auto" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              className="em-label-edit"
              aria-label={`Edit ${l.name}`}
              onClick={(e) => openEdit(l, e)}
            >
              <PencilSimple size={14} />
            </button>
          </div>
        ))}
        <button type="button" className="em-nav-item em-nav-muted" onClick={openCreate}>
          <Plus size={18} />
          <span className="em-nav-label">Add label</span>
        </button>
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
                </span>
                <CaretUpDown className="em-account-caret" size={15} />
              </button>
            )}
          />
          <DropdownMenu.Content className="em-account-menu" style={{ zIndex: 200 }}>
            <DropdownMenu.Item icon={Gear} onClick={onOpenSettings}>
              Settings
            </DropdownMenu.Item>
            <DropdownMenu.Item icon={ClockCountdown} onClick={onOpenScheduled}>
              Scheduled
            </DropdownMenu.Item>
            {user.isAdmin && (
              <DropdownMenu.Item icon={ShieldCheck} onClick={onOpenAdmin}>
                Admin
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Separator />
            <DropdownMenu.LinkItem href="https://id.estrogen.delivery" icon={UserCircleIcon}>
              My hrtID
            </DropdownMenu.LinkItem>
            <DropdownMenu.Item icon={SignOut} variant="danger" onClick={onSignOut}>
              Sign out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      </div>

      <LabelModal
        open={modalOpen}
        label={editLabel}
        onClose={() => setModalOpen(false)}
        onSaved={refreshLabels}
      />
    </div>
  );
}
