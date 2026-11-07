// The level-up wizard (spec 2026-11-06 §3): which class gets the level, the level's steps from levelPlan, then a
// summary that is a dry run of applyLevel (pure), and Finish. Full screen. The steps read the sheet with the class level
// already raised (withLevel), so ChoiceFlow and the lists ask the counts of the new level; answers never touch the sheet
// until Finish.
import { useState, type ReactNode } from 'react';
import { choicesOf, poolOptions } from '../catalog/copy';
import type { FlowAnswers } from '../catalog/flow';
import { entriesOf, type Catalog } from '../catalog/merge';
import type { ChoiceSpec, ClassEntry, Entry } from '../catalog/schema';
import { useCatalog } from '../catalog/useCatalog';
import { applyLevel, fixedHp, levelPlan, prereqCheck, undoLevel, undoPreview, withLevel, type ClassPick, type LevelAnswers, type Step } from '../levelup';
import { abilityMod, maxHpOf, maxHpRaw, totalLevel } from '../logic';
import { Sheet } from '../sheet';
import type { Character, Die, LevelKey } from '../types';
import { ChoiceFlow } from './pickers/ChoiceFlow';

const EMPTY: LevelAnswers = { flows: {}, spells: {} };
const DICE: Die[] = [6, 8, 10, 12];

export function LevelUpWizard({ c, onApply, onClose, n, cat: given }: {
  c: Character; onApply: (next: Character) => void; onClose: () => void; n?: string; cat?: Catalog | null;
}) {
  const state = useCatalog(given === undefined);
  const [without, setWithout] = useState(false);
  // undefined: still loading, or failed and not yet "without it"; null: level up without the catalog.
  const cat = without ? null : given !== undefined ? given ?? undefined : state.status === 'ready' ? state.cat : undefined;
  const failed = given === null || state.status === 'error';
  return (
    <div className="wizard" role="dialog" aria-modal="true" aria-label="Level up">
      <div className="wizard-head row between gap-8">
        <h2 className="block-title">Level up{n ? ' · ' + n : ''}</h2>
        <button type="button" className="btn btn-sm" onClick={onClose}>Close</button>
      </div>
      {cat !== undefined ? <LevelSteps c={c} cat={cat} onFinish={onApply} />
        : failed ? (
          <div role="status" className="col gap-8">
            <span>Level-up needs the class catalog, which couldn’t be loaded.</span>
            <div className="row wrap gap-8">
              {state.status === 'error' && <button type="button" className="btn" onClick={state.retry}>Retry</button>}
              <button type="button" className="btn" onClick={() => setWithout(true)}>Level up without it</button>
            </div>
          </div>
        ) : <span className="muted">Loading the rules…</span>}
    </div>
  );
}

// A screen of the wizard: one of the plan's steps that needs an answer, the overview of what the level brings, the summary.
type Screen = { kind: 'step'; step: Step } | { kind: 'overview' } | { kind: 'summary' };
const asks = (s: Step) => s.kind === 'hp' || s.kind === 'subclass' || s.kind === 'asi' || s.kind === 'cantrips' || s.kind === 'prepare' || s.kind === 'mastery'
  || ((s.kind === 'profs' || s.kind === 'choice' || s.kind === 'grow') && !!s.choice)
  || (s.kind === 'feature' && !s.onSheet && !!s.entry && choicesOf(s.entry).length > 0);

// The class pick, then the steps of one level. The creator reuses it, one level at a time.
// onFinish also gets the class pick and the answers, which the creator stores instead of the character. fixedPick: the
// class is given (the creator's level 1), so there is no class screen; skip: steps answered elsewhere (its class skills).
export function LevelSteps({ c, cat, onFinish, fixedPick, skip }: {
  c: Character; cat: Catalog | null; onFinish: (next: Character, pick: ClassPick, answers: LevelAnswers) => void; fixedPick?: ClassPick; skip?: (s: Step) => boolean;
}) {
  const only = c.classes.length === 1 ? c.classes[0] : undefined;
  const [pick, setPick] = useState<ClassPick | null>(fixedPick ?? (only ? { row: only.id } : null));
  const [answers, setAnswers] = useState<LevelAnswers>(EMPTY);
  const [at, setAt] = useState(fixedPick ? 0 : -1);   // -1: the class screen
  if (totalLevel(c) >= 20) return <span role="status">Level 20: nothing more to gain.</span>;
  const plan = pick ? levelPlan(c, pick, cat, answers) : null;
  const w = pick ? withLevel(c, pick, cat) : null;
  const raised = w?.c ?? c;
  const screens: Screen[] = plan ? [...plan.steps.filter((s) => asks(s) && !skip?.(s)).map((step): Screen => ({ kind: 'step', step })), { kind: 'overview' }, { kind: 'summary' }] : [];
  const choose = (p: ClassPick) => { setPick(p); setAnswers(EMPTY); };
  const set = (f: (a: LevelAnswers) => LevelAnswers) => setAnswers(f);

  if (at < 0 || !plan) {
    const prereq = plan?.steps.find((s) => s.kind === 'prereq');
    const ok = !!plan && (!prereq?.warn || !!answers.anyway);
    return (
      <div className="col gap-12">
        <ClassScreen c={c} cat={cat} pick={pick} onPick={choose} />
        {prereq && <div role="status" className={prereq.warn ? 'notice notice-blue col gap-6' : 'muted'}>
          <span>{prereq.warn ?? prereq.title}</span>
          {prereq.warn && <label className="check"><input type="checkbox" checked={!!answers.anyway} onChange={(e) => set((a) => ({ ...a, anyway: e.target.checked || undefined }))} />Do it anyway</label>}
        </div>}
        <Nav back={null} next={ok ? () => setAt(0) : undefined} />
      </div>
    );
  }
  const idx = Math.min(at, screens.length - 1);
  const screen = screens[idx];
  const go = (i: number) => setAt(Math.max(fixedPick ? 0 : -1, Math.min(screens.length - 1, i)));
  const ctx = { c: raised, update: () => {}, edit: false, form: null, setForm: () => {}, focus: null, reveal: () => {}, markFocusUsed: () => {} };
  const bar = (
    <div role="group" aria-label="Level-up steps" className="row wrap gap-4 wizard-bar">
      {screens.map((s, i) => (
        <button key={i} type="button" className="filter-btn" aria-pressed={i === idx} aria-current={i === idx ? 'step' : undefined} onClick={() => go(i)}>
          {s.kind === 'step' ? s.step.title : s.kind === 'overview' ? 'This level' : 'Summary'}
        </button>
      ))}
    </div>
  );
  let body: ReactNode = null, next: (() => void) | undefined = () => go(idx + 1), showNext = true;
  if (screen.kind === 'step') {
    const s = screen.step;
    const flowDone = (key: string, flow: FlowAnswers) => { set((a) => ({ ...a, flows: { ...a.flows, [key]: flow } })); go(idx + 1); };
    if (s.kind === 'hp') {
      const die = raised.classes.find((r) => r.id === w?.row)?.hd ?? 8;
      body = <HpScreen die={die} con={abilityMod(raised, 'con')} value={answers.hp} onChange={(hp) => set((a) => ({ ...a, hp }))} />;
      if (!answers.hp) next = undefined;
    } else if (s.kind === 'subclass') {
      body = <SubclassScreen cat={cat} raised={raised} step={s} value={answers.sub} onChange={(sub) => set((a) => ({ ...a, sub }))} />;
      if (!answers.sub) next = undefined;
    } else if (s.kind === 'asi' && cat) {
      body = <AsiScreen cat={cat} raised={raised} step={s} value={answers.asi} onChange={(asi) => set((a) => ({ ...a, asi }))} />;
      if (!answers.asi) next = undefined;
    } else if (s.kind === 'cantrips' || s.kind === 'prepare') {
      body = <SpellScreen cat={cat} step={s} value={answers.spells[s.key] ?? []} onChange={(ids) => set((a) => ({ ...a, spells: { ...a.spells, [s.key]: ids } }))} />;
    } else if (s.kind === 'mastery') {
      body = <MasteryScreen cat={cat} step={s} value={answers.mastery ?? []} onChange={(m) => set((a) => ({ ...a, mastery: m }))} />;
    } else if (cat) {
      // A choice through ChoiceFlow: a feature's own choices, or one choice (class proficiencies, more picks, a grown count).
      const entry: Entry = s.kind === 'feature' ? s.entry! : { ...(s.entry ?? { id: 'feature/' + (plan.cls?.id.split('/')[1] ?? 'x') + '/proficiencies', kind: 'feature', name: s.title, src: 'srd', desc: '', cls: '', lvl: 1 }), grants: [s.choice!] } as Entry;
      showNext = false;
      body = (
        <>
          {s.warn && <div role="status" className="notice notice-blue">{s.warn}</div>}
          <ChoiceFlow key={s.key} entry={entry} cat={cat} initial={answers.flows[s.key] ? { answers: answers.flows[s.key], at: 0 } : undefined}
            {...(s.held ? { held: s.held } : {})} {...(s.choice && s.owed !== undefined ? { pick: { [s.choice.id]: s.owed } } : {})}
            onDone={(_, st) => flowDone(s.key, st.answers)} onCancel={() => go(idx - 1)} />
        </>
      );
    }
  } else if (screen.kind === 'overview') {
    body = (
      <div className="col gap-6">
        <h3 className="block-title">{(plan.cls?.name ?? raised.classes.find((r) => r.lvl === plan.clsLvl)?.name ?? 'Class') + ' ' + plan.clsLvl}</h3>
        {plan.steps.filter((s) => s.kind !== 'hp' && s.kind !== 'prereq').map((s) => (
          <div key={s.key} className="col">
            <span>{s.title}</span>
            {s.warn && <span className="small picker-warn">{s.warn}</span>}
          </div>
        ))}
      </div>
    );
  } else {
    let dry: ReturnType<typeof applyLevel> | null = null, error = '';
    try { dry = applyLevel(c, plan, answers, cat); } catch (e) { error = e instanceof Error ? e.message : String(e); }
    body = dry ? <Summary c={c} dry={dry} plan={plan.steps} cat={cat} useTable={answers.useTable ?? []} setUseTable={(u) => set((a) => ({ ...a, useTable: u }))} />
      : <div role="status" className="notice notice-blue">{error}</div>;
    showNext = false;
    next = undefined;
    const finish = dry ? () => onFinish(dry!.c, pick!, answers) : undefined;
    return (
      <div className="col gap-12">
        {bar}
        {body}
        <div className="row wrap gap-8">
          <button type="button" className="btn" onClick={() => go(idx - 1)}>Back</button>
          <button type="button" className="btn btn-primary" aria-disabled={!finish} onClick={() => finish?.()}>Finish</button>
        </div>
      </div>
    );
  }
  return (
    <Sheet.Provider value={ctx}>
      <div className="col gap-12">
        {bar}
        {body}
        <Nav back={fixedPick && idx === 0 ? null : () => go(idx - 1)} next={showNext ? next : null} />
      </div>
    </Sheet.Provider>
  );
}

// Back and Next; next undefined: shown disabled; null: not shown (ChoiceFlow brings its own).
function Nav({ back, next }: { back: (() => void) | null; next: (() => void) | undefined | null }) {
  return (
    <div className="row wrap gap-8">
      {back && <button type="button" className="btn" onClick={back}>Back</button>}
      {next !== null && <button type="button" className="btn btn-primary" aria-disabled={!next} onClick={() => next?.()}>Next</button>}
    </div>
  );
}

// Which class gets the level: a card per current class, then "+ Add a class" (the catalog's other classes, or with no
// catalog a typed name and its hit die).
function ClassScreen({ c, cat, pick, onPick }: { c: Character; cat: Catalog | null; pick: ClassPick | null; onPick: (p: ClassPick) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [die, setDie] = useState<Die>(8);
  const others = cat ? entriesOf(cat, 'class').filter((e) => !c.classes.some((r) => r.clsId === e.id)) : [];
  const picked = (p: ClassPick) => JSON.stringify(p) === JSON.stringify(pick);
  return (
    <div className="col gap-8">
      <h3 className="block-title">Which class gets the level?</h3>
      <div className="row wrap gap-6">
        {c.classes.map((r) => (
          <button key={r.id} type="button" className="pick-opt" aria-pressed={picked({ row: r.id })} onClick={() => onPick({ row: r.id })}>
            <span className="col"><span>{(r.name || 'Level') + ' ' + r.lvl + ' → ' + (r.lvl + 1)}</span><span className="small">d{r.hd}{r.sub ? ' · ' + r.sub : ''}</span></span>
          </button>
        ))}
        <button type="button" className="btn btn-add" aria-expanded={adding} onClick={() => setAdding(!adding)}>+ Add a class</button>
      </div>
      {adding && cat && (
        <div className="row wrap gap-6">
          {others.map((e: ClassEntry) => (
            <button key={e.id} type="button" className="pick-opt" aria-pressed={picked({ cls: e.id })} onClick={() => onPick({ cls: e.id })}>
              <span className="col"><span>{e.name}</span><span className="small">d{e.hd}{prereqCheck(c, e, cat).ok ? '' : ' · prerequisite not met'}</span></span>
            </button>
          ))}
        </div>
      )}
      {adding && !cat && (
        <div className="row wrap gap-8" style={{ alignItems: 'flex-end' }}>
          <label className="field">Class name<input type="text" className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field">Hit die
            <select className="input" value={String(die)} onChange={(e) => setDie(Number(e.target.value) as Die)}>{DICE.map((d) => <option key={d} value={d}>d{d}</option>)}</select>
          </label>
          <button type="button" className="btn" aria-disabled={!name.trim()} onClick={() => name.trim() && onPick({ name: name.trim(), hd: die })}>Use this class</button>
        </div>
      )}
    </div>
  );
}

// HP for the level: the fixed value or a typed roll of the die (no dice in the app), shown with CON and its minimum of 1.
function HpScreen({ die, con, value, onChange }: { die: Die; con: number; value: LevelAnswers['hp']; onChange: (hp: LevelAnswers['hp']) => void }) {
  const [text, setText] = useState(value?.mode === 'roll' ? String(value.val) : '');
  const fixed = fixedHp(die);
  const typed = (v: string) => {
    setText(v);
    const n = Number(v);
    onChange(v.trim() && Number.isInteger(n) && n >= 1 && n <= die ? { mode: 'roll', val: n } : undefined);
  };
  return (
    <div className="col gap-8">
      <h3 className="block-title">Hit points</h3>
      <div className="row wrap gap-8" style={{ alignItems: 'center' }}>
        <button type="button" className="pick-opt" aria-pressed={value?.mode === 'fixed'} onClick={() => { setText(''); onChange({ mode: 'fixed', val: fixed }); }}>Fixed ({fixed})</button>
        <span className="muted">or</span>
        <label className="row gap-6">Rolled (1–{die})
          <input type="text" inputMode="numeric" className="input input-num" aria-label="HP roll" value={text} onChange={(e) => typed(e.target.value)} />
        </label>
      </div>
      {value && <span>+{Math.max(1, value.val + con)} HP with CON ({con >= 0 ? '+' : '−'}{Math.abs(con)}), at least 1</span>}
    </div>
  );
}

function SubclassScreen({ cat, raised, step, value, onChange }: { cat: Catalog | null; raised: Character; step: Step; value?: string; onChange: (v: string) => void }) {
  const opts = cat && step.choice?.pool ? poolOptions(cat, raised, step.choice.pool, {}) : [];
  const typed = value?.startsWith('name:') ? value.slice(5) : '';
  return (
    <div className="col gap-8">
      <h3 className="block-title">Subclass</h3>
      <div className="row wrap gap-6">
        {opts.map((o) => <button key={o.value} type="button" className="pick-opt" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}
      </div>
      <label className="field">Other: type a name
        <input type="text" className="input" value={typed} onChange={(e) => onChange('name:' + e.target.value)} />
      </label>
      {typed && <span className="small picker-warn">A typed subclass adds no features: add them by hand.</span>}
    </div>
  );
}

// Ability Score Improvement or a feat (Epic Boon at 19): pick the feat, then its choices.
function AsiScreen({ cat, raised, step, value, onChange }: { cat: Catalog; raised: Character; step: Step; value: LevelAnswers['asi']; onChange: (v: LevelAnswers['asi']) => void }) {
  const [feat, setFeat] = useState(value?.feat ?? '');
  const ch = step.entry ? choicesOf(step.entry)[0] as ChoiceSpec | undefined : undefined;
  const opts = ch?.pool ? poolOptions(cat, raised, ch.pool, {}) : [];
  const e = feat ? cat.byId.get(feat) : undefined;
  return (
    <div className="col gap-8">
      <h3 className="block-title">{step.title}</h3>
      {step.warn && <div role="status" className="notice notice-blue">{step.warn}</div>}
      <div className="row wrap gap-6">
        {opts.map((o) => <button key={o.value} type="button" className="pick-opt" aria-pressed={feat === o.value} onClick={() => { setFeat(o.value); onChange(undefined); }}>{o.label}</button>)}
      </div>
      {e && <ChoiceFlow key={feat} entry={e} cat={cat} initial={value?.feat === feat ? { answers: value.flow, at: 0 } : undefined}
        onDone={(_, st) => onChange({ feat, flow: st.answers })} onCancel={() => setFeat('')} />}
      {value && <span className="muted">Chosen: {cat.byId.get(value.feat)?.name}</span>}
    </div>
  );
}

// New cantrips or spells to prepare: the class's list up to the highest level it prepares on its own (PHB p.45).
function SpellScreen({ cat, step, value, onChange }: { cat: Catalog | null; step: Step; value: string[]; onChange: (ids: string[]) => void }) {
  const spells = cat ? entriesOf(cat, 'spell').filter((e) => e.classes.split(',').includes(step.list ?? '') && (step.kind === 'cantrips' ? e.lvl === 0 : e.lvl >= 1 && e.lvl <= (step.maxLvl ?? 0))) : [];
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : value.length < (step.owed ?? 0) ? [...value, id] : value);
  return (
    <div className="col gap-8">
      <h3 className="block-title">{step.title}</h3>
      {step.warn && <span className="small">{step.warn}</span>}
      <span className="muted">{value.length} of {step.owed} chosen. You can also add spells later in the Spells tab.</span>
      <div className="row wrap gap-6">
        {spells.map((e) => <button key={e.id} type="button" className="pick-opt" aria-pressed={value.includes(e.id)} onClick={() => toggle(e.id)}>{e.name}{e.lvl ? ' (' + e.lvl + ')' : ''}</button>)}
      </div>
    </div>
  );
}

// A Weapon Mastery slot gained at this level: pick the weapon kinds (the Weapon Mastery rules, PHB p.91).
function MasteryScreen({ cat, step, value, onChange }: { cat: Catalog | null; step: Step; value: string[]; onChange: (m: string[]) => void }) {
  const kinds = cat ? entriesOf(cat, 'item').filter((e) => e.cat === 'weapon' && e.mastery).map((e) => ({ id: e.id.split('/')[1], name: e.name })) : [];
  const held = step.held ?? [];
  const toggle = (k: string) => onChange(value.includes(k) ? value.filter((x) => x !== k) : value.length < (step.owed ?? 0) ? [...value, k] : value);
  return (
    <div className="col gap-8">
      <h3 className="block-title">Weapon Mastery · choose {step.owed}</h3>
      <div className="row wrap gap-6">
        {kinds.map((k) => <button key={k.id} type="button" className="pick-opt" aria-pressed={value.includes(k.id)} aria-disabled={held.includes(k.id) || undefined} onClick={() => !held.includes(k.id) && toggle(k.id)}>{k.name}</button>)}
      </div>
    </div>
  );
}

// Every change the level makes, from the dry run: HP with the final CON, what is added, the slots, and fields kept
// because they were edited by hand (each with "Use the table instead").
function Summary({ c, dry, plan, cat, useTable, setUseTable }: {
  c: Character; dry: ReturnType<typeof applyLevel>; plan: Step[]; cat: Catalog | null; useTable: LevelKey[]; setUseTable: (u: LevelKey[]) => void;
}) {
  const x = dry.c, rec = x.levels.at(-1)!;
  const names = rec.added.map((ref) => {
    const [kind, id] = [ref.slice(0, ref.indexOf(':')), ref.slice(ref.indexOf(':') + 1)];
    const list = ({ feature: x.feats, spell: x.spells, item: x.inv, sense: x.senses, defense: x.defenses, res: x.res, attack: x.attacks } as Record<string, { id: string; name: string }[]>)[kind];
    return list?.find((e) => e.id === id)?.name;
  }).filter((s): s is string => !!s);
  const slots = JSON.stringify(c.slotMax) !== JSON.stringify(x.slotMax);
  return (
    <div className="col gap-8">
      <h3 className="block-title">Summary</h3>
      <span>HP {maxHpOf(c)} → {maxHpOf(x)}</span>
      {x.classes.map((r) => <span key={r.id} className="small">{(r.name || 'Level') + ' ' + r.lvl}{r.sub ? ' (' + r.sub + ')' : ''}</span>)}
      {names.length > 0 && <span>Added: {[...new Set(names)].join(', ')}</span>}
      {slots && <span>Spell slots: {x.slotMax.slice(1).map((n, i) => (n ? `${n}×${i + 1}` : '')).filter(Boolean).join(', ')}</span>}
      {(x.pactMax !== c.pactMax || x.pactLvl !== c.pactLvl) && <span>Pact slots: {x.pactMax} at level {x.pactLvl}</span>}
      {dry.kept.map((k) => (
        <label key={k.key} className="check">
          <input type="checkbox" checked={useTable.includes(k.key)} onChange={(e) => setUseTable(e.target.checked ? [...useTable, k.key] : useTable.filter((y) => y !== k.key))} />
          {k.key === 'slotMax' ? 'Spell slots' : k.key} edited by hand, not changed (the table gives {Array.isArray(k.table) ? (k.table as number[]).slice(1).filter(Boolean).join('/') : String(k.table)}). Use the table instead
        </label>
      ))}
      {(!cat || plan.some((s) => s.kind === 'nocat')) && <span role="status" className="picker-warn">Features are added by hand.</span>}
    </div>
  );
}

// Undoing the last level: what goes, what stays, and fields edited since that stay as they are; then confirm.
export function UndoLevelPrompt({ c, onConfirm, onCancel }: { c: Character; onConfirm: () => void; onCancel: () => void }) {
  const p = undoPreview(c), rec = c.levels.at(-1);
  if (!p || !rec) return null;
  const row = c.classes.find((r) => r.id === rec.cls);
  return (
    <section aria-label="Undo level" className="block notice notice-blue col gap-8">
      <strong>Undo level {rec.n}{row ? ' (' + (row.name || 'Level') + ' ' + row.lvl + ')' : ''}?</strong>
      {/* The real drop: the level's stored gain plus its CON part (conHpPart), not rec.hp.gain alone; unfloored, as maxHpOf's floor at 1 would hide it. */}
      <span>HP maximum −{maxHpRaw(c) - maxHpRaw(undoLevel(c))}.</span>
      {p.summary.goes.length > 0 && <span>Removes: {p.summary.goes.join(', ')}.</span>}
      {p.summary.keep.map((k) => <span key={k} className="small">{k}</span>)}
      {p.unrestored.length > 0 && <span className="small">Edited since, left as they are: {p.unrestored.map((k) => (k === 'slotMax' ? 'spell slots' : k)).join(', ')}.</span>}
      <div className="row wrap gap-8">
        <button type="button" className="btn btn-danger" onClick={onConfirm}>Undo the level</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
