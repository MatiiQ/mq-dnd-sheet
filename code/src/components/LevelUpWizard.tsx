// The level-up wizard (spec 2026-11-06 §3): which class gets the level, the level's steps from levelPlan, then a
// summary that is a dry run of applyLevel (pure), and Finish. Full screen. The steps read the sheet with the class level
// already raised (withLevel), so ChoiceFlow and the lists ask the counts of the new level; answers never touch the sheet
// until Finish.
import { useState, type ReactNode } from 'react';
import { blocksPick, choicesOf, poolOptions, type PoolOption } from '../catalog/copy';
import { togglePick, type FlowAnswers } from '../catalog/flow';
import { entriesOf, type Catalog } from '../catalog/merge';
import type { ChoiceSpec, ClassEntry } from '../catalog/schema';
import { useCatalog } from '../catalog/useCatalog';
import { applyLevel, asks, fixedHp, levelPlan, levelScreens, levelSpellOptions, masteryOptions, prereqCheck, undoLevel, undoPreview, withLevel, type ClassPick, type LevelAnswers, type LevelScreenSpec, type Plan, type Step } from '../levelup';
import { abilityMod, maxHpOf, maxHpRaw, normName, totalLevel } from '../logic';
import { Sheet, useSheet } from '../sheet';
import type { Character, Die, LevelKey } from '../types';
import { ChoiceFlow } from './pickers/ChoiceFlow';
import { ChoiceTile, firstSentence, Stepper, type StepperStage } from './ui';

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

// The class pick, then the level's screens (levelScreens) with a Stepper, Back/Next and the summary's Finish. The creator
// reuses LevelScreen for its levels. onFinish also gets the class pick and the answers.
export function LevelSteps({ c, cat, onFinish }: { c: Character; cat: Catalog | null; onFinish: (next: Character, pick: ClassPick, answers: LevelAnswers) => void }) {
  const only = c.classes.length === 1 ? c.classes[0] : undefined;
  const [pick, setPick] = useState<ClassPick | null>(only ? { row: only.id } : null);
  const [answers, setAnswers] = useState<LevelAnswers>(EMPTY);
  const [at, setAt] = useState(-1);   // -1: the class screen
  if (totalLevel(c) >= 20) return <span role="status">Level 20: nothing more to gain.</span>;
  const plan = pick ? levelPlan(c, pick, cat, answers) : null;
  const raised = pick ? withLevel(c, pick, cat).c : c;
  const screens = plan ? levelScreens(raised, plan, cat, answers, { summary: true, review: true }) : [];
  const choose = (p: ClassPick) => { setPick(p); setAnswers(EMPTY); };
  const prereq = plan?.steps.find((s) => s.kind === 'prereq');
  const classOk = !!plan && (!prereq?.warn || !!answers.anyway);
  const idx = at < 0 || !plan ? -1 : Math.min(at, screens.length - 1);
  const go = (i: number) => setAt(Math.max(-1, Math.min(screens.length - 1, i)));
  // A stage is open when every screen before it is ready.
  const openUpTo = screens.findIndex((x) => !x.ready);
  const stages: StepperStage[] = [
    { id: 'class', label: 'Class', state: idx < 0 ? 'current' : 'done', enabled: true },
    ...screens.map((x, i): StepperStage => ({ id: x.key, label: x.title, state: i === idx ? 'current' : x.ready && i < idx ? 'done' : 'ahead',
      enabled: classOk && (openUpTo < 0 || i <= openUpTo) }))
  ];
  const screen = idx >= 0 ? screens[idx] : null;
  const line = screen ? `${screen.title} (${idx + 1} of ${screens.length})` : 'Class';
  const stepper = <Stepper stages={stages} line={line} onJump={(id) => (id === 'class' ? setAt(-1) : go(screens.findIndex((x) => x.key === id)))} />;

  if (!screen || !plan) {
    return (
      <div className="col gap-12">
        {plan && stepper}
        <ClassScreen c={c} cat={cat} pick={pick} onPick={choose} />
        {prereq && <div role="status" className={prereq.warn ? 'notice notice-blue col gap-6' : 'muted'}>
          <span>{prereq.warn ?? prereq.title}</span>
          {prereq.warn && <label className="check"><input type="checkbox" checked={!!answers.anyway} onChange={(e) => setAnswers((a) => ({ ...a, anyway: e.target.checked || undefined }))} />Do it anyway</label>}
        </div>}
        <Nav back={null} next={classOk ? () => setAt(0) : undefined} />
      </div>
    );
  }
  if (screen.kind === 'summary') {
    let dry: ReturnType<typeof applyLevel> | null = null, error = '';
    try { dry = applyLevel(c, plan, answers, cat); } catch (e) { error = e instanceof Error ? e.message : String(e); }
    const finish = dry ? () => onFinish(dry!.c, pick!, answers) : undefined;
    return (
      <div className="col gap-12">
        {stepper}
        {dry ? <Summary c={c} dry={dry} plan={plan.steps} cat={cat} useTable={answers.useTable ?? []} setUseTable={(u) => setAnswers((a) => ({ ...a, useTable: u }))} />
          : <div role="status" className="notice notice-blue">{error}</div>}
        <div className="row wrap gap-8">
          <button type="button" className="btn" onClick={() => go(idx - 1)}>Back</button>
          <button type="button" className="btn btn-primary" aria-disabled={!finish} onClick={() => finish?.()}>Finish</button>
        </div>
      </div>
    );
  }
  return (
    <div className="col gap-12">
      {stepper}
      <LevelScreen cat={cat} c={raised} plan={plan} screen={screen} answers={answers} set={setAnswers} />
      {!screen.ready && screen.missing && <span className="small" role="status">{screen.missing}</span>}
      <Nav back={() => go(idx - 1)} next={screen.ready ? () => go(idx + 1) : undefined} />
    </div>
  );
}

// Back and Next; next undefined: shown disabled; null: not shown.
function Nav({ back, next }: { back: (() => void) | null; next: (() => void) | undefined | null }) {
  return (
    <div className="row wrap gap-8">
      {back && <button type="button" className="btn" onClick={back}>Back</button>}
      {next !== null && <button type="button" className="btn btn-primary" aria-disabled={!next} onClick={() => next?.()}>Next</button>}
    </div>
  );
}

// One screen of a level (levelScreens), shared by the level-up wizard and the creator. c: the raised character, which
// the screens read through the Sheet context. review: false when the screens were listed without the review questions
// (the creator). header: shown above the features screen.
export function LevelScreen({ cat, c, plan, screen, answers, set, header, review = true }: {
  cat: Catalog | null; c: Character; plan: Plan; screen: LevelScreenSpec; answers: LevelAnswers;
  set: (f: (a: LevelAnswers) => LevelAnswers) => void; header?: ReactNode; review?: boolean;
}) {
  const ctx = { c, update: () => {}, edit: false, form: null, setForm: () => {}, focus: null, reveal: () => {}, markFocusUsed: () => {} };
  let body: ReactNode = null;
  if (screen.kind === 'features') body = <FeaturesScreen plan={plan} header={header} />;
  else if (screen.kind === 'step') {
    const s = screen.step;
    if (s.kind === 'hp') {
      // The row gaining the level, found as withLevel finds it from the pick.
      const pk = plan.pick;
      const row = 'row' in pk ? c.classes.find((r) => r.id === pk.row) : 'cls' in pk ? c.classes.find((r) => r.clsId === pk.cls) : c.classes.find((r) => !r.clsId && r.name === pk.name);
      body = <HpScreen die={row?.hd ?? 8} con={abilityMod(c, 'con')} value={answers.hp} onChange={(hp) => set((a) => ({ ...a, hp }))} />;
    } else if (s.kind === 'subclass') body = <SubclassScreen cat={cat} raised={c} step={s} value={answers.sub} onChange={(sub) => set((a) => ({ ...a, sub }))} />;
    else if (s.kind === 'asi' && cat) body = <AsiScreen cat={cat} raised={c} step={s} value={answers.asi} onChange={(asi) => set((a) => ({ ...a, asi }))} />;
    else if (s.kind === 'cantrips' || s.kind === 'prepare') body = <SpellScreen cat={cat} step={s} value={answers.spells[s.key] ?? []} onChange={(ids) => set((a) => ({ ...a, spells: { ...a.spells, [s.key]: ids } }))} />;
    else if (s.kind === 'mastery') body = <MasteryScreen cat={cat} step={s} value={answers.mastery ?? []} onChange={(m) => set((a) => ({ ...a, mastery: m }))} />;
  } else if (screen.kind === 'flow' && cat) {
    const s = screen.step, key = s.key;
    const flow = screen.store === 'asi' ? answers.asi?.flow ?? {} : answers.flows[key] ?? {};
    const onAnswers = (u: (cur: FlowAnswers) => FlowAnswers) => set((a) => (screen.store === 'asi'
      ? (a.asi ? { ...a, asi: { ...a.asi, flow: u(a.asi.flow) } } : a)
      : { ...a, flows: { ...a.flows, [key]: u(a.flows[key] ?? {}) } }));
    const own = screen.store === 'flows';
    body = (
      <>
        {s.warn && <div role="status" className="notice notice-blue">{s.warn}</div>}
        <ChoiceFlow entry={screen.entry} cat={cat} at={screen.at} answers={flow} onAnswers={onAnswers} onDone={() => {}} onCancel={() => {}}
          noCounts={!review} noLinks={!review} {...(own && s.held ? { held: s.held } : {})} {...(own && s.choice && s.owed !== undefined ? { pick: { [s.choice.id]: s.owed } } : {})}
          {...(plan.cls ? { ctx: { castAb: plan.cls.castAb, className: plan.cls.name } } : {})} />
      </>
    );
  }
  return <Sheet.Provider value={ctx}><div className="col gap-8">{body}</div></Sheet.Provider>;
}

// What the level gives: one tile per feature of the plan, then the warnings of steps that have no screen of their own.
function FeaturesScreen({ plan, header }: { plan: Plan; header?: ReactNode }) {
  const feats = plan.steps.filter((s) => s.kind === 'feature' && s.entry);
  const warns = plan.steps.filter((s) => s.warn && !asks(s) && s.kind !== 'prereq');
  return (
    <div className="col gap-8">
      {header}
      <h3 className="block-title">What level {plan.n} gives</h3>
      {feats.length > 0 ? (
        <div className="tile-grid">
          {feats.map((s) => {
            const desc = s.entry!.desc ?? '';
            return <ChoiceTile key={s.key} title={s.title} selected={false} body={desc ? firstSentence(desc) : undefined} more={desc && firstSentence(desc) !== desc.trim() ? desc : undefined} />;
          })}
        </div>
      ) : <span className="muted">No new features at this level.</span>}
      {warns.map((s) => <div key={s.key} role="status" className="notice notice-blue">{s.warn}</div>)}
    </div>
  );
}

// Which class gets the level: a card per current class, then "+ Add a class" (the catalog's other classes, or with no
// catalog a typed name and its hit die).
export function ClassScreen({ c, cat, pick, onPick }: { c: Character; cat: Catalog | null; pick: ClassPick | null; onPick: (p: ClassPick) => void }) {
  // A new class picked already (the creator's stored pick): the class list starts open, so its pressed tile shows.
  const [adding, setAdding] = useState(!!pick && 'cls' in pick && !c.classes.some((r) => r.clsId === pick.cls));
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
      <div className="tile-grid">
        {opts.map((o) => <ChoiceTile key={o.value} title={o.label} selected={value === o.value} {...descTile(o.entry?.desc)} onSelect={() => onChange(o.value)} />)}
      </div>
      <label className="field">Other: type a name
        <input type="text" className="input" value={typed} onChange={(e) => onChange('name:' + e.target.value)} />
      </label>
      {typed && <span className="small picker-warn">A typed subclass adds no features: add them by hand.</span>}
    </div>
  );
}

// A tile's body and More from a description: the first sentence, and the whole text when there is more.
const descTile = (desc?: string, extra?: string) => {
  const d = desc ?? '';
  const more = [d, extra].filter(Boolean).join('\n\n');
  return { ...(d ? { body: firstSentence(d) } : {}), ...(more && more.trim() !== firstSentence(d) ? { more } : {}) };
};

// Ability Score Improvement or a feat (Epic Boon at 19): pick the feat; its choices follow as their own screens. A feat
// already on the sheet (not repeatable) can be tapped out, never in.
function AsiScreen({ cat, raised, step, value, onChange }: { cat: Catalog; raised: Character; step: Step; value: LevelAnswers['asi']; onChange: (v: LevelAnswers['asi']) => void }) {
  const ch = step.entry ? choicesOf(step.entry)[0] as ChoiceSpec | undefined : undefined;
  const opts = ch?.pool ? poolOptions(cat, raised, ch.pool, {}) : [];
  const cur = value ? [value.feat] : [];
  const tap = (o: PoolOption) => {
    if (!ch) return;
    const next = togglePick(ch, cur, o.value, { blocked: blocksPick(o.value, { option: o }) });
    if (next) onChange(next.length ? { feat: next[0], flow: {} } : undefined);
  };
  return (
    <div className="col gap-8">
      <h3 className="block-title">{step.title}</h3>
      {step.warn && <div role="status" className="notice notice-blue">{step.warn}</div>}
      <div className="tile-grid">
        {opts.map((o) => {
          const held = blocksPick(o.value, { option: o });
          return <ChoiceTile key={o.value} title={o.label} selected={cur.includes(o.value)} held={held} picked={cur.includes(o.value)} warn={!!o.unmet}
            meta={o.unmet ? 'Needs ' + o.unmet.join(', ') : undefined} {...descTile(o.entry?.desc)} onSelect={() => tap(o)} />;
        })}
      </div>
    </div>
  );
}

// New cantrips or spells to prepare: the class's list up to the highest level it prepares on its own (PHB p.45),
// grouped by level, with a search above 12.
function SpellScreen({ cat, step, value, onChange }: { cat: Catalog | null; step: Step; value: string[]; onChange: (ids: string[]) => void }) {
  const { c } = useSheet();
  const [query, setQuery] = useState('');
  const spells = levelSpellOptions(cat, c, step);
  const q = normName(query);
  const shown = q ? spells.filter((e) => normName(e.name).includes(q)) : spells;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : value.length < (step.owed ?? 0) ? [...value, id] : value);
  const levels = [...new Set(shown.map((e) => e.lvl))].sort((x, y) => x - y);
  return (
    <div className="col gap-8">
      <h3 className="block-title">{step.title}</h3>
      {step.warn && <span className="small">{step.warn}</span>}
      <span className="muted">{value.length} of {step.owed} chosen. You can also add spells later in the Spells tab.</span>
      {spells.length > 12 && <input type="search" className="input" aria-label="Search the spells" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />}
      {levels.map((l) => (
        <div key={l} className="col gap-6">
          <span className="label">{l === 0 ? 'Cantrips' : 'Level ' + l}</span>
          <div className="tile-grid">
            {shown.filter((e) => e.lvl === l).map((e) => (
              <ChoiceTile key={e.id} title={e.name} selected={value.includes(e.id)} onSelect={() => toggle(e.id)}
                meta={[e.school, e.time, e.range, e.conc && 'Concentration', e.ritual && 'Ritual'].filter(Boolean).join(' · ')}
                {...descTile(e.desc, e.higher)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// A Weapon Mastery slot gained at this level: pick the weapon kinds (the Weapon Mastery rules, PHB p.91). A kind
// already on the sheet can be tapped out, never in.
function MasteryScreen({ cat, step, value, onChange }: { cat: Catalog | null; step: Step; value: string[]; onChange: (m: string[]) => void }) {
  const kinds = masteryOptions(cat);
  const held = step.held ?? [];
  const toggle = (k: string) => {
    if (value.includes(k)) onChange(value.filter((x) => x !== k));
    else if (!held.includes(k) && value.length < (step.owed ?? 0)) onChange([...value, k]);
  };
  return (
    <div className="col gap-8">
      <h3 className="block-title">Weapon Mastery · choose {step.owed}</h3>
      <div className="tile-grid">
        {kinds.map((k) => <ChoiceTile key={k.id} title={k.name} selected={value.includes(k.id)} held={held.includes(k.id)} picked={value.includes(k.id)} onSelect={() => toggle(k.id)} />)}
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
