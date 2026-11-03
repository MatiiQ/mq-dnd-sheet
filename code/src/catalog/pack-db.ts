// The PHB pack on this device, in IndexedDB ('dnd-catalog' / store 'packs' / key 'phb'); localStorage is kept for
// the characters. No wrapper library: each call opens the database, does one request and closes it.
import type { Entry } from './schema';

const DB = 'dnd-catalog', STORE = 'packs', KEY = 'phb';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('This browser offers no storage for PHB data.')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('This browser refused the storage for PHB data.'));
    req.onblocked = () => reject(new Error('PHB data storage is busy in another tab.'));
  });
}
async function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = f(tx.objectStore(STORE));
      const fail = () => reject(new Error('The PHB data storage failed.'));
      req.onerror = fail;
      tx.onabort = fail;
      // Done when the transaction commits, not when the request succeeds: a quota abort comes after the request.
      tx.oncomplete = () => resolve(req.result as T);
    });
  } finally { db.close(); }
}

// null when there is no pack or it can't be read (private window, storage blocked): the app then uses SRD only.
export async function getPack(): Promise<Entry[] | null> {
  try { return (await run<Entry[] | undefined>('readonly', (s) => s.get(KEY))) ?? null; } catch { return null; }
}
// Stores the pack, then asks the browser to keep it when space runs low.
export async function putPack(entries: Entry[]): Promise<void> {
  await run('readwrite', (s) => s.put(entries, KEY));
  try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
}
export async function deletePack(): Promise<void> {
  await run('readwrite', (s) => s.delete(KEY));
}
