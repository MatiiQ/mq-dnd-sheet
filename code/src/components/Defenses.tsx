import { useState, type CSSProperties } from 'react';
import { ABILITIES, CONDITION_OPTIONS, DAMAGE_TYPES } from '../logic';
import { useSheet } from '../sheet';
import type { DefenseKind } from '../types';
import { RemoveButton, XIcon, useArmed } from './ui';

// Choices for Advantage on saves; free text can be added too.
const ADV_OPTIONS: [string, string[]][] = [
  ['Conditions', CONDITION_OPTIONS.map((n) => 'vs ' + n)],
  ['Abilities', ABILITIES.map(([, n]) => n + ' saves')],
  ['Other', ['vs spells']]
];

export function Defenses() {
  return (
    <section id="sec-defenses" aria-label="Defenses" className="block section">
      <div className="row wrap between" style={{ alignItems: 'baseline', gap: '6px 12px' }}>
        <h2 className="block-title area-title">Defenses</h2>
        <span className="muted">Resistance halves damage · Vulnerability doubles it · Immunity ignores damage or the condition</span>
      </div>
      <div className="grid" style={{ '--min': '240px', gap: 12 } as CSSProperties}>
        <DefenseGroup kind="res" title="Resistances" noun="resistance" color="var(--blue)" addLabel="Add a resistance"
          options={[['', DAMAGE_TYPES]]} placeholder="+ Add damage type" />
        <DefenseGroup kind="vul" title="Vulnerabilities" noun="vulnerability" color="var(--danger)" addLabel="Add a vulnerability"
          options={[['', DAMAGE_TYPES]]} placeholder="+ Add damage type" />
        <DefenseGroup kind="imm" title="Immunities" noun="immunity" color="var(--accent)" addLabel="Add an immunity"
          options={[['Damage types', DAMAGE_TYPES], ['Conditions', CONDITION_OPTIONS]]} placeholder="+ Add damage type or condition" />
        <DefenseGroup kind="adv" title="Advantage on saves" noun="save advantage" color="var(--hp-high)" addLabel="Add an advantage on saves"
          options={ADV_OPTIONS} placeholder="+ Add advantage on saves" freeText />
      </div>
    </section>
  );
}

// options: [optgroup label, values]; an empty label lists the values without a group.
function DefenseGroup({ kind, title, noun, color, addLabel, options, placeholder, freeText }: {
  kind: DefenseKind; title: string; noun: string; color: string; addLabel: string;
  options: [string, string[]][]; placeholder: string; freeText?: boolean;
}) {
  const { c, update, edit } = useSheet();
  const [text, setText] = useState('');
  const list = c.def[kind];
  const add = (v: string) => update((p) => ({ def: { ...p.def, [kind]: p.def[kind].includes(v) ? p.def[kind] : [...p.def[kind], v] } }));
  const remove = (n: string) => update((p) => ({ def: { ...p.def, [kind]: p.def[kind].filter((x) => x !== n) } }));
  const addText = () => { const v = text.trim(); if (v) add(v); setText(''); };
  const opts = (vals: string[]) => vals.map((d) => <option key={d} value={d}>{d}</option>);
  return (
    <div className="col gap-6">
      <span style={{ fontWeight: 700, fontSize: 14, color }}>{title}</span>
      <div className="row wrap gap-6" style={{ minHeight: 44 }}>
        {list.map((n) => edit
          ? <DefenseChip key={n} name={n} noun={noun} color={color} onRemove={() => remove(n)} />
          : <OpenChip key={n} name={n} noun={noun} color={color} onRemove={() => remove(n)} />)}
        {list.length === 0 && <span className="muted">None</span>}
      </div>
      <select className="input" aria-label={addLabel} value="" onChange={(e) => { if (e.target.value) add(e.target.value); }}>
        <option value="">{placeholder}</option>
        {options.map(([label, vals]) => (label ? <optgroup key={label} label={label}>{opts(vals)}</optgroup> : opts(vals)))}
      </select>
      {freeText && (
        <div className="row gap-6">
          <input type="text" className="input" aria-label="Advantage on saves, free text" placeholder="Other, e.g. vs traps"
            value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addText(); }} />
          <button type="button" className="btn" onClick={addText}>Add</button>
        </div>
      )}
    </div>
  );
}

const chipStyle = (color: string): CSSProperties => ({
  fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44, padding: '0 12px', borderRadius: 22,
  border: '1px solid ' + color, background: 'transparent', color
});

// Outside Edit mode: tapping the chip shows its Remove button.
function OpenChip({ name, noun, color, onRemove }: { name: string; noun: string; color: string; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="row gap-4">
      <button type="button" aria-expanded={open} aria-label={name + ' ' + noun} onClick={() => setOpen(!open)} style={chipStyle(color)}>{name}</button>
      {open && <RemoveButton name={name + ' ' + noun} onRemove={onRemove} />}
    </span>
  );
}

function DefenseChip({ name, noun, color, onRemove }: { name: string; noun: string; color: string; onRemove: () => void }) {
  const [armed, tap] = useArmed();
  return (
    <button type="button" onClick={() => tap(onRemove)} aria-label={armed ? 'Tap again to remove ' + name + ' ' + noun : 'Remove ' + name + ' ' + noun}
      className="row gap-6" style={{
        fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44, padding: '0 10px 0 12px', borderRadius: 22,
        border: '1px solid ' + color, background: armed ? color : 'transparent', color: armed ? 'var(--on-accent)' : color
      }}>
      {armed ? 'Remove ' + name + '?' : name}<XIcon size={14} strokeWidth={2.5} />
    </button>
  );
}
