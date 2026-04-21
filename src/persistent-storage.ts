/**
 * Request persistent storage from the browser. This is the one line
 * that can save you from losing weeks of data to Safari's inactivity
 * eviction policy on home-screen PWAs.
 *
 * navigator.storage.persist() is honored differently by browser:
 *   - Chrome / Edge (desktop + Android): granted if the site is
 *     "engaged" (bookmarked, added to home screen, high usage).
 *   - Firefox: prompts the user.
 *   - Safari: honors it silently but may still evict under very high
 *     storage pressure. Behavior has changed across iOS versions.
 *
 * On denial we tighten the export reminder cadence (see storage.ts).
 */

import { getMeta, setMeta } from "./storage";

export async function ensurePersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("storage" in navigator)) return false;
  const s = navigator.storage;
  if (!s || typeof s.persist !== "function") return false;
  try {
    const already = typeof s.persisted === "function" ? await s.persisted() : false;
    if (already) {
      await setMeta("storagePersisted", true);
      await setMeta("storagePersistCheckedAt", new Date().toISOString());
      return true;
    }
    const granted = await s.persist();
    await setMeta("storagePersisted", granted);
    await setMeta("storagePersistRequestedAt", new Date().toISOString());
    return granted;
  } catch {
    return false;
  }
}

export async function isPersistentGranted(): Promise<boolean> {
  return (await getMeta<boolean>("storagePersisted")) === true;
}
