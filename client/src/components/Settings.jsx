import { Badge, Button, ClipboardText, Dialog, DialogRoot, Input, Loader, Switch } from "@cloudflare/kumo";
import { Camera, Check, Lock, LockKey, Plus, Star, Trash, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import * as pgp from "../pgp.js";
import { notify, notifyError } from "../toast.js";
import { humanSize, initials, monoColor, relativeTime } from "../util.js";

const PALETTES = [
  { id: "plum", name: "Plum", canvas: "#1d171f", brand: "#bf3264" },
  { id: "gold", name: "Gold", canvas: "#1e1a14", brand: "#c4a030" },
  { id: "midnight", name: "Midnight", canvas: "#12141f", brand: "#6b8cff" },
  { id: "sakura", name: "Sakura", canvas: "#fbf1f3", brand: "#d05a86" },
];

function ApiKeys() {
  const [keys, setKeys] = useState(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  useEffect(() => {
    api
      .listApiKeys()
      .then((d) => setKeys(d.keys || []))
      .catch(notifyError);
  }, []);

  async function create(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setCreating(true);
    try {
      const res = await api.createApiKey(n);
      setFresh(res);
      setName("");
      const d = await api.listApiKeys();
      setKeys(d.keys || []);
    } catch (err) {
      notifyError(err);
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id) {
    try {
      await api.deleteApiKey(id);
      setKeys((p) => (p || []).filter((k) => k.id !== id));
      setConfirmId(null);
    } catch (err) {
      notifyError(err);
    }
  }

  return (
    <div className="em-card">
      <div className="em-card-head">
        <h2 className="em-card-title">Developer API</h2>
        <p className="em-card-sub">
          Use these endpoints programmatically. Base URL https://mail.estrogen.delivery/api .
          Authenticate with header Authorization: Bearer &lt;key&gt; or X-API-Key: &lt;key&gt;.
        </p>
      </div>

      <form className="em-keys-new" onSubmit={create}>
        <Input
          aria-label="API key name"
          placeholder="Key name (e.g. cli, scripts)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" variant="outline" icon={Plus} loading={creating}>
          Create key
        </Button>
      </form>

      {fresh && (
        <div className="em-keys-reveal">
          <div className="em-keys-reveal-warn">Copy it now, it won't be shown again.</div>
          <ClipboardText text={fresh.key} size="sm" />
        </div>
      )}

      {!keys ? (
        <Loader size="sm" />
      ) : keys.length === 0 ? (
        <div className="em-keys-empty">No keys yet. Create one above to get started.</div>
      ) : (
        <table className="em-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Prefix</th>
              <th>Created</th>
              <th>Last used</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td>
                  <span className="em-keys-base">{k.prefix}</span>
                </td>
                <td>{k.created_at ? relativeTime(k.created_at) : "-"}</td>
                <td>{k.last_used ? relativeTime(k.last_used) : "never"}</td>
                <td>
                  {confirmId === k.id ? (
                    <div className="em-keys-revoke">
                      <span className="em-keys-confirm">Sure?</span>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" variant="outline" icon={Trash} onClick={() => revoke(k.id)}>
                        Revoke
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Trash}
                      onClick={() => setConfirmId(k.id)}
                    >
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Addresses({ user, setUser }) {
  const [addresses, setAddresses] = useState(user.addresses || null);
  const [localPart, setLocalPart] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .aliases()
      .then((d) => setAddresses(d.addresses || []))
      .catch(notifyError);
  }, []);

  function refreshUser() {
    api
      .me()
      .then((d) => d.user && setUser(d.user))
      .catch(() => {});
  }

  async function add(e) {
    e.preventDefault();
    const lp = localPart.trim().toLowerCase();
    if (!lp) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.addAlias(lp);
      if (res.error) {
        setError(res.error);
        return;
      }
      setLocalPart("");
      const d = await api.aliases();
      setAddresses(d.addresses || []);
      refreshUser();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(address) {
    try {
      await api.removeAlias(address);
      setAddresses((p) => (p || []).filter((a) => a.address !== address));
      refreshUser();
    } catch (err) {
      notifyError(err);
    }
  }

  async function makePrimary(address) {
    try {
      await api.setPrimaryAddress(address);
      setAddresses((p) => (p || []).map((a) => ({ ...a, isPrimary: a.address === address })));
      refreshUser();
    } catch (err) {
      notifyError(err);
    }
  }

  return (
    <div className="em-card">
      <div className="em-card-head">
        <h2 className="em-card-title">Addresses</h2>
        <p className="em-card-sub">
          Send and receive from any of these. Mail to all of them lands in this inbox.
        </p>
      </div>
      {!addresses ? (
        <Loader size="sm" />
      ) : (
        <div className="em-alias-list">
          {addresses.map((a) => (
            <div key={a.address} className="em-alias-row">
              <span className="em-alias-addr">{a.address}</span>
              {a.isPrimary ? (
                <Badge variant="purple">primary</Badge>
              ) : (
                <div className="em-alias-actions">
                  <Button size="sm" variant="ghost" icon={Star} onClick={() => makePrimary(a.address)}>
                    Make primary
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    shape="square"
                    aria-label="Remove address"
                    icon={Trash}
                    onClick={() => remove(a.address)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <form className="em-alias-add" onSubmit={add}>
        <div className="em-alias-input">
          <input
            aria-label="New alias local part"
            placeholder="new-alias"
            value={localPart}
            onChange={(e) => {
              setLocalPart(e.target.value);
              setError("");
            }}
          />
          <span className="em-alias-suffix">@estrogen.delivery</span>
        </div>
        <Button type="submit" variant="outline" icon={Plus} loading={busy}>
          Add
        </Button>
      </form>
      {error && <div className="em-form-error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function Encryption({ user, setUser }) {
  const [showForm, setShowForm] = useState(false);
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  async function refreshUser() {
    const d = await api.me();
    if (d.user) setUser(d.user);
    return d.user;
  }

  async function enable(e) {
    e.preventDefault();
    setError("");
    if (pass.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (pass !== confirm) {
      setError("Passphrases do not match.");
      return;
    }
    setBusy(true);
    try {
      const { publicKey, privateKeyEnc } = await pgp.generateIdentity(
        user.displayName || user.address,
        user.address,
        pass,
      );
      await api.enablePgp(publicKey, privateKeyEnc);
      await pgp.unlock(privateKeyEnc, pass);
      await refreshUser();
      setShowForm(false);
      setPass("");
      setConfirm("");
      notify("Encryption on", "Incoming mail is now encrypted to your key.", "success");
    } catch (err) {
      setError(err.message || "Could not enable encryption.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await api.disablePgp();
      pgp.clearUnlocked();
      await refreshUser();
      setConfirmDisable(false);
      notify("Encryption off", "New mail will arrive unencrypted.", "success");
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="em-card">
      <div className="em-card-head">
        <h2 className="em-card-title">Encryption</h2>
        <p className="em-card-sub">
          End-to-end encryption: incoming mail is encrypted to your key and can only be read with
          your passphrase. The passphrase never leaves this device, if you lose it your encrypted
          mail is unrecoverable.
        </p>
      </div>

      {user.pgpEnabled ? (
        <>
          <div className="em-pgp-status">
            <span className="em-pgp-status-icon">
              <LockKey size={16} weight="fill" />
            </span>
            <div className="em-pgp-status-copy">
              <div className="em-pgp-status-title">Encryption is on</div>
              <div className="em-pgp-status-sub">
                Disabling does not decrypt mail that is already stored encrypted.
              </div>
            </div>
            {confirmDisable ? (
              <div className="em-keys-revoke">
                <Button size="sm" variant="ghost" onClick={() => setConfirmDisable(false)}>
                  Cancel
                </Button>
                <Button size="sm" variant="outline" loading={busy} onClick={disable}>
                  Disable
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmDisable(true)}>
                Disable
              </Button>
            )}
          </div>
        </>
      ) : showForm ? (
        <form className="em-pgp-form" onSubmit={enable}>
          <Input
            type="password"
            label="Passphrase"
            value={pass}
            onChange={(e) => {
              setPass(e.target.value);
              setError("");
            }}
          />
          <Input
            type="password"
            label="Confirm passphrase"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setError("");
            }}
          />
          {error && <div className="em-form-error">{error}</div>}
          <div className="em-pgp-form-actions">
            <Button type="submit" variant="primary" icon={Lock} loading={busy}>
              Enable encryption
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowForm(false);
                setError("");
                setPass("");
                setConfirm("");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" icon={Lock} onClick={() => setShowForm(true)}>
          Enable encryption
        </Button>
      )}
    </div>
  );
}

export function Settings({ open, user, setUser, mode, onSetMode, palette, onSetPalette, onClose }) {
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [signature, setSignature] = useState(user.signature || "");
  const [imagesDefault, setImagesDefault] = useState(!!user.settings?.imagesDefault);
  const [catchAll, setCatchAll] = useState(!!user.settings?.catchAll);
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInput = useRef(null);

  const used = user.storageUsed || 0;

  async function onAvatarFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    try {
      const { avatarUrl } = await api.uploadAvatar(file);
      setUser({ ...user, avatarUrl });
      notify("Photo updated", "Your profile picture is set.", "success");
    } catch (err) {
      notifyError(err);
    } finally {
      setAvatarBusy(false);
      if (avatarInput.current) avatarInput.current.value = "";
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    try {
      await api.deleteAvatar();
      setUser({ ...user, avatarUrl: null });
    } catch (err) {
      notifyError(err);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const data = await api.saveSettings({
        displayName,
        signature,
        settings: { ...user.settings, theme: mode, palette, imagesDefault, catchAll },
      });
      setUser(data.user);
      localStorage.setItem("em-images-default", imagesDefault ? "1" : "0");
      notify("Settings saved", "Your preferences are updated.", "success");
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  }

  async function saveCatchAll(v) {
    setCatchAll(v);
    try {
      const data = await api.saveSettings({
        displayName,
        signature,
        settings: { ...user.settings, theme: mode, palette, imagesDefault, catchAll: v },
      });
      setUser(data.user);
    } catch (e) {
      setCatchAll(!v);
      notifyError(e);
    }
  }

  async function pickPalette(id) {
    onSetPalette(id);
    try {
      const data = await api.saveSettings({
        displayName,
        signature,
        settings: { ...user.settings, theme: mode, palette: id, imagesDefault, catchAll },
      });
      setUser(data.user);
    } catch (e) {
      notifyError(e);
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog className="em-settings-dialog" style={{ width: 600, maxWidth: "94vw", padding: 0 }}>
        <div className="em-settings-head">
          <Dialog.Title className="em-settings-title">Settings</Dialog.Title>
          <Button
            size="sm"
            variant="ghost"
            shape="square"
            aria-label="Close settings"
            icon={X}
            onClick={onClose}
          />
        </div>
        <div className="em-settings-body">
          <div className="em-card">
            <div className="em-card-head">
              <h2 className="em-card-title">Identity</h2>
              <p className="em-card-sub">How your name and sign-off appear on outgoing mail.</p>
            </div>
            <div className="em-avatar-row">
              {user.avatarUrl ? (
                <img className="em-avatar-lg" src={user.avatarUrl} alt="" />
              ) : (
                <span className="em-avatar-lg em-avatar-mono" style={{ background: monoColor(user.address) }}>
                  {initials({ name: user.displayName, address: user.address })}
                </span>
              )}
              <div className="em-avatar-actions">
                <input
                  ref={avatarInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={onAvatarFile}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Camera}
                  loading={avatarBusy}
                  onClick={() => avatarInput.current?.click()}
                >
                  {user.avatarUrl ? "Change photo" : "Upload photo"}
                </Button>
                {user.avatarUrl && (
                  <Button size="sm" variant="ghost" onClick={removeAvatar} disabled={avatarBusy}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <div className="em-field-block">
              <Input
                label="Display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <div>
                <label className="em-field-label">Signature</label>
                <textarea
                  className="em-textarea"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="Appended to outgoing mail"
                />
              </div>
            </div>
          </div>

          <Addresses user={user} setUser={setUser} />

          <div className="em-card">
            <div className="em-card-head">
              <h2 className="em-card-title">Appearance & reading</h2>
            </div>
            <div style={{ marginBottom: "var(--em-5)" }}>
              <label className="em-field-label">Theme</label>
              <div className="em-theme-grid">
                {PALETTES.map((p) => {
                  const active = (palette || "plum") === p.id;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      className={`em-theme-swatch${active ? " is-active" : ""}`}
                      onClick={() => pickPalette(p.id)}
                    >
                      <div className="em-theme-preview" style={{ background: p.canvas }}>
                        <span className="em-theme-dot" style={{ background: p.brand }} />
                      </div>
                      <div className="em-theme-label">
                        <span>{p.name}</span>
                        {active && <Check size={14} weight="bold" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="em-toggle-row">
              <div className="em-toggle-copy">
                <div className="em-toggle-title">Dark mode</div>
                <div className="em-toggle-sub">
                  Toggles the deep plum theme between dark and light. Applies to the Plum theme.
                </div>
              </div>
              <Switch
                aria-label="Dark mode"
                checked={mode === "dark"}
                onCheckedChange={(v) => onSetMode(v ? "dark" : "light")}
              />
            </div>
            <div className="em-toggle-row">
              <div className="em-toggle-copy">
                <div className="em-toggle-title">Load remote images by default</div>
                <div className="em-toggle-sub">Show images in messages without asking each time.</div>
              </div>
              <Switch aria-label="Load remote images by default" checked={imagesDefault} onCheckedChange={setImagesDefault} />
            </div>
          </div>

          {user.isAdmin && (
            <div className="em-card">
              <div className="em-card-head">
                <h2 className="em-card-title">Catch-all</h2>
              </div>
              <div className="em-toggle-row">
                <div className="em-toggle-copy">
                  <div className="em-toggle-title">Receive unclaimed mail</div>
                  <div className="em-toggle-sub">
                    Receive mail sent to any unclaimed @estrogen.delivery address.
                  </div>
                </div>
                <Switch aria-label="Catch-all" checked={catchAll} onCheckedChange={saveCatchAll} />
              </div>
            </div>
          )}

          <div className="em-card">
            <div className="em-card-head">
              <h2 className="em-card-title">Storage</h2>
              <p className="em-card-sub">No limits. Store as much as you like.</p>
            </div>
            <div className="em-stat-row">
              <span className="em-stat-value">{humanSize(used)}</span>
              <span className="em-stat-label">used</span>
            </div>
          </div>

          <Encryption user={user} setUser={setUser} />

          <ApiKeys />

          <Button variant="primary" loading={busy} onClick={save}>
            Save changes
          </Button>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
