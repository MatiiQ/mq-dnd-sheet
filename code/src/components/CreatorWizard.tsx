// The character creator (spec 2026-11-06 §4): Class, Origin, Abilities, Details, Levels, then one summary and
// "Create character". It holds answers only; the preview is replay(cat, answers), the same function Finish uses, so the
// two can't differ. The answers and the step are saved as a draft after every step.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { poolOptions } from '../catalog/copy';
import type { FlowAnswers } from '../catalog/flow';
import { entriesOf, type Catalog } from '../catalog/merge';
import type { ClassEntry, Entry } from '../catalog/schema';
import { useCatalog } from '../catalog/useCatalog';
import { CREATOR_STEPS, DRAFT_VERSION, dropLowest, POINT_BUDGET, pointsSpent, replay, replayOrigin, STANDARD_ARRAY, staleStep, writeDraft, type CreatorAnswers, type Draft } from '../creator';
import { emptyCharacter, type ClassPick } from '../levelup';
import { ABILITIES, classLine, effScore, maxHpOf } from '../logic';
import { Sheet } from '../sheet';
import type { Ability, Character } from '../types';
import { LevelSteps } from './LevelUpWizard';
import { ChoiceFlow } from './pickers/ChoiceFlow';
import { NumInput, Step } from './ui';

export const NEW_ANSWERS = (): CreatorAnswers => ({
  cls: '', equip: 'none', start: 1, bgFlow: {}, spFlow: {}, skills: [], languages: [], method: 'array', scores: {},
  details: { name: '', align: '', appearance: '', notes: '' }, first: { flows: {}, spells: {} }, levels: []
});
const SUMMARY = CREATOR_STEPS.length;
const ctxOf = (c: Character) => ({ c, update: () => {}, edit: false, form: null, setForm: () => {}, focus: null, reveal: () => {}, markFocusUsed: () => {} });

export function CreatorWizard({ initial, onCreate, onClose, cat: given, notice }: {
  initial?: Draft; onCreate: (c: Character) => void; onClose: () => void; cat?: Catalog | null; notice?: string;
}) {
  const state = useCatalog(given === undefined);
  const cat = given !== undefined ? given : state.status === 'ready' ? state.cat : null;
  return (
    <div className="wizard" role="dialog" aria-modal="true" aria-label="Create a character">
      <div className="wizard-head row between gap-8">
        <h2 className="block-title">New character</h2>
        <button type="button" className="btn btn-sm" onClick={onClose}>Close</button>
      </div>
      {cat ? <Creator cat={cat} initial={initial} onCreate={onCreate} notice={notice} />
        : state.status === 'error' ? (
          <div role="status" className="row wrap gap-8">
            <span>The creator needs the rules data, which couldn’t be loaded.</span>
            <button type="button" className="btn" onClick={state.retry}>Retry</button>
          </div>
        ) : <span className="muted">Loading the rules…</span>}
    </div>
  );
}

function Creator({ cat, initial, onCreate, notice }: { cat: Catalog; initial?: Draft; onCreate: (c: Character) => void; notice?: string }) {
  const [a, setA] = useState<CreatorAnswers>(initial?.answers ?? NEW_ANSWERS());
  // A draft naming catalog ids the catalog no longer has (a pack change) reopens at the first step that names one.
  const [stale] = useState(() => (initial ? staleStep(cat, initial.answers) : null));
  const [step, setStep] = useState(stale ?? initial?.step ?? 0);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const warned = useRef(false);
  const set = (f: (x: CreatorAnswers) => CreatorAnswers) => setA(f);
  // The preview, without the details (a keystroke in Details must not replay up to 20 levels); they go on last.
  const { details, ...rest } = a;
  const key = JSON.stringify(rest);
  const base = useMemo(() => (a.cls ? replay(cat, { ...a, details: NEW_ANSWERS().details }) : null), [cat, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = base ? { ...base.c, ch: { ...base.c.ch, name: details.name, align: details.align }, notes: { ...base.c.notes, appearance: details.appearance, backstory: details.notes } } : null;
  const cls = a.cls ? cat.byId.get(a.cls) as ClassEntry | undefined : undefined;
  const go = (n: number) => {
    const to = Math.max(0, Math.min(SUMMARY, n));
    setStep(to);
  };
  // The draft follows every answer, so Close or a closed app loses nothing; nothing is saved before a class is chosen.
  useEffect(() => {
    if (!a.cls) return;
    if (!writeDraft({ v: DRAFT_VERSION, step, answers: a }) && !warned.current) { warned.current = true; setSaveMsg('Draft couldn’t be saved: storage is full. You can still finish, but closing the app loses this character.'); }
  }, [a, step]);
  // What replay left out: a class skill the origin already gives is only a note (Origin lets you swap it); anything else
  // (a background or species whose choices were never finished, a level that no longer fits) blocks.
  const dropped = base?.dropped ?? [];
  const heldSkills = dropped.filter((d) => d.startsWith('Class skill ')).length;
  const blocking = dropped.filter((d) => !d.startsWith('Class skill '));
  const originOk = !blocking.some((d) => /^(Background|Species|Language)/.test(d));
  const langs = Math.min(2, entriesOf(cat, 'prof').filter((p) => p.cat === 'language' && p.name !== 'Common').length);
  const scoresOk = ABILITIES.every(([k]) => a.scores[k] !== undefined) && (a.method !== 'buy' || pointsSpent(a.scores) <= POINT_BUDGET);
  // Levels is ready once level 1's choices and every level up to the starting level are chosen.
  const readyAt = [!!cls, !!a.background && !!a.species && originOk && a.languages.length === langs && !!cls && a.skills.length - heldSkills === cls.skills.pick, scoresOk, true,
    !!a.firstDone && (a.start <= 1 || a.levels.length >= a.start - 1)];
  const createOk = readyAt.every(Boolean) && blocking.length === 0;
  let body: ReactNode = null;
  if (step === 0) body = <ClassStep cat={cat} a={a} set={set} />;
  else if (step === 1) body = <OriginStep cat={cat} a={a} set={set} preview={preview} cls={cls} />;
  else if (step === 2) body = <AbilityStep a={a} set={set} preview={preview} cls={cls} />;
  else if (step === 3) body = <DetailsStep a={a} set={set} />;
  else if (step === 4) body = <LevelsStep cat={cat} a={a} set={set} onDone={() => go(SUMMARY)} />;
  else body = <SummaryStep preview={preview} a={a} />;
  return (
    <div className="col gap-12">
      <div role="group" aria-label="Creator steps" className="row wrap gap-4 wizard-bar">
        {[...CREATOR_STEPS, 'Summary'].map((t, i) => (
          <button key={t} type="button" className="filter-btn" aria-pressed={i === step} aria-current={i === step ? 'step' : undefined}
            aria-disabled={i > step && !readyAt.slice(0, i).every(Boolean)} onClick={() => (i <= step || readyAt.slice(0, i).every(Boolean)) && go(i)}>{t}</button>
        ))}
      </div>
      {notice && <div role="status" className="notice notice-blue">{notice}</div>}
      {stale !== null && <div role="status" className="notice notice-blue">Some of this draft’s choices are no longer in the rules data: choose them again from here.</div>}
      {saveMsg && <div role="status" className="notice notice-blue">{saveMsg}</div>}
      {base && base.dropped.length > 0 && <div role="status" className="notice notice-blue">No longer fits, left out: {base.dropped.join('; ')}.</div>}
      {body}
      <div className="row wrap gap-8">
        {step > 0 && <button type="button" className="btn" onClick={() => go(step - 1)}>Back</button>}
        {step < SUMMARY && step !== 4 && <button type="button" className="btn btn-primary" aria-disabled={!readyAt[step]} onClick={() => readyAt[step] && go(step + 1)}>Next</button>}
        {step === 4 && a.start === 1 && a.firstDone && <button type="button" className="btn btn-primary" onClick={() => go(SUMMARY)}>Next</button>}
        {step === SUMMARY && <button type="button" className="btn btn-primary" aria-disabled={!preview || !createOk} onClick={() => preview && createOk && onCreate(preview)}>Create character</button>}
      </div>
    </div>
  );
}

// Class: the grid, its summary (die, primary abilities, saves) with "Why?", starting equipment and the starting level.
function ClassStep({ cat, a, set }: { cat: Catalog; a: CreatorAnswers; set: (f: (x: CreatorAnswers) => CreatorAnswers) => void }) {
  const [why, setWhy] = useState(false);
  const cls = a.cls ? cat.byId.get(a.cls) as ClassEntry | undefined : undefined;
  const name = (ab: string) => ABILITIES.find(([k]) => k === ab)?.[1] ?? ab;
  return (
    <div className="col gap-8">
      <h3 className="block-title">Class</h3>
      <div className="row wrap gap-6">
        {entriesOf(cat, 'class').map((e) => (
          // A new class clears the class skill picks and the answers of every level (they name the old class).
          <button key={e.id} type="button" className="pick-opt" aria-pressed={a.cls === e.id}
            onClick={() => a.cls !== e.id && set((x) => ({ ...x, cls: e.id, skills: [], first: { flows: {}, spells: {} }, firstDone: false, equip: 'none', levels: [] }))}>{e.name}</button>
        ))}
      </div>
      {cls && (
        <div className="col gap-6">
          <span>d{cls.hd} Hit Die · Primary: {(cls.primary ?? '').split(/[,|]/).filter(Boolean).map(name).join(cls.primary?.includes('|') ? ' or ' : ' and ') || '—'} · Saves: {cls.saves.split(',').map(name).join(', ')}</span>
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} aria-expanded={why} onClick={() => setWhy(!why)}>Why?</button>
          {why && <span className="small" style={{ whiteSpace: 'pre-line' }}>{cls.desc}</span>}
          {cls.equipA !== undefined && (
            <div role="group" aria-label="Starting equipment" className="row wrap gap-6">
              {(['A', 'B', 'none'] as const).map((p) => (
                <button key={p} type="button" className="pick-opt" aria-pressed={a.equip === p} onClick={() => set((x) => ({ ...x, equip: p }))}>
                  {p === 'A' ? 'Package A' : p === 'B' ? `Package B (${cls.gpB ?? 0} GP)` : 'None'}
                </button>
              ))}
            </div>
          )}
          <label className="row gap-8">Starting level
            <NumInput className="input input-num" aria-label="Starting level" value={a.start} min={1} max={20} onCommit={(v) => set((x) => ({ ...x, start: v, levels: x.levels.slice(0, v - 1) }))} />
          </label>
        </div>
      )}
    </div>
  );
}

// Origin: background and species through ChoiceFlow, two languages besides Common, then the class skills (asked here,
// so the background's skills show as already held).
function OriginStep({ cat, a, set, preview, cls }: { cat: Catalog; a: CreatorAnswers; set: (f: (x: CreatorAnswers) => CreatorAnswers) => void; preview: Character | null; cls?: ClassEntry }) {
  const c = preview ?? emptyCharacter();
  const langs = entriesOf(cat, 'prof').filter((p) => p.cat === 'language' && p.name !== 'Common');
  const fromOrigin = new Set(c.grants.filter((g) => g.kind === 'prof' && g.cat === 'skill' && !g.from.startsWith('class:')).map((g) => g.target));
  const skillOpts = cls ? poolOptions(cat, c, cls.skills.pool ?? 'skill:any', {}) : [];
  const toggleSkill = (k: string) => set((x) => ({ ...x, skills: x.skills.includes(k) ? x.skills.filter((s) => s !== k) : x.skills.length < (cls?.skills.pick ?? 0) ? [...x.skills, k] : x.skills }));
  const toggleLang = (n: string) => set((x) => ({ ...x, languages: x.languages.includes(n) ? x.languages.filter((s) => s !== n) : x.languages.length < 2 ? [...x.languages, n] : x.languages }));
  return (
    <Sheet.Provider value={ctxOf(c)}>
      <div className="col gap-12">
        <OriginPick title="Background" cat={cat} kind="background" id={a.background} flow={a.bgFlow}
          onPick={(id) => set((x) => ({ ...x, background: id, bgFlow: {} }))} onFlow={(f) => set((x) => ({ ...x, bgFlow: f }))} />
        <OriginPick title="Species" cat={cat} kind="species" id={a.species} flow={a.spFlow}
          onPick={(id) => set((x) => ({ ...x, species: id, spFlow: {} }))} onFlow={(f) => set((x) => ({ ...x, spFlow: f }))} />
        <div className="col gap-6">
          <h3 className="block-title">Languages <span className="muted">· Common and 2 more</span></h3>
          <div className="row wrap gap-6">{langs.map((l) => <button key={l.id} type="button" className="pick-opt" aria-pressed={a.languages.includes(l.name)} onClick={() => toggleLang(l.name)}>{l.name}</button>)}</div>
        </div>
        {cls && (
          <div className="col gap-6">
            <h3 className="block-title">{cls.name} skills <span className="muted">· choose {cls.skills.pick}</span></h3>
            <div className="row wrap gap-6">
              {skillOpts.map((o) => {
                const held = fromOrigin.has(o.value);
                return <button key={o.value} type="button" className="pick-opt" aria-pressed={a.skills.includes(o.value)} aria-disabled={held || undefined}
                  style={held ? { textDecoration: 'line-through' } : undefined}
                  // A skill the origin now gives can still be dropped (after a background change), never picked.
                  onClick={() => (!held || a.skills.includes(o.value)) && toggleSkill(o.value)}>{o.label}{held ? ' (from your origin)' : ''}</button>;
              })}
            </div>
          </div>
        )}
      </div>
    </Sheet.Provider>
  );
}

// A background or species: the list, then its choices through ChoiceFlow (answers kept; "Change" asks them again).
function OriginPick({ title, cat, kind, id, flow, onPick, onFlow }: {
  title: string; cat: Catalog; kind: 'background' | 'species'; id?: string; flow: FlowAnswers; onPick: (id: string) => void; onFlow: (f: FlowAnswers) => void;
}) {
  const [asking, setAsking] = useState(false);
  const e = id ? cat.byId.get(id) as Entry | undefined : undefined;
  return (
    <div className="col gap-6">
      <h3 className="block-title">{title}</h3>
      <div className="row wrap gap-6">
        {entriesOf(cat, kind).map((x) => <button key={x.id} type="button" className="pick-opt" aria-pressed={id === x.id} onClick={() => { if (id !== x.id) onPick(x.id); setAsking(true); }}>{x.name}</button>)}
      </div>
      {e && asking && <ChoiceFlow key={e.id} entry={e} cat={cat} initial={Object.keys(flow).length ? { answers: flow, at: 0 } : undefined}
        onDone={(_, st) => { onFlow(st.answers); setAsking(false); }} onCancel={() => setAsking(false)} />}
      {e && !asking && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAsking(true)}>Change {e.name}’s choices</button>}
    </div>
  );
}

// Abilities: Standard Array, Point Buy (27 points, a live counter) or Rolled (six typed totals, or four dice each with
// the lowest dropped). A set is assigned by tapping it, then an ability. The final score (with the background bonus)
// shows under each.
function AbilityStep({ a, set, preview, cls }: { a: CreatorAnswers; set: (f: (x: CreatorAnswers) => CreatorAnswers) => void; preview: Character | null; cls?: ClassEntry }) {
  const [rolled, setRolled] = useState<number[]>([]);
  const [dice, setDice] = useState<number[][]>(Array.from({ length: 6 }, () => [0, 0, 0, 0]));
  const [sel, setSel] = useState<number | null>(null);
  const method = (m: CreatorAnswers['method']) => set((x) => ({ ...x, method: m, scores: m === 'buy' ? Object.fromEntries(ABILITIES.map(([k]) => [k, 8])) : {} }));
  const pool = a.method === 'array' ? STANDARD_ARRAY : rolled;
  const used = (i: number) => Object.values(a.scores).filter((v) => v === pool[i]).length > pool.slice(0, i).filter((v) => v === pool[i]).length;
  const assign = (ab: Ability) => { if (sel === null) return; set((x) => ({ ...x, scores: { ...x.scores, [ab]: pool[sel] } })); setSel(null); };
  const spent = pointsSpent(a.scores);
  const diceFull = dice.every((d) => d.every((v) => v >= 1));
  return (
    <div className="col gap-10">
      <h3 className="block-title">Ability scores</h3>
      <div role="group" aria-label="Method" className="row wrap gap-6">
        {([['array', 'Standard Array'], ['buy', 'Point Buy'], ['rolled', 'Rolled']] as const).map(([m, l]) => <button key={m} type="button" className="filter-btn" aria-pressed={a.method === m} onClick={() => method(m)}>{l}</button>)}
      </div>
      {cls?.primary && <span className="small">Tip: {cls.name}s rely on {cls.primary.split(/[,|]/).map((k) => ABILITIES.find(([x]) => x === k)?.[1]).join(cls.primary.includes('|') ? ' or ' : ' and ')}.</span>}
      {a.method === 'rolled' && (
        <div className="col gap-6">
          <span className="small">Type six totals, or four dice for each (the lowest is dropped).</span>
          {dice.map((d, i) => (
            <div key={i} className="row gap-4">
              {d.map((v, j) => <input key={j} type="text" inputMode="numeric" className="input input-num" aria-label={'Set ' + (i + 1) + ' die ' + (j + 1)} value={v || ''}
                onChange={(e) => { const n = Math.max(0, Math.min(6, Number(e.target.value) || 0)); setDice((ds) => ds.map((x, k) => (k === i ? x.map((y, l) => (l === j ? n : y)) : x))); }} />)}
              <span className="muted">= {dropLowest(d)}</span>
            </div>
          ))}
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} aria-disabled={!diceFull} onClick={() => { if (!diceFull) return; setRolled(dice.map(dropLowest)); set((x) => ({ ...x, scores: {} })); }}>Use these sets</button>
          <label className="row gap-6">Or six totals
            <input type="text" className="input" aria-label="Six totals" placeholder="15 14 13 12 10 8" onChange={(e) => { const t = e.target.value.split(/[\s,]+/).map(Number).filter((n) => n >= 3 && n <= 18); if (t.length === 6) { setRolled(t); set((x) => ({ ...x, scores: {} })); } }} />
          </label>
        </div>
      )}
      {a.method !== 'buy' && pool.length > 0 && (
        <div role="group" aria-label="Score sets" className="row wrap gap-6">
          {pool.map((v, i) => <button key={i} type="button" className="pick-opt" aria-pressed={sel === i} aria-disabled={used(i) || undefined} onClick={() => !used(i) && setSel(i)}>{v}</button>)}
        </div>
      )}
      {a.method === 'buy' && <span style={{ color: spent > POINT_BUDGET ? 'var(--danger)' : undefined }}>Points: {spent} / {POINT_BUDGET}</span>}
      <div className="row wrap gap-8">
        {ABILITIES.map(([k, label]) => {
          const v = a.scores[k];
          return (
            <div key={k} className="well col" style={{ minWidth: 110 }}>
              <span className="small">{label}</span>
              {a.method === 'buy' ? (
                <div className="row gap-4">
                  <Step small label={'Lower ' + k.toUpperCase()} onClick={() => set((x) => ({ ...x, scores: { ...x.scores, [k]: Math.max(8, (x.scores[k] ?? 8) - 1) } }))}>−</Step>
                  <strong>{v ?? 8}</strong>
                  <Step small label={'Raise ' + k.toUpperCase()} onClick={() => set((x) => { const next = { ...x.scores, [k]: Math.min(15, (x.scores[k] ?? 8) + 1) }; return pointsSpent(next) > POINT_BUDGET ? x : { ...x, scores: next }; })}>+</Step>
                </div>
              ) : <button type="button" className="btn btn-sm" aria-label={'Assign to ' + label} onClick={() => assign(k)}>{v ?? '—'}</button>}
              {preview && v !== undefined && <span className="small">Final {effScore(preview, k)}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailsStep({ a, set }: { a: CreatorAnswers; set: (f: (x: CreatorAnswers) => CreatorAnswers) => void }) {
  const field = (k: keyof CreatorAnswers['details'], label: string, area = false) => (
    <label className="field">{label}
      {area ? <textarea className="input" value={a.details[k]} onChange={(e) => set((x) => ({ ...x, details: { ...x.details, [k]: e.target.value } }))} />
        : <input type="text" className="input" value={a.details[k]} onChange={(e) => set((x) => ({ ...x, details: { ...x.details, [k]: e.target.value } }))} />}
    </label>
  );
  return <div className="col gap-8"><h3 className="block-title">Details</h3>{field('name', 'Name')}{field('align', 'Alignment')}{field('appearance', 'Appearance', true)}{field('notes', 'Notes', true)}</div>;
}

// Levels 2..start, one at a time, each on the preview as it stands after the earlier ones ("Level 3 of 5").
function LevelsStep({ cat, a, set, onDone }: { cat: Catalog; a: CreatorAnswers; set: (f: (x: CreatorAnswers) => CreatorAnswers) => void; onDone: () => void }) {
  // Level 1 first: its features' own choices (Fighting Style, Expertise, Invocations), cantrips and spells. The class
  // skills were asked in Origin, so that step is skipped here.
  // The character the level-1 steps read: the origin, with the class skills picked in Origin (as replay adds them before
  // the features, so Expertise can offer them).
  const origin = replayOrigin(cat, a).c;
  const withSkills = { ...origin, skillProf: { ...origin.skillProf, ...Object.fromEntries(a.skills.map((k) => [k, Math.max(1, origin.skillProf[k] ?? 0)])) } };
  if (!a.firstDone) return (
    <div className="col gap-6">
      <h3 className="block-title">Level 1{a.start > 1 ? ' of ' + a.start : ''}</h3>
      <LevelSteps key={a.cls} c={withSkills} cat={cat} fixedPick={{ cls: a.cls }} skip={(s) => s.key === 'profs/skills'}
        onFinish={(_, __, ans) => set((x) => ({ ...x, first: ans, firstDone: true }))} />
    </div>
  );
  if (a.start <= 1) return <span className="muted">Level 1 is chosen. Starting at level 1: no more levels to choose.</span>;
  const i = Math.min(a.levels.length, a.start - 2);
  if (a.levels.length >= a.start - 1) return (
    <div className="col gap-6">
      <span>Levels 2–{a.start} are chosen.</span>
      <div className="row wrap gap-8">
        <button type="button" className="btn" onClick={() => set((x) => ({ ...x, levels: x.levels.slice(0, x.start - 2) }))}>Redo level {a.start}</button>
        <button type="button" className="btn btn-primary" onClick={onDone}>Next</button>
      </div>
    </div>
  );
  const before = replay(cat, { ...a, start: i + 1, levels: a.levels.slice(0, i) }).c;
  // The creator names a class by catalog id (or typed name), never by row id, so the answers replay on a fresh sheet.
  const toPick = (p: ClassPick): CreatorAnswers['levels'][number]['pick'] => {
    if (!('row' in p)) return p;
    const r = before.classes.find((x) => x.id === p.row)!;
    return r.clsId ? { cls: r.clsId } : { name: r.name, hd: r.hd };
  };
  return (
    <div className="col gap-6">
      <h3 className="block-title">Level {i + 2} of {a.start}</h3>
      <LevelSteps key={i} c={before} cat={cat} onFinish={(_, pick, ans) => set((x) => ({ ...x, levels: [...x.levels.slice(0, i), { pick: toPick(pick), ans }] }))} />
    </div>
  );
}

function SummaryStep({ preview, a }: { preview: Character | null; a: CreatorAnswers }) {
  if (!preview) return <span className="muted">Pick a class first.</span>;
  return (
    <div className="col gap-6">
      <h3 className="block-title">{preview.ch.name || 'Unnamed character'}</h3>
      <span>{[preview.ch.species, classLine(preview)].filter(Boolean).join(' · ')}</span>
      <span>HP {maxHpOf(preview)} · {ABILITIES.map(([k]) => k.toUpperCase() + ' ' + effScore(preview, k)).join(' · ')}</span>
      <span className="small">{preview.feats.length} features and traits, {preview.spells.length} spells, {preview.inv.length} items.</span>
      {a.start > 1 && <span className="small">Starting above level 1: the Starting Equipment at Higher Levels table (PHB p.43) gives more gold and items; add them by hand.</span>}
    </div>
  );
}
