import { Button, Dialog, DialogRoot, Input } from "@cloudflare/kumo";
import { LockKey, ShieldCheck } from "@phosphor-icons/react";
import { useState } from "react";
import { api } from "../api.js";
import * as pgp from "../pgp.js";
import { notify } from "../toast.js";

const DISMISS_KEY = "em-e2e-prompt";

export function E2EPrompt({ user, setUser, onClose }) {
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    onClose();
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
      pgp.rememberPass(pass);
      const d = await api.me();
      if (d.user) setUser(d.user);
      try {
        localStorage.setItem(DISMISS_KEY, "1");
      } catch {}
      notify("Encryption on", "Incoming mail is now encrypted to your key.", "success");
      onClose();
    } catch (err) {
      setError(err.message || "Could not enable encryption.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogRoot open onOpenChange={(o) => !o && dismiss()}>
      <Dialog className="em-e2e-dialog" style={{ width: 460, maxWidth: "94vw" }}>
        <div className="em-e2e-icon">
          <ShieldCheck size={30} weight="fill" />
        </div>
        <Dialog.Title className="em-e2e-title">Turn on end-to-end encryption</Dialog.Title>
        <p className="em-e2e-copy">
          Encrypt your inbox so only you can read it. New mail is encrypted to your key the moment
          it arrives, and your passphrase never leaves this device. Pick something you'll remember,
          if you lose it, your encrypted mail can't be recovered.
        </p>
        <form className="em-e2e-form" onSubmit={enable}>
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
          <div className="em-e2e-actions">
            <Button type="button" variant="ghost" onClick={dismiss}>
              Maybe later
            </Button>
            <Button type="submit" variant="primary" icon={LockKey} loading={busy}>
              Enable encryption
            </Button>
          </div>
        </form>
      </Dialog>
    </DialogRoot>
  );
}

export function shouldPromptE2E(user) {
  if (!user || user.pgpEnabled) return false;
  try {
    return localStorage.getItem(DISMISS_KEY) !== "1";
  } catch {
    return false;
  }
}
