import { hasSenseRule, senseRule } from '../catalog/copy';
import { RuleNotes } from './RuleNotes';
import { SourcePicker } from './SourcePicker';
import { mergedSenses, passiveScore, removeRef } from '../logic';
import { saveEntry, useEntryForm, useSheet } from '../sheet';
import type { Sense, SrcKind } from '../types';
import { AddButton, EntryForm, EntryRow } from './ui';

const BLANK = { name: '', range: '', desc: '', from: undefined as string | undefined, srcKind: undefined as SrcKind | undefined, srcName: undefined as string | undefined };

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
      from: f.draft.from, srcKind: f.draft.srcKind, srcName: f.draft.srcName?.trim() || undefined
    };
    update((p) => ({ senses: saveEntry<Sense>(p.senses, built, f.editingId) }));
    f.close();
  };
  // One row per sense name (mergedSenses). Edit and Remove act on the row's hand entry; a row only grants hold acts on
  // those entries (the grants come back when their source is edited).
  const rows = mergedSenses(c).map((r) => {
    const all = c.senses.filter((se) => r.ids.includes(se.id));
    return { ...r, own: all.find((se) => !se.from) ?? all[0], hand: all.filter((se) => !se.from), all };
  });
  const form = f.isOpen && (
    <EntryForm kind="sense" inline title={f.title} saveLabel={f.saveLabel} onSave={save} onCancel={f.close}>
      <div className="row wrap gap-6">
        <input type="text" className="input" style={{ flex: '2 1 160px', width: 160, padding: '0 10px' }} aria-label="Sense name" placeholder="Name"
          value={f.draft.name} onChange={(e) => f.set({ name: e.target.value })} />
        <input type="text" className="input" style={{ flex: '1 1 100px', width: 100, padding: '0 10px' }} aria-label="Sense value" placeholder="Value"
          value={f.draft.range} onChange={(e) => f.set({ range: e.target.value })} />
        <input type="text" className="input" style={{ flex: '1 1 100%', padding: '0 10px' }} aria-label="Sense description" placeholder="Description"
          value={f.draft.desc} onChange={(e) => f.set({ desc: e.target.value })} />
        <SourcePicker value={f.draft} onChange={(v) => f.set(v)} />
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
        {rows.map(({ key, name, range, sources, own: se, hand, all }) => (f.editingId === se.id ? <div key={key} className="sense-form">{form}</div> : (
          <EntryRow key={key} name={name} className="sense-entry"
            head={<span className="row gap-8"><span>{name}</span><strong style={{ fontSize: 17 }}>{range}</strong></span>}
            body={(se.desc || sources.length > 0 || hasSenseRule(name)) && <>
              {se.desc && <span>{se.desc}</span>}
              {hasSenseRule(name) && <RuleNotes pick={(cat) => { const r = senseRule(cat, name); return r ? [r] : []; }} />}
              {sources.length > 0 && <span className="muted">Source: {sources.join(', ')}</span>}
            </>}
            onEdit={() => f.openEdit(se.id, {
              name: se.name, range: se.range === '—' ? '' : se.range, desc: se.desc || '', from: se.from, srcKind: se.srcKind, srcName: se.srcName
            })}
            onRemove={() => update((p) => (hand.length ? hand : all).reduce((x, y) => removeRef(x, { kind: 'sense', id: y.id }), p))} />
        )))}
      </div>
    </section>
  );
}
