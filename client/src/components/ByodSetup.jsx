import { Button, ClipboardText, Input } from "@cloudflare/kumo";
import { RocketLaunch, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api.js";
import { notify } from "../toast.js";

const STEPS = 3;

export function ByodSetup({ open, existing, onClose, onDone }) {
  const [step, setStep] = useState(1);
  const [domain, setDomain] = useState("");
  const [created, setCreated] = useState(null);
  const [relayUrl, setRelayUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setBusy(false);
    setVerifying(false);
    if (existing?.domain) {
      setDomain(existing.domain);
      setBusy(true);
      api
        .addByodDomain(existing.domain)
        .then((res) => {
          setCreated(res);
          setRelayUrl(res.relayUrl || "");
          setStep(2);
        })
        .catch((e) => setError(e.message || "could not load domain"))
        .finally(() => setBusy(false));
    } else {
      setStep(1);
      setDomain("");
      setCreated(null);
      setRelayUrl("");
    }
  }, [open, existing]);

  function close() {
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
      setRelayUrl(res.relayUrl || "");
      setStep(2);
    } catch (e) {
      setError(e.message || "could not add domain");
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const res = await api.setupRelay(created.id, relayUrl.trim());
      if (res.verified) return done();
      setBusy(false);
      setVerifying(true);
      let ok = false;
      for (let i = 0; i < 30 && !ok; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          ok = (await api.relayStatus(created.id)).verified;
        } catch {}
      }
      if (ok) return done();
      setVerifying(false);
      setError(
        "Sent a verification email to your domain but didn't see it come back. Make sure the Email Routing catch-all points at your Worker, then try again.",
      );
    } catch (e) {
      setError(e.message || "could not connect");
    } finally {
      setBusy(false);
    }
  }

  function done() {
    notify("Domain connected", `${created.domain} is ready to send and receive.`, "success");
    onDone?.();
    close();
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
        <div className="em-setup-steps">
          {Array.from({ length: STEPS }, (_, i) => (
            <div key={i} className={`em-setup-step ${step >= i + 1 ? "active" : ""}`} />
          ))}
        </div>
        <div className="em-label-head">
          <h2 className="em-label-title">Bring your own domain</h2>
          <Button
            size="sm"
            variant="ghost"
            shape="square"
            aria-label="Close"
            icon={X}
            onClick={close}
          />
        </div>

        {step === 1 && (
          <div className="em-setup-body">
            <p className="em-card-sub">
              Use a domain on <strong>your own</strong> Cloudflare account. You'll deploy a tiny
              Worker with one click that bridges it to your mailbox here, for sending and receiving.
              Nothing leaves your account.
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
            <div className="em-byod-block">
              <div className="em-byod-block-title">1. Install the Worker</div>

              <Button
                variant="primary"
                icon={RocketLaunch}
                onClick={() => window.open(created.deployUrl, "_blank", "noopener,noreferrer")}
              >
                Deploy to Cloudflare
              </Button>
            </div>

            <div className="em-byod-block">
              <div className="em-byod-block-title">2. Use this as "RELAY_CONFIG"</div>
              <p className="em-byod-hint">
                When Cloudflare asks you for <code className="em-inline-code">RELAY_CONFIG</code>,
                copy this and paste it there.
              </p>
              <ClipboardText
                text={created.relayConfig}
                className="em-byod-clip"
                tooltip={{ text: "Copy", copiedText: "Copied!", side: "top" }}
              />
            </div>

            <div className="em-byod-block">
              <div className="em-byod-block-title">3. Set up Email Routing and Sending</div>
              <p className="em-byod-hint">
                In Cloudflare, go to <strong>{created.domain} → Email</strong> and do both:
              </p>
              <ul className="em-byod-steps">
                <li>
                  <strong>Email Routing</strong>: open <strong>Routing rules</strong>, enable{" "}
                  <strong>Catch-all</strong> and edit the action to{" "}
                  <strong>Send to a Worker</strong> → <strong>email-worker</strong>. Then, save.
                </li>
                <li>
                  <strong>Email Sending</strong>: turn it <strong>on</strong> for {created.domain}.
                  You may need to onboard the domain first.
                </li>
              </ul>
            </div>

            {error && <div className="em-form-error">{error}</div>}
            <Button variant="primary" onClick={() => setStep(3)}>
              Done, continue
            </Button>
          </div>
        )}

        {step === 3 && created && (
          <div className="em-setup-body">
            <p className="em-byod-hint">
              Find it in Cloudflare under <strong>Workers &amp; Pages → email-worker</strong> (the{" "}
              <code className="em-inline-code">.workers.dev</code> URL near the top).
            </p>
            <Input
              autoFocus
              label="Worker URL"
              placeholder="https://email-worker.your-subdomain.workers.dev"
              value={relayUrl}
              disabled={verifying}
              onChange={(e) => {
                setRelayUrl(e.target.value);
                setError("");
              }}
            />
            {verifying && (
              <div className="em-byod-hint">Verifying… this can take up to a minute.</div>
            )}
            {error && <div className="em-form-error">{error}</div>}
            <div className="em-byod-actions">
              <Button variant="ghost" disabled={verifying} onClick={() => setStep(2)}>
                Back
              </Button>
              <Button variant="primary" loading={busy || verifying} onClick={connect}>
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
