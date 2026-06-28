import {
  Badge,
  Button,
  ClipboardText,
  Dialog,
  DialogRoot,
  Input,
  Loader,
  Select,
  Switch,
} from "@cloudflare/kumo";
import {
  Bell,
  Camera,
  Check,
  CheckCircle,
  Code,
  Funnel,
  Globe,
  Lock,
  LockKey,
  Palette,
  Plus,
  ShieldCheck,
  Star,
  Trash,
  User,
  Warning,
  X,
} from "@phosphor-icons/react";
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
  const [domains, setDomains] = useState([]);
  const [domain, setDomain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .aliases()
      .then((d) => setAddresses(d.addresses || []))
      .catch(notifyError);
    api
      .aliasDomains()
      .then((d) => {
        setDomains(d.domains || []);
        setDomain(d.builtIn || (d.domains || [])[0] || "");
      })
      .catch(() => {});
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
      const res = await api.addAlias(lp, domain);
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
          {domains.length > 1 ? (
            <div className="em-alias-domain">
              <Select
                aria-label="Alias domain"
                size="sm"
                value={domain}
                onValueChange={setDomain}
              >
                {domains.map((d) => (
                  <Select.Option key={d} value={d}>
                    @{d}
                  </Select.Option>
                ))}
              </Select>
            </div>
          ) : (
            <span className="em-alias-suffix">@{domain || "estrogen.delivery"}</span>
          )}
        </div>
        <Button type="submit" variant="outline" icon={Plus} loading={busy}>
          Add
        </Button>
      </form>
      {error && <div className="em-form-error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function HiddenAliases() {
  const [aliases, setAliases] = useState(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [openSenders, setOpenSenders] = useState("");
  const [senders, setSenders] = useState({});

  useEffect(() => {
    api
      .hiddenAliases()
      .then((d) => setAliases(d.aliases || []))
      .catch(notifyError);
  }, []);

  async function copy(addr) {
    try {
      await navigator.clipboard?.writeText(addr);
    } catch {}
    setCopied(addr);
    setTimeout(() => setCopied((c) => (c === addr ? "" : c)), 1500);
  }

  async function generate() {
    setBusy(true);
    try {
      const a = await api.createHiddenAlias(label.trim());
      setAliases((p) => [a, ...(p || [])]);
      setLabel("");
      await copy(a.address);
      notify("Alias created", "Copied to clipboard. Paste it wherever you sign up.", "success");
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(a, v) {
    setAliases((p) => p.map((x) => (x.address === a.address ? { ...x, enabled: v } : x)));
    try {
      await api.updateHiddenAlias(a.address, { enabled: v });
    } catch (e) {
      setAliases((p) => p.map((x) => (x.address === a.address ? { ...x, enabled: !v } : x)));
      notifyError(e);
    }
  }

  async function remove(a) {
    try {
      await api.removeHiddenAlias(a.address);
      setAliases((p) => p.filter((x) => x.address !== a.address));
    } catch (e) {
      notifyError(e);
    }
  }

  async function showSenders(addr) {
    if (openSenders === addr) {
      setOpenSenders("");
      return;
    }
    setOpenSenders(addr);
    if (!senders[addr]) {
      try {
        const d = await api.hiddenAliasSenders(addr);
        setSenders((p) => ({ ...p, [addr]: d.senders || [] }));
      } catch (e) {
        notifyError(e);
      }
    }
  }

  return (
    <div className="em-card">
      <div className="em-card-head">
        <h2 className="em-card-title">Hidden aliases</h2>
        <p className="em-card-sub">
          Generate a unique address for each site. Everything lands in your inbox. If one starts
          getting spam you can see who leaked it, then switch it off in one tap.
        </p>
      </div>
      <div className="em-alias-add">
        <div className="em-alias-input">
          <input
            aria-label="Label"
            placeholder="What's it for? (optional, e.g. Amazon)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <Button type="button" variant="primary" icon={Plus} loading={busy} onClick={generate}>
          Generate alias
        </Button>
      </div>
      {!aliases ? (
        <Loader size="sm" />
      ) : aliases.length === 0 ? (
        <div className="em-empty-hint">No hidden aliases yet.</div>
      ) : (
        <div className="em-alias-list">
          {aliases.map((a) => (
            <div key={a.address} className="em-hidden-alias">
              <div className="em-hidden-main">
                <button
                  type="button"
                  className={`em-hidden-addr${a.enabled ? "" : " is-off"}`}
                  onClick={() => copy(a.address)}
                  title="Copy address"
                >
                  <span>{a.address}</span>
                  {copied === a.address ? <Check size={14} weight="bold" /> : <ClipboardText size={14} />}
                </button>
                <div className="em-hidden-meta">
                  {a.label && <span className="em-hidden-label">{a.label}</span>}
                  <span>{a.recvCount} received</span>
                  {a.lastSeen ? <span>· {relativeTime(a.lastSeen)}</span> : null}
                </div>
              </div>
              <div className="em-hidden-actions">
                {a.recvCount > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => showSenders(a.address)}>
                    Senders
                  </Button>
                )}
                <Switch
                  aria-label="Active"
                  checked={a.enabled}
                  onCheckedChange={(v) => toggle(a, v)}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  shape="square"
                  aria-label="Delete alias"
                  icon={Trash}
                  onClick={() => remove(a)}
                />
              </div>
              {openSenders === a.address && (
                <div className="em-hidden-senders">
                  {!senders[a.address] ? (
                    <Loader size="sm" />
                  ) : senders[a.address].length === 0 ? (
                    <span className="em-empty-hint">No senders recorded yet.</span>
                  ) : (
                    senders[a.address].map((s) => (
                      <div key={s.address} className="em-hidden-sender">
                        <span className="em-hidden-sender-name">{s.name || s.address}</span>
                        <span className="em-hidden-sender-addr">{s.address}</span>
                        <span className="em-hidden-sender-count">{s.count}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
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
      await pgp.rememberPass(pass);
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

const FIELD_LABELS = { from: "From", to: "To", subject: "Subject" };
const ACTION_LABELS = {
  read: "mark as read",
  archive: "archive it",
  star: "star it",
  spam: "move to spam",
};

function Filters() {
  const [filters, setFilters] = useState(null);
  const [field, setField] = useState("from");
  const [matchValue, setMatchValue] = useState("");
  const [action, setAction] = useState("archive");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .filters()
      .then((d) => setFilters(d.filters || []))
      .catch(notifyError);
  }, []);

  async function add(e) {
    e.preventDefault();
    const v = matchValue.trim();
    if (!v) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.createFilter({ field, matchValue: v, action });
      setFilters((p) => [...(p || []), res]);
      setMatchValue("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    try {
      await api.deleteFilter(id);
      setFilters((p) => (p || []).filter((f) => f.id !== id));
    } catch (err) {
      notifyError(err);
    }
  }

  return (
    <div className="em-card">
      <div className="em-card-head">
        <h2 className="em-card-title">Filters</h2>
        <p className="em-card-sub">
          Rules run on incoming mail, top to bottom. Matching is a simple contains check, not
          case-sensitive.
        </p>
      </div>

      {!filters ? (
        <Loader size="sm" />
      ) : filters.length === 0 ? (
        <div className="em-keys-empty">No filters yet. Add one below.</div>
      ) : (
        <div className="em-filter-list">
          {filters.map((f) => (
            <div key={f.id} className="em-filter-row">
              <span className="em-filter-rule">
                If <strong>{FIELD_LABELS[f.field] || f.field}</strong> contains{" "}
                <span className="em-filter-needle">{f.match_value}</span>, then{" "}
                <strong>{ACTION_LABELS[f.action] || f.action}</strong>.
              </span>
              <Button
                size="sm"
                variant="ghost"
                shape="square"
                aria-label="Delete filter"
                icon={Trash}
                onClick={() => remove(f.id)}
              />
            </div>
          ))}
        </div>
      )}

      <form className="em-filter-add" onSubmit={add}>
        <span className="em-filter-lead">If</span>
        <Select aria-label="Field" size="sm" value={field} onValueChange={setField}>
          {Object.entries(FIELD_LABELS).map(([k, v]) => (
            <Select.Option key={k} value={k}>
              {v}
            </Select.Option>
          ))}
        </Select>
        <span className="em-filter-lead">contains</span>
        <Input
          aria-label="Match value"
          placeholder="text to match"
          value={matchValue}
          onChange={(e) => {
            setMatchValue(e.target.value);
            setError("");
          }}
        />
        <span className="em-filter-lead">then</span>
        <Select aria-label="Action" size="sm" value={action} onValueChange={setAction}>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <Select.Option key={k} value={k}>
              {v}
            </Select.Option>
          ))}
        </Select>
        <Button type="submit" variant="outline" icon={Plus} loading={busy}>
          Add
        </Button>
      </form>
      {error && (
        <div className="em-form-error" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function Notifications() {
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supported) return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager?.getSubscription();
        setEnabled(!!sub && Notification.permission === "granted");
      } catch {}
    })();
  }, [supported]);

  async function enable() {
    setBusy(true);
    setMessage("");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage(
          permission === "denied"
            ? "Notifications are blocked. Allow them in your browser site settings, then try again."
            : "Permission was not granted.",
        );
        return;
      }
      const { key } = await api.pushKey();
      if (!key) {
        setMessage("Push is not configured on the server.");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const json = sub.toJSON();
      await api.pushSubscribe({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      setEnabled(true);
      notify("Notifications on", "You'll get a browser alert when new mail arrives.", "success");
    } catch (err) {
      setMessage(err.message || "Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage("");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager?.getSubscription();
      if (sub) {
        await api.pushUnsubscribe(sub.endpoint).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setEnabled(false);
    } catch (err) {
      setMessage(err.message || "Could not disable notifications.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="em-card">
      <div className="em-card-head">
        <h2 className="em-card-title">Notifications</h2>
        <p className="em-card-sub">
          Get a browser notification when new mail arrives, even when this tab is closed. Works per
          device and browser.
        </p>
      </div>
      {!supported ? (
        <div className="em-keys-empty">This browser does not support web push notifications.</div>
      ) : (
        <div className="em-toggle-row">
          <div className="em-toggle-copy">
            <div className="em-toggle-title">New mail notifications</div>
            <div className="em-toggle-sub">
              Spam is never notified. On iOS, add this site to your home screen first.
            </div>
          </div>
          <Switch
            aria-label="New mail notifications"
            checked={enabled}
            disabled={busy}
            onCheckedChange={(v) => (v ? enable() : disable())}
          />
        </div>
      )}
      {message && (
        <div className="em-form-error" style={{ marginTop: 8 }}>
          {message}
        </div>
      )}
    </div>
  );
}

function Domains() {
  const [domains, setDomains] = useState(null);
  const [directory, setDirectory] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState("");
  const [lookups, setLookups] = useState({});

  useEffect(() => {
    api
      .domains()
      .then((d) => setDomains(d.domains || []))
      .catch(notifyError);
    api
      .publicDomains()
      .then((d) => setDirectory(d.domains || []))
      .catch(() => {});
  }, []);

  async function add(e) {
    e.preventDefault();
    const d = input.trim().toLowerCase();
    if (!d) return;
    setBusy(true);
    setError("");
    try {
      await api.addDomain(d);
      setInput("");
      const res = await api.domains();
      setDomains(res.domains || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(id) {
    setVerifying(id);
    try {
      const res = await api.verifyDomain(id);
      setLookups((p) => ({ ...p, [id]: res }));
      setDomains((p) =>
        (p || []).map((d) =>
          d.id === id ? { ...d, verified: res.verified, sendVerified: res.sendVerified } : d,
        ),
      );
      if (res.verified && res.sendVerified)
        notify("Domain ready", "This domain can send and receive mail.", "success");
      else if (res.verified)
        notify("Receiving verified", "Set up Email Sending to send from it too.", "success");
    } catch (err) {
      notifyError(err);
    } finally {
      setVerifying("");
    }
  }

  async function togglePublic(d, v) {
    setDomains((p) => (p || []).map((x) => (x.id === d.id ? { ...x, public: v } : x)));
    try {
      await api.setDomainPublic(d.id, v);
    } catch (err) {
      setDomains((p) => (p || []).map((x) => (x.id === d.id ? { ...x, public: !v } : x)));
      notifyError(err);
    }
  }

  async function remove(id) {
    try {
      await api.removeDomain(id);
      setDomains((p) => (p || []).filter((d) => d.id !== id));
    } catch (err) {
      notifyError(err);
    }
  }

  return (
    <>
      <div className="em-card">
        <div className="em-card-head">
          <h2 className="em-card-title">Your domains</h2>
          <p className="em-card-sub">
            Add your own domain to send and receive mail on it. Domains are private to you. Publish
            one to list it in the public directory so other people here can make addresses on it too.
          </p>
        </div>

        {!domains ? (
          <Loader size="sm" />
        ) : (
          <div className="em-alias-list">
            {domains.map((d) => (
              <div key={d.id} className="em-domain-row">
                <div className="em-domain-main">
                  <span className="em-alias-addr">{d.domain}</span>
                  {d.verified ? (
                    <Badge variant="green" icon={CheckCircle}>
                      receiving
                    </Badge>
                  ) : (
                    <Badge variant="neutral" icon={Warning}>
                      no receiving
                    </Badge>
                  )}
                  {d.sendVerified ? (
                    <Badge variant="green" icon={CheckCircle}>
                      sending
                    </Badge>
                  ) : (
                    <Badge variant="neutral" icon={Warning}>
                      no sending
                    </Badge>
                  )}
                  {d.builtIn && <Badge variant="purple">built-in</Badge>}
                </div>
                {!d.builtIn && (
                  <div className="em-alias-actions">
                    <Button
                      size="sm"
                      variant="outline"
                      icon={ShieldCheck}
                      loading={verifying === d.id}
                      onClick={() => verify(d.id)}
                    >
                      Verify
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      shape="square"
                      aria-label="Remove domain"
                      icon={Trash}
                      onClick={() => remove(d.id)}
                    />
                  </div>
                )}
                {!d.builtIn && d.verified && (
                  <label className="em-domain-public">
                    <Switch
                      aria-label="List in public directory"
                      checked={!!d.public}
                      onCheckedChange={(v) => togglePublic(d, v)}
                    />
                    <span>List in public directory</span>
                  </label>
                )}
                {lookups[d.id] && (
                  <div className="em-domain-lookup">
                    <div className="em-dns-check">
                      <span className={lookups[d.id].verified ? "is-ok" : "is-bad"}>
                        {lookups[d.id].verified ? "✓" : "✗"} Receiving (MX, Cloudflare Email Routing)
                      </span>
                      <span className={lookups[d.id].sending?.spf ? "is-ok" : "is-bad"}>
                        {lookups[d.id].sending?.spf ? "✓" : "✗"} SPF record
                      </span>
                      <span className={lookups[d.id].sending?.dkim ? "is-ok" : "is-bad"}>
                        {lookups[d.id].sending?.dkim ? "✓" : "✗"} DKIM record
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <form className="em-alias-add" onSubmit={add}>
          <div className="em-alias-input">
            <input
              aria-label="New domain"
              placeholder="example.com"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError("");
              }}
            />
          </div>
          <Button type="submit" variant="outline" icon={Plus} loading={busy}>
            Add domain
          </Button>
        </form>
        {error && (
          <div className="em-form-error" style={{ marginTop: 8 }}>
            {error}
          </div>
        )}

        <div className="em-dns-steps">
          <div className="em-dns-steps-title">Setup</div>
          <ol>
            <li>The domain must be on the Cloudflare account that runs this mail server.</li>
            <li>
              Enable Email Routing (adds the MX records) and point the catch-all at this worker, then
              enable Email Sending (adds SPF + DKIM).
            </li>
            <li>
              Press Verify. Receiving passes once the MX resolves, sending once SPF and DKIM resolve.
            </li>
          </ol>
        </div>
      </div>

      {directory.length > 0 && (
        <div className="em-card">
          <div className="em-card-head">
            <h2 className="em-card-title">Public directory</h2>
            <p className="em-card-sub">
              Domains other people have published. You can make addresses on these too.
            </p>
          </div>
          <div className="em-alias-list">
            {directory.map((d) => (
              <div key={d} className="em-domain-row">
                <span className="em-alias-addr">{d}</span>
                <Badge variant="purple" icon={Globe}>
                  public
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const SECTIONS = [
  { id: "account", label: "Account", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "domains", label: "Domains", icon: Globe },
  { id: "filters", label: "Filters", icon: Funnel },
  { id: "encryption", label: "Encryption", icon: LockKey },
  { id: "developer", label: "Developer", icon: Code },
];

export function Settings({ open, user, setUser, mode, onSetMode, palette, onSetPalette, onClose }) {
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [signature, setSignature] = useState(user.signature || "");
  const [imagesDefault, setImagesDefault] = useState(!!user.settings?.imagesDefault);
  const [catchAll, setCatchAll] = useState(!!user.settings?.catchAll);
  const [aiSpam, setAiSpam] = useState(user.settings?.aiSpam !== false);
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [section, setSection] = useState("account");
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

  async function saveAiSpam(v) {
    setAiSpam(v);
    try {
      const data = await api.saveSettings({
        displayName,
        signature,
        settings: { ...user.settings, theme: mode, palette, imagesDefault, catchAll, aiSpam: v },
      });
      setUser(data.user);
    } catch (e) {
      setAiSpam(!v);
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
      <Dialog className="em-settings-dialog" style={{ width: 760, maxWidth: "94vw", padding: 0 }}>
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
          <nav className="em-settings-rail">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.id;
              return (
                <button
                  type="button"
                  key={s.id}
                  className={`em-settings-nav${active ? " is-active" : ""}`}
                  onClick={() => setSection(s.id)}
                >
                  <Icon size={17} weight={active ? "fill" : "regular"} />
                  <span>{s.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="em-settings-content">
          {section === "account" && (
          <>
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

          <HiddenAliases />

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

          <Button variant="primary" loading={busy} onClick={save}>
            Save changes
          </Button>
          </>
          )}

          {section === "appearance" && (
          <>
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

          <Button variant="primary" loading={busy} onClick={save}>
            Save changes
          </Button>
          </>
          )}

          {section === "notifications" && <Notifications />}

          {section === "domains" && <Domains />}

          {section === "filters" && (
            <>
              <div className="em-card">
                <div className="em-card-head">
                  <h2 className="em-card-title">Spam filter</h2>
                </div>
                <div className="em-toggle-row">
                  <div className="em-toggle-copy">
                    <div className="em-toggle-title">Smart spam detection</div>
                    <div className="em-toggle-sub">
                      Automatically move scams, phishing, and junk to the spam folder. Your data is
                      not stored or used for training.
                    </div>
                  </div>
                  <Switch aria-label="Smart spam detection" checked={aiSpam} onCheckedChange={saveAiSpam} />
                </div>
              </div>
              <Filters />
            </>
          )}

          {section === "encryption" && <Encryption user={user} setUser={setUser} />}

          {section === "developer" && <ApiKeys />}
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
