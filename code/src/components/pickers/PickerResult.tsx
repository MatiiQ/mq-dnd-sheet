import { useState } from 'react';
import type { Entry } from '../../catalog/schema';

// The line under a result's name: a spell's level, school and casting time; an item's category and cost.
function subline(e: Entry): string {
  if (e.kind === 'spell') return [e.lvl ? 'Level ' + e.lvl : 'Cantrip', e.school, e.time].filter(Boolean).join(' · ');
  if (e.kind === 'item') return [e.rarity, e.cost].filter(Boolean).join(' · ');
  return '';
}

// One catalog result: tap the name to read its description, Add to add it. taken: 'Already on the sheet' (Add stays
// on: a spell or a repeatable feat can be added twice). note: a line under the name ('Level 9', missing
// prerequisites); marked: shown as not met; disabled: Add off (a feat that can't be taken twice).
export function PickerResult({ entry, taken, onAdd, note, marked, disabled }: {
  entry: Entry; taken: boolean; onAdd: () => void; note?: string; marked?: boolean; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const sub = subline(entry);
  // A magic armor or weapon of the player's choice comes without its base fields (catalog `base`).
  return (
    <div className="well entry picker-result">
      <div className="entry-row">
        <button type="button" className="entry-head" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="col">
            <span className={marked ? 'picker-name unmet' : 'picker-name'}>{entry.name}</span>
            {sub && <span className="muted">{sub}</span>}
            {note && <span className={marked ? 'small picker-warn' : 'small'}>{note}</span>}
            {taken && <span className="small picker-taken">Already on the sheet</span>}
          </span>
        </button>
        <button type="button" className="btn btn-sm" aria-disabled={disabled} aria-label={'Add ' + entry.name} onClick={() => { if (!disabled) onAdd(); }}>Add</button>
      </div>
      {open && <div className="entry-body"><span className="entry-desc">{entry.desc || 'No description.'}</span></div>}
    </div>
  );
}
