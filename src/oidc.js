let discoveryCache = null;

export async function discovery(env) {
  if (discoveryCache) return discoveryCache;
  const res = await fetch(`${env.OIDC_ISSUER}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error("oidc discovery failed");
  discoveryCache = await res.json();
  return discoveryCache;
}

function base64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomVerifier() {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

export async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export async function authorizeUrl(env, { redirectUri, state, nonce, challenge }) {
  const d = await discovery(env);
  const params = new URLSearchParams({
    client_id: env.OIDC_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile email groups offline_access",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${d.authorization_endpoint}?${params.toString()}`;
}

export async function exchangeCode(env, { code, redirectUri, verifier }) {
  const d = await discovery(env);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: env.OIDC_CLIENT_ID,
    client_secret: env.OIDC_CLIENT_SECRET,
    code_verifier: verifier,
  });
  const res = await fetch(d.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function userInfo(env, accessToken) {
  const d = await discovery(env);
  const res = await fetch(d.userinfo_endpoint, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo failed: ${res.status}`);
  return res.json();
}

export async function endSessionUrl(env, { idToken, redirectUri }) {
  const d = await discovery(env);
  if (!d.end_session_endpoint) return redirectUri;
  const params = new URLSearchParams({ client_id: env.OIDC_CLIENT_ID });
  if (idToken) params.set("id_token_hint", idToken);
  if (redirectUri) params.set("post_logout_redirect_uri", redirectUri);
  return `${d.end_session_endpoint}?${params.toString()}`;
}

function b64urlBytes(s) {
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
}

let jwksCache = null;
async function getSigningKey(env, kid) {
  if (!jwksCache) {
    const d = await discovery(env);
    const res = await fetch(d.jwks_uri);
    if (!res.ok) throw new Error("jwks fetch failed");
    jwksCache = (await res.json()).keys || [];
  }
  let jwk = jwksCache.find((k) => k.kid === kid);
  if (!jwk) {
    jwksCache = null;
    const d = await discovery(env);
    const res = await fetch(d.jwks_uri);
    jwksCache = res.ok ? (await res.json()).keys || [] : [];
    jwk = jwksCache.find((k) => k.kid === kid);
  }
  return jwk || null;
}

export async function verifyIdToken(env, idToken, expectedNonce) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("malformed id_token");
  const header = b64urlJson(parts[0]);
  if (header.alg !== "RS256") throw new Error("unexpected id_token alg");
  const jwk = await getSigningKey(env, header.kid);
  if (!jwk) throw new Error("id_token signing key not found");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!ok) throw new Error("bad id_token signature");
  const claims = b64urlJson(parts[1]);
  if (claims.iss !== env.OIDC_ISSUER) throw new Error("bad id_token iss");
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(env.OIDC_CLIENT_ID)) throw new Error("bad id_token aud");
  if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now())
    throw new Error("id_token expired");
  if (expectedNonce && claims.nonce !== expectedNonce) throw new Error("bad id_token nonce");
  return claims;
}
