import { entriesOf, type Catalog } from '../catalog/merge';
import { useCatalog } from '../catalog/useCatalog';
import { CAST_NAMES, SIZES } from '../logic';
import { useSheet } from '../sheet';
import type { CastAbility, Details, Size } from '../types';
import { NumInput, TextField, useArmed } from './ui';

type TextKey = keyof Details;
const TEXT_FIELDS: [string, TextKey][] = [['Name', 'name'], ['Species', 'species'], ['Alignment', 'align']];
const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
// Catalog names offered while typing: species and their lineage options.
function suggestions(cat: Catalog): Partial<Record<TextKey, string[]>> {
  return {
    species: uniq([...entriesOf(cat, 'species').map((e) => e.name), ...entriesOf(cat, 'trait').filter((t) => t.of && t.of.endsWith('-lineage')).map((t) => t.name)])
  };
}
const NUM_FIELDS: [string, 'speedBase' | 'initMisc', number, number][] = [
  ['Base speed (ft)', 'speedBase', 0, 200], ['Initiative bonus (extra)', 'initMisc', -20, 20]
];

export function EditDetails({ onReset }: { onReset: () => void }) {
  const { c, update } = useSheet();
  const [resetArmed, tapReset] = useArmed();
  const state = useCatalog(true);
  const cat = state.status === 'ready' ? state.cat : null;
  const lists = cat ? suggestions(cat) : {};
  return (
    <section aria-label="Edit character" className="block edit-details">
      <div className="row wrap between gap-8">
        <h2 className="block-title">Editing character <span className="muted" style={{ fontFamily: 'var(--sans)', fontWeight: 400 }}>· changes save automatically</span></h2>
        <button type="button" className={'btn btn-danger' + (resetArmed ? ' armed' : '')} style={{ fontSize: 14, padding: '0 14px' }} onClick={() => tapReset(onReset)}>
          {resetArmed ? 'Tap again to clear everything' : 'Clear this character'}
        </button>
      </div>
      <div className="grid">
        {TEXT_FIELDS.map(([label, key]) => (
          <TextField key={key} label={label} value={c.ch[key]} list={lists[key] ? 'details-' + key : undefined}
            onChange={(v) => update((p) => ({ ch: { ...p.ch, [key]: v } }))} />
        ))}
        {Object.entries(lists).map(([key, names]) => (
          <datalist key={key} id={'details-' + key}>{names.map((n) => <option key={n} value={n} />)}</datalist>
        ))}
        {NUM_FIELDS.map(([label, key, min, max]) => (
          <label key={key} className="field">{label}
            <NumInput className="input" value={c[key]} min={min} max={max}
              onCommit={(v) => update({ [key]: v })} />
          </label>
        ))}
        <label className="field">Spellcasting ability
          <select className="input" value={c.castAb} onChange={(e) => update({ castAb: e.target.value as CastAbility })}>
            {Object.entries(CAST_NAMES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <label className="field">Size
          <select className="input" value={c.size} onChange={(e) => update({ size: e.target.value as Size })}>
            {SIZES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={c.carryUp} onChange={(e) => update({ carryUp: e.target.checked })} />Counts as one size larger for carrying</label>
      </div>
      <div className="muted">Max HP, ability scores, proficiencies and speeds are edited in their own blocks below; spell slots in the Spells tab. Pencil buttons edit existing entries.</div>
    </section>
  );
}
