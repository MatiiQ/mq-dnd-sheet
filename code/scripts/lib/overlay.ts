// Hand-authored overlays for parsed catalog entries: JSON keyed by catalog id. An overlay's `grants` replace the
// parsed grants and its other fields override the parsed ones. Shared by the SRD and the pack builder.
import type { Entry } from '../../src/catalog/schema.ts';

export type Overlay = Record<string, Partial<Entry>>;

// Throws on an overlay id with no entry, so a renamed entry can't silently lose its grants.
export function applyOverlay(entries: Entry[], overlay: Overlay): Entry[] {
  const ids = new Set(entries.map((e) => e.id));
  const missing = Object.keys(overlay).filter((id) => !ids.has(id));
  if (missing.length) throw new Error(`overlay ids with no entry: ${missing.join(', ')}`);
  return entries.map((e) => (overlay[e.id] ? ({ ...e, ...overlay[e.id] } as Entry) : e));
}
