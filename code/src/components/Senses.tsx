import { passiveScore } from '../logic';
import { removeEntry, saveEntry, useEntryForm, useSheet } from '../sheet';
import type { Sense } from '../types';
import { AddButton, EntryActions, EntryForm } from './ui';

const BLANK = { name: '', range: '' };

export function Senses() {
  const { c, update, edit } = useSheet();
  const f = useEntryForm('sense', BLANK, 'sense', 'Add a sense');
  const passive = (label: string, value: number) => (
    <div className="well tight"><span>{label}</span><strong style={{ fontSize: 17 }}>{value}</strong></div>
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
    <section id="sec-senses" aria-label="Senses" className="block section">
      <h2 className="block-title area-title">Senses</h2>
      <div className="row wrap gap-8">
        {passive('Passive Perception', passiveScore(c, 'perception'))}
        {passive('Passive Investigation', passiveScore(c, 'investigation'))}
        {passive('Passive Insight', passiveScore(c, 'insight'))}
        {c.senses.map((se) => (
          <div key={se.id} className="well tight">
            <span>{se.name}</span>
            <strong style={{ fontSize: 17 }}>{se.range}</strong>
            <EntryActions name={se.name} canEdit={edit}
              onEdit={() => f.openEdit(se.id, { name: se.name, range: se.range === '—' ? '' : se.range })}
              onRemove={() => update((p) => ({ senses: removeEntry(p.senses, se.id) }))} />
          </div>
        ))}
      </div>
      {!f.isOpen && <AddButton onClick={f.openAdd}>+ Add sense</AddButton>}
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
