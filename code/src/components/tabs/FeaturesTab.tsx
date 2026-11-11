import { useEffect, useState, type CSSProperties } from 'react';
import { PROF_NAMES, type ProfCat } from '../../catalog/names';
import { entriesOf } from '../../catalog/merge';
import { useCatalog } from '../../catalog/useCatalog';
import { masteryText } from '../../actions';
import { hasActiveEffect, isActive, laterLevel, linkOf, sourceLabel } from '../../links';
import { classLine, removeRef, addGrants, grantChips, newId, normName, profList, type GrantInput } from '../../logic';
import { removeEntry, saveEntry, useEntryForm, useSheet } from '../../sheet';
import type { Character, Feature, FeatureGroup, SrcKind } from '../../types';
import { GrantList, removalNote, SourceChips } from '../Chips';
import { SummonStep, summonStart } from '../Companions';
import { FeaturePicker } from '../pickers/FeaturePicker';
import { SourcePicker } from '../SourcePicker';
import { jumpTo } from '../nav';
import { AddButton, Caret, EffectSwitch, EntryForm, EntryRow, RemoveButton, TextField } from '../ui';

const PROF_CATS: [ProfCat, string][] = [['armor', 'Armor'], ['weapon', 'Weapons'], ['tool', 'Tools'], ['language', 'Languages']];

const BLANK = { g: 'class' as FeatureGroup, name: '', desc: '', makes: undefined as Feature['makes'], from: undefined as string | undefined, srcKind: undefined as SrcKind | undefined, srcName: undefined as string | undefined, pending: [] as GrantInput[] };

// The tab's groups in display order.
const GROUP_ORDER: FeatureGroup[] = ['class', 'sub', 'background', 'feat', 'species', 'training', 'other'];
// c.mastery is one list for the character, so it shows once (spec 2026-11-10 §2.7): on the first feature in tab order with
// an active target-less Weapon Mastery grant (a level-gated one gives no slots yet).
export function firstMasteryFeature(c: Character): string | undefined {
  const marks = (x: Feature) => c.grants.some((g) => g.from === 'feature:' + x.id && g.kind === 'prof' && g.cat === 'mastery' && !g.target && isActive(c, g));
  for (const g of GROUP_ORDER) { const x = c.feats.find((f) => f.g === g && marks(f)); if (x) return x.id; }
  return undefined;
}
// The chosen masteries, inside the open row: opening it loads the catalog for the weapons' masteries.
function MasteryLine() {
  const { c, update } = useSheet();
  const state = useCatalog(true);
  const text = masteryText(c, state.status === 'ready' ? state.cat : undefined);
  return text ? <span className="muted">Chosen: {text}</span> : (
    <span className="row wrap gap-8"><span className="muted">None chosen</span>
      <button type="button" className="btn btn-sm" onClick={() => jumpTo({ tab: 'actions' }, update)}>Choose in Actions</button></span>
  );
}

export function FeaturesTab() {
  const { c, update, form: openForm, setForm, focus } = useSheet();
  // Features that wait for a later level (Large Form at 1) sit in a folded group at the end; a reveal of one opens it.
  const later = c.feats.filter((x) => GROUP_ORDER.includes(x.g) && laterLevel(c, x) > 0).sort((x, y) => laterLevel(c, x) - laterLevel(c, y));
  const [laterOpen, setLaterOpen] = useState(false);
  useEffect(() => {
    if (focus && !focus.used && later.some((x) => 'feat-' + x.id === focus.id)) setLaterOpen(true);
  }, [focus?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  const f = useEntryForm('feat', BLANK, 'feature', 'Add a custom feature or trait');
  const picking = openForm?.kind === 'pick-feat';
  const titles: [FeatureGroup, string][] = [
    ['class', 'Class · ' + classLine(c)], ['sub', 'Subclass · ' + c.classes.map((r) => r.sub).filter((x) => x).join(' / ')], ['background', 'Background'], ['feat', 'Feats'],
    ['species', 'Species · ' + (c.ch.species || '')], ['training', 'Training & proficiencies'], ['other', 'Other']
  ];
  const d = f.draft;
  const masteryAt = firstMasteryFeature(c);
  // A feature's Summon: no slot level; the same step as a spell's cast.
  const summonFrom = (x: Feature) => {
    const s = summonStart(c, x, linkOf('feature', x.id));
    if (s.patch.creatures) update(s.patch);
    setForm(s.form);
  };
  const save = () => {
    const name = d.name.trim();
    if (!name) return;
    const id = f.editingId ?? newId();
    // All keys present: undefined clears a field when editing.
    const built = { g: d.g, name, desc: d.desc.trim(), makes: d.makes, from: d.from, srcKind: d.srcKind, srcName: d.srcName?.trim() || undefined };
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
        <label className="field" style={{ gridColumn: '1 / -1' }}>Description
          <textarea className="input textarea" value={d.desc} placeholder="Short summary of what it does" onChange={(e) => f.set({ desc: e.target.value })} />
        </label>
        <SourcePicker self={f.editingId ? linkOf('feature', f.editingId) : undefined} value={d} onChange={(v) => f.set(v)} />
        <label className="check"><input type="checkbox" aria-label="Makes a creature" checked={d.makes === 'pet'} onChange={(e) => f.set({ makes: e.target.checked ? 'pet' : undefined })} />Makes a creature</label>
        <label className="check"><input type="checkbox" aria-label="Is a form" checked={d.makes === 'form'} onChange={(e) => f.set({ makes: e.target.checked ? 'form' : undefined })} />Is a form</label>
        <GrantList link={f.editingId ? linkOf('feature', f.editingId) : null} fromKind="feature" pending={d.pending} setPending={(pending) => f.set({ pending })} />
      </div>
    </EntryForm>
  );

  // One feature row; head: the row's heading (Later levels adds the level).
  const rowOf = (x: Feature, head = <strong>{x.name}</strong>) => {
    if (f.editingId === x.id) return <div key={x.id}>{form}</div>;
    const link = linkOf('feature', x.id), src = sourceLabel(c, x);
    return (
      <EntryRow key={x.id} id={'feat-' + x.id} name={x.name}
        // A catalog description runs to paragraphs: the row shows its start, the open row all of it.
        head={<>{head}{x.desc && <span className="muted entry-clamp">{x.desc}</span>}</>}
        side={hasActiveEffect(c, link) || x.makes ? <>
          {hasActiveEffect(c, link) && <EffectSwitch link={link} name={x.name} />}
          {/* A feature that makes a creature (Primal Companion) or a form (Wild Shape) opens its summon step. */}
          {x.makes === 'pet' && <button type="button" className="btn btn-sm toggle-btn" onClick={() => summonFrom(x)}>Summon</button>}
          {x.makes === 'form' && <button type="button" className="btn btn-sm toggle-btn" onClick={() => setForm({ kind: 'summon', id: link })}>Assume form</button>}
        </> : undefined}
        body={x.desc || src || masteryAt === x.id ? <>
          {x.desc && <span className="entry-desc">{x.desc}</span>}
          {masteryAt === x.id && <MasteryLine />}
          {src && <span className="muted">Source: {src}</span>}
        </> : undefined}
        onEdit={() => f.openEdit(x.id, { g: x.g || 'other', name: x.name, desc: x.desc || '', makes: x.makes, from: x.from, srcKind: x.srcKind, srcName: x.srcName, pending: [] })}
        onRemove={() => update((p) => removeRef(p, { kind: 'feature', id: x.id }))}
        removeConfirm={removalNote(c, { kind: 'feature', id: x.id })}>
        {grantChips(c, link).length > 0 && <SourceChips link={link} />}
        {x.makes && <SummonStep link={link} src={x} />}
      </EntryRow>
    );
  };

  return (
    <div className="col gap-12">
      <div className="grid" style={{ '--min': '260px', gap: 12 } as CSSProperties}>
        {titles.map(([g, title]) => {
          const items = c.feats.filter((x) => x.g === g && !laterLevel(c, x));
          // The Training card always shows: it holds the proficiencies and the row that adds one.
          if (!items.length && g !== 'training') return null;
          return (
            <div key={g} className="block">
              <h3 className="block-title">{title}</h3>
              {g === 'training' && <Proficiencies />}
              {items.map((x) => rowOf(x))}
            </div>
          );
        })}
      </div>
      {later.length > 0 && (
        <div className="block">
          <button type="button" className="btn row gap-4" aria-expanded={laterOpen} onClick={() => setLaterOpen(!laterOpen)}>Later levels<Caret open={laterOpen} /></button>
          {laterOpen && later.map((x) => rowOf(x, <><strong>{x.name}</strong> · from level {laterLevel(c, x)}</>))}
        </div>
      )}
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
                <span key={p.name} className={'prof-chip' + (p.id ? '' : ' bare')}>
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
