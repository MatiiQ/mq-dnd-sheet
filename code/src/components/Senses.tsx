import type { CSSProperties } from 'react';
import { skillMod } from '../logic';
import { saveEntry, useEntryForm, useSheet } from '../sheet';
import type { Sense } from '../types';
import { AddButton, EntryActions, EntryForm, EyeIcon } from './ui';

const BLANK = { name: '', range: '' };

export function Senses() {
  const { c, update, edit } = useSheet();
  const f = useEntryForm('sense', BLANK, 'sense', 'sense', 'ADD A SENSE');
  const passive = (label: string, value: number) => (
    <div className="row between gap-8" style={{ minHeight: 44 }}><span>{label}</span><strong style={{ fontSize: 17 }}>{value}</strong></div>
  );
  const save = () => {
    const name = f.draft.name.trim();
    if (!name) return;
    const r = f.draft.range.trim();
    const built = { name, range: r ? (/^\d+$/.test(r) ? r + ' ft' : r) : '—' };
    update((p) => ({ senses: saveEntry<Sense>(p.senses, built, f.editingId) }));
    f.close();
  };

  return (
    <section id="sec-senses" aria-label="Senses" className="card section gap-4">
      <div className="row gap-8" style={{ marginBottom: 2, color: 'var(--muted)' }}>
        <EyeIcon size={18} /><span className="caps">SENSES</span>
      </div>
      <div className="grid" style={{ '--min': '220px', gap: '0 24px' } as CSSProperties}>
        {passive('Passive Perception', 10 + skillMod(c, 'perception', 'wis'))}
        {passive('Passive Investigation', 10 + skillMod(c, 'investigation', 'int'))}
        {passive('Passive Insight', 10 + skillMod(c, 'insight', 'wis'))}
        {c.senses.map((se) => (
          <div key={se.id} className="row gap-4" style={{ minHeight: 44 }}>
            <span className="grow">{se.name}</span>
            <strong style={{ fontSize: 17, marginRight: 4 }}>{se.range}</strong>
            <EntryActions name={se.name} canEdit={edit}
              onEdit={() => f.openEdit(se.id, { name: se.name, range: se.range === '—' ? '' : se.range })}
              onRemove={() => update((p) => ({ senses: p.senses.filter((x) => x.id !== se.id) }))} />
          </div>
        ))}
      </div>
      {!f.isOpen && <AddButton style={{ marginTop: 4 }} onClick={f.openAdd}>+ Add sense</AddButton>}
      {f.isOpen && (
        <EntryForm kind="sense" inline title={f.title} saveLabel={f.saveLabel} onSave={save} onCancel={f.close}>
          <div className="row wrap gap-6">
            <input type="text" className="input" style={{ flex: '2 1 160px', width: 160, padding: '0 10px' }} aria-label="Sense name" placeholder="Name"
              value={f.draft.name} onChange={(e) => f.set({ name: e.target.value })} />
            <input type="text" className="input" style={{ flex: '1 1 100px', width: 100, padding: '0 10px' }} aria-label="Sense value" placeholder="Value"
              value={f.draft.range} onChange={(e) => f.set({ range: e.target.value })} />
          </div>
        </EntryForm>
      )}
    </section>
  );
}
