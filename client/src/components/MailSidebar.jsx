import { AppSwitcher } from "./AppSwitcher.jsx";
import { DropdownMenu } from "@cloudflare/kumo";
import {
  Archive,
  CalendarBlank,
  CaretDown,
  CaretUpDown,
  Clock,
  ClockCountdown,
  FileText,
  Folder,
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
  UserCircleIcon,
  UserPlus,
  Newspaper,
} from "@phosphor-icons/react";
import { useState } from "react";
import { FOLDER_LABELS, initials, monoColor } from "../util.js";
import { FolderSetup } from "./FolderSetup.jsx";
import { LabelModal } from "./LabelModal.jsx";

const PRIMARY = [
  { key: "inbox", icon: Tray },
  { key: "newsletters", icon: Newspaper },
  { key: "screener", icon: UserPlus },
  { key: "starred", icon: Star },
  { key: "sent", icon: PaperPlaneTilt },
  { key: "drafts", icon: FileText },
];

const MORE = [
  { key: "snoozed", icon: Clock },
  { key: "archive", icon: Archive },
  { key: "spam", icon: Warning },
  { key: "trash", icon: Trash },
];

const MORE_KEY = "em-nav-more";

function activeKey(view) {
  if (view.kind === "folder") return view.folder;
  if (view.kind === "starred") return "starred";
  if (view.kind === "label") return `label:${view.labelId}`;
  if (view.kind === "userfolder") return `folder:${view.folderId}`;
  return null;
}

export function MailSidebar({
  store,
  onOpenSettings,
  onOpenAdmin,
  onOpenScheduled,
  onSignOut,
  onNavigate,
  onOpenCalendar,
  calendarActive,
}) {
  const { user, view, goView, counts, labels, refreshLabels, userFolders, refreshCounts } = store;
  const [modalOpen, setModalOpen] = useState(false);
  const [editLabel, setEditLabel] = useState(null);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [editFolder, setEditFolder] = useState(null);
  const [moreOpen, setMoreOpen] = useState(() => {
    try {
      return localStorage.getItem(MORE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const active = calendarActive ? null : activeKey(view);
  const moreActive = MORE.some((f) => f.key === active);
  const showMore = moreOpen || moreActive;

  function navigate(v) {
    goView(v);
    onNavigate?.();
  }

  function selectFolder(key) {
    if (key === "starred") navigate({ kind: "starred" });
    else navigate({ kind: "folder", folder: key });
  }

  function toggleMore() {
    const next = !showMore;
    setMoreOpen(next);
    try {
      localStorage.setItem(MORE_KEY, next ? "1" : "0");
    } catch {}
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

  function folderButton({ key, icon: Icon }) {
    const on = active === key;
    const badge =
      key === "inbox" || key === "newsletters"
        ? counts?.[key]?.unread
        : key === "screener"
          ? counts?.[key]?.total
          : key === "drafts"
            ? counts?.[key]?.total
            : 0;
    return (
      <button
        key={key}
        type="button"
        className={`em-nav-item${on ? " is-active" : ""}`}
        aria-current={on ? "page" : undefined}
        onClick={() => selectFolder(key)}
      >
        <Icon size={18} weight={on ? "fill" : "regular"} />
        <span className="em-nav-label">{FOLDER_LABELS[key]}</span>
        {badge > 0 && <span className="em-nav-badge">{badge}</span>}
      </button>
    );
  }

  const primary = PRIMARY.filter(({ key }) => {
    if (key === "screener") return user.settings?.screenSenders === true;
    if (key === "newsletters") return user.settings?.newsletterFolder !== false;
    return true;
  });

  return (
    <div className="em-nav">
      {user.settings?.calendar !== false && (
      <div className="em-switch" role="tablist" aria-label="App">
        <button
          type="button"
          role="tab"
          aria-selected={!calendarActive}
          className={calendarActive ? "" : "is-on"}
          aria-label="Mail"
          title="Mail"
          onClick={() => onNavigate?.()}
        >
          <Tray size={16} />
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={calendarActive}
          className={calendarActive ? "is-on" : ""}
          aria-label="Calendar"
          title="Calendar"
          onClick={onOpenCalendar}
        >
          <CalendarBlank size={16} />
        </button>
      </div>
      )}

      {calendarActive ? (
        <div id="em-nav-slot" className="em-nav-slot" />
      ) : (
        <>
          <div className="em-nav-list">
            {primary.map(folderButton)}
            <button
              type="button"
              className="em-nav-item em-nav-more"
              aria-expanded={showMore}
              onClick={toggleMore}
            >
              <CaretDown size={16} className="em-nav-caret" />
              <span className="em-nav-label">{showMore ? "Less" : "More"}</span>
            </button>
            {showMore && MORE.map(folderButton)}
          </div>

          <div className="em-nav-list">
            <div className="em-nav-head">
              <span>Labels</span>
              <button type="button" aria-label="New label" onClick={openCreate}>
                <Plus size={14} />
              </button>
            </div>
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
          </div>

          <div className="em-nav-list">
            <div className="em-nav-head">
              <span>Folders</span>
              <button
                type="button"
                aria-label="New folder"
                onClick={() => {
                  setEditFolder(null);
                  setFolderModalOpen(true);
                }}
              >
                <Plus size={14} />
              </button>
            </div>
            {(userFolders || []).map((f) => {
              const on = active === `folder:${f.id}`;
              return (
                <div
                  key={f.id}
                  className={`em-nav-item em-nav-labelrow${on ? " is-active" : ""}`}
                >
                  <button
                    type="button"
                    className="em-nav-labelmain"
                    onClick={() => navigate({ kind: "userfolder", folderId: f.id, name: f.name })}
                  >
                    <Folder size={18} weight={on ? "fill" : "regular"} style={{ color: f.color }} />
                    <span className="em-nav-label">{f.name}</span>
                    {f.unread > 0 && <span className="em-nav-badge">{f.unread}</span>}
                  </button>
                  <button
                    type="button"
                    className="em-label-edit"
                    aria-label={`Edit ${f.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditFolder(f);
                      setFolderModalOpen(true);
                    }}
                  >
                    <PencilSimple size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

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
        <AppSwitcher src={user.switcherUrl} placement="up" />
      </div>

      <LabelModal
        open={modalOpen}
        label={editLabel}
        onClose={() => setModalOpen(false)}
        onSaved={refreshLabels}
      />

      <FolderSetup
        open={folderModalOpen}
        folder={editFolder}
        user={user}
        onClose={() => setFolderModalOpen(false)}
        onSaved={refreshCounts}
      />
    </div>
  );
}
