// The character creator's answers (spec 2026-11-06 §4) and what they build. The creator stores answers, never a
// character: replay builds the character from them with the same applyLevel calls Finish uses, so the preview and the
// result are the same function. Answers name catalog ids and step keys only, never a generated id, so they replay on a
// fresh sheet. The draft (the answers and the step) lives in its own key, never in a character or the backup.
import { addClassEquipment, addFromCatalog } from './catalog/copy';
import { buildChoices, type FlowAnswers } from './catalog/flow';
import { entriesOf, type Catalog } from './catalog/merge';
import type { ClassEntry } from './catalog/schema';
import { isObj } from './catalog/schema';
import { applyLevel, emptyCharacter, levelPlan, type ClassPick, type LevelAnswers } from './levelup';
import { newId, skillLevel } from './logic';
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
export const pointsSpent = (scores: Partial<Record<Ability, number>>) => Object.values(scores).reduce((t, s) => t + (POINT_COST[s ?? 8] ?? 0), 0);
// "4 dice each" (PHB p.38): the total of the highest three of four typed d6 rolls.
export const dropLowest = (dice: number[]) => [...dice].sort((a, b) => b - a).slice(0, 3).reduce((t, n) => t + n, 0);

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// What Finish builds, in the spec's order: the empty character (no class, no HP), background and species, languages,
// the class's starting equipment, the scores, level 1 of the class, then levels 2..start; details last. Never throws on
// stored answers: what no longer fits goes in dropped (named for the player), and later levels stop there.
export function replay(cat: Catalog, a: CreatorAnswers): { c: Character; dropped: string[] } {
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
  if (cls?.kind !== 'class') {
    dropped.push('Class: not in the loaded catalog');
    return { c: details(c, a), dropped };
  }
  c = addClassEquipment(c, cat, cls as ClassEntry, a.equip);
  c = { ...c, abil: { ...c.abil, ...a.scores } };
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
export function readDraft(): { draft: Draft | null; notice?: string } {
  let raw: string | null = null;
  try { raw = localStorage.getItem(DRAFT_KEY); } catch { return { draft: null }; }
  if (raw === null) return { draft: null };
  const drop = (notice: string) => { clearDraft(); return { draft: null, notice }; };
  let d: unknown;
  try { d = JSON.parse(raw); } catch { return drop('The saved character draft couldn’t be read, so it was discarded.'); }
  if (!isObj(d) || d.v !== DRAFT_VERSION || !isObj(d.answers) || typeof d.step !== 'number') return drop('The saved character draft is from another version of the app, so it was discarded.');
  return { draft: d as unknown as Draft };
}
export function writeDraft(d: Draft): boolean {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); return true; } catch { return false; }
}
export function clearDraft(): void {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable: nothing to clear */ }
}
