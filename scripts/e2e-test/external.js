import net from "node:net";
import tls from "node:tls";

const BASE = "https://mail.estrogen.delivery";
const accts = await Bun.file(new URL("accounts.json", import.meta.url).pathname).json();
const BRIDGE = { host: "127.0.0.1", user: "hi@tiago.zip", pass: "b4DKEnEGLS2ARLHepNztsQ" };
const run = Date.now().toString(36);

const results = [];
function report(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

function starttlsSession(port, greetRe) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, BRIDGE.host);
    let buf = "";
    sock.on("data", (d) => {
      buf += d.toString();
      if (greetRe.test(buf)) {
        sock.removeAllListeners("data");
        resolve(sock);
      }
    });
    sock.on("error", reject);
    setTimeout(() => reject(new Error("greet timeout")), 8000);
  });
}

function cmdOver(sock, line, doneRe, timeout = 15000) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (d) => {
      buf += d.toString();
      if (doneRe.test(buf)) {
        sock.removeAllListeners("data");
        resolve(buf);
      }
    };
    sock.on("data", onData);
    if (line !== null) sock.write(line + "\r\n");
    setTimeout(() => {
      sock.removeAllListeners("data");
      reject(new Error(`timeout waiting ${doneRe} after ${JSON.stringify(line?.slice(0, 40))}: ${buf.slice(-200)}`));
    }, timeout);
  });
}

function upgrade(sock) {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({ socket: sock, rejectUnauthorized: false }, () => resolve(secure));
    secure.on("error", reject);
  });
}

async function smtpSend({ to, subject, text, inReplyTo, references }) {
  const plain = await starttlsSession(1025, /^220 /m);
  await cmdOver(plain, "EHLO localhost", /250 [A-Z]/m);
  await cmdOver(plain, "STARTTLS", /^220 /m);
  const sock = await upgrade(plain);
  await cmdOver(sock, "EHLO localhost", /250 [A-Z]/m);
  const auth = Buffer.from(`\0${BRIDGE.user}\0${BRIDGE.pass}`).toString("base64");
  await cmdOver(sock, `AUTH PLAIN ${auth}`, /^235 /m);
  await cmdOver(sock, `MAIL FROM:<${BRIDGE.user}>`, /^250 /m);
  await cmdOver(sock, `RCPT TO:<${to}>`, /^250 /m);
  await cmdOver(sock, "DATA", /^354 /m);
  const headers = [
    `From: tiago <${BRIDGE.user}>`,
    `To: <${to}>`,
    `Subject: ${subject}`,
    `Message-ID: <e2e-${run}-${Math.random().toString(36).slice(2)}@tiago.zip>`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    references?.length ? `References: ${references.join(" ")}` : null,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset=utf-8',
  ].filter(Boolean);
  await cmdOver(sock, `${headers.join("\r\n")}\r\n\r\n${text}\r\n.`, /^250 /m, 30000);
  sock.end();
}

async function imapSearchSubject(subject, { timeout = 180000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const plain = await starttlsSession(1143, /^\* OK/m);
    await cmdOver(plain, "a1 STARTTLS", /^a1 OK/m);
    const sock = await upgrade(plain);
    await cmdOver(sock, `a2 LOGIN "${BRIDGE.user}" "${BRIDGE.pass}"`, /^a2 OK/m);
    await cmdOver(sock, "a3 SELECT INBOX", /^a3 OK/m);
    const found = await cmdOver(sock, `a4 UID SEARCH SUBJECT "${subject}"`, /^a4 OK/m);
    const uids = (found.match(/\* SEARCH ?(.*)/) || [])[1]?.trim().split(/\s+/).filter(Boolean) || [];
    if (uids.length) {
      const uid = uids[uids.length - 1];
      const fetched = await cmdOver(sock, `a5 UID FETCH ${uid} (BODY.PEEK[])`, /^a5 OK/m, 30000);
      sock.end();
      return fetched;
    }
    sock.end();
    await Bun.sleep(8000);
  }
  return null;
}

const hdr = (u) => ({ authorization: `Bearer ${accts[u].key}`, "content-type": "application/json" });
const api = (u, method, path, body) =>
  fetch(BASE + path, { method, headers: hdr(u), body: body ? JSON.stringify(body) : undefined }).then(async (r) => {
    if (!r.ok) throw new Error(`${path} ${r.status} ${await r.text()}`);
    return r.json();
  });
async function waitInbox(u, subj, timeout = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const d = await api(u, "GET", "/api/messages?folder=inbox&limit=20");
    const hit = (d.messages || []).find((m) => m.subject === subj);
    if (hit) return (await api(u, "GET", `/api/messages/${hit.id}`)).message;
    await Bun.sleep(5000);
  }
  return null;
}

{
  const subj = `[e2e ext-out ${run}] estrogen to proton`;
  const sent = await api("e2e-alice", "POST", "/api/send", {
    from: accts["e2e-alice"].addr,
    to: [BRIDGE.user],
    subject: subj,
    text: "outbound body line\nsecond line",
  });
  console.log("sent, waiting on proton inbox...");
  const raw = await imapSearchSubject(subj);
  report("outbound estrogen->proton delivered", !!raw);
  if (raw) {
    report("outbound body intact at proton", raw.includes("outbound body line"));
    report("outbound wire msgid matches stored", raw.includes(sent.messageId.slice(1, -1)), sent.messageId);
    const spf = /Authentication-Results:[^\n]*spf=pass/i.test(raw) || /Received-SPF: pass/i.test(raw);
    const dkim = /dkim=pass/i.test(raw);
    report("outbound SPF pass", spf);
    report("outbound DKIM pass", dkim);

    const rsubj = `Re: ${subj}`;
    await smtpSend({
      to: accts["e2e-alice"].addr,
      subject: rsubj,
      text: `external reply from proton\n\n> outbound body line\n> second line`,
      inReplyTo: sent.messageId,
      references: [sent.messageId],
    });
    console.log("replied via SMTP, waiting on estrogen inbox...");
    const reply = await waitInbox("e2e-alice", rsubj);
    report("external reply delivered to estrogen", !!reply);
    if (reply) {
      report("external reply threads with sent copy", reply.threadId === sent.threadId, `${reply.threadId} vs ${sent.threadId}`);
      report("external reply quote intact", (reply.bodyText || "").includes("> outbound body line"));
      report("inbound auth recorded", ["pass", "spf", "dkim", "dmarc"].some((k) => (reply.authStatus || "").includes(k)) || reply.authStatus === "pass", reply.authStatus);
    }
  }
}

{
  const subj = `[e2e ext-in ${run}] proton to estrogen fresh`;
  await smtpSend({ to: accts["e2e-bob"].addr, subject: subj, text: "fresh inbound from external client" });
  console.log("sent fresh external mail, waiting on estrogen...");
  const got = await waitInbox("e2e-bob", subj);
  report("fresh external inbound delivered", !!got);
  if (got) {
    report("external from parsed", got.from?.address === BRIDGE.user, got.from?.address);
    report("external body parsed", (got.bodyText || "").includes("fresh inbound"));

    const rsubj = `Re: ${subj}`;
    await api("e2e-bob", "POST", "/api/send", {
      from: accts["e2e-bob"].addr,
      to: [BRIDGE.user],
      subject: rsubj,
      text: `replying from estrogen\n\nOn ${new Date(got.date).toLocaleString()}, tiago wrote:\n> fresh inbound from external client`,
      inReplyTo: got.rfcMessageId,
      references: [got.rfcMessageId],
    });
    console.log("estrogen reply sent, checking proton threading headers...");
    const raw = await imapSearchSubject(rsubj);
    report("estrogen reply reached proton", !!raw);
    if (raw) {
      report("In-Reply-To header on wire", raw.includes(`In-Reply-To: ${got.rfcMessageId}`) || raw.toLowerCase().includes("in-reply-to"), "");
      report("quote renders as text at proton", raw.includes("> fresh inbound from external client"));
    }
  }
}

const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} passed`);
for (const f of fails) console.log(` - FAIL ${f.name} ${f.detail}`);
await Bun.write(new URL(`results-external-${run}.json`, import.meta.url).pathname, JSON.stringify(results, null, 2));
