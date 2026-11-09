// The character creator's answers (spec 2026-11-06 §4) and what they build. The creator stores answers, never a
// character: replay builds the character from them with the same applyLevel calls Finish uses, so the preview and the
// result are the same function. Answers name catalog ids and step keys only, never a generated id, so they replay on a
// fresh sheet. The draft (the answers and the step) lives in its own key, never in a character or the backup.
import { addFromCatalog, addPackage, choicesOf, validPicks } from './catalog/copy';
import { buildChoices, choiceKey, choiceStepReady, choiceSteps, type ChoiceStep, type FlowAnswers } from './catalog/flow';
import { entriesOf, type Catalog } from './catalog/merge';
import type { ClassEntry, Entry } from './catalog/schema';
import { isObj } from './catalog/schema';
import { applyLevel, emptyCharacter, levelPlan, levelScreens, withLevel, type ClassPick, type LevelAnswers, type LevelScreenSpec, type Plan, type Step } from './levelup';
import type { StepperStage } from './components/ui';
import { abilityName, DICE, newId, skillLevel } from './logic';
import type { Ability, Character, Die } from './types';

export const DRAFT_KEY = 'dnd-draft', DRAFT_VERSION = 1;
export type AbilityMethod = 'array' | 'buy' | 'rolled';
export interface CreatorAnswers {
  cls: string; start: number;                                         // class catalog id, starting level 1–20
  equip?: 'A' | 'B' | 'none';                                         // the class's starting package; unset until answered
  rolled?: number[];                                                  // Rolled: the six totals (3–18), the pool the scores take
  background?: string; bgFlow: FlowAnswers; species?: string; spFlow: FlowAnswers;
  skills: string[];                                                   // the class skill picks: the one place they are stored
  languages: string[];                                                // the two chosen languages (Common is always added)
  method: AbilityMethod; scores: Partial<Record<Ability, number>>;    // base scores, before the background bonus
  details: { name: string; align: string; appearance: string; notes: string };
  first: LevelAnswers;                                                // level 1 of `cls`; its skill flow is built from `skills`
  firstDone?: boolean;                                                // an older draft's flag; still accepted, never written
  levels: { pick: { cls: string } | { name: string; hd: Die }; ans: LevelAnswers }[];  // levels[0] is level 2
}
// step: the key of the screen the creator was on ('origin/background', 'level/3/features').
export interface Draft { v: number; step: string; answers: CreatorAnswers }
// An older draft's step index (Class, Origin, Abilities, Details, Levels, Summary) → the first screen of that stage.
export const OLD_STEP_KEYS = ['class', 'origin/background', 'abilities/scores', 'details', 'level/1/features', 'summary'] as const;

// The stage a screen key belongs to, for the draft prompt and the Stepper.
export function stageName(key: string): string | undefined {
  const lv = /^level\/(\d+)(\/|$)/.exec(key);
  if (lv) return 'Level ' + lv[1];
  const head = key.split('/')[0];
  return ({ class: 'Class', origin: 'Origin', abilities: 'Abilities', equipment: 'Equipment', details: 'Details', summary: 'Summary' } as Record<string, string>)[head];
}

// Point Buy (PHB p.38): 27 points, scores 8–15, at these costs.
export const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUDGET = 27;
// Standard Array (PHB p.38).
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

// A class tile's two lines: "d12 · Primary: Strength · Saves: STR, CON", then the likes and complexity (Class Overview,
// PHB p.33) when the pack gives both, else the app's blurb.
export function classTileText(cls: ClassEntry): { meta: string; body: string } {
  const p = cls.primary;
  const primary = p ? p.split(/[,|]/).map((a) => abilityName(a as Ability)).join(p.includes('|') ? ' or ' : ' and ') : '';
  const meta = ['d' + cls.hd, primary && 'Primary: ' + primary, 'Saves: ' + cls.saves.split(',').map((x) => x.toUpperCase()).join(', ')].filter(Boolean).join(' · ');
  const { blurb = '', likes, complexity } = cls;
  return { meta, body: likes && complexity ? `Likes ${likes} · ${complexity} complexity` : blurb };
}
// The class's suggested Standard Array (PHB p.38), when it is a permutation of STANDARD_ARRAY.
export function classArray(cls: ClassEntry): Record<Ability, number> | undefined {
  const a = cls.stdArray;
  if (!a || !isObj(a)) return undefined;
  const vals = (['str', 'dex', 'con', 'int', 'wis', 'cha'] as Ability[]).map((k) => a[k]);
  return [...vals].sort((x, y) => y - x).every((n, i) => n === STANDARD_ARRAY[i]) ? a : undefined;
}
export const pointsSpent = (scores: Partial<Record<Ability, number>>) => Object.values(scores).reduce((t, s) => t + (POINT_COST[s ?? 8] ?? 0), 0);
// "4 dice each" (PHB p.38): the total of the highest three of four typed d6 rolls.
export const dropLowest = (dice: number[]) => [...dice].sort((a, b) => b - a).slice(0, 3).reduce((t, n) => t + n, 0);

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// The character before level 1: background and species, languages, the class's starting equipment and the scores.
// ---- Pure answer writers (the creator's screens call these; each returns new answers) ----

const ORDER: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
// Six values into the class's suggested Standard Array by rank (the highest value where it puts 15, and so on, PHB p.38),
// else the shortcut order: the primary abilities as written, then CON, then the rest in STR..CHA order.
export function arrayFill(cls: ClassEntry | undefined, values: number[]): Partial<Record<Ability, number>> {
  if (values.length !== 6) return {};
  const ranked = [...values].sort((x, y) => y - x);
  const target = cls && classArray(cls);
  if (target) return Object.fromEntries(ORDER.map((k) => [k, ranked[STANDARD_ARRAY.indexOf(target[k])]]));
  const prim = (cls?.primary ?? '').split(/[,|]/).filter(Boolean) as Ability[];
  const order = [...new Set([...prim, 'con' as Ability, ...ORDER])];
  return Object.fromEntries(order.map((k, i) => [k, ranked[i]]));
}
// The values the scores are assigned from: the Standard Array, or the rolled totals.
export const scorePool = (a: CreatorAnswers): number[] => (a.method === 'rolled' ? a.rolled ?? [] : STANDARD_ARRAY);
// A score counts as assigned when its value is in the pool.
export const assigned = (a: CreatorAnswers, ab: Ability) => a.scores[ab] !== undefined && scorePool(a).includes(a.scores[ab]!);
const classOf = (cat: Catalog, id: string) => { const e = cat.byId.get(id); return e?.kind === 'class' ? (e as ClassEntry) : undefined; };

// A new class: its skills, level 1, later levels and the class package start over; the scores follow the new class
// when they are empty or still the old class's fill (Point Buy scores stay).
export function chooseClass(a: CreatorAnswers, cat: Catalog, clsId: string): CreatorAnswers {
  if (a.cls === clsId) return a;
  const { equip: _equip, ...rest } = a;
  const out: CreatorAnswers = { ...rest, cls: clsId, skills: [], first: { flows: {}, spells: {} }, levels: [] };
  delete out.firstDone;
  if (a.method === 'buy') return out;
  const pool = scorePool(a);
  const untouched = !Object.keys(a.scores).length || JSON.stringify(sortKeys(a.scores)) === JSON.stringify(sortKeys(arrayFill(classOf(cat, a.cls), pool)));
  return untouched ? { ...out, scores: arrayFill(classOf(cat, clsId), pool) } : out;
}
const sortKeys = (o: Partial<Record<Ability, number>>) => ORDER.map((k) => o[k]);

export const setStart = (a: CreatorAnswers, n: number): CreatorAnswers => {
  const start = Math.max(1, Math.min(20, Math.round(n)));
  return { ...a, start, levels: a.levels.slice(0, start - 1) };
};
// A method change clears the scores (Point Buy: all 8) and keeps the rolled totals; the Standard Array and Rolled
// fill them for the class at once.
export function setMethod(a: CreatorAnswers, m: AbilityMethod, cls?: ClassEntry): CreatorAnswers {
  const scores = m === 'buy' ? Object.fromEntries(ORDER.map((k) => [k, 8])) : m === 'array' ? arrayFill(cls, STANDARD_ARRAY) : a.rolled ? arrayFill(cls, a.rolled) : {};
  return { ...a, method: m, scores };
}
// Six totals of 3–18 (4d6, drop the lowest), split on spaces or commas; null for anything else.
export function parseTotals(text: string): number[] | null {
  const parts = text.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length !== 6 || !parts.every((p) => /^\d+$/.test(p))) return null;
  const n = parts.map(Number);
  return n.every((x) => x >= 3 && x <= 18) ? n : null;
}
export const applyRolled = (a: CreatorAnswers, totals: number[], cls?: ClassEntry): CreatorAnswers => ({ ...a, rolled: totals, scores: arrayFill(cls, totals) });
// Gives an ability a value from the pool; when no unused copy is left, the first ability (STR..CHA) holding it takes
// this ability's old value (a swap).
export function assignScore(a: CreatorAnswers, ab: Ability, value: number): CreatorAnswers {
  const scores = { ...a.scores };
  const old = scores[ab];
  const copies = scorePool(a).filter((v) => v === value).length;
  const used = ORDER.filter((k) => k !== ab && scores[k] === value);
  if (used.length >= copies && used.length) {
    if (old === undefined) delete scores[used[0]];
    else scores[used[0]] = old;
  }
  scores[ab] = value;
  return { ...a, scores };
}

// The background's ability bonus (bgFlow[''].picks.abil, option ids of its abil choice): "+2 and +1" stores the +2's id
// twice and the +1's once; "+1 to three" stores three ids. A partial pick can only come from "+2 and +1".
export function bonusMode(picks?: string[]): 'two' | 'three' | null {
  if (!picks?.length) return null;
  return new Set(picks).size === 3 && picks.length === 3 ? 'three' : 'two';
}
const withAbil = (a: CreatorAnswers, abil: string[]): CreatorAnswers => {
  const n = a.bgFlow[''] ?? { picks: {}, counted: {}, links: {} };
  return { ...a, bgFlow: { ...a.bgFlow, '': { ...n, picks: { ...n.picks, abil } } } };
};
export const setBonusMode = (a: CreatorAnswers, mode: 'two' | 'three', optionIds: string[]): CreatorAnswers => withAbil(a, mode === 'three' ? optionIds.slice(0, 3) : []);
export function setBonusPick(a: CreatorAnswers, opt: string, plus: 1 | 2): CreatorAnswers {
  const cur = a.bgFlow['']?.picks.abil ?? [];
  let two = cur.find((x, i) => cur.indexOf(x) !== i), one = cur.find((x) => x !== two);
  if (plus === 2) { two = opt; if (one === opt) one = undefined; } else { one = opt; if (two === opt) two = undefined; }
  return withAbil(a, [...(two ? [two, two] : []), ...(one ? [one] : [])]);
}

// The answers of level i + 2 before the player has touched it: the class of the level before, nothing answered.
export function defaultLevel(a: CreatorAnswers, i: number): CreatorAnswers['levels'][number] {
  return { pick: i === 0 ? { cls: a.cls } : a.levels[i - 1]?.pick ?? { cls: a.cls }, ans: { flows: {}, spells: {} } };
}
export function ensureLevel(a: CreatorAnswers, i: number): CreatorAnswers {
  if (a.levels[i]) return a;
  const levels = [...a.levels];
  for (let j = levels.length; j <= i; j++) levels.push(defaultLevel({ ...a, levels }, j));
  return { ...a, levels };
}
// Another class at a level: its answers start over and later levels go (they were built on it).
export function setLevelPick(a: CreatorAnswers, i: number, pick: CreatorAnswers['levels'][number]['pick']): CreatorAnswers {
  const e = ensureLevel(a, i);
  return { ...e, levels: [...e.levels.slice(0, i), { pick, ans: { flows: {}, spells: {} } }] };
}
// A subclass or ASI feat change changes what later levels offer, so they go; other answers keep them.
const reshapes = (x: LevelAnswers, y: LevelAnswers) => x.sub !== y.sub || x.asi?.feat !== y.asi?.feat;
export function setLevelAns(a: CreatorAnswers, i: number, f: (ans: LevelAnswers) => LevelAnswers): CreatorAnswers {
  const e = ensureLevel(a, i), old = e.levels[i].ans, ans = f(old);
  const levels = [...e.levels.slice(0, i), { ...e.levels[i], ans }, ...(reshapes(old, ans) ? [] : e.levels.slice(i + 1))];
  return { ...e, levels };
}
export function setFirst(a: CreatorAnswers, f: (ans: LevelAnswers) => LevelAnswers): CreatorAnswers {
  const first = f(a.first);
  return { ...a, first, levels: reshapes(a.first, first) ? [] : a.levels };
}
// The creator names a class by catalog id (or typed name), never by row id, so the answers replay on a fresh sheet.
export function toAnswerPick(before: Character, p: ClassPick): CreatorAnswers['levels'][number]['pick'] {
  if (!('row' in p)) return p;
  const r = before.classes.find((x) => x.id === p.row)!;
  return r.clsId ? { cls: r.clsId } : { name: r.name, hd: r.hd };
}

// Old drafts' "Already counted" ticks are ignored: the creator asks no such question (its flows replay with noCounts).
const uncount = (f: FlowAnswers): FlowAnswers => Object.fromEntries(Object.entries(f).map(([k, n]) => [k, { ...n, counted: {} }]));
const uncountLevel = (x: LevelAnswers): LevelAnswers => ({ ...x, flows: Object.fromEntries(Object.entries(x.flows).map(([k, f]) => [k, uncount(f)])), ...(x.asi ? { asi: { ...x.asi, flow: uncount(x.asi.flow) } } : {}) });
const abilChoice = (e: Entry | undefined) => (e ? choicesOf(e).find((ch) => ch.id === 'abil') : undefined);
const ORIGIN_OPTS = { skipChoices: ['abil'], noCounts: true, noLinks: true, noEquip: true };

// The origin, in the spec's order: background, species, languages, the class's starting equipment, the scores.
// fill (the creator's preview): an unfinished background bonus replays as "+1 to all three", an unanswered package as
// none, so the background is on the preview before Abilities and Equipment; the stored answers never change.
// originFor: the characters the Origin screens read (before the background, before the species, the whole origin).
// failed: a background, species or language that can't be added although its own questions are answered.
export function replayOrigin(cat: Catalog, a: CreatorAnswers, opts: { fill?: boolean } = {}): {
  c: Character; dropped: string[]; originFor: ReplaySteps['originFor']; failed: ReplaySteps['failed'];
} {
  const dropped: string[] = [], failed: ReplaySteps['failed'] = {};
  let c = emptyCharacter();
  const originFor = { background: c, species: c, full: c };
  for (const [id, flow0, label, which] of [[a.background, a.bgFlow, 'Background', 'background'], [a.species, a.spFlow, 'Species', 'species']] as const) {
    if (which === 'species') originFor.species = c;
    if (!id) continue;
    const e = cat.byId.get(id);
    if (!e) { dropped.push(label + ': not in the loaded catalog'); failed[which] = `${id.split('/').pop()} no longer fits: not in the loaded catalog`; continue; }
    let flow = uncount(flow0);
    if (opts.fill && which === 'background') {
      const node = flow[''] ?? { picks: {}, counted: {}, links: {} };
      const ch = abilChoice(e);
      const picks = { ...node.picks };
      if (ch && validPicks(ch, picks.abil ?? []).length < ch.pick) picks.abil = (ch.options ?? []).map((o) => o.id).slice(0, 3);
      flow = { ...flow, '': { ...node, picks, ...(e.kind === 'background' && e.equipA !== undefined && !node.equip ? { equip: 'none' as const } : {}) } };
    }
    try { c = addFromCatalog(c, cat, e, buildChoices(cat, c, e, flow, {}, { noCounts: true, noLinks: true })); }
    catch (err) {
      dropped.push(label + ' ' + e.name + ': ' + errText(err));
      // A throw while a question of its own is still open is the unfinished flow, not a misfit.
      const asked = choiceSteps(cat, c, e, flow, ORIGIN_OPTS).every((st) => choiceStepReady(cat, c, st, flow, ORIGIN_OPTS).ready);
      if (asked) failed[which] = `${e.name} no longer fits: ${errText(err)}`;
    }
  }
  // Common plus the chosen languages (PHB p.37), as language proficiencies like the sheet's own.
  const langs = entriesOf(cat, 'prof').filter((p) => p.cat === 'language');
  for (const name of ['Common', ...a.languages]) {
    const e = langs.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (!e) { dropped.push('Language ' + name + ': not in the loaded catalog'); failed.languages = `${name} no longer fits: not in the loaded catalog`; continue; }
    if (!c.profs.some((p) => p.cat === 'language' && p.name === e.name)) c = { ...c, profs: [...c.profs, { id: newId(), cat: 'language', name: e.name }] };
  }
  const cls = cat.byId.get(a.cls);
  if (cls?.kind !== 'class') dropped.push('Class: not in the loaded catalog');
  else c = addPackage(c, cat, cls as ClassEntry, a.equip ?? 'none');
  c = { ...c, abil: { ...c.abil, ...a.scores } };
  originFor.full = c;
  return { c, dropped, originFor, failed };
}

// The replay, level by level, keeping the character before each level. before[0]: the origin plus the class skills
// from a.skills the origin doesn't give (screens only: Expertise offers them); before[n−1] for n ≥ 2: the character
// after level n−1. fill (the creator): a level whose screens aren't all ready is skipped silently and stops the loop;
// without it, today's replay (an unfinished level is reported).
// levels[n−1]: level n's plan, raised character and screens as replaySteps' readiness check (fill) worked them out, so
// creatorScreens lists them without building them again.
export interface LevelWork { plan: Plan; raised: Character; screens: LevelScreenSpec[] }
export interface ReplaySteps {
  before: Character[]; c: Character; dropped: string[];
  originFor: { background: Character; species: Character; full: Character };
  failed: { background?: string; species?: string; languages?: string };
  levels: LevelWork[];
}
const SKIP_SKILLS = (s: Step) => s.key === 'profs/skills';
// A level's answers and class: level 1 is a.first with a.cls, level n ≥ 2 is a.levels[n − 2] (or its default).
const levelAt = (a: CreatorAnswers, n: number) => (n === 1 ? { pick: { cls: a.cls } as CreatorAnswers['levels'][number]['pick'], ans: a.first } : a.levels[n - 2] ?? defaultLevel(a, n - 2));
function levelWork(cat: Catalog, before: Character, pick: ClassPick, ans: LevelAnswers, n: number): LevelWork | null {
  const plan = levelPlan(before, pick, cat, ans);
  if (!plan) return null;
  const raised = withLevel(before, pick, cat).c;
  return { plan, raised, screens: levelScreens(raised, plan, cat, ans, { review: false, ...(n === 1 ? { skip: SKIP_SKILLS } : {}) }) };
}
const workReady = (w: LevelWork | null) => !!w && w.screens.every((x) => x.ready);
export function replaySteps(cat: Catalog, a: CreatorAnswers, opts: { fill?: boolean } = {}): ReplaySteps {
  const o = replayOrigin(cat, a, opts);
  const dropped = [...o.dropped], before: Character[] = [], levels: LevelWork[] = [];
  let c = o.c;
  const done = (): ReplaySteps => ({ before, c, dropped, originFor: o.originFor, failed: o.failed, levels });
  const cls = cat.byId.get(a.cls);
  if (cls?.kind !== 'class') return done();
  // Level 1: the class skill flow comes from `skills`, minus skills the origin already gives.
  const held = a.skills.filter((k) => skillLevel(c, k).level >= 1);
  for (const k of held) dropped.push('Class skill ' + k + ': already proficient from your origin');
  before.push({ ...c, skillProf: { ...c.skillProf, ...Object.fromEntries(a.skills.map((k) => [k, Math.max(1, c.skillProf[k] ?? 0)])) } });
  const firstAns = uncountLevel(a.first);
  if (opts.fill) {
    const w = levelWork(cat, before[0], { cls: a.cls }, firstAns, 1);
    if (w) levels.push(w);
    if (!workReady(w)) return done();
  }
  const flows = Object.fromEntries(Object.entries(firstAns.flows).filter(([k]) => k !== 'profs' && k !== 'profs/skills'));
  const first: LevelAnswers = { ...firstAns, flows: { ...flows, 'profs/skills': { '': { picks: { skills: a.skills.filter((k) => !held.includes(k)) }, counted: {}, links: {} } } } };
  try {
    const plan = levelPlan(c, { cls: a.cls }, cat, first);
    if (!plan) throw new Error('no level to gain');
    c = applyLevel(c, plan, first, cat, { noLinks: true }).c;
  } catch (err) {
    dropped.push('Level 1: ' + errText(err));
    return done();
  }
  const start = Math.max(1, Math.min(20, a.start));
  // The character before level 2, whether or not level 2 has answers yet (its screens read it).
  if (start >= 2) before.push(c);
  for (let i = 0; i < a.levels.length; i++) {
    const n = i + 2;
    if (n > start) { dropped.push('Level ' + n + ': above the starting level'); continue; }
    const L = a.levels[i], ans = uncountLevel(L.ans);
    let w: LevelWork | null = null;
    if (opts.fill) {
      w = levelWork(cat, c, L.pick as ClassPick, ans, n);
      if (w) levels[n - 1] = w;
      if (!workReady(w)) break;
    }
    try {
      const plan = w?.plan ?? levelPlan(c, L.pick as ClassPick, cat, ans);
      if (!plan) throw new Error('no level to gain');
      c = applyLevel(c, plan, ans, cat, { noLinks: true }).c;
      if (n < start) before.push(c);
    } catch (err) {
      for (let j = i; j < a.levels.length && j + 2 <= start; j++) dropped.push('Level ' + (j + 2) + (j === i ? ': ' + errText(err) : ': after a level that no longer fits'));
      break;
    }
  }
  return done();
}

// What Create builds: replaySteps without fill, then the details.
export function replay(cat: Catalog, a: CreatorAnswers): { c: Character; dropped: string[] } {
  const r = replaySteps(cat, a);
  return { c: details(r.c, a), dropped: r.dropped };
}
const details = (c: Character, a: CreatorAnswers): Character => ({
  ...c, ch: { ...c.ch, name: a.details.name, align: a.details.align },
  notes: { ...c.notes, appearance: a.details.appearance, backstory: a.details.notes }
});

// ---- The screen list ----

export type StageId = 'class' | 'origin' | 'abilities' | 'equipment' | 'details' | `level/${number}` | 'summary';
export type ScreenBody =
  | { kind: 'class' | 'start' | 'background' | 'species' | 'languages' | 'skills' | 'scores' | 'bonus' | 'equipment' | 'details' | 'summary' }
  | { kind: 'origin-choice'; source: 'bg' | 'sp'; step: ChoiceStep; c: Character }
  | { kind: 'level'; n: number; c: Character; plan: Plan; screen: LevelScreenSpec; before: Character };
export interface Screen { stage: StageId; key: string; title: string; ready: boolean; missing?: string; body: ScreenBody }
export interface Stage { id: StageId; title: string; listed: boolean; done: boolean }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const not = (missing: string) => ({ ready: false, missing });
const READY = { ready: true };

// Every stage, Class to Summary with one stage per level up to the starting level, and the screens listed so far: a
// level's screens only once every screen before it is ready (spec §2). ready/missing come from the same rules as Next.
export function creatorScreens(cat: Catalog, a: CreatorAnswers, opts: { fill?: boolean } = {}): { stages: Stage[]; screens: Screen[]; replay: ReplaySteps } {
  const r = replaySteps(cat, a, opts);
  const screens: Screen[] = [];
  const cls = classOf(cat, a.cls);
  const start = Math.max(1, Math.min(20, a.start));
  const push = (stage: StageId, key: string, title: string, body: ScreenBody, rd: { ready: boolean; missing?: string }) =>
    screens.push({ stage, key, title, body, ready: rd.ready, ...(rd.ready || !rd.missing ? {} : { missing: rd.missing }) });
  push('class', 'class', 'Class', { kind: 'class' }, cls ? READY : not('Choose a class'));
  push('class', 'class/start', 'Starting level', { kind: 'start' }, READY);
  const levelTitle = (n: number) => {
    const p = levelAt(a, n).pick;
    return `Level ${n}: ${'cls' in p ? cat.byId.get(p.cls)?.name ?? 'Class' : p.name}`;
  };
  const stages: Stage[] = [
    { id: 'class', title: 'Class', listed: true, done: false }, { id: 'origin', title: 'Origin', listed: false, done: false },
    { id: 'abilities', title: 'Abilities', listed: false, done: false }, { id: 'equipment', title: 'Equipment', listed: false, done: false },
    { id: 'details', title: 'Details', listed: false, done: false },
    ...Array.from({ length: start }, (_, i): Stage => ({ id: `level/${i + 1}`, title: levelTitle(i + 1), listed: false, done: false })),
    { id: 'summary', title: 'Summary', listed: false, done: false }
  ];
  const finish = () => {
    for (const st of stages) {
      const own = screens.filter((x) => x.stage === st.id);
      if (own.length) st.listed = true;
      st.done = st.listed && own.every((x) => x.ready);
    }
    return { stages, screens, replay: r };
  };
  if (!cls) return finish();

  // Origin.
  const bg = a.background ? cat.byId.get(a.background) : undefined, sp = a.species ? cat.byId.get(a.species) : undefined;
  push('origin', 'origin/background', 'Background', { kind: 'background' }, !a.background ? not('Choose a background') : r.failed.background ? not(r.failed.background) : READY);
  const originChoices = (src: 'bg' | 'sp', e: Entry | undefined, flow0: FlowAnswers, c: Character) => {
    if (!e) return;
    const flow = uncount(flow0);
    for (const st of choiceSteps(cat, c, e, flow, ORIGIN_OPTS)) {
      push('origin', `origin/${src}/${choiceKey(st)}`, st.kind === 'choice' ? st.choice.name : 'Choices', { kind: 'origin-choice', source: src, step: st, c }, choiceStepReady(cat, c, st, flow, ORIGIN_OPTS));
    }
  };
  originChoices('bg', bg, a.bgFlow, r.originFor.background);
  push('origin', 'origin/species', 'Species', { kind: 'species' }, !a.species ? not('Choose a species') : r.failed.species ? not(r.failed.species) : READY);
  originChoices('sp', sp, a.spFlow, r.originFor.species);
  const langOpts = entriesOf(cat, 'prof').filter((p) => p.cat === 'language' && p.name !== 'Common');
  const langNeed = Math.min(2, langOpts.length);
  const langHave = a.languages.filter((n) => langOpts.some((p) => p.name.toLowerCase() === n.toLowerCase())).length;
  push('origin', 'origin/languages', 'Languages', { kind: 'languages' },
    r.failed.languages ? not(r.failed.languages) : langHave >= langNeed ? READY : not(`Choose ${plural(langNeed - langHave, 'more language', 'more languages')}`));
  const skillHave = a.skills.filter((k) => skillLevel(r.originFor.full, k).level < 1).length;
  push('origin', 'origin/skills', cls.name + ' skills', { kind: 'skills' },
    skillHave >= cls.skills.pick ? READY : not(`Choose ${plural(cls.skills.pick - skillHave, 'more ' + cls.name + ' skill', 'more ' + cls.name + ' skills')}`));

  // Abilities.
  const all = ORDER.every((k) => (a.method === 'buy' ? a.scores[k] !== undefined : assigned(a, k)));
  const over = a.method === 'buy' ? pointsSpent(a.scores) - POINT_BUDGET : 0;
  push('abilities', 'abilities/scores', 'Ability scores', { kind: 'scores' }, !all ? not('Assign all six scores') : over > 0 ? not(`${plural(over, 'point', 'points')} over budget`) : READY);
  const ab = abilChoice(bg);
  if (ab) push('abilities', 'abilities/bonus', 'Background bonus', { kind: 'bonus' },
    validPicks(ab, a.bgFlow['']?.picks.abil ?? []).length >= ab.pick ? READY : not('Choose your background bonus'));

  // Equipment: the class's package and the background's.
  const clsOpen = cls.equipA !== undefined && !a.equip;
  const bgOpen = bg?.kind === 'background' && bg.equipA !== undefined && !a.bgFlow['']?.equip;
  push('equipment', 'equipment', 'Starting equipment', { kind: 'equipment' },
    clsOpen && bgOpen ? not('Choose both starting equipment options') : clsOpen ? not('Choose the class starting equipment') : bgOpen ? not('Choose the background starting equipment') : READY);
  push('details', 'details', 'Details', { kind: 'details' }, READY);

  // Levels: listed one after another while everything before is ready.
  for (let n = 1; n <= start; n++) {
    if (!screens.every((x) => x.ready)) break;
    const before = r.before[n - 1];
    if (!before) break;
    const L = levelAt(a, n);
    const w = r.levels[n - 1] ?? levelWork(cat, before, L.pick as ClassPick, uncountLevel(L.ans), n);
    if (!w) break;
    const { plan, raised } = w;
    const stage = `level/${n}` as StageId;
    for (const spec of w.screens) {
      const waiting = spec.kind === 'features' && n > 1 && !a.levels[n - 2];
      push(stage, `level/${n}/${spec.key}`, spec.title, { kind: 'level', n, c: raised, plan, screen: spec, before },
        waiting ? not('Open this level to choose its class') : { ready: spec.ready, ...(spec.missing ? { missing: spec.missing } : {}) });
    }
  }
  push('summary', 'summary', 'Summary', { kind: 'summary' }, READY);
  return finish();
}

// The first screen that isn't ready (in the stage when given), else the stage's first, else the summary.
export function firstOpen(screens: Screen[], stage?: StageId | 'levels'): string {
  const own = stage === undefined ? screens : screens.filter((x) => (stage === 'levels' ? x.stage.startsWith('level/') : x.stage === stage));
  return own.find((x) => !x.ready)?.key ?? (stage === undefined ? undefined : own[0]?.key) ?? 'summary';
}
// Where the creator stands after the list changed: `at` while it is still listed; else the first not-ready screen at or
// after the first screen that followed `at` and still exists; else the first not-ready screen.
export function nextOpen(prev: Screen[], screens: Screen[], at: string): string {
  if (screens.some((x) => x.key === at)) return at;
  const i = prev.findIndex((x) => x.key === at);
  const after = i < 0 ? undefined : prev.slice(i + 1).find((x) => screens.some((y) => y.key === x.key));
  if (after) {
    const j = screens.findIndex((x) => x.key === after.key);
    const open = screens.slice(j).find((x) => !x.ready);
    if (open) return open.key;
  }
  return firstOpen(screens);
}

// The Stepper's stages, its line and where each stage jumps. With a starting level above 3 the level stages collapse
// into one "Levels 1–N" stage (spec §2 "Stepper").
export function stepperModel(r: { stages: Stage[]; screens: Screen[] }, at: string, start: number): { stages: StepperStage[]; line: string; jump: Record<string, string> } {
  const collapse = start > 3;
  const cur = r.screens.find((x) => x.key === at);
  const isLevel = (id: string) => id.startsWith('level/');
  const enabledAt = (first: number) => first >= 0 && r.screens.slice(0, first).every((x) => x.ready);
  const out: StepperStage[] = [], jump: Record<string, string> = {};
  let levelsDone = true, levelsAdded = false;
  for (const st of r.stages) {
    if (collapse && isLevel(st.id)) {
      levelsDone = levelsDone && st.done;
      if (levelsAdded) continue;
      levelsAdded = true;
      const first = r.screens.findIndex((x) => x.key === 'level/1/features');
      jump.levels = r.screens.find((x) => isLevel(x.stage) && !x.ready)?.key ?? r.screens.find((x) => x.stage === 'level/1')?.key ?? 'summary';
      out.push({ id: 'levels', label: `Levels 1–${start}`, state: cur && isLevel(cur.stage) ? 'current' : 'ahead', enabled: enabledAt(first) });
      continue;
    }
    const first = r.screens.findIndex((x) => x.stage === st.id);
    jump[st.id] = firstOpen(r.screens, st.id);
    out.push({ id: st.id, label: st.title, state: cur?.stage === st.id ? 'current' : st.done ? 'done' : 'ahead', enabled: enabledAt(first) });
  }
  const lv = out.find((x) => x.id === 'levels');
  if (lv && lv.state !== 'current' && levelsDone) lv.state = 'done';
  let line = '';
  if (cur) {
    const own = r.screens.filter((x) => x.stage === cur.stage);
    const count = `(${own.indexOf(cur) + 1} of ${own.length})`;
    line = collapse && isLevel(cur.stage) ? `Level ${cur.stage.split('/')[1]} · ${cur.title} ${count}` : `${r.stages.find((x) => x.id === cur.stage)?.title} · ${cur.title} ${count}`;
  }
  return { stages: out, line, jump };
}

// The first screen of the stage naming a catalog id the catalog lacks (a pack change): the creator reopens there.
export function staleStep(cat: Catalog, a: CreatorAnswers): string | null {
  if (a.cls && !cat.byId.has(a.cls)) return 'class';
  if (a.background && !cat.byId.has(a.background)) return 'origin/background';
  if (a.species && !cat.byId.has(a.species)) return 'origin/species';
  const i = a.levels.findIndex((L) => 'cls' in L.pick && !cat.byId.has(L.pick.cls));
  return i >= 0 ? `level/${i + 2}/features` : null;
}

// ---- The draft (its own key, never in the backup) ----
// The shape the creator reads without checking: a draft that doesn't fit is dropped, never opened (it would crash the
// creator, and the crash screen hides the draft's Discard button).
const isStrs = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isFlow = (v: unknown): boolean => isObj(v) && Object.values(v).every((n) => isObj(n) && isObj(n.picks) && Object.values(n.picks).every(isStrs) && isObj(n.counted) && isObj(n.links));
const isLevelAns = (v: unknown): boolean => isObj(v) && isObj(v.flows) && Object.values(v.flows).every(isFlow) && isObj(v.spells) && Object.values(v.spells).every(isStrs)
  && (v.hp === undefined || (isObj(v.hp) && (v.hp.mode === 'fixed' || v.hp.mode === 'roll') && Number.isFinite(v.hp.val)))
  && (v.sub === undefined || typeof v.sub === 'string') && (v.mastery === undefined || isStrs(v.mastery))
  && (v.asi === undefined || (isObj(v.asi) && typeof v.asi.feat === 'string' && isFlow(v.asi.flow)));
export function isAnswers(a: unknown): a is CreatorAnswers {
  if (!isObj(a) || !isObj(a.details) || !Array.isArray(a.levels) || !isObj(a.scores)) return false;
  const d = a.details;
  return typeof a.cls === 'string' && (a.equip === undefined || a.equip === 'A' || a.equip === 'B' || a.equip === 'none')
    && (a.rolled === undefined || (Array.isArray(a.rolled) && a.rolled.length === 6 && a.rolled.every((n) => Number.isInteger(n) && n >= 3 && n <= 18)))
    && Number.isInteger(a.start) && (a.start as number) >= 1 && (a.start as number) <= 20
    && (a.background === undefined || typeof a.background === 'string') && (a.species === undefined || typeof a.species === 'string')
    && isFlow(a.bgFlow) && isFlow(a.spFlow) && isStrs(a.skills) && isStrs(a.languages)
    && (a.method === 'array' || a.method === 'buy' || a.method === 'rolled') && Object.values(a.scores).every((n) => Number.isInteger(n))
    && ['name', 'align', 'appearance', 'notes'].every((k) => typeof d[k] === 'string')
    && isLevelAns(a.first) && (a.firstDone === undefined || typeof a.firstDone === 'boolean')
    && a.levels.every((L) => isObj(L) && isObj(L.pick) && (typeof L.pick.cls === 'string' || (typeof L.pick.name === 'string' && DICE.includes(L.pick.hd as never))) && isLevelAns(L.ans));
}
// Steps are screen keys; an older draft's step index maps to the first screen of its stage (OLD_STEP_KEYS). An older
// Rolled draft (no stored totals) takes its six scores, when all are 3–18, as the totals in STR..CHA order; otherwise its
// scores clear and the player types the totals again. An older draft's stored class package ('none' set by the old class
// change) reads as answered, as the old flow showed the same default. DRAFT_VERSION stays 1 although the step is now a
// string: an older offline copy of the app reads such a draft as damaged and discards it with its notice (accepted).
export function readDraft(): { draft: Draft | null; notice?: string } {
  let raw: string | null = null;
  try { raw = localStorage.getItem(DRAFT_KEY); } catch { return { draft: null }; }
  if (raw === null) return { draft: null };
  const drop = (notice: string) => { clearDraft(); return { draft: null, notice }; };
  let d: unknown;
  try { d = JSON.parse(raw); } catch { return drop('The saved character draft couldn’t be read, so it was discarded.'); }
  if (!isObj(d) || d.v !== DRAFT_VERSION) return drop('The saved character draft is from another version of the app, so it was discarded.');
  const step = typeof d.step === 'string' && d.step ? d.step : Number.isInteger(d.step) ? OLD_STEP_KEYS[d.step as number] : undefined;
  if (!isAnswers(d.answers) || !step) return drop('The saved character draft is damaged, so it was discarded.');
  let answers = d.answers;
  if (answers.method === 'rolled' && !answers.rolled) {
    const vals = ORDER.map((k) => answers.scores[k]);
    answers = vals.every((v) => v !== undefined && v >= 3 && v <= 18) ? { ...answers, rolled: vals as number[] } : { ...answers, scores: {} };
  }
  return { draft: { v: DRAFT_VERSION, step, answers } };
}
export function writeDraft(d: Draft): boolean {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); return true; } catch { return false; }
}
export function clearDraft(): void {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable: nothing to clear */ }
}
