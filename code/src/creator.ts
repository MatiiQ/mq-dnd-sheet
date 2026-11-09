// The character creator's answers (spec 2026-11-06 §4) and what they build. The creator stores answers, never a
// character: replay builds the character from them with the same applyLevel calls Finish uses, so the preview and the
// result are the same function. Answers name catalog ids and step keys only, never a generated id, so they replay on a
// fresh sheet. The draft (the answers and the step) lives in its own key, never in a character or the backup.
import { addFromCatalog, addPackage } from './catalog/copy';
import { buildChoices, type FlowAnswers } from './catalog/flow';
import { entriesOf, type Catalog } from './catalog/merge';
import type { ClassEntry } from './catalog/schema';
import { isObj } from './catalog/schema';
import { applyLevel, emptyCharacter, levelPlan, type ClassPick, type LevelAnswers } from './levelup';
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

// The creator's level-1 step reads it; replay goes on from it.
export function replayOrigin(cat: Catalog, a: CreatorAnswers): { c: Character; dropped: string[] } {
  const dropped: string[] = [];
  let c = emptyCharacter();
  for (const [id, flow, label] of [[a.background, a.bgFlow, 'Background'], [a.species, a.spFlow, 'Species']] as const) {
    if (!id) continue;
    const e = cat.byId.get(id);
    if (!e) { dropped.push(label + ': not in the loaded catalog'); continue; }
    try { c = addFromCatalog(c, cat, e, buildChoices(cat, c, e, flow)); }
    catch (err) { dropped.push(label + ' ' + e.name + ': ' + errText(err)); }
  }
  // Common plus the chosen languages (PHB p.37), as language proficiencies like the sheet's own.
  const langs = entriesOf(cat, 'prof').filter((p) => p.cat === 'language');
  for (const name of ['Common', ...a.languages]) {
    const e = langs.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (!e) { dropped.push('Language ' + name + ': not in the loaded catalog'); continue; }
    if (!c.profs.some((p) => p.cat === 'language' && p.name === e.name)) c = { ...c, profs: [...c.profs, { id: newId(), cat: 'language', name: e.name }] };
  }
  const cls = cat.byId.get(a.cls);
  if (cls?.kind !== 'class') dropped.push('Class: not in the loaded catalog');
  else c = addPackage(c, cat, cls as ClassEntry, a.equip ?? 'none');
  c = { ...c, abil: { ...c.abil, ...a.scores } };
  return { c, dropped };
}

// What Finish builds, in the spec's order: the empty character (no class, no HP), background and species, languages,
// the class's starting equipment, the scores, level 1 of the class, then levels 2..start; details last. Never throws on
// stored answers: what no longer fits goes in dropped (named for the player), and later levels stop there.
export function replay(cat: Catalog, a: CreatorAnswers): { c: Character; dropped: string[] } {
  const { c: o, dropped } = replayOrigin(cat, a);
  let c = o;
  const cls = cat.byId.get(a.cls);
  if (cls?.kind !== 'class') return { c: details(c, a), dropped };
  // Level 1: the class skill flow comes from `skills`, minus skills the origin already gives.
  const held = a.skills.filter((k) => skillLevel(c, k).level >= 1);
  for (const k of held) dropped.push('Class skill ' + k + ': already proficient from your origin');
  const flows = Object.fromEntries(Object.entries(a.first.flows).filter(([k]) => k !== 'profs' && k !== 'profs/skills'));
  const first: LevelAnswers = { ...a.first, flows: { ...flows, 'profs/skills': { '': { picks: { skills: a.skills.filter((k) => !held.includes(k)) }, counted: {}, links: {} } } } };
  try {
    const plan = levelPlan(c, { cls: a.cls }, cat, first);
    if (!plan) throw new Error('no level to gain');
    c = applyLevel(c, plan, first, cat).c;
  } catch (err) {
    dropped.push('Level 1: ' + errText(err));
    return { c: details(c, a), dropped };
  }
  const start = Math.max(1, Math.min(20, a.start));
  for (let i = 0; i < a.levels.length; i++) {
    const n = i + 2;
    if (n > start) { dropped.push('Level ' + n + ': above the starting level'); continue; }
    const L = a.levels[i];
    try {
      const plan = levelPlan(c, L.pick as ClassPick, cat, L.ans);
      if (!plan) throw new Error('no level to gain');
      c = applyLevel(c, plan, L.ans, cat).c;
    } catch (err) {
      for (let j = i; j < a.levels.length && j + 2 <= start; j++) dropped.push('Level ' + (j + 2) + (j === i ? ': ' + errText(err) : ': after a level that no longer fits'));
      break;
    }
  }
  return { c: details(c, a), dropped };
}
const details = (c: Character, a: CreatorAnswers): Character => ({
  ...c, ch: { ...c.ch, name: a.details.name, align: a.details.align },
  notes: { ...c.notes, appearance: a.details.appearance, backstory: a.details.notes }
});

// The first creator step that names a catalog id the catalog lacks (a pack change): the creator reopens there.
export function staleStep(cat: Catalog, a: CreatorAnswers): number | null {
  if (a.cls && !cat.byId.has(a.cls)) return 0;
  if ((a.background && !cat.byId.has(a.background)) || (a.species && !cat.byId.has(a.species))) return 1;
  if (a.levels.some((L) => 'cls' in L.pick && !cat.byId.has(L.pick.cls))) return 4;
  return null;
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
