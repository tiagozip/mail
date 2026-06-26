import * as openpgp from "openpgp";

let unlockedKey = null;

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

export async function decryptArmored(armored) {
  if (!unlockedKey) throw new Error("PGP key is locked");
  const { data } = await openpgp.decrypt({
    message: await openpgp.readMessage({ armoredMessage: armored }),
    decryptionKeys: unlockedKey,
  });
  return data;
}
