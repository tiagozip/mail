import {
  Button,
  DropdownMenu,
  Input,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRoot,
} from "@cloudflare/kumo";
import {
  Archive,
  CaretUpDown,
  Gear,
  Moon,
  PencilSimpleLine,
  PaperPlaneTilt,
  ShieldCheck,
  SignOut,
  Star,
  Sun,
  Tag,
  Trash,
  Tray,
  Warning,
  FileText,
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
  onCompose,
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
    <SidebarProvider collapsible="none">
      <SidebarRoot>
        <SidebarHeader>
          <div className="em-sidebar-head">
            <div className="em-wordmark">
              <span className="em-wordmark-glyph">e</span>
              estrogen.delivery
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              {FOLDERS.map(({ key, icon }) => {
                const c = counts?.[key];
                const unread = key === "inbox" ? c?.unread : 0;
                return (
                  <SidebarMenuItem key={key}>
                    <SidebarMenuButton
                      icon={icon}
                      active={active === key}
                      onClick={() => selectFolder(key)}
                    >
                      {FOLDER_LABELS[key]}
                      {unread > 0 && <SidebarMenuBadge>{unread}</SidebarMenuBadge>}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Labels</SidebarGroupLabel>
            <SidebarMenu>
              {labels.map((l) => (
                <SidebarMenuItem key={l.id}>
                  <SidebarMenuButton
                    active={active === `label:${l.id}`}
                    onClick={() => navigate({ kind: "label", labelId: l.id, name: l.name })}
                  >
                    <span className="em-label-group-item">
                      <span className="em-label-dot" style={{ background: l.color }} />
                      {l.name}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                {addingLabel ? (
                  <form
                    onSubmit={createLabel}
                    style={{ display: "flex", gap: 4, padding: "2px 8px" }}
                  >
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
                  <SidebarMenuButton icon={Tag} size="sm" onClick={() => setAddingLabel(true)}>
                    Add label
                  </SidebarMenuButton>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className="em-sidebar-foot">
            <Button
              className="em-compose-btn"
              variant="primary"
              icon={PencilSimpleLine}
              onClick={onCompose}
            >
              Compose
            </Button>
            <DropdownMenu>
            <DropdownMenu.Trigger
              render={(p) => (
                <button {...p} className="em-account-chip" type="button">
                  {user.avatarUrl ? (
                    <img className="em-account-avatar" src={user.avatarUrl} alt="" />
                  ) : (
                    <span
                      className="em-account-mono"
                      style={{ background: monoColor(user.address) }}
                    >
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
            <DropdownMenu.Content>
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
        </SidebarFooter>
      </SidebarRoot>
    </SidebarProvider>
  );
}
