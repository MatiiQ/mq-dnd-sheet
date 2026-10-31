import { useState } from 'react';
import type { Catalog } from '../../catalog/merge';
import type { ItemEntry } from '../../catalog/schema';
import { entriesOf, useCatalog } from '../../catalog/useCatalog';
import { normName } from '../../logic';
import { useSheet } from '../../sheet';
import { ChoiceFlow } from './ChoiceFlow';
import { PickerResult } from './PickerResult';
import { PickerFrame, scrollToEntry, usePickerFlow } from './usePicker';

const CATS: [string, string, ItemEntry['cat'][]][] = [
  ['weapon', 'Weapons', ['weapon']], ['armor', 'Armor', ['armor', 'shield']], ['gear', 'Gear', ['gear', 'ammo', 'focus']],
  ['tool', 'Tools', ['tool']], ['pack', 'Packs', ['pack']], ['magic', 'Magic items', ['magic']]
];

// Items by category, or by name across all of them. Adding goes through ChoiceFlow (Armor of Resistance asks its type).
export function ItemPicker({ onClose }: { onClose: () => void }) {
  const state = useCatalog(true);
  const pf = usePickerFlow();
  return (
    <PickerFrame title="Add an item" state={state} msg={pf.msg} onClose={onClose}>
      {(cat) => <>
        {pf.flow && <ChoiceFlow entry={pf.flow.entry} cat={cat} onCancel={pf.cancel} onDone={(ans) => {
          const r = pf.finish(cat, ans);
          if (!r) return;
          const added = r.next.inv.find((x) => !r.before.inv.some((b) => b.id === x.id));
          onClose();
          if (added) scrollToEntry('item-' + added.id);
        }} />}
        {/* Kept mounted while a flow is open, so Cancel returns to the same category and search. */}
        <div hidden={!!pf.flow}><ItemList cat={cat} onAdd={(e) => pf.start(e)} /></div>
      </>}
    </PickerFrame>
  );
}

function ItemList({ cat, onAdd }: { cat: Catalog; onAdd: (e: ItemEntry) => void }) {
  const { c } = useSheet();
  const [group, setGroup] = useState('weapon');
  const [q, setQ] = useState('');
  const items = entriesOf(cat, 'item');
  const query = normName(q);
  const cats = CATS.find(([k]) => k === group)![2];
  const shown = query ? items.filter((e) => normName(e.name).includes(query)) : items.filter((e) => cats.includes(e.cat));
  const taken = (e: ItemEntry) => c.inv.some((i) => (i.cid ? i.cid === e.id : normName(i.name) === normName(e.name)));
  return (
    <div className="col gap-8">
      <label className="field">Search every item by name
        <input type="search" className="input" value={q} placeholder="e.g. rope" onChange={(e) => setQ(e.target.value)} />
      </label>
      {!query && (
        <div role="group" aria-label="Item category" className="row wrap gap-4">
          {CATS.map(([k, label]) => <button key={k} type="button" className="filter-btn" aria-pressed={group === k} onClick={() => setGroup(k)}>{label}</button>)}
        </div>
      )}
      {shown.length === 0 && <span className="muted">No item by that name.</span>}
      <div className="col gap-6 picker-results">
        {shown.map((e) => <PickerResult key={e.id} entry={e} taken={taken(e)} onAdd={() => onAdd(e)} />)}
      </div>
    </div>
  );
}
