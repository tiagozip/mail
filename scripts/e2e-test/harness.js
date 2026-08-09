const BASE = "https://mail.estrogen.delivery";
const accts = await Bun.file(new URL("accounts.json", import.meta.url).pathname).json();

const results = [];
function report(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

function api(who) {
  const key = accts[who].key;
  return async (method, path, body, form) => {
    const headers = { authorization: `Bearer ${key}` };
    let payload = body;
    if (body && !form) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const r = await fetch(BASE + path, { method, headers, body: payload });
    const text = await r.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {}
    if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 200)}`);
    return data;
  };
}

const A = api("e2e-alice");
const B = api("e2e-bob");
const C = api("e2e-carol");
const addr = (u) => accts[u].addr;

async function waitFor(clientApi, { subject, folder = "inbox", timeout = 90000 }) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const d = await clientApi("GET", `/api/messages?folder=${folder}&limit=20`);
    const hit = (d.messages || []).find((m) => m.subject === subject);
    if (hit) return clientApi("GET", `/api/messages/${hit.id}`).then((x) => x.message);
    await Bun.sleep(3000);
  }
  return null;
}

const run = Date.now().toString(36);
const S = (name) => `[e2e ${run}] ${name}`;

{
  const subj = S("plain compose");
  const sent = await A("POST", "/api/send", {
    from: addr("e2e-alice"),
    to: [addr("e2e-bob")],
    subject: subj,
    text: "hello bob, plain text line 1\nline 2",
  });
  const sentCopy = await A("GET", `/api/messages/${sent.id}`).then((x) => x.message);
  report("sent copy stored in sent folder", sentCopy?.folder === "sent", `folder=${sentCopy?.folder}`);
  const got = await waitFor(B, { subject: subj });
  report("internal delivery alice->bob", !!got);
  if (got) {
    report("plain body intact", (got.bodyText || "").includes("plain text line 1"));
    report("from parsed", got.from?.address === addr("e2e-alice"), got.from?.address);
    report("rfcMessageId present", /^<.+@estrogen\.delivery>$/.test(got.rfcMessageId || ""), got.rfcMessageId);

    const rsubj = `Re: ${subj}`;
    await B("POST", "/api/send", {
      from: addr("e2e-bob"),
      to: [addr("e2e-alice")],
      subject: rsubj,
      text: `got it alice\n\nOn some date, alice wrote:\n> hello bob, plain text line 1\n> line 2`,
      inReplyTo: got.rfcMessageId,
      references: [...(got.references || []), got.rfcMessageId].filter(Boolean),
    });
    const reply = await waitFor(A, { subject: rsubj });
    report("reply delivered bob->alice", !!reply);
    if (reply) {
      report("reply In-Reply-To set", reply.inReplyTo === got.rfcMessageId, reply.inReplyTo);
      report("reply threads with original", reply.threadId === sentCopy.threadId, `${reply.threadId} vs ${sentCopy.threadId}`);
      report("quote survives transit", (reply.bodyText || "").includes("> hello bob"));
    }
  }
}

{
  const subj = S("cc test");
  await A("POST", "/api/send", {
    from: addr("e2e-alice"),
    to: [addr("e2e-bob")],
    cc: [addr("e2e-carol")],
    subject: subj,
    text: "cc body",
  });
  const [gotB, gotC] = await Promise.all([waitFor(B, { subject: subj }), waitFor(C, { subject: subj })]);
  report("cc: to-recipient got it", !!gotB);
  report("cc: cc-recipient got it", !!gotC);
  if (gotB) report("cc visible on to-copy", (gotB.cc || []).some((x) => x.address === addr("e2e-carol")), JSON.stringify(gotB.cc));
  if (gotC) report("cc visible on cc-copy", (gotC.cc || []).some((x) => x.address === addr("e2e-carol")), JSON.stringify(gotC.cc));

  if (gotB && gotC) {
    const rsubj = `Re: ${subj}`;
    await B("POST", "/api/send", {
      from: addr("e2e-bob"),
      to: [addr("e2e-alice")],
      cc: [addr("e2e-carol")],
      subject: rsubj,
      text: "reply-all body",
      inReplyTo: gotB.rfcMessageId,
      references: [gotB.rfcMessageId],
    });
    const [raA, raC] = await Promise.all([waitFor(A, { subject: rsubj }), waitFor(C, { subject: rsubj })]);
    report("reply-all: to leg", !!raA);
    report("reply-all: cc leg", !!raC);
    if (raC) report("reply-all threads on carol's side", raC.threadId === gotC.threadId, `${raC?.threadId} vs ${gotC.threadId}`);
  }
}

{
  const subj = S("bcc test");
  await A("POST", "/api/send", {
    from: addr("e2e-alice"),
    to: [addr("e2e-bob")],
    bcc: [addr("e2e-carol")],
    subject: subj,
    text: "bcc body",
  });
  const [gotB, gotC] = await Promise.all([waitFor(B, { subject: subj }), waitFor(C, { subject: subj })]);
  report("bcc: to-recipient got it", !!gotB);
  report("bcc: bcc-recipient got it", !!gotC);
  if (gotB) {
    const leaked =
      (gotB.bcc || []).length > 0 || JSON.stringify(gotB.to).includes("carol") || JSON.stringify(gotB.cc).includes("carol");
    report("bcc NOT leaked to to-recipient", !leaked, JSON.stringify({ to: gotB.to, cc: gotB.cc, bcc: gotB.bcc }));
    const raw = await fetch(`${BASE}/api/messages/${gotB.id}/raw`, {
      headers: { authorization: `Bearer ${accts["e2e-bob"].key}` },
    }).then((r) => (r.ok ? r.text() : ""));
    if (raw) report("bcc NOT in raw headers of to-copy", !raw.toLowerCase().includes("carol"), `raw ${raw.length}b`);
  }
}

{
  const subj = S("html compose");
  await A("POST", "/api/send", {
    from: addr("e2e-alice"),
    to: [addr("e2e-bob")],
    subject: subj,
    text: "fallback text",
    html: `<p>hello <strong>bob</strong></p><script>alert(1)</script><p>after script</p>`,
  });
  const got = await waitFor(B, { subject: subj });
  report("html delivery", !!got, got ? `hasHtml=${got.hasHtml}` : "");
  if (got) {
    report("html flagged", !!got.hasHtml);
    const html = got.bodyHtml || "";
    report("html content present", html.includes("<strong>bob</strong>") || html.includes("hello"), html.slice(0, 120));
    report("script stripped", !html.includes("<script"));
  }
}

{
  const subj = S("forward test");
  const orig = await waitFor(B, { subject: S("plain compose") });
  const fwsubj = `Fwd: ${S("plain compose")}`;
  await B("POST", "/api/send", {
    from: addr("e2e-bob"),
    to: [addr("e2e-carol")],
    subject: fwsubj,
    text: `\n\n---------- Forwarded message ----------\nFrom: alice <${addr("e2e-alice")}>\n\n${orig?.bodyText || ""}`,
  });
  const got = await waitFor(C, { subject: fwsubj });
  report("forward delivered", !!got);
  if (got) report("forwarded body included", (got.bodyText || "").includes("plain text line 1"));
  void subj;
}

{
  const form = new FormData();
  form.append("file", new File([new TextEncoder().encode("attachment payload " + run)], "e2e.txt", { type: "text/plain" }));
  const up = await A("POST", "/api/attachments", form, true);
  const subj = S("attachment test");
  await A("POST", "/api/send", {
    from: addr("e2e-alice"),
    to: [addr("e2e-bob")],
    subject: subj,
    text: "see attached",
    attachmentIds: [up.id],
  });
  const got = await waitFor(B, { subject: subj });
  report("attachment mail delivered", !!got);
  if (got) {
    const att = (got.attachments || [])[0];
    report("attachment parsed inbound", att?.filename === "e2e.txt", JSON.stringify(got.attachments));
    if (att) {
      const blob = await fetch(`${BASE}/api/attachments/${att.id}`, {
        headers: { authorization: `Bearer ${accts["e2e-bob"].key}` },
      }).then((r) => (r.ok ? r.text() : ""));
      report("attachment content roundtrip", blob.includes("attachment payload " + run), `${blob.length}b`);
    }
  }
}

{
  const subj = S("draft flow");
  const draft = await A("POST", "/api/drafts", {
    to: [addr("e2e-bob")],
    subject: subj,
    text: "draft body v1",
  });
  const draftId = draft?.id || draft?.message?.id;
  const listed = await A("GET", "/api/messages?folder=drafts&limit=10");
  report("draft saved + listed", (listed.messages || []).some((m) => m.id === draftId), draftId);
  await A("POST", "/api/send", {
    from: addr("e2e-alice"),
    to: [addr("e2e-bob")],
    subject: subj,
    text: "draft body final",
    draftId,
  });
  const after = await A("GET", "/api/messages?folder=drafts&limit=10");
  report("draft deleted after send", !(after.messages || []).some((m) => m.id === draftId));
  const got = await waitFor(B, { subject: subj });
  report("draft-send delivered", !!got, got ? got.bodyText?.slice(0, 30) : "");
}

const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} passed`);
if (fails.length) {
  console.log("FAILURES:");
  for (const f of fails) console.log(` - ${f.name} ${f.detail}`);
}
await Bun.write(
  new URL(`results-internal-${run}.json`, import.meta.url).pathname,
  JSON.stringify(results, null, 2),
);
