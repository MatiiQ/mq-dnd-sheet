import { useEffect, useState } from 'react';
import { itemQuestions, type AddChoices } from '../../catalog/copy';
import type { Catalog } from '../../catalog/merge';
import type { ItemEntry } from '../../catalog/schema';
import { entriesOf, useCatalog } from '../../catalog/useCatalog';
import { setItemSection } from '../../inventory';
import { normName } from '../../logic';
import { useSheet } from '../../sheet';
import { ChoiceFlow, type FlowState } from './ChoiceFlow';
import { ItemQuestions } from './ItemQuestions';
import { PickerResult } from './PickerResult';
import { PickerFrame, scrollToEntry, usePickerFlow } from './usePicker';

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
  // A new flow (or one the catalog swap closed) starts with no answers waiting.
  useEffect(() => { setAsked(null); setBack(undefined); }, [pf.flow]);
  const cancel = () => { setAsked(null); setBack(undefined); pf.cancel(); };
  const add = (cat: Catalog, ans: AddChoices) => {
    setAsked(null); setBack(undefined);
    const r = pf.finish(cat, ans, sec ? (before, next) =>
      next.inv.filter((i) => !before.inv.some((b) => b.id === i.id)).reduce((x, i) => setItemSection(x, i.id, sec), next) : undefined);
    if (!r) return;
    const added = r.next.inv.find((x) => !r.before.inv.some((b) => b.id === x.id));
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
