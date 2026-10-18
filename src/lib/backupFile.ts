// Protected backup file (.htb): AES-GCM 256 encrypted with a unique IV per export.
// The file is opaque binary in any editor, and any edited byte fails the GCM tag check.
const enc = new TextEncoder();
const MAGIC = enc.encode("HTB1");
const LEGACY_MAGIC = enc.encode("HTBAK1");
const SEED = "ht-sealed-backup-v1::7f3c9a2e-41d8-4b6e-9c0f-backup";
export const TAMPER_MESSAGE = "This backup file has been modified or corrupted and cannot be imported";

let keyPromise: Promise<CryptoKey> | null = null;
const getKey = () =>
  (keyPromise ??= (async () => {
    const base = await crypto.subtle.importKey("raw", enc.encode(SEED), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: enc.encode("htbak-salt"), iterations: 50_000, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
    );
  })());

export const sealBackup = async (data: unknown): Promise<Blob> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = enc.encode(JSON.stringify(data));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: MAGIC }, await getKey(), plain));
  return new Blob([MAGIC, iv, cipher], { type: "application/octet-stream" });
};

const startsWith = (bytes: Uint8Array, magic: Uint8Array) =>
  bytes.length > magic.length + 12 && magic.every((b, i) => bytes[i] === b);

const magicOf = (bytes: Uint8Array) =>
  startsWith(bytes, LEGACY_MAGIC) ? LEGACY_MAGIC : startsWith(bytes, MAGIC) ? MAGIC : null;

export const isSealedBackup = (bytes: Uint8Array) => magicOf(bytes) !== null;

export const openBackup = async (bytes: Uint8Array): Promise<any> => {
  const magic = magicOf(bytes);
  if (!magic) throw new Error(TAMPER_MESSAGE);
  const iv = bytes.slice(magic.length, magic.length + 12);
  const cipher = bytes.slice(magic.length + 12);
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: magic }, await getKey(), cipher);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new Error(TAMPER_MESSAGE);
  }
};
