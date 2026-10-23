import type { CSSProperties } from 'react';
import { CONDITIONS } from '../logic';
import { useSheet } from '../sheet';
import type { DefenseKind } from '../types';
import { XIcon, useArmed } from './ui';

const DAMAGE_TYPES = ['Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Lightning', 'Necrotic', 'Piercing', 'Poison', 'Psychic', 'Radiant', 'Slashing', 'Thunder'];
const CONDITION_OPTIONS = [...CONDITIONS.slice(0, 3), 'Exhaustion', ...CONDITIONS.slice(3)];

export function Defenses() {
  const { c, update } = useSheet();
  return (
    <section id="sec-defenses" aria-label="Defenses" className="card section gap-10">
      <div className="row wrap between" style={{ alignItems: 'baseline', gap: '6px 12px' }}>
        <span className="caps">DEFENSES</span>
        <span className="muted">Resistance halves damage · Vulnerability doubles it · Immunity ignores damage or the condition</span>
      </div>
      <div className="grid" style={{ '--min': '240px', gap: 12 } as CSSProperties}>
        <DefenseGroup kind="res" title="Resistances" noun="resistance" color="var(--blue)" withConditions addLabel="Add a resistance" />
        <DefenseGroup kind="vul" title="Vulnerabilities" noun="vulnerability" color="var(--orange)" addLabel="Add a vulnerability" />
        <DefenseGroup kind="imm" title="Immunities" noun="immunity" color="var(--accent)" withConditions addLabel="Add an immunity" />
      </div>
      <label className="field" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>Save notes
        <input type="text" className="input" value={c.saveNotes} placeholder="e.g. Advantage on saves against being Charmed"
          onChange={(e) => update({ saveNotes: e.target.value })} />
      </label>
    </section>
  );
}

function DefenseGroup({ kind, title, noun, color, withConditions, addLabel }: {
  kind: DefenseKind; title: string; noun: string; color: string; withConditions?: boolean; addLabel: string;
}) {
  const { c, update } = useSheet();
  const list = c.def[kind];
  const damageOptions = DAMAGE_TYPES.map((d) => <option key={d} value={d}>{d}</option>);
  return (
    <div className="col gap-6">
      <span style={{ fontWeight: 700, fontSize: 14, color }}>{title}</span>
      <div className="row wrap gap-6" style={{ minHeight: 44 }}>
        {list.map((n) => (
          <DefenseChip key={n} name={n} noun={noun} color={color}
            onRemove={() => update((p) => ({ def: { ...p.def, [kind]: p.def[kind].filter((x) => x !== n) } }))} />
        ))}
        {list.length === 0 && <span className="muted">None</span>}
      </div>
      <select className="input" aria-label={addLabel} value=""
        onChange={(e) => {
          const v = e.target.value;
          if (v) update((p) => ({ def: { ...p.def, [kind]: p.def[kind].includes(v) ? p.def[kind] : [...p.def[kind], v] } }));
        }}>
        <option value="">{withConditions ? '+ Add damage type or condition' : '+ Add damage type'}</option>
        {withConditions ? (
          <>
            <optgroup label="Damage types">{damageOptions}</optgroup>
            <optgroup label="Conditions">{CONDITION_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}</optgroup>
          </>
        ) : damageOptions}
      </select>
    </div>
  );
}

function DefenseChip({ name, noun, color, onRemove }: { name: string; noun: string; color: string; onRemove: () => void }) {
  const [armed, tap] = useArmed();
  return (
    <button type="button" onClick={() => tap(onRemove)} aria-label={armed ? 'Tap again to remove ' + name + ' ' + noun : 'Remove ' + name + ' ' + noun}
      className="row gap-6" style={{
        fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44, padding: '0 10px 0 12px', borderRadius: 22,
        border: '1px solid ' + color, background: armed ? color : 'transparent', color: armed ? 'var(--bg)' : color
      }}>
      {armed ? 'Remove ' + name + '?' : name}<XIcon size={14} strokeWidth={2.5} />
    </button>
  );
}
