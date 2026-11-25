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
      <Dialog className="em-label-dialog" style={{ width: 440, maxWidth: "94vw" }}>
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
      </Dialog>
    </DialogRoot>
  );
}
