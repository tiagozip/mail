async function req(method, path, body, isForm) {
  const opts = {
    method,
    credentials: "same-origin",
    headers: {},
  };
  if (body !== undefined) {
    if (isForm) {
      opts.body = body;
    } else {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch(path, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const err = new Error(data?.error || `request failed (${res.status})`);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }
  return data;
}

export const api = {
  me: () => req("GET", "/api/me"),
  loginUrl: "/api/auth/login",
  logout: () => req("POST", "/api/auth/logout"),

  folders: () => req("GET", "/api/folders"),
  messages: (params) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, v);
    }
    return req("GET", `/api/messages?${qs.toString()}`);
  },
  message: (id, images) => req("GET", `/api/messages/${id}${images ? "?images=1" : ""}`),
  thread: (threadId) => req("GET", `/api/threads/${threadId}`),

  setRead: (id, read) => req("POST", `/api/messages/${id}/read`, { read }),
  setStar: (id, star) => req("POST", `/api/messages/${id}/star`, { star }),
  moveMessage: (id, folder) => req("POST", `/api/messages/${id}/move`, { folder }),
  setLabels: (id, add, remove) => req("POST", `/api/messages/${id}/labels`, { add, remove }),
  deleteMessage: (id) => req("DELETE", `/api/messages/${id}`),
  bulk: (ids, action, value) => req("POST", "/api/messages/bulk", { ids, action, value }),

  uploadAttachment: (file) => {
    const form = new FormData();
    form.append("file", file);
    return req("POST", "/api/attachments", form, true);
  },
  deleteAttachment: (id) => req("DELETE", `/api/attachments/${id}`),
  uploadAvatar: (file) => {
    const form = new FormData();
    form.append("file", file);
    return req("POST", "/api/avatar", form, true);
  },
  deleteAvatar: () => req("DELETE", "/api/avatar"),
  aliases: () => req("GET", "/api/aliases"),
  addAlias: (localPart) => req("POST", "/api/aliases", { localPart }),
  removeAlias: (address) => req("DELETE", `/api/aliases/${encodeURIComponent(address)}`),
  setPrimaryAddress: (address) => req("POST", "/api/aliases/primary", { address }),

  send: (payload) => req("POST", "/api/send", payload),
  createDraft: (payload) => req("POST", "/api/drafts", payload),
  updateDraft: (id, payload) => req("PUT", `/api/drafts/${id}`, payload),

  labels: () => req("GET", "/api/labels"),
  createLabel: (name, color) => req("POST", "/api/labels", { name, color }),
  deleteLabel: (id) => req("DELETE", `/api/labels/${id}`),
  contacts: (q) => req("GET", `/api/contacts?q=${encodeURIComponent(q || "")}`),

  saveSettings: (payload) => req("PUT", "/api/settings", payload),

  getPgp: () => req("GET", "/api/pgp"),
  enablePgp: (publicKey, privateKeyEnc) => req("POST", "/api/pgp/enable", { publicKey, privateKeyEnc }),
  disablePgp: () => req("DELETE", "/api/pgp"),
  pgpPubkey: (address) => req("GET", `/api/pgp/pubkey?address=${encodeURIComponent(address)}`),

  listApiKeys: () => req("GET", "/api/keys"),
  createApiKey: (name) => req("POST", "/api/keys", { name }),
  deleteApiKey: (id) => req("DELETE", `/api/keys/${id}`),

  adminUsers: () => req("GET", "/api/admin/users"),
};
