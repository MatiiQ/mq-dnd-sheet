// The catalog for a picker: loaded the first time the picker opens, and again after a pack import or removal.
import { useEffect, useRef, useState } from 'react';
import { catalogVersion, loadCatalog, onCatalogReset } from './load';
import type { Catalog } from './merge';

export type CatalogState = { status: 'idle' | 'loading' } | { status: 'ready'; cat: Catalog } | { status: 'error'; retry: () => void };

// keep: leave the current ready state up while the load runs (a reopen with nothing changed). stale: the result
// (ready or error) of a load overtaken by a reset or an unmount is dropped.
export function startLoad(load: () => Promise<Catalog>, set: (s: CatalogState) => void, stale: () => boolean, keep = false): void {
  if (!keep) set({ status: 'loading' });
  load().then(
    (cat) => { if (!stale()) set({ status: 'ready', cat }); },
    () => { if (!stale()) set({ status: 'error', retry: () => startLoad(load, set, stale) }); }
  );
}

// Starts a load every time `active` turns true (cached, so cheap) and on every reset while active.
export function useCatalog(active: boolean): CatalogState {
  const [state, setState] = useState<CatalogState>({ status: 'idle' });
  const readyAt = useRef(-1);   // the catalogVersion() the ready state was loaded at, -1 when not ready
  useEffect(() => {
    if (!active) return;
    let gone = false;
    const run = () => {
      const v = catalogVersion();
      const set = (s: CatalogState) => { readyAt.current = s.status === 'ready' ? v : -1; setState(s); };
      startLoad(loadCatalog, set, () => gone || catalogVersion() !== v, readyAt.current === v);
    };
    run();
    const off = onCatalogReset(run);
    return () => { gone = true; off(); };
  }, [active]);
  return state;
}
