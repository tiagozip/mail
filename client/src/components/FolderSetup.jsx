import { Button, Dialog, DialogRoot, Input, Select, Switch } from "@cloudflare/kumo";
import { Check, Trash, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { notifyError } from "../toast.js";

const PALETTE = ["#bf3264", "#e0789f", "#8b7fd6", "#5aa9e6", "#5fcf80", "#e6b450"];
const slug = (s) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

export function FolderSetup({ open, folder, user, onClose, onSaved }) {
  const editing = !!folder;
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[2]);
  const [skipInbox, setSkipInbox] = useState(true);
  const [aliasMode, setAliasMode] = useState("new");
  const [localPart, setLocalPart] = useState("");
  const [localTouched, setLocalTouched] = useState(false);
  const [domain, setDomain] = useState("");
  const [existingAlias, setExistingAlias] = useState("");
  const [domains, setDomains] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setBusy(false);
    setLocalTouched(false);
    api
      .aliasDomains()
      .then((d) => {
        const ds = d.domains || [];
        setDomains(ds);
        setDomain((prev) => prev || ds[0] || "");
      })
      .catch(() => {});
    api
      .aliases()
      .then((d) => setAliases(d.addresses || []))
      .catch(() => {});
    if (folder) {
      setName(folder.name || "");
      setColor(folder.color || PALETTE[2]);
      setSkipInbox(!!folder.skipInbox);
      setAliasMode(folder.alias ? "existing" : "none");
      setExistingAlias(folder.alias || "");
      setLocalPart("");
    } else {
      setName("");
      setColor(PALETTE[2]);
      setSkipInbox(true);
      setAliasMode("new");
      setLocalPart("");
      setExistingAlias("");
    }
  }, [open, folder]);

  const effectiveLocal = aliasMode === "new" && !localTouched && !editing ? slug(name) : localPart;

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return setError("Name is required.");
    setBusy(true);
    setError("");
    try {
      if (editing) {
        const body = { name: trimmed, color, skipInbox };
        if (aliasMode === "existing") body.aliasAddress = existingAlias;
        else if (aliasMode === "none") body.aliasAddress = "";
        await api.updateFolder(folder.id, body);
      } else {
        const body = { name: trimmed, color, skipInbox };
        if (aliasMode === "new") {
          const lp = effectiveLocal.trim();
          if (!lp) {
            setBusy(false);
            return setError("Enter an address for the alias.");
          }
          body.createAlias = true;
          body.localPart = lp;
          body.domain = domain;
        } else if (aliasMode === "existing") {
          if (!existingAlias) {
            setBusy(false);
            return setError("Pick an alias.");
          }
          body.aliasAddress = existingAlias;
        }
        await api.addFolder(body);
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing) return;
    setBusy(true);
    try {
      await api.removeFolder(folder.id);
      onSaved?.();
      onClose();
    } catch (err) {
      notifyError(err);
      setBusy(false);
    }
  }

  const usableAliases = aliases.filter((a) => !a.isPrimary);

  return (
    <DialogRoot open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog className="em-label-dialog" style={{ width: 540, maxWidth: "94vw" }}>
        <div className="em-label-head">
          <Dialog.Title className="em-label-title">{editing ? "Edit folder" : "New folder"}</Dialog.Title>
          <Button size="sm" variant="ghost" shape="square" aria-label="Close" icon={X} onClick={onClose} />
        </div>

        <div className="em-label-body">
          <div className="em-label-field">
            <span className="em-label-fieldlabel">Name</span>
            <Input
              autoFocus
              placeholder="Shopping, Work, Newsletters…"
              aria-label="Folder name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
            />
          </div>

          <div className="em-label-field">
            <span className="em-label-fieldlabel">Color</span>
            <div className="em-swatch-grid">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`em-swatch${color === c ? " is-selected" : ""}`}
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                  onClick={() => setColor(c)}
                >
                  {color === c && <Check size={14} weight="bold" color="#fff" />}
                </button>
              ))}
            </div>
          </div>

          <div className="em-label-field">
            <span className="em-label-fieldlabel">Address</span>

            {aliasMode === "new" && !editing && (
              <>
                <div className="em-folder-aliasrow">
                  <Input
                    size="sm"
                    placeholder="address"
                    aria-label="Alias local part"
                    value={effectiveLocal}
                    onChange={(e) => {
                      setLocalTouched(true);
                      setLocalPart(e.target.value);
                    }}
                  />
                  <span className="em-folder-at">@</span>
                  <Select aria-label="Domain" size="sm" value={domain} onValueChange={setDomain}>
                    {domains.map((d) => (
                      <Select.Option key={d} value={d}>
                        {d}
                      </Select.Option>
                    ))}
                  </Select>
                </div>
                <div className="em-folder-aliasalt">
                  {usableAliases.length > 0 && (
                    <button type="button" className="em-link-btn" onClick={() => setAliasMode("existing")}>
                      Use an existing alias
                    </button>
                  )}
                  <button type="button" className="em-link-btn em-link-muted" onClick={() => setAliasMode("none")}>
                    No address
                  </button>
                </div>
              </>
            )}

            {aliasMode === "existing" && (
              <>
                <Select
                  aria-label="Existing alias"
                  size="sm"
                  value={existingAlias}
                  onValueChange={setExistingAlias}
                >
                  {usableAliases.length === 0 ? (
                    <Select.Option value="">No aliases yet</Select.Option>
                  ) : (
                    usableAliases.map((a) => (
                      <Select.Option key={a.address} value={a.address}>
                        {a.address}
                      </Select.Option>
                    ))
                  )}
                </Select>
                <div className="em-folder-aliasalt">
                  {!editing && (
                    <button type="button" className="em-link-btn" onClick={() => setAliasMode("new")}>
                      Create a new address
                    </button>
                  )}
                  <button type="button" className="em-link-btn em-link-muted" onClick={() => setAliasMode("none")}>
                    No address
                  </button>
                </div>
              </>
            )}

            {aliasMode === "none" && (
              <div className="em-folder-aliasalt">
                <span className="em-folder-nonenote">No address, you'll file mail here yourself.</span>
                {!editing && (
                  <button type="button" className="em-link-btn" onClick={() => setAliasMode("new")}>
                    Add one
                  </button>
                )}
                {usableAliases.length > 0 && (
                  <button type="button" className="em-link-btn" onClick={() => setAliasMode("existing")}>
                    Pick an alias
                  </button>
                )}
              </div>
            )}

            <p className="em-byod-hint">
              Mail to this address lands in the folder, and replies send from it, like a separate
              mailbox.
            </p>
          </div>

          <label className="em-domain-public">
            <Switch aria-label="Skip inbox" checked={skipInbox} onCheckedChange={setSkipInbox} />
            <span>Keep this folder's mail out of the main inbox</span>
          </label>

          {error && <div className="em-form-error">{error}</div>}
        </div>

        <div className="em-label-foot">
          {editing && (
            <Button className="em-label-delete" variant="ghost" icon={Trash} loading={busy} onClick={remove}>
              Delete
            </Button>
          )}
          <div className="em-label-foot-right">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={save}>
              {editing ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
