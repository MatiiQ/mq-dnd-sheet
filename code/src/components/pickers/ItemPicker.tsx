import { useState } from 'react';
import { hasItem, itemQuestions, type AddChoices } from '../../catalog/copy';
import { entriesOf, type Catalog } from '../../catalog/merge';
import type { ItemEntry } from '../../catalog/schema';
import { useCatalog } from '../../catalog/useCatalog';
import { setItemSection } from '../../inventory';
import { normName } from '../../logic';
import { useSheet } from '../../sheet';
import { ChoiceFlow, type FlowState } from './ChoiceFlow';
import { ItemQuestions } from './ItemQuestions';
import { PickerResult } from './PickerResult';
import { firstNew, PickerFrame, scrollToEntry, usePickerFlow } from './usePicker';

const CATS: [string, string, ItemEntry['cat'][]][] = [
  ['weapon', 'Weapons', ['weapon']], ['armor', 'Armor', ['armor', 'shield']], ['gear', 'Gear', ['gear', 'ammo', 'focus']],
  ['tool', 'Tools', ['tool']], ['pack', 'Packs', ['pack']], ['magic', 'Magic items', ['magic']]
];

// Items by category, or by name across all of them. Adding goes through ChoiceFlow (Armor of Resistance asks its type),
// then the item questions (plan 7: a rolled charge count); Back from the first question returns to ChoiceFlow's last
// step with its picks, or cancels when it had nothing to ask.
// sec: the section the new items go in (a pack can add several), from the section whose "+ Add item" was tapped.
export function ItemPicker({ onClose, sec }: { onClose: () => void; sec?: string }) {
  const state = useCatalog(true);
  const pf = usePickerFlow();
  // The ChoiceFlow answers waiting for the item questions, and where ChoiceFlow stood.
  const [asked, setAsked] = useState<{ ans: AddChoices; flow: FlowState } | null>(null);
  const [back, setBack] = useState<FlowState | undefined>();
  // A new flow starts with no answers waiting. Reset here, not in an effect on pf.flow: ChoiceFlow hands its answers
  // on from its own mount effect when it has nothing to ask, and a parent effect would then wipe them.
  const start = (e: ItemEntry) => { setAsked(null); setBack(undefined); pf.start(e); };
  const cancel = () => { setAsked(null); setBack(undefined); pf.cancel(); };
  const add = (cat: Catalog, ans: AddChoices) => {
    setAsked(null); setBack(undefined);
    const r = pf.finish(cat, ans, sec ? (before, next) =>
      next.inv.filter((i) => !before.inv.some((b) => b.id === i.id)).reduce((x, i) => setItemSection(x, i.id, sec), next) : undefined);
    if (!r) return;
    const added = firstNew(r.before.inv, r.next.inv);
    onClose();
    if (added) scrollToEntry('item-' + added.id);
  };
  return (
    <PickerFrame title="Add an item" state={state} msg={pf.msg} onClose={onClose}>
      {(cat) => <>
        {pf.flow && !asked && <ChoiceFlow entry={pf.flow.entry} cat={cat} initial={back} onCancel={cancel} onDone={(ans, flow) => {
          if (itemQuestions(cat, pf.flow!.entry).length) setAsked({ ans, flow });
          else add(cat, ans);
        }} />}
        {pf.flow && asked && <ItemQuestions entry={pf.flow.entry} cat={cat} onCancel={cancel} onDone={(item) => add(cat, { ...asked.ans, item })}
          onBack={() => { if (!asked.flow.total) cancel(); else { setBack(asked.flow); setAsked(null); } }} />}
        {/* Kept mounted while a flow is open, so Cancel returns to the same category and search. */}
        <div hidden={!!pf.flow}><ItemList cat={cat} onAdd={start} /></div>
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
        {shown.map((e) => <PickerResult key={e.id} entry={e} taken={hasItem(c, e)} onAdd={() => onAdd(e)} />)}
      </div>
    </div>
  );
}
