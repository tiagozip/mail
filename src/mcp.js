import { sha256Hex } from "./auth.js";
import { consume, enforce } from "./ratelimit.js";
import { error } from "./util.js";

const PROTOCOL = "2025-06-18";

const USER_SELECT =
  "SELECT id, username, address, email, display_name, is_admin, signature, settings_json, storage_used, avatar_url, pgp_enabled, created_at FROM users";

const str = { type: "string" };
const strs = { type: "array", items: { type: "string" } };

const TOOLS = [
  {
    name: "list_folders",
    scope: "mail:read",
    description:
      "List system folders with counts, custom folders and labels. Use the ids with search_messages and move_messages.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    run: async (call) => {
      const [folders, labels] = await Promise.all([
        call("GET", "/api/folders"),
        call("GET", "/api/labels"),
      ]);
      return { ...folders, labels: labels.labels };
    },
  },
  {
    name: "search_messages",
    scope: "mail:read",
    description:
      "List or search messages. query supports from:, to:, subject:, has:attachment, is:unread, is:starred and free text. Returns summaries; read bodies with get_thread.",
    inputSchema: {
      type: "object",
      properties: {
        query: str,
        folder: {
          type: "string",
          enum: ["inbox", "sent", "drafts", "archive", "spam", "trash", "snoozed", "all"],
          description: "defaults to inbox",
        },
        folder_id: { type: "string", description: "custom folder id" },
        label_id: str,
        limit: { type: "integer", minimum: 1, maximum: 50 },
        cursor: { type: "string", description: "nextCursor from a previous page" },
      },
    },
    annotations: { readOnlyHint: true },
    run: async (call, a) => {
      const q = new URLSearchParams();
      if (a.query) q.set("q", a.query);
      if (a.folder) q.set("folder", a.folder);
      if (a.folder_id) q.set("folderId", a.folder_id);
      if (a.label_id) q.set("label", a.label_id);
      q.set("limit", String(Math.min(a.limit || 20, 50)));
      if (a.cursor) q.set("cursor", a.cursor);
      const res = await call("GET", `/api/messages?${q}`);
      return {
        ...res,
        messages: (res.messages || []).map((m) => ({
          id: m.id,
          threadId: m.threadId,
          folder: m.folder,
          from: m.from,
          to: m.to,
          subject: m.subject,
          snippet: m.pgp ? "(encrypted)" : m.snippet,
          date: new Date(m.date).toISOString(),
          unread: !m.isRead,
          starred: m.isStarred,
          hasAttachments: m.hasAttachments,
          labels: m.labels?.map((l) => l.name),
        })),
      };
    },
  },
  {
    name: "get_thread",
    scope: "mail:read",
    description: "Read every message in a thread as plain text, oldest first.",
    inputSchema: {
      type: "object",
      properties: { thread_id: str },
      required: ["thread_id"],
    },
    annotations: { readOnlyHint: true },
    run: async (call, a) => {
      const { messages } = await call("GET", `/api/threads/${encodeURIComponent(a.thread_id)}`);
      return { messages: (messages || []).map(plainMessage) };
    },
  },
  {
    name: "mark_messages",
    scope: "mail:organize",
    description: "Mark messages read or unread, starred or unstarred.",
    inputSchema: {
      type: "object",
      properties: { ids: strs, read: { type: "boolean" }, starred: { type: "boolean" } },
      required: ["ids"],
    },
    annotations: { idempotentHint: true },
    run: async (call, a) => {
      if (typeof a.read === "boolean")
        await call("POST", "/api/messages/bulk", { ids: a.ids, action: "read", value: a.read });
      if (typeof a.starred === "boolean")
        await call("POST", "/api/messages/bulk", {
          ids: a.ids,
          action: "star",
          value: a.starred,
        });
      return { ok: true };
    },
  },
  {
    name: "move_messages",
    scope: "mail:organize",
    description:
      "Move messages to a system folder (archive, trash, spam, inbox) or a custom folder id. Trash is recoverable for 30 days.",
    inputSchema: {
      type: "object",
      properties: {
        ids: strs,
        folder: { type: "string", enum: ["inbox", "archive", "spam", "trash"] },
        folder_id: str,
      },
      required: ["ids"],
    },
    run: (call, a) =>
      a.folder_id
        ? call("POST", "/api/messages/bulk", {
            ids: a.ids,
            action: "movefolder",
            value: a.folder_id,
          })
        : call("POST", "/api/messages/bulk", { ids: a.ids, action: "move", value: a.folder }),
  },
  {
    name: "label_message",
    scope: "mail:organize",
    description: "Add or remove labels on a message by label id.",
    inputSchema: {
      type: "object",
      properties: { id: str, add: strs, remove: strs },
      required: ["id"],
    },
    annotations: { idempotentHint: true },
    run: (call, a) =>
      call("POST", `/api/messages/${encodeURIComponent(a.id)}/labels`, {
        add: a.add || [],
        remove: a.remove || [],
      }),
  },
  {
    name: "save_draft",
    scope: "mail:draft",
    description: "Create a draft, or update one when draft_id is given. Nothing is sent.",
    inputSchema: {
      type: "object",
      properties: { draft_id: str, to: strs, cc: strs, bcc: strs, subject: str, text: str },
    },
    run: (call, a) =>
      a.draft_id
        ? call("PUT", `/api/drafts/${encodeURIComponent(a.draft_id)}`, a)
        : call("POST", "/api/drafts", a),
  },
  {
    name: "send_email",
    scope: "mail:send",
    description:
      "Send an email from the user's address. To reply, pass in_reply_to with the rfcMessageId from get_thread and keep the subject.",
    inputSchema: {
      type: "object",
      properties: {
        to: strs,
        cc: strs,
        bcc: strs,
        subject: str,
        text: str,
        from: { type: "string", description: "one of the user's own addresses" },
        in_reply_to: str,
        references: strs,
        draft_id: { type: "string", description: "draft to delete after sending" },
      },
      required: ["to", "subject", "text"],
    },
    annotations: { destructiveHint: true, openWorldHint: true },
    run: (call, a) =>
      call("POST", "/api/send", {
        to: a.to,
        cc: a.cc,
        bcc: a.bcc,
        subject: a.subject,
        text: a.text,
        from: a.from,
        inReplyTo: a.in_reply_to,
        references: a.references,
        draftId: a.draft_id,
        track: false,
      }),
  },
];

function plainMessage(m) {
  return {
    id: m.id,
    rfcMessageId: m.rfcMessageId,
    from: m.from,
    to: m.to,
    cc: m.cc,
    date: new Date(m.date).toISOString(),
    subject: m.subject,
    folder: m.folder,
    encrypted: m.pgp || undefined,
    text: m.pgp
      ? "(end-to-end encrypted, open it in Estrogen Mail to read)"
      : (m.bodyText || htmlToText(m.bodyHtml || "")).slice(0, 20000),
    attachments: m.attachments?.map((x) => ({ filename: x.filename, mime: x.mime, size: x.size })),
  };
}

function htmlToText(html) {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function authorize(request, env) {
  const secret = request.headers.get("x-mcp-secret") || "";
  if (!env.MCP_GATEWAY_SECRET || secret.length !== env.MCP_GATEWAY_SECRET.length) return null;
  const [a, b] = await Promise.all([sha256Hex(secret), sha256Hex(env.MCP_GATEWAY_SECRET)]);
  if (a !== b) return null;
  const sub = request.headers.get("x-mcp-sub");
  if (!sub) return null;
  const user = await env.DB.prepare(`${USER_SELECT} WHERE oidc_sub = ?`).bind(sub).first();
  const scopes = (request.headers.get("x-mcp-scopes") || "").split(" ").filter(Boolean);
  return user ? { user, scopes } : null;
}

const rpcResult = (id, result) => Response.json({ jsonrpc: "2.0", id, result });
const rpcError = (id, code, message) =>
  Response.json({ jsonrpc: "2.0", id, error: { code, message } });

export async function handleMcp(request, env, ctx, routeApi, ip) {
  if (request.method !== "POST") return error(405, "method not allowed");
  const pre = await consume(env, "mcp:ip", ip);
  if (!pre.ok) return error(429, "rate limited");
  const auth = await authorize(request, env);
  if (!auth) return error(401, "gateway only");

  let msg;
  try {
    msg = await request.json();
  } catch {
    return rpcError(null, -32700, "parse error");
  }
  if (Array.isArray(msg)) return rpcError(null, -32600, "batching is not supported");
  if (msg.id === undefined) return new Response(null, { status: 202 });

  const { id, method, params } = msg;
  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: params?.protocolVersion || PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: { name: "estrogen-mail", title: "Estrogen Mail", version: "0.1.0" },
      instructions:
        "Mail for the signed-in Estrogen Mail user. Search first, then read threads by id. Always confirm with the user before send_email.",
    });
  }
  if (method === "ping") return rpcResult(id, {});
  if (method === "tools/list") {
    return rpcResult(id, {
      tools: TOOLS.filter((t) => auth.scopes.includes(t.scope)).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        annotations: t.annotations,
      })),
    });
  }
  if (method !== "tools/call") return rpcError(id, -32601, "method not found");

  const tool = TOOLS.find((t) => t.name === params?.name);
  if (!tool) return rpcError(id, -32602, "unknown tool");
  if (!auth.scopes.includes(tool.scope)) {
    return rpcResult(id, {
      isError: true,
      content: [{ type: "text", text: `This connection doesn't have ${tool.scope} permission.` }],
    });
  }

  const base = new URL(request.url).origin;
  const internal = { user: auth.user, viaApiKey: true, viaMcp: true };
  const call = async (verb, path, body) => {
    const rl = await enforce(env, {
      method: verb,
      path: path.split("?")[0],
      userId: auth.user.id,
      ip,
    });
    if (!rl.ok) throw new Error(`rate limited, retry in ${rl.retryAfter}s`);
    const res = await routeApi(
      new Request(`${base}${path}`, {
        method: verb,
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      }),
      env,
      ctx,
      internal,
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
    return data;
  };

  try {
    const out = await tool.run(call, params.arguments || {});
    return rpcResult(id, {
      content: [{ type: "text", text: JSON.stringify(out, null, 1) }],
      structuredContent: out,
    });
  } catch (e) {
    return rpcResult(id, { isError: true, content: [{ type: "text", text: e.message }] });
  }
}
