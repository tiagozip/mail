import { Button, Loader } from "@cloudflare/kumo";
import { ClockCountdown, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api.js";
import { notifyError } from "../toast.js";
import { fullDate, recipientLine } from "../util.js";

function toLine(to) {
  if (!to?.length) return "(no recipient)";
  if (typeof to[0] === "string") return to.join(", ");
  return recipientLine(to);
}

export function ScheduledModal({ open, onClose }) {
  const [sends, setSends] = useState(null);

  useEffect(() => {
    if (!open) return;
    setSends(null);
    api
      .scheduledSends()
      .then((d) => setSends(d.sends || []))
      .catch(notifyError);
  }, [open]);

  async function cancel(id) {
    try {
      await api.cancelScheduled(id);
      setSends((p) => (p || []).filter((s) => s.id !== id));
    } catch (e) {
      notifyError(e);
    }
  }

  if (!open) return null;
  return createPortal(
    <div
      className="em-modal-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="em-modal-panel">
        <div className="em-label-head">
          <h2 className="em-label-title">Scheduled</h2>
          <Button size="sm" variant="ghost" shape="square" aria-label="Close" icon={X} onClick={onClose} />
        </div>
        <p className="em-card-sub">
          Messages waiting to be sent later.
        </p>
        {!sends ? (
          <Loader size="sm" />
        ) : sends.length === 0 ? (
          <div className="em-empty">
            <ClockCountdown className="em-empty-icon" size={38} weight="thin" />
            <div className="em-empty-title">No scheduled messages.</div>
          </div>
        ) : (
          <div className="em-sched-list">
            {sends.map((s) => (
              <div key={s.id} className="em-sched-row">
                <div className="em-sched-main">
                  <div className="em-sched-to">{toLine(s.to)}</div>
                  <div className="em-sched-subject">{s.subject || "(no subject)"}</div>
                </div>
                <div className="em-sched-when">{fullDate(s.sendAt)}</div>
                <Button size="sm" variant="ghost" icon={X} onClick={() => cancel(s.id)}>
                  Cancel
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
