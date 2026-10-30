import { SRC_KINDS, passiveScore } from '../logic';
import { removeEntry, saveEntry, useEntryForm, useSheet } from '../sheet';
import type { Sense, SrcKind } from '../types';
import { AddButton, EntryForm, EntryRow } from './ui';

const BLANK = { name: '', range: '', desc: '', srcKind: '' as SrcKind | '', srcName: '' };

export function Senses() {
  const { c, update } = useSheet();
  const f = useEntryForm('sense', BLANK, 'sense', 'Add a sense');
  const passive = (label: string, value: number) => (
    <div className="well tight"><span>{label}</span><strong style={{ fontSize: 17 }}>{value}</strong></div>
  );
  const save = () => {
    const name = f.draft.name.trim();
    if (!name) return;
    const r = f.draft.range.trim();
    // Empty optional fields are cleared (undefined), so editing can remove them.
    const built = {
      name, range: r ? (/^\d+$/.test(r) ? r + ' ft' : r) : '—', desc: f.draft.desc.trim() || undefined,
      srcKind: f.draft.srcKind || undefined, srcName: f.draft.srcName.trim() || undefined
    };
    update((p) => ({ senses: saveEntry<Sense>(p.senses, built, f.editingId) }));
    f.close();
  };
  const source = (se: Sense) => [SRC_KINDS.find(([k]) => k === se.srcKind)?.[1], se.srcName].filter(Boolean).join(' · ');
  const form = f.isOpen && (
    <EntryForm kind="sense" inline title={f.title} saveLabel={f.saveLabel} onSave={save} onCancel={f.close}>
      <div className="row wrap gap-6">
        <input type="text" className="input" style={{ flex: '2 1 160px', width: 160, padding: '0 10px' }} aria-label="Sense name" placeholder="Name"
          value={f.draft.name} onChange={(e) => f.set({ name: e.target.value })} />
        <input type="text" className="input" style={{ flex: '1 1 100px', width: 100, padding: '0 10px' }} aria-label="Sense value" placeholder="Value"
          value={f.draft.range} onChange={(e) => f.set({ range: e.target.value })} />
        <input type="text" className="input" style={{ flex: '1 1 100%', padding: '0 10px' }} aria-label="Sense description" placeholder="Description"
          value={f.draft.desc} onChange={(e) => f.set({ desc: e.target.value })} />
        <select className="input" style={{ flex: '1 1 120px', width: 120 }} aria-label="Source kind" value={f.draft.srcKind}
          onChange={(e) => f.set({ srcKind: e.target.value as SrcKind | '' })}>
          <option value="">—</option>
          {SRC_KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <input type="text" className="input" style={{ flex: '2 1 160px', width: 160, padding: '0 10px' }} aria-label="Source name" placeholder="Source, e.g. Wood Elf"
          value={f.draft.srcName} onChange={(e) => f.set({ srcName: e.target.value })} />
      </div>
    </EntryForm>
  );

  return (
    <section id="sec-senses" aria-label="Senses" className="block section">
      <h2 className="block-title area-title">Senses</h2>
      {/* Hidden only by the add form: while an entry below is edited it stays, so the list doesn't shift up. */}
      {(!f.isOpen || f.editingId) && <AddButton always onClick={f.openAdd}>+ Add sense</AddButton>}
      {f.isOpen && !f.editingId && form}
      <div className="row wrap gap-8">
        {passive('Passive Perception', passiveScore(c, 'perception'))}
        {passive('Passive Investigation', passiveScore(c, 'investigation'))}
        {passive('Passive Insight', passiveScore(c, 'insight'))}
        {c.senses.map((se) => (f.editingId === se.id ? <div key={se.id} className="sense-form">{form}</div> : (
          <EntryRow key={se.id} name={se.name} className="sense-entry"
            head={<span className="row gap-8"><span>{se.name}</span><strong style={{ fontSize: 17 }}>{se.range}</strong></span>}
            body={(se.desc || source(se)) && <>
              {se.desc && <span>{se.desc}</span>}
              {source(se) && <span className="muted">Source: {source(se)}</span>}
            </>}
            onEdit={() => f.openEdit(se.id, {
              name: se.name, range: se.range === '—' ? '' : se.range, desc: se.desc || '', srcKind: se.srcKind || '', srcName: se.srcName || ''
            })}
            onRemove={() => update((p) => ({ senses: removeEntry(p.senses, se.id) }))} />
        )))}
      </div>
    </section>
  );
}
