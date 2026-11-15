// Tiny IndexedDB key-value store for the last weather data (NOT part of the offline map package).
// Every entry keeps when it was saved, so the UI can say "data from X min ago, offline".
const DB = 'pae-weather';
const STORE = 'kv';

export interface Cached<T> { savedAt: number; value: T }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function cacheGet<T>(key: string): Promise<Cached<T> | null> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const q = db.transaction(STORE).objectStore(STORE).get(key);
      q.onsuccess = () => { db.close(); resolve((q.result as Cached<T>) ?? null); };
      q.onerror = () => { db.close(); resolve(null); };
    });
  } catch {
    return null;
  }
}

export async function cachePut<T>(key: string, value: T, savedAt = Date.now()) {
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put({ savedAt, value } satisfies Cached<T>, key);
      t.oncomplete = () => { db.close(); resolve(); };
      t.onerror = () => { db.close(); resolve(); };
    });
  } catch { /* storage unavailable: live data only */ }
}

/**
 * Network first, cache fallback. Returns the data plus whether it came from the cache.
 * Errors never reach the UI: with no network and no cache it returns null.
 */
export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export async function fetchWithCache<T>(key: string, load: () => Promise<T>): Promise<{ value: T; savedAt: number; stale: boolean } | null> {
  try {
    if (isOffline()) throw new Error('offline'); // known offline: no pointless request
    const value = await load();
    const savedAt = Date.now();
    await cachePut(key, value, savedAt);
    return { value, savedAt, stale: false };
  } catch {
    const c = await cacheGet<T>(key);
    return c ? { value: c.value, savedAt: c.savedAt, stale: true } : null;
  }
}
