import * as openpgp from "openpgp";
import { sendViaRelay } from "./byod.js";
import { encryptText, tryDecryptBytes } from "./crypto.js";
import { consume } from "./ratelimit.js";
import { expandHtmlBlocks, sanitizeEmailHtml, textToHtml } from "./sanitize.js";
import { bumpContact, htmlKey, insertMessage, resolveThread, updateStorage } from "./store.js";
import { escapeHtml, isValidEmail, normalizeAddr, now, snippetFrom, uuid } from "./util.js";

async function pgpEncryptToSelf(env, userId, content) {
  const row = await env.DB.prepare(
    "SELECT pgp_public_key FROM users WHERE id = ? AND pgp_enabled = 1",
  )
    .bind(userId)
    .first();
  if (!row?.pgp_public_key) return null;
  try {
    const key = await openpgp.readKey({ armoredKey: row.pgp_public_key });
    return await openpgp.encrypt({
      message: await openpgp.createMessage({ text: String(content ?? "") }),
      encryptionKeys: key,
    });
  } catch {
    return null;
  }
}

// Counted here rather than in the api router so scheduled sends, which the
// cron dispatches straight to sendMessage(), stay inside the same budget.
async function checkSendLimit(env, userId) {
  return (await consume(env, "send:day", userId)).ok;
}

function hourKey() {
  return new Date().toISOString().slice(0, 13);
}

async function checkForwardLimit(env, userId) {
  const limit = Number.parseInt(env.FORWARD_HOURLY_LIMIT || "60", 10);
  const key = `fwd:${userId}:${hourKey()}`;
  const current = Number.parseInt((await env.KV.get(key)) || "0", 10);
  if (current >= limit) return false;
  await env.KV.put(key, String(current + 1), { expirationTtl: 7200 });
  return true;
}

export async function forwardInbound(env, { userId, fromAddr, fromName, to, parsed, hops }) {
  const dest = normalizeAddr(to);
  if (!isValidEmail(dest) || !isValidEmail(fromAddr)) return;
  if (!(await checkForwardLimit(env, userId))) {
    console.log("forward rate-limited", userId, "->", dest);
    return;
  }

  const domain = fromAddr.split("@")[1]?.toLowerCase() || "";
  let relayDomain = null;
  if (domain && domain !== String(env.MAIL_DOMAIN || "").toLowerCase()) {
    relayDomain = await env.DB.prepare(
      "SELECT domain, relay_url, relay_secret_enc FROM domains WHERE domain = ? AND owner_id = ? AND send_verified = 1",
    )
      .bind(domain, userId)
      .first();
    if (!relayDomain?.relay_url) {
      console.log("forward skipped: from-domain not sendable", fromAddr);
      return;
    }
  }

  const origFrom = parsed.from || {};
  const origAddr = normalizeAddr(origFrom.address || "");
  const origName = origFrom.name || origAddr;
  const origSubject = parsed.subject || "(no subject)";
  const subject = /^fwd:/i.test(origSubject) ? origSubject : `Fwd: ${origSubject}`;
  const origDate = parsed.date ? new Date(parsed.date).toUTCString() : "";
  const origTo = (parsed.to || [])
    .map((a) => a.address)
    .filter(Boolean)
    .join(", ");

  const headerLines = [
    "---------- Forwarded message ----------",
    `From: ${origName} <${origAddr}>`,
    origDate ? `Date: ${origDate}` : "",
    `Subject: ${origSubject}`,
    origTo ? `To: ${origTo}` : "",
  ].filter(Boolean);

  const text = `${headerLines.join("\n")}\n\n${parsed.text || ""}`;
  const rawHtml = parsed.html || (parsed.text ? textToHtml(parsed.text) : "");
  const headerHtml = `<div style="color:#666;border-left:2px solid #ccc;padding-left:10px;margin-bottom:12px">${headerLines
    .map((l) => escapeHtml(l))
    .join("<br>")}</div>`;
  const html = rawHtml ? `${headerHtml}${sanitizeEmailHtml(rawHtml, { allowRemote: true })}` : "";

  const attachments = [];
  for (const a of parsed.attachments || []) {
    const content = a.content instanceof ArrayBuffer ? new Uint8Array(a.content) : a.content;
    if (!content) continue;
    attachments.push({
      content,
      filename: a.filename || "attachment",
      type: a.mimeType || "application/octet-stream",
      disposition: "attachment",
    });
  }

  const headers = { "X-Estrogen-Forward-Hops": String(hops) };
  if (origAddr) headers["Reply-To"] = `${origName} <${origAddr}>`;

  const sendPayload = {
    to: [dest],
    from: { email: fromAddr, name: fromName || fromAddr.split("@")[0] },
    subject,
    text,
    headers,
  };
  if (html) sendPayload.html = html;
  if (attachments.length) sendPayload.attachments = attachments;

  await (relayDomain ? sendViaRelay(env, relayDomain, sendPayload) : env.EMAIL.send(sendPayload));
}

export async function sendMessage(env, user, payload) {
  const to = (payload.to || []).map(normalizeAddr).filter(isValidEmail);
  const cc = (payload.cc || []).map(normalizeAddr).filter(isValidEmail);
  const bcc = (payload.bcc || []).map(normalizeAddr).filter(isValidEmail);
  if (to.length + cc.length + bcc.length === 0) throw new Error("no valid recipients");
  if (to.length + cc.length + bcc.length > 50) throw new Error("too many recipients (max 50)");

  if (!(await checkSendLimit(env, user.id))) {
    const e = new Error("daily send limit reached");
    e.code = "E_DAILY_LIMIT";
    throw e;
  }

  const attIds = payload.attachmentIds || [];
  const attachments = [];
  const attRows = [];
  for (const id of attIds) {
    const row = await env.DB.prepare(
      "SELECT * FROM attachments WHERE id = ? AND user_id = ? AND message_id IS NULL",
    )
      .bind(id, user.id)
      .first();
    if (!row) continue;
    const obj = await env.R2.get(row.r2_key);
    if (!obj) continue;
    const buf = await tryDecryptBytes(env, await obj.arrayBuffer());
    attachments.push({
      content: buf,
      filename: row.filename,
      type: row.mime,
      disposition: "attachment",
    });
    attRows.push(row);
  }

  let fromAddr = user.address;
  let fromName = user.display_name || user.username;
  let sigText = user.signature || "";
  {
    const owned = await env.DB.prepare(
      "SELECT address, display_name, signature FROM addresses WHERE address = ? AND user_id = ?",
    )
      .bind(normalizeAddr(payload.from || user.address), user.id)
      .first();
    if (owned) {
      fromAddr = owned.address;
      if (owned.display_name) fromName = owned.display_name;
      if (owned.signature !== null && owned.signature !== undefined) sigText = owned.signature;
    }
  }

  const fromDomain = fromAddr.split("@")[1]?.toLowerCase() || "";
  let relayDomain = null;
  if (fromDomain && fromDomain !== String(env.MAIL_DOMAIN || "").toLowerCase()) {
    const ownDom = await env.DB.prepare(
      "SELECT domain, send_verified, relay_url, relay_secret_enc FROM domains WHERE domain = ? AND owner_id = ?",
    )
      .bind(fromDomain, user.id)
      .first();
    if (!ownDom?.send_verified) {
      const err = new Error(
        "You can only send from a domain you own and have verified. Finish its setup in Settings > Domains.",
      );
      err.code = "domain_unverified";
      throw err;
    }
    if (ownDom.relay_url) relayDomain = ownDom;
  }

  const subject = (payload.subject || "(no subject)").slice(0, 988);
  const text = payload.text || "";
  const expandedHtml = expandHtmlBlocks(payload.html || "");
  const html = expandedHtml
    ? sanitizeEmailHtml(expandedHtml, { allowRemote: true })
    : textToHtml(text);
  const signature = sigText ? `\n\n${sigText}` : "";
  const sigHtml = sigText ? `<br><br>${escapeHtml(sigText).replace(/\n/g, "<br>")}` : "";

  const inlineRows = [];
  const inlineIds = [
    ...new Set([...html.matchAll(/\/api\/attachments\/([a-z0-9-]+)\/inline/gi)].map((mm) => mm[1])),
  ];
  for (const id of inlineIds) {
    const row = await env.DB.prepare("SELECT * FROM attachments WHERE id = ? AND user_id = ?")
      .bind(id, user.id)
      .first();
    if (!row) continue;
    const obj = await env.R2.get(row.r2_key);
    if (!obj) continue;
    const buf = await tryDecryptBytes(env, await obj.arrayBuffer());
    attachments.push({
      content: buf,
      filename: row.filename,
      type: row.mime,
      disposition: "inline",
      contentId: `cid${id}`,
    });
    inlineRows.push(row);
  }
  const outboundHtml = html.replace(
    /\/api\/attachments\/([a-z0-9-]+)\/inline/gi,
    (_mm, id) => `cid:cid${id}`,
  );

  const validMsgId = (v) => typeof v === "string" && /^<[^\s<>@]+@[^\s<>]+>$/.test(v.trim());
  const inReplyTo = validMsgId(payload.inReplyTo) ? payload.inReplyTo.trim() : null;
  const headers = {};
  const refs = [];
  if (inReplyTo) {
    headers["In-Reply-To"] = inReplyTo;
    refs.push(...(payload.references || []).filter(validMsgId).map((r) => r.trim()), inReplyTo);
    if (refs.length) headers.References = refs.slice(-20).join(" ");
  }

  const isE2E = payload.pgp === true && text.includes("-----BEGIN PGP MESSAGE-----");
  const sendPayload = {
    to,
    from: { email: fromAddr, name: fromName },
    subject,
  };
  if (isE2E) {
    sendPayload.text = text;
  } else {
    sendPayload.text = text + signature;
    sendPayload.html = outboundHtml + sigHtml;
  }
  if (cc.length) sendPayload.cc = cc;
  if (bcc.length) sendPayload.bcc = bcc;
  if (Object.keys(headers).length) sendPayload.headers = headers;
  if (attachments.length && !isE2E) sendPayload.attachments = attachments;

  const result = relayDomain
    ? await sendViaRelay(env, relayDomain, sendPayload)
    : await env.EMAIL.send(sendPayload);

  const messageId = uuid();
  const wireId =
    typeof result?.messageId === "string" && validMsgId(result.messageId) ? result.messageId.trim() : null;
  const rfcId = wireId || `<${messageId}@${env.MAIL_DOMAIN}>`;
  const threadId = (await resolveThread(env, user.id, inReplyTo, refs)) || messageId;

  const selfEncrypted = isE2E ? text : await pgpEncryptToSelf(env, user.id, html || text);
  const storedPgp = isE2E || !!selfEncrypted;
  let snippetEnc = null;
  if (!isE2E && selfEncrypted) {
    const plainSnippet = snippetFrom(text || html.replace(/<[^>]+>/g, " "));
    if (plainSnippet) snippetEnc = await pgpEncryptToSelf(env, user.id, plainSnippet);
  }
  const storedBody = storedPgp
    ? selfEncrypted
    : html
      ? sanitizeEmailHtml(html, { allowRemote: true })
      : "";
  let hKey = null;
  if (storedBody) {
    hKey = htmlKey(user.id, messageId);
    await env.R2.put(hKey, await encryptText(env, storedBody), {
      httpMetadata: { contentType: "text/html; charset=utf-8" },
    });
  }

  await insertMessage(env, {
    id: messageId,
    user_id: user.id,
    thread_id: threadId,
    rfc_message_id: rfcId,
    in_reply_to: inReplyTo,
    refs: refs.join(" "),
    folder: "sent",
    from_addr: fromAddr,
    from_name: fromName,
    to: to.map((a) => ({ name: "", address: a })),
    cc: cc.map((a) => ({ name: "", address: a })),
    bcc: bcc.map((a) => ({ name: "", address: a })),
    subject,
    snippet: storedPgp ? "Encrypted message" : snippetFrom(text || html.replace(/<[^>]+>/g, " ")),
    snippet_enc: snippetEnc,
    body_text: storedPgp ? "" : text,
    has_html: isE2E ? 0 : html ? 1 : 0,
    date: now(),
    received_at: now(),
    is_read: 1,
    has_attachments: attRows.length ? 1 : 0,
    size: text.length + html.length,
    html_key: hKey,
    pgp: storedPgp ? 1 : 0,
  });

  let attBytes = 0;
  for (const row of attRows) {
    await env.DB.prepare("UPDATE attachments SET message_id = ?, status = 'stored' WHERE id = ?")
      .bind(messageId, row.id)
      .run();
    attBytes += row.size || 0;
  }
  for (const row of inlineRows) {
    await env.DB.prepare(
      "UPDATE attachments SET message_id = ?, status = 'stored', is_inline = 1 WHERE id = ?",
    )
      .bind(messageId, row.id)
      .run();
    attBytes += row.size || 0;
  }
  await updateStorage(env, user.id, attBytes + (hKey ? html.length : 0));

  for (const addr of [...to, ...cc]) await bumpContact(env, user.id, addr, "");

  return { id: messageId, threadId, messageId: result?.messageId || rfcId };
}
