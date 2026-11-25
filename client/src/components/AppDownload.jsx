import { Button, Dialog, DialogRoot } from "@cloudflare/kumo";
import { DownloadSimple, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

export function AppDownload({ open, onClose }) {
  const [release, setRelease] = useState(undefined);

  useEffect(() => {
    if (!open || release !== undefined) return;
    fetch("/api/app/android.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setRelease)
      .catch(() => setRelease(null));
  }, [open, release]);

  const mb = release?.size ? `${(release.size / 1048576).toFixed(1)} MB` : null;

  return (
    <DialogRoot open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog className="em-label-dialog" style={{ width: 720, maxWidth: "94vw", padding: 0, overflow: "hidden" }}>
        <div className="em-app-split">
          <div className="em-app-side">
        <div className="em-label-head">
          <Dialog.Title className="em-label-title">Estrogen Mail for Android</Dialog.Title>
          <Button size="sm" variant="ghost" shape="square" aria-label="Close" icon={X} onClick={onClose} />
        </div>
        <div className="em-label-body em-app-dl">
          <p className="em-card-sub">
            Your inbox, calendar and notifications in a native app. It signs in with hrtID and keeps
            itself up to date, so you only install it once.
          </p>
          <dl className="em-app-facts">
            <dt>Version</dt>
            <dd>{release === undefined ? "Checking" : release ? release.versionName : "Not released yet"}</dd>
            {mb && (
              <>
                <dt>Size</dt>
                <dd>{mb}</dd>
              </>
            )}
            <dt>Needs</dt>
            <dd>Android 8 or newer</dd>
          </dl>
          {release?.notes && <p className="em-app-notes">{release.notes}</p>}
          <p className="em-card-sub">
            Your phone will ask you to allow installs from your browser the first time. Updates after
            that come from inside the app.
          </p>
          <Button
            variant="primary"
            icon={DownloadSimple}
            disabled={!release}
            onClick={() => {
              location.href = "/api/app/android.apk";
            }}
          >
            Download APK
          </Button>
        </div>
          </div>
        <div className="em-app-art" aria-hidden="true">
          <div className="em-phone">
            <div className="em-phone-screen">
              <div className="em-phone-bar" />
              <div className="em-phone-title">Inbox</div>
              {[
                ["#f08aae", 62, 88, true],
                ["#b9a0f5", 48, 72, true],
                ["#6fd3bf", 70, 64, false],
                ["#f0b766", 40, 80, false],
                ["#f08aae", 56, 70, false],
                ["#b9a0f5", 66, 58, false],
              ].map(([c, a, b, unread], i) => (
                <div key={i} className={`em-phone-row${unread ? " is-unread" : ""}`}>
                  <span className="em-phone-av" style={{ background: c }} />
                  <span className="em-phone-lines">
                    <span style={{ width: `${a}%` }} />
                    <span style={{ width: `${b}%` }} />
                  </span>
                </div>
              ))}
              <span className="em-phone-fab" />
            </div>
          </div>
        </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
