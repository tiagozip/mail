import { useState } from "react";
import { initials } from "../util.js";

const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "aol.com",
  "gmx.com",
  "gmx.de",
  "yandex.com",
  "mail.ru",
  "zoho.com",
  "fastmail.com",
  "tuta.io",
  "estrogen.delivery",
]);

const SECOND_LEVEL = new Set(["co", "com", "org", "net", "ac", "gov", "edu"]);

function brandDomain(address) {
  const host = String(address || "").split("@")[1]?.toLowerCase().trim();
  if (!host || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
  const parts = host.split(".");
  const keep =
    parts.length > 2 && parts.at(-1).length === 2 && SECOND_LEVEL.has(parts.at(-2)) ? 3 : 2;
  const root = parts.slice(-keep).join(".");
  return FREE_MAIL.has(root) ? null : root;
}

const failed = new Set();

let randomAvatars = (() => {
  try {
    return localStorage.getItem("em-random-avatars") === "1";
  } catch {
    return false;
  }
})();

export function setRandomAvatars(on) {
  randomAvatars = !!on;
  try {
    localStorage.setItem("em-random-avatars", on ? "1" : "0");
  } catch {}
}

export function SenderAvatar({ from, className = "" }) {
  const domain = brandDomain(from?.address);
  const sources = [
    from?.avatar && { src: from.avatar, kind: "user" },
    domain && { src: `/api/logo/${domain}`, kind: "logo" },
    from?.hash && { src: `/api/gravatar/${from.hash}`, kind: "user" },
    randomAvatars &&
      (from?.hash || from?.address) && {
        src: `https://avatars.tiago.zip/random.png?seed=${from.hash || encodeURIComponent(from.address)}`,
        kind: "user",
      },
  ].filter((x) => x && !failed.has(x.src));
  const [, bump] = useState(0);
  const pick = sources[0];
  if (!pick) return <span className={`em-avatar ${className}`}>{initials(from || {})}</span>;
  return (
    <img
      key={pick.src}
      className={`em-avatar em-avatar-img${pick.kind === "logo" ? " em-avatar-logo" : ""} ${className}`}
      src={pick.src}
      alt=""
      onError={() => {
        failed.add(pick.src);
        bump((n) => n + 1);
      }}
    />
  );
}
