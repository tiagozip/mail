import { handleApi } from "./api.js";
import { reverifyAllDomains } from "./domains.js";
import { handleEmail } from "./mail.js";
import { processScheduledSends, wakeSnoozed } from "./scheduler.js";
import { error } from "./util.js";

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = {
  "content-security-policy": CSP,
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "cross-origin-opener-policy": "same-origin",
};

function harden(res) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

const ASSETLINKS = JSON.stringify([
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "zip.estrogen.mail",
      sha256_cert_fingerprints: [
        "46:BF:97:9E:5D:2E:33:3B:E8:7E:AC:92:9E:70:8D:78:29:A5:EA:51:B7:C7:B6:01:E6:BD:7B:DD:15:7D:C5:C3",
        "2C:98:9F:0E:53:6A:AA:B1:BA:ED:B8:71:20:69:13:48:D7:47:77:62:69:13:EA:AC:18:71:9C:18:93:B2:F7:E7",
      ],
    },
  },
]);

function appAuthPage(code) {
  const c = String(code || "").replace(/[^a-fA-F0-9]/g, "");
  const deep = `zip.estrogen.mail://auth?code=${c}`;
  const deepJson = JSON.stringify(deep);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Opening Estrogen Mail</title><style>:root{color-scheme:dark}body{font-family:-apple-system,Roboto,'Segoe UI',sans-serif;background:#1d171f;color:#faecf2;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px}.c{max-width:320px}h1{font-size:20px;margin:0 0 8px}p{color:#d3c0cb;margin:0 0 24px;line-height:1.5}a{display:inline-block;padding:14px 28px;background:#bf3264;color:#fff;border-radius:28px;text-decoration:none;font-weight:600}</style></head><body><div class="c"><h1>Opening Estrogen Mail…</h1><p>If the app doesn't open automatically, tap below.</p><a href="${deep}">Open the app</a></div><script>setTimeout(function(){location.href=${deepJson}},120)</script></body></html>`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/.well-known/assetlinks.json") {
      return new Response(ASSETLINKS, {
        headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
      });
    }
    if (url.pathname === "/app/auth") {
      return harden(
        new Response(appAuthPage(url.searchParams.get("code")), {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
    if (url.pathname.startsWith("/api/")) {
      let res;
      try {
        res = await handleApi(request, env, ctx);
      } catch (e) {
        console.error("api error", e?.stack || e);
        res = error(500, "internal error");
      }
      return harden(res);
    }
    const res = await env.ASSETS.fetch(request);
    if ((request.headers.get("accept") || "").includes("text/html")) return harden(res);
    return res;
  },

  async email(message, env, ctx) {
    try {
      await handleEmail(message, env, ctx);
    } catch (e) {
      console.error("email handler error", e?.stack || e);
      message.setReject("451 4.3.0 Temporary processing error");
    }
  },

  async scheduled(event, env, ctx) {
    if (event.cron === "17 7 * * *") {
      ctx.waitUntil(
        reverifyAllDomains(env).catch((e) => console.error("reverify error", e?.stack || e)),
      );
      return;
    }
    ctx.waitUntil(
      Promise.all([
        processScheduledSends(env).catch((e) => console.error("sched send error", e?.stack || e)),
        wakeSnoozed(env).catch((e) => console.error("wake snooze error", e?.stack || e)),
      ]),
    );
  },
};
