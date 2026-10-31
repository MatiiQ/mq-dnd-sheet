import { useState, type CSSProperties, type ReactNode } from 'react';
import { PROF_NAMES, type ProfCat } from '../../catalog/names';
import { entriesOf, useCatalog } from '../../catalog/useCatalog';
import { hasActiveEffect, linkOf, sourceLabel } from '../../links';
import { addGrants, grantChips, newId, normName, profList, removalSummary, removeFeature, toggleEffect, type GrantInput } from '../../logic';
import { removeEntry, saveEntry, useEntryForm, useSheet } from '../../sheet';
import type { Character, Feature, FeatureGroup, SrcKind } from '../../types';
import { GrantList, SourceChips } from '../Chips';
import { FeaturePicker } from '../pickers/FeaturePicker';
import { SourcePicker } from '../SourcePicker';
import { AddButton, EntryForm, EntryRow, RemoveButton, TextField } from '../ui';

const PROF_CATS: [ProfCat, string][] = [['armor', 'Armor'], ['weapon', 'Weapons'], ['tool', 'Tools'], ['language', 'Languages']];

const BLANK = { g: 'class' as FeatureGroup, name: '', desc: '', from: undefined as string | undefined, srcKind: undefined as SrcKind | undefined, srcName: undefined as string | undefined, pending: [] as GrantInput[] };

// What a removal confirm lists: everything else that goes, and what stays for the player to fix.
function removalNote(c: Character, id: string): ReactNode {
  const { goes, keep } = removalSummary(c, { kind: 'feature', id });
  if (!goes.length && !keep.length) return undefined;
  return <>{goes.length > 0 && <span>Also removes: {goes.join(', ')}</span>}{keep.map((k) => <span key={k}>{k}</span>)}</>;
}

export function FeaturesTab() {
  const { c, update, form: openForm, setForm } = useSheet();
  const f = useEntryForm('feat', BLANK, 'feature', 'Add a custom feature or trait');
  const picking = openForm?.kind === 'pick-feat';
  const titles: [FeatureGroup, string][] = [
    ['class', 'Class · ' + (c.ch.cls || 'Class') + ' ' + c.level], ['sub', 'Subclass · ' + (c.ch.sub || '')], ['background', 'Background'], ['feat', 'Feats'],
    ['species', 'Species · ' + (c.ch.species || '')], ['training', 'Training & proficiencies'], ['other', 'Other']
  ];
  const d = f.draft;
  const save = () => {
    const name = d.name.trim();
    if (!name) return;
    const id = f.editingId ?? newId();
    // All keys present: undefined clears a field when editing.
    const built = { g: d.g, name, desc: d.desc.trim(), from: d.from, srcKind: d.srcKind, srcName: d.srcName?.trim() || undefined };
    update((p) => {
      const next: Character = { ...p, feats: saveEntry<Feature>(p.feats, built, f.editingId, { id }) };
      return !f.editingId && d.pending.length ? addGrants(next, linkOf('feature', id), d.pending) : next;
    });
    f.close();
  };
  const form = f.isOpen && (
    <EntryForm kind="feat" title={f.title} saveLabel={f.saveLabel} onSave={save} onCancel={f.close}>
      <div className="grid" style={{ '--min': '180px' } as CSSProperties}>
        <label className="field">Section
          <select className="input" value={d.g} onChange={(e) => f.set({ g: e.target.value as FeatureGroup })}>
            <option value="class">Class</option><option value="sub">Subclass</option><option value="background">Background</option><option value="feat">Feats</option>
            <option value="species">Species</option><option value="training">Training &amp; Proficiencies</option><option value="other">Other</option>
          </select>
        </label>
        <TextField label="Name" value={d.name} placeholder="e.g. Roving" onChange={(v) => f.set({ name: v })} />
        <TextField label="Description" style={{ gridColumn: '1 / -1' }} value={d.desc} placeholder="Short summary of what it does" onChange={(v) => f.set({ desc: v })} />
        <SourcePicker self={f.editingId ? linkOf('feature', f.editingId) : undefined} value={d} onChange={(v) => f.set(v)} />
        <GrantList link={f.editingId ? linkOf('feature', f.editingId) : null} fromKind="feature" pending={d.pending} setPending={(pending) => f.set({ pending })} />
      </div>
    </EntryForm>
  );

  return (
    <div className="col gap-12">
      <div className="grid" style={{ '--min': '260px', gap: 12 } as CSSProperties}>
        {titles.map(([g, title]) => {
          const items = c.feats.filter((x) => x.g === g);
          // The Training card always shows: it holds the proficiencies and the row that adds one.
          if (!items.length && g !== 'training') return null;
          return (
            <div key={g} className="block">
              <h3 className="block-title">{title}</h3>
              {g === 'training' && <Proficiencies />}
              {items.map((x) => {
                if (f.editingId === x.id) return <div key={x.id}>{form}</div>;
                const link = linkOf('feature', x.id), src = sourceLabel(c, x);
                const effect = hasActiveEffect(c, link), on = c.effectsOn.includes(link);
                return (
                  <EntryRow key={x.id} id={'feat-' + x.id} name={x.name}
                    // A catalog description runs to paragraphs: the row shows its start, the open row all of it.
                    head={<><strong>{x.name}</strong>{x.desc && <span className="muted entry-clamp">{x.desc}</span>}</>}
                    side={effect ? (
                      <button type="button" aria-pressed={on} aria-label={(on ? 'Switch off ' : 'Switch on ') + x.name} className="btn btn-sm"
                        style={{ border: '1px solid var(--accent)', background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--on-accent)' : 'var(--accent)' }}
                        onClick={() => update((p) => toggleEffect(p, link))}>{on ? 'On' : 'Off'}</button>
                    ) : undefined}
                    body={x.desc || src ? <>
                      {x.desc && <span className="entry-desc">{x.desc}</span>}
                      {src && <span className="muted">Source: {src}</span>}
                    </> : undefined}
                    onEdit={() => f.openEdit(x.id, { g: x.g || 'other', name: x.name, desc: x.desc || '', from: x.from, srcKind: x.srcKind, srcName: x.srcName, pending: [] })}
                    onRemove={() => update((p) => removeFeature(p, x.id))}
                    removeConfirm={removalNote(c, x.id)}>
                    {grantChips(c, link).length > 0 && <SourceChips link={link} />}
                  </EntryRow>
                );
              })}
            </div>
          );
        })}
      </div>
      {!f.isOpen && !picking && (
        <div className="row wrap gap-8">
          <AddButton onClick={() => setForm({ kind: 'pick-feat', id: null })}>+ Add feature or trait</AddButton>
          <AddButton onClick={f.openAdd}>Custom</AddButton>
        </div>
      )}
      {picking && <FeaturePicker onClose={() => setForm(null)} onCustom={f.openAdd} />}
      {f.isOpen && !f.editingId && form}
    </div>
  );
}

// Proficiencies by category: hand ones can be removed, granted ones name their source. Names from the catalog (the
// PHB pack included, loaded the first time the name field is used; the SRD names until then) are offered while
// typing; any other text is kept as typed.
function Proficiencies() {
  const { c, update } = useSheet();
  const [cat, setCat] = useState<ProfCat>('tool');
  const [name, setName] = useState('');
  const [wanted, setWanted] = useState(false);
  const state = useCatalog(wanted);
  const names = state.status === 'ready' ? entriesOf(state.cat, 'prof').filter((p) => p.cat === cat).map((p) => p.name)
    : PROF_NAMES.filter((p) => p.cat === cat).map((p) => p.name);
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
          value={name} onFocus={() => setWanted(true)} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <datalist id={'prof-names-' + cat}>{[...new Set(names)].map((n) => <option key={n} value={n} />)}</datalist>
        <button type="button" className="btn" onClick={add}>Add</button>
      </div>
    </div>
  );
}
