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

  const meta = release
    ? [`Version ${release.versionName}`, release.size && `${(release.size / 1048576).toFixed(1)} MB`, `Android ${{ 26: "8", 27: "8.1", 28: "9" }[release.minSdk] ?? (release.minSdk ?? 26) - 19} or newer`]
        .filter(Boolean)
        .join(", ")
    : release === null
      ? "Not released yet"
      : " ";

  return (
    <DialogRoot open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog className="em-label-dialog em-app-dialog">
        <div className="em-app-grid">
        <div className="em-app-side">
          <img className="em-app-icon" src="/icon-192.png" alt="" />
          <Dialog.Title className="em-app-title">Estrogen Mail for Android</Dialog.Title>
          <p className="em-app-lede">Your mail and calendar on your phone. The app updates itself.</p>
          <div className="em-app-cta">
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
            <span className="em-app-meta">{meta}</span>
          </div>
        </div>
        <div className="em-app-art" aria-hidden="true">
          <div className="em-phone">
            <img className="em-phone-shot" src="/app-inbox.webp" alt="" />
          </div>
        </div>
        </div>
        <Button
          className="em-app-close"
          size="sm"
          variant="ghost"
          shape="square"
          aria-label="Close"
          icon={X}
          onClick={onClose}
        />
      </Dialog>
    </DialogRoot>
  );
}
