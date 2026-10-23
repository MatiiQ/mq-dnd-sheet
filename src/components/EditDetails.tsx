import { useSheet } from '../sheet';
import type { CastAbility, Details } from '../types';
import { NumInput, TextField, useArmed } from './ui';

const TEXT_FIELDS: [string, keyof Details][] = [['Name', 'name'], ['Species', 'species'], ['Class', 'cls'], ['Subclass', 'sub'], ['Background', 'bg'], ['Alignment', 'align']];
const NUM_FIELDS: [string, 'level' | 'ac' | 'speedBase' | 'initMisc', number, number][] = [
  ['Level', 'level', 1, 20], ['Armor Class', 'ac', 0, 40], ['Base speed (ft)', 'speedBase', 0, 200], ['Initiative bonus (extra)', 'initMisc', -20, 20]
];

export function EditDetails({ onReset }: { onReset: () => void }) {
  const { c, update } = useSheet();
  const [resetArmed, tapReset] = useArmed();
  return (
    <section aria-label="Edit character" className="card gap-12" style={{ borderColor: 'var(--accent)' }}>
      <div className="row wrap between gap-8">
        <span className="caps" style={{ color: 'var(--accent)' }}>EDITING CHARACTER · changes save automatically</span>
        <button type="button" className={'btn btn-danger' + (resetArmed ? ' armed' : '')} style={{ fontSize: 14, padding: '0 14px' }} onClick={() => tapReset(onReset)}>
          {resetArmed ? 'Tap again to clear everything' : 'Clear this character'}
        </button>
      </div>
      <div className="grid">
        {TEXT_FIELDS.map(([label, key]) => (
          <TextField key={key} label={label} value={c.ch[key]} onChange={(v) => update((p) => ({ ch: { ...p.ch, [key]: v } }))} />
        ))}
        {NUM_FIELDS.map(([label, key, min, max]) => (
          <label key={key} className="field">{label}
            <NumInput className="input" value={c[key]} min={min} max={max}
              onCommit={(v) => update((p) => (key === 'level' ? { level: v, hdUsed: Math.min(p.hdUsed, v) } : { [key]: v }))} />
          </label>
        ))}
        <label className="field">Hit die
          <select className="input" value={String(c.hdDie)} onChange={(e) => update({ hdDie: parseInt(e.target.value, 10) })}>
            <option value="6">d6</option><option value="8">d8</option><option value="10">d10</option><option value="12">d12</option>
          </select>
        </label>
        <label className="field">Spellcasting ability
          <select className="input" value={c.castAb} onChange={(e) => update({ castAb: e.target.value as CastAbility })}>
            <option value="none">None</option><option value="int">Intelligence</option><option value="wis">Wisdom</option><option value="cha">Charisma</option>
          </select>
        </label>
      </div>
      <div className="muted">Max HP, ability scores, proficiencies and speeds are edited in their own blocks below; spell slots in the Spells tab. Pencil buttons edit existing entries.</div>
    </section>
  );
}
