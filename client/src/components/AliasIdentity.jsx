import { Button, Dialog, DialogRoot, Input } from "@cloudflare/kumo";
import { Camera, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { notifyError } from "../toast.js";
import { initials, monoColor } from "../util.js";

export function AliasIdentity({ open, alias, onClose, onSaved }) {
  const [displayName, setDisplayName] = useState("");
  const [signature, setSignature] = useState("");
  const [avatar, setAvatar] = useState(null);
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    if (!open || !alias) return;
    setDisplayName(alias.displayName || "");
    setSignature(alias.signature || "");
    setAvatar(alias.avatar || null);
    setBusy(false);
  }, [open, alias]);

  if (!open || !alias) return null;

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarBusy(true);
    try {
      const r = await api.uploadAliasAvatar(alias.address, file);
      setAvatar(r.avatar);
    } catch (err) {
      notifyError(err);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    try {
      await api.deleteAliasAvatar(alias.address);
      setAvatar(null);
    } catch (err) {
      notifyError(err);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      await api.setAliasIdentity(alias.address, { displayName, signature });
      onSaved?.();
      onClose();
    } catch (err) {
      notifyError(err);
      setBusy(false);
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog className="em-label-dialog" style={{ width: 520, maxWidth: "94vw" }}>
        <div className="em-label-head">
          <Dialog.Title className="em-label-title">Identity for {alias.address}</Dialog.Title>
          <Button size="sm" variant="ghost" shape="square" aria-label="Close" icon={X} onClick={onClose} />
        </div>

        <div className="em-label-body">
          <p className="em-card-sub">
            This name and signature are used when you send from this address. A separate identity for
            one account.
          </p>

          <div className="em-avatar-row">
            {avatar ? (
              <img className="em-avatar-lg em-avatar-img" src={avatar} alt="" />
            ) : (
              <span className="em-avatar-lg em-avatar-mono" style={{ background: monoColor(alias.address) }}>
                {initials({ name: displayName, address: alias.address })}
              </span>
            )}
            <div className="em-avatar-actions">
              <input ref={fileInput} type="file" accept="image/*" hidden onChange={onFile} />
              <Button
                size="sm"
                variant="secondary"
                icon={Camera}
                loading={avatarBusy}
                onClick={() => fileInput.current?.click()}
              >
                {avatar ? "Change photo" : "Upload photo"}
              </Button>
              {avatar && (
                <Button size="sm" variant="ghost" onClick={removeAvatar} disabled={avatarBusy}>
                  Remove
                </Button>
              )}
            </div>
          </div>

          <Input
            label="Display name"
            placeholder="e.g. Ashley (bugs)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <div>
            <label className="em-field-label">Signature</label>
            <textarea
              className="em-textarea"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="Appended to mail sent from this address"
            />
          </div>
        </div>

        <div className="em-label-foot">
          <div className="em-label-foot-right">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
