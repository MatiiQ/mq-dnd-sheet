import { useState, type CSSProperties } from 'react';
import {
  addCreature, assumeForm, castAgainBlock, damageCreature, dismiss, duplicateCreature, endForm, formAc, healCreature, recall, sendAway,
  showCompanions, summon, summonCopies
} from '../creatures';
import { parseLink, sourceLabel, sourceOf } from '../links';
import { castRitual, CONDITIONS, newId } from '../logic';
import { useSheet } from '../sheet';
import type { Character, Creature, CreatureAttack, Spell } from '../types';
import { revealOf } from './nav';
import { SourcePicker } from './SourcePicker';
import { AddButton, EntryActions, EntryForm, NumInput, RemoveButton, TextField, XIcon } from './ui';

export type CreatureDraft = Omit<Creature, 'id'> & { id?: string };
export const BLANK_CREATURE: CreatureDraft = {
  name: '', kind: 'pet', on: true, ac: 10, hp: 0, maxHp: 0, temp: 0, speed: '', init: '', note: '', atk: [], conds: {}
};
const spellIdOf = (k: Pick<Creature, 'from'>) => { const p = parseLink(k.from); return p?.kind === 'spell' ? p.id : null; };
const spellOfCard = (c: Character, k: Pick<Creature, 'from'>): Spell | undefined => { const id = spellIdOf(k); return id ? c.spells.find((s) => s.id === id) : undefined; };
const stats = (k: Creature, ac: number) => ['AC ' + ac, k.speed].filter(Boolean).join(' · ');
const scores = (k: Creature) => (['str', 'dex', 'con'] as const).filter((a) => k[a] !== undefined).map((a) => a.toUpperCase() + ' ' + k[a]).join(' ');

// The pet saved `on` with a Concentration spell source that isn't the current Concentration would be switched off by
// normalize(), so the editor says so and saves it off.
const concMissing = (c: Character, d: CreatureDraft): Spell | null => {
  const sp = spellOfCard(c, d);
  return d.kind === 'pet' && d.on && d.ends === 'conc' && sp && c.conc?.id !== sp.id ? sp : null;
};

// One editor for pets and forms, in the Companions section (+ Add companion, Edit, the scroll case) and inline under a
// source row (the summon step's pre-linked editor). howMany: the summon step's count for a first cast (Animate Dead).
export function CreatureEditor({ initial, title, saveLabel, onSave, onCancel, inline, howMany }: {
  initial: CreatureDraft; title: string; saveLabel: string; onSave: (d: CreatureDraft, n: number) => void; onCancel: () => void; inline?: boolean; howMany?: boolean;
}) {
  const { c } = useSheet();
  const [d, setD] = useState<CreatureDraft>(initial);
  const [n, setN] = useState(1);
  const [err, setErr] = useState('');
  const set = (p: Partial<CreatureDraft>) => { setD((x) => ({ ...x, ...p })); setErr(''); };
  const pet = d.kind === 'pet';
  const missing = concMissing(c, d);
  const save = () => {
    if (!d.name.trim()) return setErr('Enter a name');
    // A pet at 0 HP is dismissed at once, and an hp form at 0 Temporary HP ends at once (R47, R13).
    if (pet && d.maxHp < 1) return setErr('Enter the creature’s HP');
    if (!pet && d.formTemp === 'hp' && d.maxHp < 1) return setErr('Enter the beast’s HP');
    onSave({ ...d, name: d.name.trim(), on: missing ? false : d.on }, n);
  };
  const atk = (id: string, p: Partial<CreatureAttack>) => set({ atk: d.atk.map((a) => (a.id === id ? { ...a, ...p } : a)) });
  const check = (label: string, on: boolean, flip: () => void) => (
    <label className="row gap-8 check-row"><input type="checkbox" aria-label={label} checked={on} onChange={flip} />{label}</label>
  );
  return (
    <EntryForm kind={inline ? 'summon-creature' : 'creature'} title={title} saveLabel={saveLabel} onSave={save} onCancel={onCancel} inline={inline}>
      <div className="row gap-6" role="group" aria-label="Creature or form">
        {(['pet', 'form'] as const).map((k) => (
          <button key={k} type="button" className={'btn btn-sm toggle-btn' + (d.kind === k ? ' on' : '')} aria-pressed={d.kind === k}
            onClick={() => set({ kind: k })}>{k === 'pet' ? 'Creature' : 'Form'}</button>
        ))}
      </div>
      <div className="grid" style={{ '--min': '160px' } as CSSProperties}>
        <TextField label="Name" value={d.name} placeholder={pet ? 'e.g. Owl, Skeleton' : 'e.g. Wolf, Brown Bear'} onChange={(v) => set({ name: v })} />
        <label className="field">AC<NumInput className="input" value={d.ac} min={0} max={40} onCommit={(v) => set({ ac: v })} /></label>
        <label className="field">Max HP<NumInput className="input" value={d.maxHp} min={0} max={9999} onCommit={(v) => set({ maxHp: v })} /></label>
        <TextField label="Speed" value={d.speed} placeholder="e.g. 40 ft, fly 60 ft" onChange={(v) => set({ speed: v })} />
        <TextField label="Initiative" value={d.init} placeholder="e.g. +2" onChange={(v) => set({ init: v })} />
        {!pet && (['str', 'dex', 'con'] as const).map((a) => (
          <label key={a} className="field">{a.toUpperCase()}<NumInput className="input" value={d[a] ?? 10} min={1} max={30} onCommit={(v) => set({ [a]: v })} /></label>
        ))}
        {!pet && (
          <label className="field">Temporary HP when assumed
            <select className="input" value={d.formTemp ?? ''} onChange={(e) => set({ formTemp: (e.target.value || undefined) as Creature['formTemp'] })}>
              <option value="">None</option><option value="wildshape">Wild Shape (Druid level)</option><option value="hp">The beast’s HP (Polymorph)</option>
            </select>
          </label>
        )}
        {howMany && pet && <label className="field">How many<NumInput className="input" value={n} min={1} max={20} onCommit={setN} /></label>}
      </div>
      <div className="col gap-6">
        <span className="muted">Attacks</span>
        {d.atk.map((a) => (
          <div key={a.id} className="row wrap gap-6">
            <input type="text" className="input grow" aria-label="Attack name" value={a.name} placeholder="e.g. Bite" onChange={(e) => atk(a.id, { name: e.target.value })} />
            <input type="text" className="input" style={{ width: 80 }} aria-label="To hit" value={a.hit} placeholder="+4" onChange={(e) => atk(a.id, { hit: e.target.value })} />
            <input type="text" className="input grow" aria-label="Damage" value={a.dmg} placeholder="1d6+2 Piercing" onChange={(e) => atk(a.id, { dmg: e.target.value })} />
            <button type="button" className="icon-btn" aria-label={'Remove attack ' + (a.name || '')} onClick={() => set({ atk: d.atk.filter((x) => x.id !== a.id) })}><XIcon /></button>
          </div>
        ))}
        <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ atk: [...d.atk, { id: newId(), name: '', hit: '', dmg: '' }] })}>+ Attack</button>
      </div>
      <TextField label="Note" value={d.note} onChange={(v) => set({ note: v })} />
      <SourcePicker value={{ from: d.from, srcKind: d.srcKind, srcName: d.srcName }} onChange={(v) => set({ from: v.from, srcKind: v.srcKind, srcName: v.srcName })} />
      <div className="col gap-4">
        {check('Ends with Concentration', d.ends === 'conc', () => set({ ends: d.ends === 'conc' ? undefined : 'conc' }))}
        {pet && check('Ends on a Long Rest', d.ends === 'long', () => set({ ends: d.ends === 'long' ? undefined : 'long' }))}
        {pet && check('Pocket dimension', !!d.pocket, () => set({ pocket: d.pocket ? undefined : true }))}
        {pet && check('Out now', d.on, () => set({ on: !d.on }))}
        {missing && <span className="small" style={{ color: 'var(--danger)' }}>Not concentrating on {missing.name}: saved as dismissed</span>}
      </div>
      {err && <span role="alert" className="small" style={{ color: 'var(--danger)' }}>{err}</span>}
    </EntryForm>
  );
}

// Saves an editor's draft: a new card (with n − 1 numbered copies, summoned), or the edit merged into its card.
export function saveCreature(c: Character, d: CreatureDraft, n = 1, lvl?: number): Character {
  if (d.id && c.creatures?.some((k) => k.id === d.id)) {
    // A linked card keeps its source's current name (R22).
    const srcName = d.from ? sourceOf(c, d.from)?.name ?? d.srcName : d.srcName;
    return { ...c, creatures: c.creatures.map((k) => (k.id === d.id ? { ...k, ...d, id: k.id, srcName, hp: Math.min(k.hp, d.maxHp) } : k)) };
  }
  const id = newId();
  const out = addCreature(c, { ...d, id, hp: d.maxHp, ...(lvl ? { lvl } : {}) });
  return n > 1 ? summonCopies(out, id, n - 1, lvl) : out;
}

// A pet's card: HP and the Damage / Heal buttons while it is out; tap the name for the rest.
function PetCard({ k }: { k: Creature }) {
  const { c, update, reveal, setForm } = useSheet();
  const [open, setOpen] = useState(false);
  const [amt, setAmt] = useState(0);
  const out = k.on && !k.away;
  const sp = spellOfCard(c, k);
  const src = sourceLabel(c, k);
  const pct = k.maxHp ? Math.round((k.hp / k.maxHp) * 100) : 0;
  const block = sp ? castAgainBlock(c, sp) : null;
  const ritual = () => {
    // Computed from the render's c and applied as one plain patch (never inside an update function).
    const r = castRitual(c, sp!);
    if (r === null) return;
    update({ ...r, creatures: summon({ ...c, ...r }, [k.id], sp!.lvl).creatures });
  };
  return (
    <div id={'creature-' + k.id} className={'well col gap-6 pet-card' + (k.on ? '' : ' inactive')}>
      <div className="row gap-8">
        <button type="button" className="entry-head grow" aria-expanded={open} onClick={() => setOpen(!open)}>
          <strong>{k.name}</strong>{k.lvl ? <span className="muted"> · level {k.lvl}</span> : null}
        </button>
        {k.on && k.away && <span className="muted">In pocket</span>}
        {k.on && k.away && <button type="button" className="btn btn-sm" onClick={() => update((p) => recall(p, k.id))}>Recall</button>}
        {!k.on && sp && (
          <span className="col" style={{ alignItems: 'flex-end' }}>
            <span className="row gap-6">
              <button type="button" className="btn btn-sm" disabled={!!block} onClick={() => reveal({ kind: 'spell', id: sp.id, cast: true })}>Cast again</button>
              {sp.ritual && <button type="button" className="btn btn-sm" aria-label={'Cast ' + sp.name + ' as a Ritual, no slot'} onClick={ritual}>Ritual</button>}
            </span>
            {block && <span className="small">{block}</span>}
          </span>
        )}
        {!k.on && !sp && <button type="button" className="btn btn-sm" onClick={() => update((p) => summon(p, [k.id]))}>Summon again</button>}
      </div>
      {out ? (
        <div className="row gap-10 pet-hp">
          <div className="col grow" style={{ maxWidth: 220, gap: 2 }}>
            <span><strong>{k.hp}</strong><span className="muted">/{k.maxHp}</span>{k.temp > 0 && <span style={{ color: 'var(--blue)', fontWeight: 600 }}> +{k.temp} temp</span>}</span>
            <span className="pet-bar" aria-hidden="true"><span style={{ width: pct + '%' }} /></span>
            <span className="muted">{stats(k, k.ac)}</span>
          </div>
          <NumInput className="input pet-amt" aria-label={'Amount for ' + k.name} value={amt} min={0} max={999} onCommit={setAmt} />
          <button type="button" className="round-btn btn-damage" aria-label={'Damage ' + k.name} onClick={() => update((p) => damageCreature(p, k.id, amt))}>−</button>
          <button type="button" className="round-btn btn-heal" aria-label={'Heal ' + k.name} onClick={() => update((p) => healCreature(p, k.id, amt))}>+</button>
        </div>
      ) : !k.on && <span className="muted">{['Dismissed', stats(k, k.ac)].join(' · ')}</span>}
      {open && (
        <div className="col gap-6 entry-body">
          {k.init && <span>Initiative {k.init}</span>}
          {k.atk.map((a) => <span key={a.id}>{[a.name, a.hit, a.dmg].filter(Boolean).join(' · ')}</span>)}
          {out && (
            <div className="row wrap gap-6" role="group" aria-label={'Conditions on ' + k.name}>
              {CONDITIONS.map((cn) => (
                <button key={cn} type="button" className="chip" aria-pressed={!!k.conds[cn]}
                  onClick={() => update((p) => ({ creatures: (p.creatures ?? []).map((x) => (x.id === k.id ? { ...x, conds: { ...x.conds, [cn]: !x.conds[cn] } } : x)) }))}>{cn}</button>
              ))}
            </div>
          )}
          {out && <label className="field" style={{ maxWidth: 160 }}>Temp HP
            <NumInput className="input" value={k.temp} min={0} max={999} onCommit={(v) => update((p) => ({ creatures: (p.creatures ?? []).map((x) => (x.id === k.id ? { ...x, temp: v } : x)) }))} />
          </label>}
          {k.note && <span className="entry-desc">{k.note}</span>}
          {src && (revealOf(c, k.from) ? <button type="button" className="link-btn go-link" onClick={() => reveal(revealOf(c, k.from)!)}>Source: {src}</button>
            : <span className="muted">Source: {src}</span>)}
          <div className="row wrap gap-6">
            <button type="button" className="btn btn-sm" onClick={() => setForm({ kind: 'creature', id: k.id })}>Edit</button>
            <button type="button" className="btn btn-sm" onClick={() => update((p) => duplicateCreature(p, k.id))}>Duplicate</button>
            {k.on && <button type="button" className="btn btn-sm" onClick={() => update((p) => dismiss(p, k.id))}>Dismiss</button>}
            {out && k.pocket && <button type="button" className="btn btn-sm" onClick={() => update((p) => sendAway(p, k.id))}>Send to pocket</button>}
            <RemoveButton name={k.name} onRemove={() => update((p) => ({ creatures: (p.creatures ?? []).filter((x) => x.id !== k.id) }))} />
          </div>
        </div>
      )}
    </div>
  );
}

// Assume (a feature's form, one with no source, or a spell's form while its spell is the Concentration), or Cast <spell>.
function FormTile({ k }: { k: Creature }) {
  const { c, update, reveal, setForm } = useSheet();
  const sp = spellOfCard(c, k);
  const canAssume = !sp || c.conc?.id === sp.id;
  return (
    <div className="tile form-tile">
      <strong>{k.name}</strong>
      <span className="muted">{['AC ' + formAc(c, k), 'HP ' + k.maxHp, k.speed].filter(Boolean).join(' · ')}</span>
      <div className="row wrap gap-6">
        {canAssume
          ? <button type="button" className="btn btn-sm" aria-label={'Assume ' + k.name} onClick={() => update((p) => assumeForm(p, k.id))}>Assume</button>
          : <button type="button" className="btn btn-sm" onClick={() => reveal({ kind: 'spell', id: sp!.id, cast: true })}>Cast {sp!.name}</button>}
        <EntryActions name={k.name} onEdit={() => setForm({ kind: 'creature', id: k.id })}
          onRemove={() => update((p) => ({ creatures: (p.creatures ?? []).filter((x) => x.id !== k.id) }))} />
      </div>
    </div>
  );
}

function ActiveForm({ k }: { k: Creature }) {
  const { c, update } = useSheet();
  return (
    <div className="well col gap-4 form-card">
      <div className="row gap-8">
        <strong className="grow">◆ Form · {k.name}</strong>
        <button type="button" className="btn btn-sm" aria-label={'End form ' + k.name} onClick={() => update((p) => endForm(p, k.id))}>End</button>
      </div>
      <span className="muted">{[stats(k, formAc(c, k)), scores(k)].filter(Boolean).join(' · ')}</span>
      {k.atk.map((a) => <span key={a.id}>{[a.name, a.hit, a.dmg].filter(Boolean).join(' · ')}</span>)}
      {k.note && <span className="small">{k.note}</span>}
    </div>
  );
}

// The Hit Points panel's line while a form is on: "◆ Wild Shape: Wolf [End]".
export function FormBanner() {
  const { c, update } = useSheet();
  const k = c.creatures?.find((x) => x.kind === 'form' && x.on);
  if (!k) return null;
  const src = (k.from ? sourceOf(c, k.from)?.name : undefined) ?? k.srcName ?? 'Form';
  return (
    <div className="row gap-8 form-banner">
      <span className="grow">◆ {src}: {k.name}</span>
      <button type="button" className="btn btn-sm" aria-label={'End form ' + k.name} onClick={() => update((p) => endForm(p, k.id))}>End</button>
    </div>
  );
}

export function Companions() {
  const { c, update, edit, form, setForm } = useSheet();
  if (!showCompanions(c, edit, form)) return null;
  const list = c.creatures ?? [];
  const pets = list.filter((k) => k.kind === 'pet');
  const active = list.find((k) => k.kind === 'form' && k.on);
  const saved = list.filter((k) => k.kind === 'form' && !k.on);
  const ordered = [...pets.filter((k) => k.on && !k.away), ...pets.filter((k) => k.on && k.away), ...pets.filter((k) => !k.on)];
  const editing = form?.kind === 'creature' ? list.find((k) => k.id === form.id) : undefined;
  const editor = form?.kind === 'creature' && (
    <CreatureEditor key={form.id ?? 'new'} initial={editing ?? { ...BLANK_CREATURE, ...form.draft }}
      title={editing ? 'Edit ' + editing.name : 'Add a companion'} saveLabel={editing ? 'Save changes' : 'Add companion'}
      onCancel={() => setForm(null)} onSave={(d) => { update((p) => saveCreature(p, d, 1, form.draft?.lvl)); setForm(null); }} />
  );
  return (
    <section id="sec-companions" aria-label="Companions" className="block section">
      <h2 className="block-title area-title">Companions</h2>
      {active && <ActiveForm k={active} />}
      {ordered.map((k) => <PetCard key={k.id} k={k} />)}
      {saved.length > 0 && (
        <div className="col gap-6">
          <span className="muted">Saved forms</span>
          <div className="form-tiles">{saved.map((k) => <FormTile key={k.id} k={k} />)}</div>
        </div>
      )}
      {editor}
      {!editor && <AddButton always onClick={() => setForm({ kind: 'creature', id: null })}>+ Add companion</AddButton>}
    </section>
  );
}
