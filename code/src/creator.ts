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
  cls: string; equip: 'A' | 'B' | 'none'; start: number;              // class catalog id, its package, starting level 1–20
  background?: string; bgFlow: FlowAnswers; species?: string; spFlow: FlowAnswers;
  skills: string[];                                                   // the class skill picks: the one place they are stored
  languages: string[];                                                // the two chosen languages (Common is always added)
  method: AbilityMethod; scores: Partial<Record<Ability, number>>;    // base scores, before the background bonus
  details: { name: string; align: string; appearance: string; notes: string };
  first: LevelAnswers;                                                // level 1 of `cls`; its skill flow is built from `skills`
  firstDone?: boolean;                                                // level 1's own choices were answered (Levels step)
  levels: { pick: { cls: string } | { name: string; hd: Die }; ans: LevelAnswers }[];  // levels[0] is level 2
}
export interface Draft { v: number; step: number; answers: CreatorAnswers }
// The creator's steps, in PHB order (spec §4); staleStep returns one of these indexes.
export const CREATOR_STEPS = ['Class', 'Origin', 'Abilities', 'Details', 'Levels'] as const;

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
  else c = addPackage(c, cat, cls as ClassEntry, a.equip);
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
  return typeof a.cls === 'string' && (a.equip === 'A' || a.equip === 'B' || a.equip === 'none')
    && Number.isInteger(a.start) && (a.start as number) >= 1 && (a.start as number) <= 20
    && (a.background === undefined || typeof a.background === 'string') && (a.species === undefined || typeof a.species === 'string')
    && isFlow(a.bgFlow) && isFlow(a.spFlow) && isStrs(a.skills) && isStrs(a.languages)
    && (a.method === 'array' || a.method === 'buy' || a.method === 'rolled') && Object.values(a.scores).every((n) => Number.isInteger(n))
    && ['name', 'align', 'appearance', 'notes'].every((k) => typeof d[k] === 'string')
    && isLevelAns(a.first) && (a.firstDone === undefined || typeof a.firstDone === 'boolean')
    && a.levels.every((L) => isObj(L) && isObj(L.pick) && (typeof L.pick.cls === 'string' || (typeof L.pick.name === 'string' && DICE.includes(L.pick.hd as never))) && isLevelAns(L.ans));
}
export function readDraft(): { draft: Draft | null; notice?: string } {
  let raw: string | null = null;
  try { raw = localStorage.getItem(DRAFT_KEY); } catch { return { draft: null }; }
  if (raw === null) return { draft: null };
  const drop = (notice: string) => { clearDraft(); return { draft: null, notice }; };
  let d: unknown;
  try { d = JSON.parse(raw); } catch { return drop('The saved character draft couldn’t be read, so it was discarded.'); }
  if (!isObj(d) || d.v !== DRAFT_VERSION) return drop('The saved character draft is from another version of the app, so it was discarded.');
  if (!isAnswers(d.answers) || !Number.isInteger(d.step) || (d.step as number) < 0 || (d.step as number) > CREATOR_STEPS.length) return drop('The saved character draft is damaged, so it was discarded.');
  return { draft: d as unknown as Draft };
}
export function writeDraft(d: Draft): boolean {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); return true; } catch { return false; }
}
export function clearDraft(): void {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable: nothing to clear */ }
}
