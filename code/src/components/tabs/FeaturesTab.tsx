import type { CSSProperties } from 'react';
import { removeEntry, saveEntry, useEntryForm, useSheet } from '../../sheet';
import type { Feature, FeatureGroup } from '../../types';
import { AddButton, EntryActions, EntryForm, TextField } from '../ui';

const BLANK = { g: 'class' as FeatureGroup, name: '', desc: '' };

export function FeaturesTab() {
  const { c, update, edit } = useSheet();
  const f = useEntryForm('feat', BLANK, 'feature', 'ADD A FEATURE OR TRAIT');
  const titles: [FeatureGroup, string][] = [
    ['class', 'CLASS · ' + (c.ch.cls || 'Class').toUpperCase() + ' ' + c.level], ['sub', 'SUBCLASS · ' + (c.ch.sub || '').toUpperCase()], ['feat', 'FEATS'],
    ['species', 'SPECIES · ' + (c.ch.species || '').toUpperCase()], ['training', 'TRAINING & PROFICIENCIES'], ['other', 'OTHER']
  ];
  const save = () => {
    const name = f.draft.name.trim();
    if (!name) return;
    update((p) => ({ feats: saveEntry<Feature>(p.feats, { g: f.draft.g, name, desc: f.draft.desc.trim() }, f.editingId) }));
    f.close();
  };

  return (
    <div className="col gap-12">
      <div className="grid" style={{ '--min': '260px', gap: 12 } as CSSProperties}>
        {titles.map(([g, title]) => {
          const items = c.feats.filter((x) => x.g === g);
          if (!items.length) return null;
          return (
            <div key={g} className="card gap-6">
              <span className="group-title" style={{ fontSize: 13 }}>{title}</span>
              {items.map((x) => (
                <div key={x.id} className="row" style={{ alignItems: 'flex-start', gap: 2 }}>
                  <div className="grow" style={{ paddingTop: 10 }}>
                    <strong>{x.name}</strong>
                    {x.desc && <div className="muted">{x.desc}</div>}
                  </div>
                  <EntryActions name={x.name} canEdit={edit} onEdit={() => f.openEdit(x.id, { g: x.g || 'other', name: x.name, desc: x.desc || '' })}
                    onRemove={() => update((p) => ({ feats: removeEntry(p.feats, x.id) }))} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {!f.isOpen && <AddButton onClick={f.openAdd}>+ Add feature or trait</AddButton>}
      {f.isOpen && (
        <EntryForm kind="feat" title={f.title} saveLabel={f.saveLabel} onSave={save} onCancel={f.close}>
          <div className="grid" style={{ '--min': '180px' } as CSSProperties}>
            <label className="field">Section
              <select className="input" value={f.draft.g} onChange={(e) => f.set({ g: e.target.value as FeatureGroup })}>
                <option value="class">Class</option><option value="sub">Subclass</option><option value="feat">Feats</option>
                <option value="species">Species</option><option value="training">Training &amp; Proficiencies</option><option value="other">Other</option>
              </select>
            </label>
            <TextField label="Name" value={f.draft.name} placeholder="e.g. Roving" onChange={(v) => f.set({ name: v })} />
            <TextField label="Description" style={{ gridColumn: '1 / -1' }} value={f.draft.desc} placeholder="Short summary of what it does" onChange={(v) => f.set({ desc: v })} />
          </div>
        </EntryForm>
      )}
    </div>
  );
}
