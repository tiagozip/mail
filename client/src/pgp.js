import * as openpgp from "openpgp";

let unlockedKey = null;
const LEGACY_PASS_KEY = "em-pgp-pass";
const DB_NAME = "em-secure";
const STORE = "vault";
const DEVICE_KEY_ID = "device-key";
const PASS_ID = "wrapped-pass";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(id, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDel(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deviceKey() {
  const existing = await idbGet(DEVICE_KEY_ID);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  await idbSet(DEVICE_KEY_ID, key);
  return key;
}

export async function rememberPass(pass) {
  try {
    const key = await deviceKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(pass)),
    );
    await idbSet(PASS_ID, { iv, ct });
    try {
      localStorage.removeItem(LEGACY_PASS_KEY);
    } catch {}
  } catch {}
}

export async function getRememberedPass() {
  try {
    const legacy = localStorage.getItem(LEGACY_PASS_KEY);
    if (legacy) {
      await rememberPass(legacy);
      return legacy;
    }
  } catch {}
  try {
    const blob = await idbGet(PASS_ID);
    if (!blob) return null;
    const key = await deviceKey();
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: blob.iv }, key, blob.ct);
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

export async function forgetPass() {
  try {
    await idbDel(PASS_ID);
  } catch {}
  try {
    localStorage.removeItem(LEGACY_PASS_KEY);
  } catch {}
}

export async function generateIdentity(name, email, passphrase) {
  const { publicKey, privateKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519",
    userIDs: [{ name: name || email, email }],
    passphrase,
    format: "armored",
  });
  return { publicKey, privateKeyEnc: privateKey };
}

export function setUnlocked(key) {
  unlockedKey = key;
}

export function getUnlocked() {
  return unlockedKey;
}

export function clearUnlocked() {
  unlockedKey = null;
}

export async function unlock(privateKeyEnc, passphrase) {
  const key = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({ armoredKey: privateKeyEnc }),
    passphrase,
  });
  unlockedKey = key;
  return true;
}

export async function encryptFor(armoredPublicKeys, text) {
  const keys = await Promise.all(
    armoredPublicKeys.map((armored) => openpgp.readKey({ armoredKey: armored })),
  );
  return openpgp.encrypt({
    message: await openpgp.createMessage({ text }),
    encryptionKeys: keys,
  });
}

export async function decryptArmored(armored) {
  if (!unlockedKey) throw new Error("PGP key is locked");
  const { data } = await openpgp.decrypt({
    message: await openpgp.readMessage({ armoredMessage: armored }),
    decryptionKeys: unlockedKey,
  });
  return data;
}

export async function decryptBytes(armored) {
  if (!unlockedKey) throw new Error("PGP key is locked");
  const { data } = await openpgp.decrypt({
    message: await openpgp.readMessage({ armoredMessage: armored }),
    decryptionKeys: unlockedKey,
    format: "binary",
  });
  return data;
}
