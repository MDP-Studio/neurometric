/**
 * Local-first IndexedDB storage.
 *
 * Origin-scoped. If the app is ever moved from http://<ip>:5173 to an
 * HTTPS deployment, the data here does NOT migrate — IndexedDB is
 * bucketed by origin. Methodology doc commits us to: treat origin
 * migration as a hard restart, export JSON before the move, import on
 * the new origin.
 */

import type { DeferralRecord, Session } from "./types";

const DB_NAME = "neurometric";
const DB_VERSION = 2;
const STORE_SESSIONS = "sessions";
const STORE_META = "meta";
const STORE_DEFERRALS = "deferrals";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const s = db.createObjectStore(STORE_SESSIONS, { keyPath: "id" });
        s.createIndex("timestamp", "timestamp");
        s.createIndex("task", "task");
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_DEFERRALS)) {
        const d = db.createObjectStore(STORE_DEFERRALS, { keyPath: "id" });
        d.createIndex("timestamp", "timestamp");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// ---------- Sessions ----------

export async function saveSession(session: Session): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_SESSIONS, "readwrite");
    tx.objectStore(STORE_SESSIONS).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listSessions(task?: string): Promise<Session[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SESSIONS, "readonly");
    const store = tx.objectStore(STORE_SESSIONS);
    const req = store.getAll();
    req.onsuccess = () => {
      const all = req.result as Session[];
      const filtered = task ? all.filter((s) => s.task === task) : all;
      filtered.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      resolve(filtered);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAllSessions(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_SESSIONS, STORE_DEFERRALS], "readwrite");
    tx.objectStore(STORE_SESSIONS).clear();
    tx.objectStore(STORE_DEFERRALS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Deferrals ----------

export async function saveDeferral(d: DeferralRecord): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_DEFERRALS, "readwrite");
    tx.objectStore(STORE_DEFERRALS).put(d);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listDeferrals(): Promise<DeferralRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DEFERRALS, "readonly");
    const req = tx.objectStore(STORE_DEFERRALS).getAll();
    req.onsuccess = () => {
      const all = req.result as DeferralRecord[];
      all.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      resolve(all);
    };
    req.onerror = () => reject(req.error);
  });
}

// ---------- Meta ----------

export async function getMeta<T = unknown>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readonly");
    const req = tx.objectStore(STORE_META).get(key);
    req.onsuccess = () => resolve(req.result ? (req.result.value as T) : null);
    req.onerror = () => reject(req.error);
  });
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readwrite");
    tx.objectStore(STORE_META).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Export ----------

export async function exportAll(): Promise<string> {
  const sessions = await listSessions();
  const deferrals = await listDeferrals();
  const db = await openDb();
  const meta = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readonly");
    const req = tx.objectStore(STORE_META).getAll();
    req.onsuccess = () => {
      const obj: Record<string, unknown> = {};
      for (const r of req.result as Array<{ key: string; value: unknown }>) {
        obj[r.key] = r.value;
      }
      resolve(obj);
    };
    req.onerror = () => reject(req.error);
  });
  return JSON.stringify(
    {
      version: DB_VERSION,
      exportedAt: new Date().toISOString(),
      origin: location.origin,
      sessions,
      deferrals,
      meta,
    },
    null,
    2,
  );
}

/**
 * True if the user should be prompted to download an export now.
 *
 * Default cadence: every 5 sessions, or 7 days since last export.
 * Tightened cadence (every 3 sessions, 3 days) if persistent storage
 * was denied — in that mode we assume higher eviction risk. Tightest of
 * all if persistent storage was never granted AND the user is on Safari
 * (the most aggressive evictor).
 */
export async function shouldRemindBackup(): Promise<boolean> {
  const sessions = await listSessions();
  if (sessions.length === 0) return false;
  const lastCount = (await getMeta<number>("lastExportSessionCount")) ?? 0;
  const lastAtIso = (await getMeta<string>("lastExportAt")) ?? null;
  const persisted = (await getMeta<boolean>("storagePersisted")) === true;
  const isSafari =
    typeof navigator !== "undefined" &&
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  const sessionsThreshold = persisted ? 5 : isSafari ? 2 : 3;
  const daysThreshold = persisted ? 7 : isSafari ? 2 : 3;

  if (sessions.length - lastCount >= sessionsThreshold) return true;
  if (lastAtIso === null && sessions.length >= (persisted ? 3 : 1)) return true;
  if (lastAtIso) {
    const daysSince = (Date.now() - new Date(lastAtIso).getTime()) / 86400000;
    if (daysSince >= daysThreshold) return true;
  }
  return false;
}

export async function markBackupDone(): Promise<void> {
  const sessions = await listSessions();
  await setMeta("lastExportSessionCount", sessions.length);
  await setMeta("lastExportAt", new Date().toISOString());
}
