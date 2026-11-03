import { useState, type CSSProperties } from 'react';
import { DAMAGE_TYPES } from '../catalog/schema';
import { ABILITIES, CONDITION_OPTIONS, mergedDefenses, newId, normName, removeRef } from '../logic';
import { patchEntry, useSheet } from '../sheet';
import { SourcePicker } from './SourcePicker';
import type { Character, Defense, DefenseKind } from '../types';
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
  const list = mergedDefenses(c, kind);
  // A hand entry, unless this kind already has one with that name.
  const add = (v: string) => update((p) => (p.defenses.some((d) => d.kind === kind && normName(d.name) === normName(v)) ? {}
    : { defenses: [...p.defenses, { id: newId(), kind, name: v }] }));
  // Removing a row removes its hand entries; a row that only grants hold removes those (its sources are listed first).
  const remove = (ids: string[]) => update((p) => {
    const own = p.defenses.filter((d) => ids.includes(d.id) && !d.from).map((d) => d.id);
    return (own.length ? own : ids).reduce<Character>((x, id) => removeRef(x, { kind: 'defense', id }), p);
  });
  const addText = () => { const v = text.trim(); if (v) add(v); setText(''); };
  const opts = (vals: string[]) => vals.map((d) => <option key={d} value={d}>{d}</option>);
  return (
    <div className="col gap-6">
      <span style={{ fontWeight: 700, fontSize: 14, color }}>{title}</span>
      <div className="row wrap gap-6" style={{ minHeight: 44 }}>
        {list.map((r) => edit
          ? <DefenseChip key={r.key} name={r.name} noun={noun} color={color} onRemove={() => remove(r.ids)} />
          : <OpenChip key={r.key} name={r.name} noun={noun} color={color} sources={r.sources} onRemove={() => remove(r.ids)}
            entry={c.defenses.find((x) => r.ids.includes(x.id) && !x.from) ?? c.defenses.find((x) => x.id === r.ids[0])} />)}
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

// Outside Edit mode: tapping the chip shows its sources, a source picker for its own entry and its Remove button.
function OpenChip({ name, noun, color, sources, onRemove, entry }: { name: string; noun: string; color: string; sources: string[]; onRemove: () => void; entry?: Defense }) {
  const [open, setOpen] = useState(false);
  const { update } = useSheet();
  return (
    <span className="row wrap gap-4">
      <button type="button" aria-expanded={open} aria-label={name + ' ' + noun} onClick={() => setOpen(!open)} style={chipStyle(color)}>{name}</button>
      {open && sources.length > 0 && <span className="small">From {sources.join(', ')}</span>}
      {open && <RemoveButton name={name + ' ' + noun} onRemove={onRemove} />}
      {open && entry && (
        <span className="col gap-4" style={{ flex: '1 1 100%' }}>
          <SourcePicker value={entry} onChange={(v) => update((p) => ({ defenses: patchEntry(p.defenses, entry.id, v) }))} />
        </span>
      )}
    </span>
  );
}

function DefenseChip({ name, noun, color, onRemove }: { name: string; noun: string; color: string; onRemove: () => void }) {
  const [armed, tap] = useArmed();
  return (
    <button type="button" onClick={() => tap(onRemove)} aria-label={armed ? 'Tap again to remove ' + name + ' ' + noun : 'Remove ' + name + ' ' + noun}
      className="row gap-6" style={{ ...chipStyle(color), padding: '0 10px 0 12px', background: armed ? color : 'transparent', color: armed ? 'var(--on-accent)' : color }}>
      {armed ? 'Remove ' + name + '?' : name}<XIcon size={14} strokeWidth={2.5} />
    </button>
  );
}
