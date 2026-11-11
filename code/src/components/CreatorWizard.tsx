// The character creator (spec 2026-11-08 §2): one guided flow, a screen per question, from Class to Summary, with a
// Stepper. It holds answers only; every screen, its readiness and the preview come from creatorScreens (replay with the
// creator's temporary answers), and Create replays without them, so the two can't differ. The answers and the screen
// key are saved as a draft after every change.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Catalog } from '../catalog/merge';
import { useCatalog } from '../catalog/useCatalog';
import {
  creatorScreens, defaultLevel, details, DRAFT_VERSION, ensureLevel, firstOpen, nextOpen, replay, setFirst, setLevelAns, setLevelPick, staleStep, stepperModel,
  toAnswerPick, writeDraft, type CreatorAnswers, type Draft, type Screen
} from '../creator';
import type { ClassPick, LevelAnswers } from '../levelup';
import type { Character } from '../types';
import { Bonus, ClassSkills, ClassTiles, Details, Equipment, Languages, OriginChoice, OriginTiles, Scores, StartLevel, Summary, type ScreenProps } from './CreatorScreens';
import { ClassScreen, LevelScreen } from './LevelUpWizard';
import { Stepper } from './ui';

export const NEW_ANSWERS = (): CreatorAnswers => ({
  cls: '', start: 1, bgFlow: {}, spFlow: {}, skills: [], languages: [], method: 'array', scores: {},
  details: { name: '', align: '', appearance: '', notes: '' }, first: { flows: {}, spells: {} }, levels: []
});
const NO_DETAILS = NEW_ANSWERS().details;
const isNote = (d: string) => d.startsWith('Class skill ');

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
  const set = (f: (x: CreatorAnswers) => CreatorAnswers) => setA(f);
  // A draft naming catalog ids the catalog no longer has (a pack change) reopens at the first screen that names one.
  const [stale] = useState(() => (initial ? staleStep(cat, initial.answers) : null));
  // The screen list, recomputed when the answers (without the details: typing a name must not replay 20 levels) or the
  // catalog change.
  const { details: _d, passed: _p, ...rest } = a;
  const key = JSON.stringify(rest);
  const r = useMemo(() => creatorScreens(cat, { ...a, details: NO_DETAILS }, { fill: true }), [cat, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const listed = (k?: string | null) => !!k && r.screens.some((x) => x.key === k);
  const [at, setAt] = useState(() => (listed(stale) ? stale! : listed(initial?.step) ? initial!.step : firstOpen(r.screens)));
  // When the current screen leaves the list, the flow moves to the first screen after it that isn't ready.
  const prev = useRef<Screen[]>(r.screens);
  const cur = listed(at) ? at : nextOpen(prev.current, r.screens, at);
  useEffect(() => { prev.current = r.screens; if (cur !== at) setAt(cur); }, [r, cur, at]);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const warned = useRef(false);
  // The draft follows every answer and every move, so Close or a closed app loses nothing; nothing before a class.
  useEffect(() => {
    if (!a.cls) return;
    if (!writeDraft({ v: DRAFT_VERSION, step: cur, answers: a }) && !warned.current) { warned.current = true; setSaveMsg('Draft couldn’t be saved: storage is full. You can still finish, but closing the app loses this character.'); }
  }, [a, cur]);
  const created = useRef(false);
  const [refused, setRefused] = useState<string[]>([]);

  const screen = r.screens.find((x) => x.key === cur) ?? r.screens[0];
  const idx = r.screens.indexOf(screen);
  const m = stepperModel(r, screen.key, a.start, a.passed ?? []);
  const blocking = r.replay.dropped.filter((d) => !isNote(d));
  const createOk = r.screens.every((x) => x.ready) && a.levels.length >= a.start - 1 && blocking.length === 0;
  const create = () => {
    if (!createOk) return;
    const real = replay(cat, a);
    const bad = real.dropped.filter((d) => !isNote(d));
    if (bad.length) { setRefused(bad); return; }
    // Set only now, after every check: a refused click never locks the button, a second tap never adds a second character.
    if (created.current) return;
    created.current = true;
    onCreate(real.c);
  };
  const props: ScreenProps = { cat, a, set, r: r.replay };
  const b = screen.body;
  let body: ReactNode = null;
  switch (b.kind) {
    case 'class': body = <ClassTiles {...props} />; break;
    case 'start': body = <StartLevel {...props} />; break;
    case 'background': body = <OriginTiles {...props} kind="background" />; break;
    case 'species': body = <OriginTiles {...props} kind="species" />; break;
    case 'origin-choice': body = <OriginChoice {...props} source={b.source} step={b.step} c={b.c} />; break;
    case 'languages': body = <Languages {...props} />; break;
    case 'skills': body = <ClassSkills {...props} />; break;
    case 'scores': body = <Scores {...props} />; break;
    case 'bonus': body = <Bonus {...props} />; break;
    case 'equipment': body = <Equipment {...props} />; break;
    case 'details': body = <Details {...props} />; break;
    case 'level': body = <LevelBody cat={cat} a={a} set={set} screen={screen} title={r.stages.find((x) => x.id === screen.stage)?.title ?? ''} />; break;
    // Fill only changes unfinished answers, so once every screen is ready the memoized replay is what Create builds.
    case 'summary': body = <Summary a={a} preview={details(r.replay.c, a)} cat={cat} />; break;
  }
  const last = screen.key === 'summary';
  return (
    <div className="col gap-12">
      <Stepper stages={m.stages} line={m.line} onJump={(id) => m.jump[id] && setAt(m.jump[id])} />
      {notice && <div role="status" className="notice notice-blue">{notice}</div>}
      {stale !== null && <div role="status" className="notice notice-blue">Some of this draft’s choices are no longer in the rules data: choose them again from here.</div>}
      {saveMsg && <div role="status" className="notice notice-blue">{saveMsg}</div>}
      {(blocking.length > 0 || refused.length > 0) && <div role="status" className="notice notice-blue">No longer fits, left out: {(blocking.length ? blocking : refused).join('; ')}.</div>}
      <div key={screen.key}>{body}</div>
      <div className="col gap-6">
        <div className="row wrap gap-8">
          {idx > 0 && <button type="button" className="btn" onClick={() => setAt(r.screens[idx - 1].key)}>Back</button>}
          {!last && <button type="button" className="btn btn-primary" aria-disabled={!screen.ready} onClick={() => {
            if (!screen.ready) return;
            // Only Next ticks a screen: a Stepper jump would tick always-ready screens the player never saw.
            set((x) => ({ ...x, passed: x.passed?.includes(screen.key) ? x.passed : [...(x.passed ?? []), screen.key] }));
            setAt(r.screens[idx + 1].key);
          }}>Next</button>}
          {last && <button type="button" className="btn btn-primary" aria-disabled={!createOk} onClick={create}>Create character</button>}
        </div>
        {!screen.ready && screen.missing && <span className="small" role="status">{screen.missing}</span>}
      </div>
    </div>
  );
}

// A level's screen. Level n ≥ 2's features screen creates the level's answers once (an effect, never during render:
// ensureLevel is a no-op on an existing entry), and holds "Change class" with the multiclass prerequisite.
function LevelBody({ cat, a, set, screen, title }: { cat: Catalog; a: CreatorAnswers; set: (f: (x: CreatorAnswers) => CreatorAnswers) => void; screen: Screen; title: string }) {
  const b = screen.body as Extract<Screen['body'], { kind: 'level' }>;
  const n = b.n, features = b.screen.kind === 'features';
  useEffect(() => { if (n >= 2 && features && !a.levels[n - 2]) set((x) => ensureLevel(x, n - 2)); }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  const setL = (f: (x: LevelAnswers) => LevelAnswers) => set((x) => (n === 1 ? setFirst(x, f) : setLevelAns(x, n - 2, f)));
  const ans = n === 1 ? a.first : a.levels[n - 2]?.ans ?? defaultLevel(a, n - 2).ans;
  const header = features ? (n === 1 ? <h3 className="block-title">{title}</h3> : <ChangeClass cat={cat} a={a} set={set} n={n} before={b.before} title={title} prereq={b.plan.steps.find((s) => s.kind === 'prereq')} ans={ans} setL={setL} />) : undefined;
  return <LevelScreen cat={cat} c={b.c} plan={b.plan} screen={b.screen} answers={ans} set={setL} header={header} review={false} />;
}

// "Level N: <class>" and, in place, today's class screen: the class of the level defaults to the level before's.
function ChangeClass({ cat, a, set, n, before, title, prereq, ans, setL }: {
  cat: Catalog; a: CreatorAnswers; set: (f: (x: CreatorAnswers) => CreatorAnswers) => void; n: number; before: Character; title: string;
  prereq?: { warn?: string; title: string }; ans: LevelAnswers; setL: (f: (x: LevelAnswers) => LevelAnswers) => void;
}) {
  const [open, setOpen] = useState(false);
  const stored = (a.levels[n - 2] ?? defaultLevel(a, n - 2)).pick;
  // ClassScreen marks a row by its id: the stored pick is mapped back to the row of `before` that it names.
  const row = 'cls' in stored ? before.classes.find((x) => x.clsId === stored.cls) : before.classes.find((x) => !x.clsId && x.name === stored.name);
  const shown: ClassPick = row ? { row: row.id } : stored;
  return (
    <div className="col gap-8">
      <div className="row wrap between gap-8" style={{ alignItems: 'center' }}>
        <h3 className="block-title">{title}</h3>
        <button type="button" className="btn btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>Change class</button>
      </div>
      {open && <ClassScreen c={before} cat={cat} pick={shown} onPick={(p) => set((x) => setLevelPick(x, n - 2, toAnswerPick(before, p)))} />}
      {prereq && (prereq.warn || open) && (
        <div role="status" className={prereq.warn ? 'notice notice-blue col gap-6' : 'muted'}>
          <span>{prereq.warn ?? prereq.title}</span>
          {prereq.warn && <label className="check"><input type="checkbox" checked={!!ans.anyway} onChange={(e) => setL((x) => ({ ...x, anyway: e.target.checked || undefined }))} />Do it anyway</label>}
        </div>
      )}
    </div>
  );
}
