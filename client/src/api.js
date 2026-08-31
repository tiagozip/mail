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
    const retryAfter = data?.retryAfter || Number(res.headers.get("retry-after")) || 0;
    const fallback =
      res.status === 429
        ? `too many requests${retryAfter ? `, retry in ${retryAfter}s` : ", slow down"}`
        : `request failed (${res.status})`;
    const err = new Error(data?.error || fallback);
    err.status = res.status;
    err.code = data?.code || (res.status === 429 ? "E_RATE_LIMIT" : undefined);
    err.retryAfter = retryAfter;
    throw err;
  }
  return data;
}

export const api = {
  me: () => req("GET", "/api/me"),
  loginUrl: "/api/auth/login",
  logout: () => req("POST", "/api/auth/logout"),

  folders: () => req("GET", "/api/folders"),
  addFolder: (body) => req("POST", "/api/folders", body),
  updateFolder: (id, body) => req("PATCH", `/api/folders/${id}`, body),
  removeFolder: (id) => req("DELETE", `/api/folders/${id}`),
  sync: (since, limit) =>
    req("GET", `/api/sync?since=${since || 0}${limit ? `&limit=${limit}` : ""}`),
  messages: (params) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, v);
    }
    return req("GET", `/api/messages?${qs.toString()}`);
  },
  message: (id, images) => req("GET", `/api/messages/${id}${images ? "?images=1" : ""}`),
  thread: (threadId) => req("GET", `/api/threads/${threadId}`),
  threadsBulk: (ids) => req("POST", "/api/threads/bulk", { ids }),

  setRead: (id, read) => req("POST", `/api/messages/${id}/read`, { read }),
  setStar: (id, star) => req("POST", `/api/messages/${id}/star`, { star }),
  moveMessage: (id, folder) => req("POST", `/api/messages/${id}/move`, { folder }),
  moveToFolder: (id, folderId) => req("POST", `/api/messages/${id}/move`, { folderId }),
  setLabels: (id, add, remove) => req("POST", `/api/messages/${id}/labels`, { add, remove }),
  deleteMessage: (id) => req("DELETE", `/api/messages/${id}`),
  bulk: (ids, action, value) => req("POST", "/api/messages/bulk", { ids, action, value }),
  emptyTrash: () => req("POST", "/api/trash/empty"),

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
  aliasDomains: () => req("GET", "/api/alias-domains"),
  addAlias: (localPart, domain) => req("POST", "/api/aliases", { localPart, domain }),
  removeAlias: (address) => req("DELETE", `/api/aliases/${encodeURIComponent(address)}`),
  setPrimaryAddress: (address) => req("POST", "/api/aliases/primary", { address }),
  setAliasIdentity: (address, body) =>
    req("PATCH", `/api/aliases/${encodeURIComponent(address)}/identity`, body),
  uploadAliasAvatar: (address, file) => {
    const form = new FormData();
    form.append("file", file);
    return req("POST", `/api/aliases/${encodeURIComponent(address)}/avatar`, form, true);
  },
  deleteAliasAvatar: (address) =>
    req("DELETE", `/api/aliases/${encodeURIComponent(address)}/avatar`),
  hiddenAliases: () => req("GET", "/api/hidden-aliases"),
  createHiddenAlias: (label) => req("POST", "/api/hidden-aliases", { label }),
  updateHiddenAlias: (address, patch) =>
    req("PATCH", `/api/hidden-aliases/${encodeURIComponent(address)}`, patch),
  removeHiddenAlias: (address) =>
    req("DELETE", `/api/hidden-aliases/${encodeURIComponent(address)}`),
  hiddenAliasSenders: (address) =>
    req("GET", `/api/hidden-aliases/${encodeURIComponent(address)}/senders`),

  send: (payload) => req("POST", "/api/send", payload),
  scheduledSends: () => req("GET", "/api/scheduled-sends"),
  cancelScheduled: (id) => req("DELETE", `/api/scheduled-sends/${id}`),
  snoozeMessage: (id, until) => req("POST", `/api/messages/${id}/snooze`, { until }),
  createDraft: (payload) => req("POST", "/api/drafts", payload),
  updateDraft: (id, payload) => req("PUT", `/api/drafts/${id}`, payload),

  labels: () => req("GET", "/api/labels"),
  createLabel: (name, color, rule) => req("POST", "/api/labels", { name, color, rule }),
  updateLabel: (id, { name, color, rule }) => req("PUT", `/api/labels/${id}`, { name, color, rule }),
  deleteLabel: (id) => req("DELETE", `/api/labels/${id}`),
  contacts: (q) => req("GET", `/api/contacts?q=${encodeURIComponent(q || "")}`),
  emlUrl: (id) => `/api/messages/${id}/raw`,

  filters: () => req("GET", "/api/filters"),
  createFilter: (payload) => req("POST", "/api/filters", payload),
  deleteFilter: (id) => req("DELETE", `/api/filters/${id}`),

  saveSettings: (payload) => req("PUT", "/api/settings", payload),

  pushKey: () => req("GET", "/api/push/key"),
  pushSubscribe: (sub) => req("POST", "/api/push/subscribe", sub),
  pushUnsubscribe: (endpoint) => req("POST", "/api/push/unsubscribe", { endpoint }),

  getPgp: () => req("GET", "/api/pgp"),
  enablePgp: (publicKey, privateKeyEnc) => req("POST", "/api/pgp/enable", { publicKey, privateKeyEnc }),
  disablePgp: () => req("DELETE", "/api/pgp"),
  pgpPubkey: (address) => req("GET", `/api/pgp/pubkey?address=${encodeURIComponent(address)}`),
  pgpKeys: () => req("GET", "/api/pgp/keys"),
  addPgpKey: (address, publicKey) => req("POST", "/api/pgp/keys", { address, publicKey }),
  removePgpKey: (address) => req("DELETE", `/api/pgp/keys/${encodeURIComponent(address)}`),

  listApiKeys: () => req("GET", "/api/keys"),
  createApiKey: (name) => req("POST", "/api/keys", { name }),
  deleteApiKey: (id) => req("DELETE", `/api/keys/${id}`),

  adminUsers: () => req("GET", "/api/admin/users"),
  adminStats: () => req("GET", "/api/admin/stats"),

  domains: () => req("GET", "/api/domains"),
  publicDomains: () => req("GET", "/api/domains/public"),
  addDomain: (domain) => req("POST", "/api/domains", { domain }),
  addByodDomain: (domain) => req("POST", "/api/domains/byod", { domain }),
  setupRelay: (id, relayUrl) => req("POST", `/api/domains/${id}/relay`, { relayUrl }),
  relayStatus: (id) => req("GET", `/api/domains/${id}/relay-status`),
  relayHealth: (id) => req("POST", `/api/domains/${id}/relay-health`),
  rotateRelay: (id) => req("POST", `/api/domains/${id}/relay/rotate`),
  verifyDomain: (id) => req("POST", `/api/domains/${id}/verify`),
  setDomainPublic: (id, isPublic) => req("PATCH", `/api/domains/${id}`, { public: isPublic }),
  removeDomain: (id) => req("DELETE", `/api/domains/${id}`),
  adminPublicDomains: () => req("GET", "/api/admin/public-domains"),
  approvePublicDomain: (id) => req("POST", `/api/admin/public-domains/${id}/approve`),
  rejectPublicDomain: (id) => req("POST", `/api/admin/public-domains/${id}/reject`),
};
