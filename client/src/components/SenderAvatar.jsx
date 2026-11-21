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

function brandDomain(address) {
  const host = String(address || "").split("@")[1]?.toLowerCase().trim();
  if (!host || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
  const parts = host.split(".");
  const keep = parts.length > 2 && parts.at(-2).length <= 3 && parts.at(-1).length === 2 ? 3 : 2;
  const root = parts.slice(-keep).join(".");
  return FREE_MAIL.has(root) ? null : root;
}

const failed = new Set();

export function SenderAvatar({ from, className = "" }) {
  const domain = brandDomain(from?.address);
  const src = from?.avatar || (domain && !failed.has(domain) ? `/api/logo/${domain}` : null);
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <span className={`em-avatar ${className}`}>{initials(from || {})}</span>;
  return (
    <img
      className={`em-avatar em-avatar-img${from?.avatar ? "" : " em-avatar-logo"} ${className}`}
      src={src}
      alt=""
      onError={() => {
        if (domain) failed.add(domain);
        setBroken(true);
      }}
    />
  );
}
