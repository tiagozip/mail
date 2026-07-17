import { Button, Dialog, DialogRoot } from "@cloudflare/kumo";
import { X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { fullDate } from "../util.js";

export function SendAtDialog({ open, onClose, onConfirm }) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!open) return;
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    const pad = (n) => String(n).padStart(2, "0");
    setValue(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
    );
  }, [open]);

  if (!open) return null;

  const ts = value ? new Date(value).getTime() : Number.NaN;
  const valid = !Number.isNaN(ts) && ts > Date.now();

  return (
    <DialogRoot open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog className="em-label-dialog" style={{ width: 380, maxWidth: "94vw" }}>
        <div className="em-label-head">
          <Dialog.Title className="em-label-title">Schedule send</Dialog.Title>
          <Button
            size="sm"
            variant="ghost"
            shape="square"
            aria-label="Close"
            icon={X}
            onClick={onClose}
          />
        </div>

        <div className="em-label-body">
          <div>
            <label className="em-field-label" htmlFor="em-sendat-input">
              Date and time
            </label>
            <input
              id="em-sendat-input"
              type="datetime-local"
              className="em-datetime"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <p className="em-card-sub">
            {valid ? `Will send ${fullDate(ts)}.` : "Pick a time in the future."}
          </p>
        </div>

        <div className="em-label-foot">
          <div className="em-label-foot-right">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!valid} onClick={() => onConfirm(ts)}>
              Schedule send
            </Button>
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
