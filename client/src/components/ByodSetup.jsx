import { Button, Input } from "@cloudflare/kumo";
import { Check, Copy, X } from "@phosphor-icons/react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api.js";
import { notify, notifyError } from "../toast.js";

function CopyField({ label, value, mono }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="em-byod-field">
      {label && <label className="em-field-label">{label}</label>}
      <div className="em-byod-copyrow">
        <code className={mono ? "em-byod-code" : "em-byod-val"}>{value}</code>
        <Button
          size="sm"
          variant="ghost"
          shape="square"
          aria-label="Copy"
          icon={copied ? Check : Copy}
          onClick={() => {
            navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
        />
      </div>
    </div>
  );
}

export function ByodSetup({ open, onClose, onDone }) {
  const [step, setStep] = useState(1);
  const [domain, setDomain] = useState("");
  const [created, setCreated] = useState(null);
  const [relayUrl, setRelayUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setStep(1);
    setDomain("");
    setCreated(null);
    setRelayUrl("");
    setError("");
  }

  function close() {
    reset();
    onClose();
  }

  async function add() {
    const d = domain.trim().toLowerCase();
    if (!d) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.addByodDomain(d);
      setCreated(res);
      setStep(2);
    } catch (e) {
      setError(e.message || "could not add domain");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError("");
    try {
      await api.setupRelay(created.id, relayUrl.trim());
      notify("Domain connected", `${created.domain} is ready to send and receive.`, "success");
      onDone?.();
      close();
    } catch (e) {
      setError(e.message || "verification failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return createPortal(
    <div
      className="em-modal-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="em-modal-panel em-setup-dialog">
        <div className="em-setup-progress">Step {step} of 3</div>
        <div className="em-setup-steps">
          <div className={`em-setup-step ${step >= 1 ? "active" : ""}`} />
          <div className={`em-setup-step ${step >= 2 ? "active" : ""}`} />
          <div className={`em-setup-step ${step >= 3 ? "active" : ""}`} />
        </div>
        <div className="em-label-head">
          <h2 className="em-label-title">Bring your own domain</h2>
          <Button size="sm" variant="ghost" shape="square" aria-label="Close" icon={X} onClick={close} />
        </div>

        {step === 1 && (
          <div className="em-setup-body">
            <p className="em-card-sub">
              Use a domain on <strong>your own</strong> Cloudflare account. You'll deploy a tiny relay
              Worker that bridges it to your mailbox here, for both sending and receiving. Nothing
              leaves your account.
            </p>
            <Input
              autoFocus
              label="Domain"
              placeholder="example.com"
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
                setError("");
              }}
            />
            {error && <div className="em-form-error">{error}</div>}
            <Button variant="primary" loading={busy} onClick={add}>
              Continue
            </Button>
          </div>
        )}

        {step === 2 && created && (
          <div className="em-setup-body">
            <p className="em-card-sub">
              On <strong>your</strong> Cloudflare account: add <strong>{created.domain}</strong>,
              enable Email Sending and Email Routing for it, then deploy the relay Worker below.
            </p>

            <div className="em-byod-block">
              <div className="em-byod-block-title">1. Prove you own it — add this DNS TXT record</div>
              <CopyField label={`_estrogen.${created.domain}`} value={created.verifyToken} mono />
            </div>

            <div className="em-byod-block">
              <div className="em-byod-block-title">2. Deploy this Worker on your account</div>
              <p className="em-byod-hint">
                Create a Worker, paste this code, and set the three variables below (keep the secret
                private — it's shown only once).
              </p>
              <textarea className="em-byod-template" readOnly value={created.relayTemplate} rows={8} />
              <Button
                size="sm"
                variant="outline"
                icon={Copy}
                onClick={() => {
                  navigator.clipboard?.writeText(created.relayTemplate);
                  notify("Copied", "Relay Worker code copied.", "success");
                }}
              >
                Copy Worker code
              </Button>
              <CopyField label="RELAY_SECRET (secret)" value={created.relaySecret} mono />
              <CopyField label="MAIL_ENDPOINT" value={created.mailEndpoint} mono />
              <CopyField label="DOMAIN" value={created.domain} mono />
            </div>

            <div className="em-byod-block">
              <div className="em-byod-block-title">3. Wire it up</div>
              <p className="em-byod-hint">
                Point your domain's Email Routing catch-all at the Worker, and enable Email Sending
                for the domain (so it can send with DKIM). Then continue.
              </p>
            </div>

            {error && <div className="em-form-error">{error}</div>}
            <Button variant="primary" onClick={() => setStep(3)}>
              I've deployed it
            </Button>
          </div>
        )}

        {step === 3 && created && (
          <div className="em-setup-body">
            <p className="em-card-sub">
              Paste your relay Worker's URL. We'll check the ownership record and do a signed
              handshake with your relay.
            </p>
            <Input
              autoFocus
              label="Relay Worker URL"
              placeholder="https://your-relay.workers.dev"
              value={relayUrl}
              onChange={(e) => {
                setRelayUrl(e.target.value);
                setError("");
              }}
            />
            {error && <div className="em-form-error">{error}</div>}
            <div className="em-byod-actions">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button variant="primary" loading={busy} onClick={verify}>
                Connect domain
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
