let cachedKey = null;

function decodeBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getKey(env) {
  if (cachedKey) return cachedKey;
  const bytes = decodeBase64(env.ENCRYPTION_KEY);
  cachedKey = await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  return cachedKey;
}

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input);
}

export async function encryptBytes(env, bytes) {
  const key = await getKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = toBytes(bytes);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data));
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv, 0);
  out.set(cipher, iv.length);
  return out;
}

export async function decryptBytes(env, bytes) {
  const key = await getKey(env);
  const data = toBytes(bytes);
  const iv = data.slice(0, 12);
  const cipher = data.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new Uint8Array(plain);
}

export async function tryDecryptBytes(env, bytes) {
  try {
    return await decryptBytes(env, bytes);
  } catch {
    return toBytes(bytes);
  }
}

export async function encryptText(env, str) {
  return encryptBytes(env, new TextEncoder().encode(String(str ?? "")));
}

export async function tryDecryptText(env, bytes) {
  const plain = await tryDecryptBytes(env, bytes);
  return new TextDecoder().decode(plain);
}
