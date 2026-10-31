// Hand-authored overlays for parsed catalog entries: JSON keyed by catalog id. An overlay's `grants` replace the
// parsed grants and its other fields override the parsed ones; a field set to `null` is removed from the entry (JSON
// has no `undefined`). Shared by the SRD and the pack builder.
import type { Entry } from '../../src/catalog/schema.ts';

type Nullable<T> = T extends unknown ? { [K in keyof T]?: T[K] | null } : never;
export type Overlay = Record<string, Nullable<Entry>>;

// Throws on an overlay id with no entry, so a renamed entry can't silently lose its grants.
export function applyOverlay(entries: Entry[], overlay: Overlay): Entry[] {
  const ids = new Set(entries.map((e) => e.id));
  const missing = Object.keys(overlay).filter((id) => !ids.has(id));
  if (missing.length) throw new Error(`overlay ids with no entry: ${missing.join(', ')}`);
  return entries.map((e) => {
    const o = overlay[e.id];
    if (!o) return e;
    const out: Record<string, unknown> = { ...e, ...o };
    for (const [k, v] of Object.entries(o)) if (v === null) delete out[k];
    return out as unknown as Entry;
  });
}
