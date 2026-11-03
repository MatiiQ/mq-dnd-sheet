// The catalog, loaded on first use: the SRD data comes as its own chunk, so the first paint doesn't parse it.
import { mergeCatalog, type Catalog } from './merge';
import { getPack } from './pack-db';
import { importSrd } from './srd-chunk';

let cached: Promise<Catalog> | null = null;
let version = 0;
const listeners = new Set<() => void>();

// SRD merged with the PHB pack on this device. A pack that can't be read leaves SRD only. If the SRD chunk can't be
// fetched (offline before the service worker cached a new version), the next call tries again. A failed load clears
// the cache only while it is still the cached one: a load from before a resetCatalog() never clears a newer one.
export function loadCatalog(): Promise<Catalog> {
  if (cached) return cached;
  const p: Promise<Catalog> = (async () => {
    const [srd, pack] = await Promise.all([importSrd(), getPack()]);
    return mergeCatalog(srd, pack);
  })().catch((e: unknown) => { if (cached === p) cached = null; throw e; });
  cached = p;
  return p;
}

// Bumped by every resetCatalog(), so answers held against a catalog can tell it was swapped.
export function catalogVersion(): number {
  return version;
}

// Called after every resetCatalog(); returns the unsubscribe function.
export function onCatalogReset(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// After a pack is imported or removed: the next loadCatalog() merges again, and open pickers reload.
export function resetCatalog(): void {
  cached = null;
  version++;
  for (const fn of [...listeners]) fn();
}
