// Rule text from the catalog, under an open row. Loads the catalog on first mount; a row that isn't open doesn't mount it.
import type { Catalog } from '../catalog/merge';
import type { RuleEntry } from '../catalog/schema';
import { useCatalog, type CatalogState } from '../catalog/useCatalog';

export function RuleNotesView({ state, pick }: { state: CatalogState; pick: (cat: Catalog) => RuleEntry[] }) {
  if (state.status !== 'ready') return null;
  return <>{pick(state.cat).map((e) => <span key={e.id} className="entry-desc"><strong>{e.name}.</strong> {e.desc}</span>)}</>;
}

export function RuleNotes({ pick }: { pick: (cat: Catalog) => RuleEntry[] }) {
  return <RuleNotesView state={useCatalog(true)} pick={pick} />;
}
