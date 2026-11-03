// The app's catalog: SRD entries merged with the PHB pack by id.
import { catalogId, entryScope, PHB_TO_SRD, slug, type Entry, type GrantSpec, type Kind, type Spec } from './schema.ts';

export interface Catalog { list: Entry[]; byId: Map<string, Entry> }

export function entriesOf<K extends Kind>(cat: Catalog, kind: K): Extract<Entry, { kind: K }>[] {
  return cat.list.filter((e): e is Extract<Entry, { kind: K }> => e.kind === kind);
}

// A pack lives on the device for months; an app update can add an alias since it was built. Re-keying recomputes
// every id with today's PHB_TO_SRD and moves the references inside entries (spell grants, free casts, a
// background's feat) along, so an entry the SRD also has lands on the SRD id instead of being listed twice.
export function rekeyPack(pack: Entry[]): Entry[] {
  const moved = new Map<string, string>();
  for (const kind of ['spell', 'item', 'feat'] as Kind[]) {
    for (const phb of Object.keys(PHB_TO_SRD)) moved.set(`${kind}/${slug(phb)}`, catalogId(kind, phb));
  }
  for (const e of pack) {
    const id = catalogId(e.kind, e.name, entryScope(e));
    if (id !== e.id) moved.set(e.id, id);
  }
  const ref = (v: string | undefined) => (v && !v.startsWith('$') && moved.get(v)) || v;
  const grant = (g: GrantSpec): GrantSpec => ({ ...g, ...(g.spell ? { spell: ref(g.spell) } : {}), ...(g.casts ? { casts: ref(g.casts) } : {}) });
  const spec = (s: Spec): Spec => (s.kind === 'choice' ? { ...s, ...(s.options ? { options: s.options.map(grant) } : {}) } : grant(s));
  return pack.map((e) => {
    const out = { ...e, id: moved.get(e.id) ?? e.id } as Entry;
    if ('grants' in out && out.grants) out.grants = out.grants.map(spec);
    if (out.kind === 'background') {
      const [feat, option] = out.feat.split(':');
      out.feat = ref(feat) + (option === undefined ? '' : `:${option}`);
    }
    return out;
  });
}

// A pack entry whose id the SRD already has is dropped unless it is marked `replace`; the list is sorted by kind, then name.
export function mergeCatalog(srd: Entry[], pack: Entry[] | null): Catalog {
  const byId = new Map(srd.map((e) => [e.id, e]));
  for (const e of pack ? rekeyPack(pack) : []) if (!byId.has(e.id) || e.replace) byId.set(e.id, e);
  const list = [...byId.values()].sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.name.localeCompare(b.name)));
  return { list, byId };
}
