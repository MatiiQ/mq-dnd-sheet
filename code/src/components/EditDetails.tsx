import { CAST_NAMES, clamp, SIZES } from '../logic';
import { useSheet } from '../sheet';
import type { CastAbility, Details, Size } from '../types';
import { NumInput, TextField, TypeInNumber, useArmed } from './ui';

const TEXT_FIELDS: [string, keyof Details][] = [['Name', 'name'], ['Species', 'species'], ['Class', 'cls'], ['Subclass', 'sub'], ['Background', 'bg'], ['Alignment', 'align']];
const NUM_FIELDS: [string, 'speedBase' | 'initMisc', number, number][] = [
  ['Base speed (ft)', 'speedBase', 0, 200], ['Initiative bonus (extra)', 'initMisc', -20, 20]
];

export function EditDetails({ onReset }: { onReset: () => void }) {
  const { c, update } = useSheet();
  const [resetArmed, tapReset] = useArmed();
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
          <TextField key={key} label={label} value={c.ch[key]} onChange={(v) => update((p) => ({ ch: { ...p.ch, [key]: v } }))} />
        ))}
        {/* Level commits once, on blur or Enter: typing "12" never passes through level 1, because a level drop lowers
            level-table resource maxima and HP per level for good (normalize() clamps counts and HP). */}
        <label className="field">Level
          <TypeInNumber className="input" value={c.level} onCommit={(v) => update({ level: clamp(v, 1, 20) })} />
        </label>
        {NUM_FIELDS.map(([label, key, min, max]) => (
          <label key={key} className="field">{label}
            <NumInput className="input" value={c[key]} min={min} max={max}
              onCommit={(v) => update({ [key]: v })} />
          </label>
        ))}
        <label className="field">Hit die
          <select className="input" value={String(c.hdDie)} onChange={(e) => update({ hdDie: parseInt(e.target.value, 10) })}>
            <option value="6">d6</option><option value="8">d8</option><option value="10">d10</option><option value="12">d12</option>
          </select>
        </label>
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
