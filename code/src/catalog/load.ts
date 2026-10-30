// The catalog, loaded on first use: the SRD data comes as its own chunk, so the first paint doesn't parse it.
import { mergeCatalog, type Catalog } from './merge';
import { getPack } from './pack-db';

let cached: Promise<Catalog> | null = null;

// SRD merged with the PHB pack on this device. A pack that can't be read leaves SRD only. If the SRD chunk can't be
// fetched (offline before the service worker cached a new version), the next call tries again.
export function loadCatalog(): Promise<Catalog> {
  cached ??= (async () => {
    const [srd, pack] = await Promise.all([import('../data/srd/index').then((m) => m.default), getPack().catch(() => null)]);
    return mergeCatalog(srd, pack);
  })().catch((e: unknown) => { cached = null; throw e; });
  return cached;
}
