import { useState, type CSSProperties } from 'react';
import { PROF_NAMES, type ProfCat } from '../../catalog/names';
import { newId, normName, profList, removeFeature } from '../../logic';
import { removeEntry, saveEntry, useEntryForm, useSheet } from '../../sheet';
import type { Feature, FeatureGroup } from '../../types';
import { AddButton, EntryForm, EntryRow, RemoveButton, TextField } from '../ui';

const PROF_CATS: [ProfCat, string][] = [['armor', 'Armor'], ['weapon', 'Weapons'], ['tool', 'Tools'], ['language', 'Languages']];

const BLANK = { g: 'class' as FeatureGroup, name: '', desc: '' };

export function FeaturesTab() {
  const { c, update } = useSheet();
  const f = useEntryForm('feat', BLANK, 'feature', 'Add a feature or trait');
  const titles: [FeatureGroup, string][] = [
    ['class', 'Class · ' + (c.ch.cls || 'Class') + ' ' + c.level], ['sub', 'Subclass · ' + (c.ch.sub || '')], ['background', 'Background'], ['feat', 'Feats'],
    ['species', 'Species · ' + (c.ch.species || '')], ['training', 'Training & proficiencies'], ['other', 'Other']
  ];
  const save = () => {
    const name = f.draft.name.trim();
    if (!name) return;
    update((p) => ({ feats: saveEntry<Feature>(p.feats, { g: f.draft.g, name, desc: f.draft.desc.trim() }, f.editingId) }));
    f.close();
  };
  const form = f.isOpen && (
    <EntryForm kind="feat" title={f.title} saveLabel={f.saveLabel} onSave={save} onCancel={f.close}>
      <div className="grid" style={{ '--min': '180px' } as CSSProperties}>
        <label className="field">Section
          <select className="input" value={f.draft.g} onChange={(e) => f.set({ g: e.target.value as FeatureGroup })}>
            <option value="class">Class</option><option value="sub">Subclass</option><option value="background">Background</option><option value="feat">Feats</option>
            <option value="species">Species</option><option value="training">Training &amp; Proficiencies</option><option value="other">Other</option>
          </select>
        </label>
        <TextField label="Name" value={f.draft.name} placeholder="e.g. Roving" onChange={(v) => f.set({ name: v })} />
        <TextField label="Description" style={{ gridColumn: '1 / -1' }} value={f.draft.desc} placeholder="Short summary of what it does" onChange={(v) => f.set({ desc: v })} />
      </div>
    </EntryForm>
  );

  return (
    <div className="col gap-12">
      <div className="grid" style={{ '--min': '260px', gap: 12 } as CSSProperties}>
        {titles.map(([g, title]) => {
          const items = c.feats.filter((x) => x.g === g);
          // The background lives in Edit details; the Class card shows it as its first line.
          const bg = g === 'class' ? c.ch.bg.trim() : '';
          // The Training card always shows: it holds the proficiencies and the row that adds one.
          if (!items.length && !bg && g !== 'training') return null;
          return (
            <div key={g} className="block">
              <h3 className="block-title">{title}</h3>
              {g === 'training' && <Proficiencies />}
              {bg && <div className="well" style={{ padding: '10px 12px' }}><strong>Background</strong> · {bg}</div>}
              {items.map((x) => (f.editingId === x.id ? <div key={x.id}>{form}</div> : (
                <EntryRow key={x.id} name={x.name}
                  head={<><strong>{x.name}</strong>{x.desc && <span className="muted">{x.desc}</span>}</>}
                  onEdit={() => f.openEdit(x.id, { g: x.g || 'other', name: x.name, desc: x.desc || '' })}
                  onRemove={() => update((p) => removeFeature(p, x.id))} />
              )))}
            </div>
          );
        })}
      </div>
      {!f.isOpen && <AddButton onClick={f.openAdd}>+ Add feature or trait</AddButton>}
      {f.isOpen && !f.editingId && form}
    </div>
  );
}

// Proficiencies by category: hand ones can be removed, granted ones name their source. Names from the catalog are
// offered while typing; any other text is kept as typed.
function Proficiencies() {
  const { c, update } = useSheet();
  const [cat, setCat] = useState<ProfCat>('tool');
  const [name, setName] = useState('');
  const list = profList(c);
  const add = () => {
    const n = name.trim();
    if (!n) return;
    if (!list.some((p) => p.cat === cat && normName(p.name) === normName(n))) update((p) => ({ profs: [...p.profs, { id: newId(), cat, name: n }] }));
    setName('');
  };
  return (
    <div className="col gap-8">
      {PROF_CATS.map(([k, label]) => {
        const mine = list.filter((p) => p.cat === k);
        return mine.length > 0 && (
          <div key={k} className="col gap-4">
            <span className="muted">{label}</span>
            <div className="row wrap gap-6">
              {mine.map((p) => (
                <span key={p.name} className="prof-chip">
                  {p.name}{p.by && <span className="small">· {p.by}</span>}
                  {p.id ? <RemoveButton name={p.name + ' proficiency'} onRemove={() => update((x) => ({ profs: removeEntry(x.profs, p.id!) }))} /> : null}
                </span>
              ))}
            </div>
          </div>
        );
      })}
      <div className="row wrap gap-6">
        <select className="input" style={{ flex: '1 1 120px' }} aria-label="Proficiency category" value={cat} onChange={(e) => setCat(e.target.value as ProfCat)}>
          {PROF_CATS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <input type="text" className="input" style={{ flex: '2 1 160px' }} list={'prof-names-' + cat} aria-label="Proficiency name" placeholder="e.g. Thieves’ Tools"
          value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <datalist id={'prof-names-' + cat}>{PROF_NAMES.filter((p) => p.cat === cat).map((p) => <option key={p.id} value={p.name} />)}</datalist>
        <button type="button" className="btn" onClick={add}>Add</button>
      </div>
    </div>
  );
}
