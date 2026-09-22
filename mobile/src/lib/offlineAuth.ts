/**
 * Mobile offline credentials vault.
 * Lets Android users log in with password or PIN when the server is unreachable.
 *
 * Design (mirrors client/src/lib/offline-db.ts + desktop vault):
 * - On every successful ONLINE login, cache { hash, salt, pinHash, pinSalt, user }.
 * - Hashes live in SecureStore (small); user profile + email index in AsyncStorage.
 * - Passwords are never stored — only salted hashes (local verification only).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const INDEX_KEY = "offline_cred_index";
const USER_PREFIX = "offline_cred_user:";

export type OfflineCredRecord = {
  email: string;
  hash: string;
  salt: string;
  pinHash?: string;
  pinSalt?: string;
  lastOnlineLogin: string;
};

function fallbackHash(value: string, salt: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const str = `${salt}::${value}::${salt.length}`;
  for (let round = 0; round < 8; round++) {
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i) + round;
      h1 = Math.imul(h1 ^ c, 16777619);
      h2 = Math.imul(h2 ^ (c + (h1 & 0xff)), 16777619);
    }
  }
  return `fb-${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

function newSalt(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

function secureKey(email: string) {
  return `offline_cred:${email.toLowerCase()}`;
}

async function readIndex(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeIndex(emails: string[]) {
  try {
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(emails));
  } catch {}
}

async function readHashRecord(email: string): Promise<OfflineCredRecord | null> {
  try {
    const raw = await SecureStore.getItemAsync(secureKey(email));
    if (raw) return JSON.parse(raw) as OfflineCredRecord;
  } catch {}
  // Fallback: older builds stored the whole record in AsyncStorage
  try {
    const raw = await AsyncStorage.getItem(secureKey(email));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.hash) return parsed as OfflineCredRecord;
    }
  } catch {}
  return null;
}

async function readCachedUser(email: string): Promise<any | null> {
  try {
    const raw = await AsyncStorage.getItem(`${USER_PREFIX}${email.toLowerCase()}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function extractPin(user: any): string | null {
  const v = user?.pin ?? user?.cashierPin ?? user?.offlinePin ?? user?.user_metadata?.pin;
  if (v === undefined || v === null) return null;
  const s = String(v);
  return s.length >= 4 ? s : null;
}

export async function saveOfflineCredentials(email: string, password: string, user: any): Promise<void> {
  const key = email.toLowerCase();
  const salt = newSalt();
  const hash = fallbackHash(password, salt);
  const prev = await readHashRecord(key).catch(() => null);

  let pinHash = prev?.pinHash;
  let pinSalt = prev?.pinSalt;
  const pin = extractPin(user);
  if (pin) {
    pinSalt = newSalt();
    pinHash = fallbackHash(pin, pinSalt);
  }

  const record: OfflineCredRecord = {
    email: key,
    hash,
    salt,
    pinHash,
    pinSalt,
    lastOnlineLogin: new Date().toISOString(),
  };
  try {
    await SecureStore.setItemAsync(secureKey(key), JSON.stringify(record));
  } catch {
    // SecureStore can fail on rooted devices / no lock screen — keep AsyncStorage copy
    try {
      await AsyncStorage.setItem(secureKey(key), JSON.stringify(record));
    } catch {}
  }
  try {
    if (user) await AsyncStorage.setItem(`${USER_PREFIX}${key}`, JSON.stringify(user));
  } catch {}
  const index = await readIndex();
  if (!index.includes(key)) await writeIndex([...index, key]);
}

export async function verifyOfflineCredentials(email: string, password: string): Promise<any | null> {
  const key = email.toLowerCase();
  const rec = await readHashRecord(key);
  if (!rec) return null;
  if (fallbackHash(password, rec.salt) !== rec.hash) return null;
  return (await readCachedUser(key)) || null;
}

export async function verifyOfflinePin(email: string, pin: string): Promise<any | null> {
  const key = email.toLowerCase();
  const rec = await readHashRecord(key);
  if (!rec?.pinHash || !rec?.pinSalt) return null;
  if (fallbackHash(String(pin), rec.pinSalt) !== rec.pinHash) return null;
  return (await readCachedUser(key)) || null;
}

export async function getOfflineUsers(): Promise<any[]> {
  const index = await readIndex();
  const out: any[] = [];
  for (const email of index) {
    const user = await readCachedUser(email);
    if (user) out.push(user);
  }
  return out;
}

export async function hasOfflineCredentials(): Promise<boolean> {
  const index = await readIndex();
  return index.length > 0;
}
