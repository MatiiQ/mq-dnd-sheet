import { useState } from 'react';
import { classIdOf, hasSpell } from '../../catalog/copy';
import { entriesOf, type Catalog } from '../../catalog/merge';
import type { SpellEntry } from '../../catalog/schema';
import { useCatalog } from '../../catalog/useCatalog';
import { normName } from '../../logic';
import { useSheet } from '../../sheet';
import { ChoiceFlow } from './ChoiceFlow';
import { PickerResult } from './PickerResult';
import { firstNew, PickerFrame, scrollToEntry, usePickerFlow } from './usePicker';

const LEVELS = ['Cantrip', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

// Spells by class list and level, or by name across every list. Adding goes through ChoiceFlow and addFromCatalog.
export function SpellPicker({ onClose }: { onClose: () => void }) {
  const state = useCatalog(true);
  const pf = usePickerFlow();
  return (
    <PickerFrame title="Add a spell" state={state} msg={pf.msg} onClose={onClose}>
      {(cat) => <>
        {pf.flow && <ChoiceFlow entry={pf.flow.entry} cat={cat} onCancel={pf.cancel} onDone={(ans) => {
          const r = pf.finish(cat, ans);
          if (!r) return;
          const added = firstNew(r.before.spells, r.next.spells);
          onClose();
          if (added) scrollToEntry('spell-' + added.id);
        }} />}
        {/* Kept mounted while a flow is open, so Cancel returns to the same list, level and search. */}
        <div hidden={!!pf.flow}><SpellList cat={cat} onAdd={pf.start} /></div>
      </>}
    </PickerFrame>
  );
}

function SpellList({ cat, onAdd }: { cat: Catalog; onAdd: (e: SpellEntry) => void }) {
  const { c } = useSheet();
  const spells = entriesOf(cat, 'spell');
  // Every class with spells; the character's own class first chosen.
  const lists = entriesOf(cat, 'class').filter((cl) => spells.some((s) => s.classes.split(',').includes(cl.id.split('/')[1])));
  const own = classIdOf(cat, c);
  const [list, setList] = useState(lists.some((l) => l.id === own) ? own : lists[0]?.id ?? '');
  const [lvl, setLvl] = useState(0);
  const [q, setQ] = useState('');
  const slug = list.split('/')[1];
  const query = normName(q);
  const shown = query ? spells.filter((s) => normName(s.name).includes(query))
    : spells.filter((s) => s.lvl === lvl && s.classes.split(',').includes(slug));
  return (
    <div className="col gap-8">
      <div className="row wrap gap-6">
        <label className="field" style={{ flex: '1 1 140px' }}>Spell list
          <select className="input" value={list} onChange={(e) => setList(e.target.value)}>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: '1 1 110px' }}>Level
          <select className="input" value={String(lvl)} onChange={(e) => setLvl(Number(e.target.value))}>
            {LEVELS.map((l, i) => <option key={l} value={String(i)}>{l}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: '2 1 180px' }}>Search every list by name
          <input type="search" className="input" value={q} placeholder="e.g. cure" onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {shown.length === 0 && <span className="muted">{query ? 'No spell by that name.' : 'No spells of this level on this list.'}</span>}
      <div className="col gap-6 picker-results">
        {shown.map((s) => <PickerResult key={s.id} entry={s} taken={hasSpell(c, s)} onAdd={() => onAdd(s)} />)}
      </div>
    </div>
  );
}
