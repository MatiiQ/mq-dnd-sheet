// The level engine (spec §2): what the next level of one class gives (levelPlan), applying it (applyLevel) and taking
// the last level back (undoLevel). Pure. The wizards are UI over these functions; the creator replays its stored answers
// through applyLevel, so its preview and its result are the same function.
import { addFromCatalog, addChoicePicks, classProfInputs, titled } from './catalog/copy';
import { buildChoices, type FlowAnswers } from './catalog/flow';
import { entriesOf, type Catalog } from './catalog/merge';
import type { ChoiceSpec, ClassEntry, Entry, FeatureEntry } from './catalog/schema';
import { atLevel } from './catalog/copy';
import { blankCharacter } from './defaults';
import { ABILITIES, abilityMod, addGrants, effScore, LEVEL_KEYS, LIST_KIND, maxHpOf, maxHpRaw, newId, normalize, ROW_FIELDS, totalLevel, type RefKind } from './logic';
import type { Ability, Character, ClassRow, Die, LevelKey, LevelRecord, LevelSet } from './types';

// { row }: that row (the level-up wizard). { cls }: the row whose clsId is cls, or a new row of that catalog class (the
// creator names classes this way, never by row id). { name, hd }: the row of that name without clsId, or a new row
// without catalog data.
export type ClassPick = { row: string } | { cls: string } | { name: string; hd: Die };
export type StepKind = 'prereq' | 'hp' | 'profs' | 'feature' | 'subclass' | 'choice' | 'grow' | 'mastery' | 'asi' | 'cantrips' | 'prepare' | 'nocat';
// key: stable across replays, built only from catalog ids and the class level, never from a generated id:
// '<kind>:<entry catalog id>@<class level>' ('feature:feature/ranger/deft-explorer@1'), plus '/<choice id>' for a choice
// step, and fixed names for hp, prereq, profs ('profs/<choice id>'), subclass, asi, cantrips, prepare, mastery.
export interface Step { key: string; kind: StepKind; title: string; entry?: Entry; choice?: ChoiceSpec; owed?: number; held?: string[]; onSheet?: string; warn?: string; list?: string; maxLvl?: number }
export interface Plan { pick: ClassPick; cls?: ClassEntry; n: number; clsLvl: number; steps: Step[] }
export interface LevelAnswers {
  hp?: { mode: 'fixed' | 'roll'; val: number };  // absent only at total level 1
  anyway?: true;                                  // prerequisite override
  sub?: string;                                   // subclass catalog id, or 'name:<typed>'
  flows: Record<string, FlowAnswers>;             // step key → that step's ChoiceFlow answers
  asi?: { feat: string; flow: FlowAnswers };
  spells: Record<string, string[]>;               // step key → spell catalog ids
  mastery?: string[];
  useTable?: LevelKey[];
}

// The creator's character before its first level: no class, no HP (the blank's 8 would add to level 1).
export const emptyCharacter = (): Character => ({ ...blankCharacter(), classes: [], levels: [], maxHp: 0, origHp: 0, hp: 0 });

// HP for a level after the first: the fixed value (half the die + 1) or a roll, plus CON, at least 1 per level (PHB
// p.42–45). The maximum stores it without the CON part beyond conBase (maxHpOf adds level × (CON − conBase)), so the
// stored gain is max(1, val + CON) − (CON − conBase). Simplification: the minimum of 1 is applied when the level is
// gained, not re-checked when CON changes later.
export const hpGain = (val: number, con: number, conBase: number) => Math.max(1, val + con) - (con - conBase);
export const fixedHp = (die: Die) => die / 2 + 1;

const classEntry = (cat: Catalog | null, id: string) => { const e = cat && id ? cat.byId.get(id) : undefined; return e?.kind === 'class' ? (e as ClassEntry) : undefined; };
// The one place the class level rises: the row's lvl + 1, or a new row at 1 (its id never holds '.').
export function withLevel(c: Character, pick: ClassPick, cat: Catalog | null = null): { c: Character; row: string } {
  const at = 'row' in pick ? c.classes.find((r) => r.id === pick.row)
    : 'cls' in pick ? c.classes.find((r) => r.clsId === pick.cls)
    : c.classes.find((r) => !r.clsId && r.name === pick.name);
  if (at) return { c: { ...c, classes: c.classes.map((r) => (r === at ? { ...r, lvl: r.lvl + 1 } : r)) }, row: at.id };
  if ('row' in pick) throw new Error('No such class row');
  const e = 'cls' in pick ? classEntry(cat, pick.cls) : undefined;
  const row: ClassRow = 'cls' in pick
    ? { id: newId(), name: e?.name ?? titled(pick.cls.split('/')[1] ?? pick.cls), clsId: pick.cls, sub: '', subId: '', lvl: 1, hd: (e?.hd ?? 8) as Die, prep: 0 }
    : { id: newId(), name: pick.name, clsId: '', sub: '', subId: '', lvl: 1, hd: pick.hd, prep: 0 };
  return { c: { ...c, classes: [...c.classes, row] }, row: row.id };
}

// Features the plan never adds as features: the subclass pick, the Ability Score Improvement and Epic Boon (own steps).
const OWN_STEP = /(-subclass|\/ability-score-improvement|\/epic-boon)$/;
const subOf = (r: ClassRow) => r.subId.split('/')[2] ?? '';
// The class features gained at this class level: those of that level, and those gained again (`again`).
function featuresAt(cat: Catalog, r: ClassRow, short: string): FeatureEntry[] {
  return entriesOf(cat, 'feature').filter((e) => e.cls === short && !e.of && !OWN_STEP.test(e.id) && (!e.sub || e.sub === subOf(r))
    && (e.lvl === r.lvl || (e.again ?? '').split(',').map(Number).includes(r.lvl)));
}

// Multiclassing prerequisite (PHB p.44): 13 or higher in the primary ability of the new class and of every current
// class (',' all of them, '|' any one), read from the final scores. A class without a known primary is listed in
// unknown and skipped. Advisory: the wizard warns and offers "Do it anyway".
export function prereqCheck(c: Character, cls: ClassEntry | undefined, cat: Catalog | null): { ok: boolean; missing: string[]; unknown: string[] } {
  const missing: string[] = [], unknown: string[] = [];
  const name = (a: string) => ABILITIES.find(([k]) => k === a)?.[1] ?? a;
  const check = (label: string, primary: string | undefined) => {
    if (!primary) { unknown.push(label); return; }
    const any = primary.includes('|'), abs = primary.split(/[|,]/) as Ability[];
    const low = abs.filter((a) => effScore(c, a) < 13);
    if (any ? low.length === abs.length : low.length) missing.push((any ? abs : low).map((a) => name(a) + ' 13').join(any ? ' or ' : ' and ') + ' (' + label + ')');
  };
  const rows = c.classes.filter((r) => !cls || r.clsId !== cls.id);
  for (const r of rows) check(r.name || 'Level ' + r.lvl, classEntry(cat, r.clsId)?.primary);
  if (cls) check(cls.name, cls.primary);
  return { ok: !missing.length, missing, unknown };
}

// The steps of the next level of one class (spec §2). Null at total level 20. With no catalog, or a class missing from
// it, the plan is the HP and the class level only.
export function levelPlan(c: Character, pick: ClassPick, cat: Catalog | null, ans?: LevelAnswers): Plan | null {
  if (totalLevel(c) >= 20) return null;
  void ans;
  const { c: x0, row } = withLevel(c, pick, cat);
  const r0 = x0.classes.find((y) => y.id === row)!;
  const cls = classEntry(cat, r0.clsId);
  const n = totalLevel(x0), steps: Step[] = [];
  const first = c.classes.length === 0;
  // A new class (multiclassing): the prerequisite first.
  if (!first && r0.lvl === 1) {
    const pre = prereqCheck(c, cls, cat);
    if (!cls) pre.unknown.push(r0.name);
    if (!pre.ok) steps.push({ key: 'prereq', kind: 'prereq', title: 'Multiclass prerequisite', warn: 'Needs ' + pre.missing.join('; ') });
    else steps.push({ key: 'prereq', kind: 'prereq', title: pre.unknown.length ? 'No prerequisite known for ' + pre.unknown.join(', ') : 'Prerequisite met' });
  }
  // The subclass pick (step 5): with an answer the plan reads the row as having it, so its features are listed.
  const subFeat = cat && cls && !r0.sub.trim() ? entriesOf(cat, 'feature').find((e) => e.cls === cls.id.split('/')[1] && e.lvl === r0.lvl && /-subclass$/.test(e.id)) : undefined;
  const picked = subFeat && ans?.sub && !ans.sub.startsWith('name:') ? cat!.byId.get(ans.sub) : undefined;
  const x = picked?.kind === 'subclass' ? { ...x0, classes: x0.classes.map((y) => (y.id === row ? { ...y, sub: picked.name, subId: picked.id } : y)) } : x0;
  const r = x.classes.find((y) => y.id === row)!;
  if (!first) steps.push({ key: 'hp', kind: 'hp', title: 'Hit points' });
  if (!cls || !cat) {
    steps.push({ key: 'nocat', kind: 'nocat', title: r.name + ' ' + r.lvl, warn: 'No class data: only the HP and the class level are added. Add its features by hand.' });
    return { pick, n, clsLvl: r.lvl, steps };
  }
  const short = cls.id.split('/')[1];
  if (r.lvl === 1) {
    // The starting class gets all its proficiencies; a later one only its multiclass set (PHB p.44).
    const isFirst = x.classes[0].id === row, src = isFirst ? cls : cls.multi;
    if (!src) steps.push({ key: 'profs', kind: 'profs', title: 'Proficiencies', warn: 'No multiclass proficiencies known for ' + cls.name + '; add them by hand.' });
    else {
      const choices = [src.skills, typeof src.tools === 'object' ? src.tools : undefined].filter((ch): ch is ChoiceSpec => !!ch);
      if (!choices.length) steps.push({ key: 'profs', kind: 'profs', title: 'Proficiencies' });
      for (const ch of choices) steps.push({ key: 'profs/' + ch.id, kind: 'profs', title: ch.name, choice: ch });
    }
  }
  if (subFeat) {
    const choice = subFeat.grants.find((g): g is ChoiceSpec => g.kind === 'choice');
    steps.push({ key: 'subclass', kind: 'subclass', title: 'Subclass', entry: subFeat, ...(choice ? { choice } : {}),
      ...(ans?.sub?.startsWith('name:') ? { warn: 'A subclass typed by name adds no features: add them by hand.' } : {}) });
  }
  // A subclass picked now brings every subclass feature up to this level (a creator taking it late gets the earlier ones).
  const subFeats = picked ? entriesOf(cat, 'feature').filter((e) => e.cls === short && e.sub === subOf(r) && e.lvl < r.lvl && !e.of) : [];
  for (const e0 of [...subFeats, ...featuresAt(cat, r, short)]) {
    const e = atLevel(x, e0), on = x.feats.find((f) => f.cid === e.id);
    const key = 'feature:' + e.id + '@' + r.lvl;
    if (on) steps.push({ key, kind: 'feature', title: e.name + (e.lvl === r.lvl ? ': Already on your sheet' : ': gained again'), entry: e, onSheet: on.id });
    else steps.push({ key, kind: 'feature', title: e.name, entry: e });
  }
  return { pick, cls, n, clsLvl: r.lvl, steps };
}

// The scalar fields a level changed, as was → now: LEVEL_KEYS and each row's ROW_FIELDS. An absent optional value is
// written '' (JSON drops undefined); a row created by the level gets no entries (undo removes it whole).
export function levelSet(before: Character, after: Character): LevelSet[] {
  const out: LevelSet[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const top = (k: 'castAb' | 'slotMax' | 'pactMax' | 'pactLvl') => (k === 'slotMax' ? [...before.slotMax] : before[k]);
  for (const k of LEVEL_KEYS) if (!same(top(k), after[k])) out.push({ key: k, was: top(k), now: k === 'slotMax' ? [...after.slotMax] : after[k] });
  for (const b of before.classes) {
    const a = after.classes.find((y) => y.id === b.id);
    if (!a) continue;
    for (const f of ROW_FIELDS) if ((b[f] ?? '') !== (a[f] ?? '')) out.push({ key: `row.${b.id}.${f}`, was: b[f] ?? '', now: a[f] ?? '' });
  }
  return out;
}

const LISTS: [keyof Character, RefKind][] = [...LIST_KIND, ['inv', 'item']];
const refsOf = (c: Character) => new Set(LISTS.flatMap(([k, kind]) => (c[k] as { id: string }[]).map((x) => kind + ':' + x.id)));

// Applies a plan with its answers: the class level first (so the catalog reads the new class level and attaches no
// minLvl to what is gained now), the class proficiencies, the features, then the HP; then the record (added, picks,
// set) and normalize(). kept: fields left as the player edited them (Task 13).
export function applyLevel(c: Character, plan: Plan, ans: LevelAnswers, cat: Catalog | null): { c: Character; kept: { key: LevelKey; table: unknown }[] } {
  if (plan.steps.some((s) => s.kind === 'prereq' && s.warn) && !ans.anyway) throw new Error('Multiclass prerequisite not met');
  const { c: raised, row } = withLevel(c, plan.pick, cat);
  let x = raised;
  const picks: Record<string, string[]> = {};
  const cls = plan.cls;
  const first = c.classes.length === 0;
  if (cls && cat && plan.clsLvl === 1) {
    const isFirst = x.classes[0].id === row;
    const prof: Record<string, string[]> = {};
    for (const s of plan.steps) if (s.kind === 'profs' && s.choice) {
      const v = ans.flows[s.key]?.['']?.picks[s.choice.id] ?? [];
      prof[s.choice.id] = v;
      picks[s.key] = v;
    }
    if (isFirst || cls.multi) {
      const inputs = classProfInputs(cat, cls, !isFirst, prof);
      if (inputs.length) x = addGrants(x, 'class:' + row, inputs);
    }
  }
  // The subclass: its entry (which names the row's sub and subId) or a typed name.
  if (plan.steps.some((s) => s.kind === 'subclass') && ans.sub) {
    if (ans.sub.startsWith('name:')) x = { ...x, classes: x.classes.map((y) => (y.id === row ? { ...y, sub: ans.sub!.slice(5), subId: '' } : y)) };
    else if (cat?.byId.get(ans.sub)?.kind === 'subclass') {
      const e = cat.byId.get(ans.sub)!;
      x = addFromCatalog(x, cat, e, { picks: {}, counted: {}, links: {} });
      x = { ...x, classes: x.classes.map((y) => (y.id === row ? { ...y, sub: e.name, subId: e.id } : y)) };
      picks['subclass'] = [e.id];
    }
  }
  if (cat) for (const s of plan.steps) {
    if (s.kind !== 'feature' || s.onSheet || !s.entry) continue;
    const e = cat.byId.get(s.entry.id)!;
    const ch = buildChoices(cat, x, e, ans.flows[s.key] ?? {});
    const ids = new Set(x.feats.map((f) => f.id));
    x = addFromCatalog(x, cat, e, ch);
    const added = x.feats.find((f) => !ids.has(f.id) && f.cid === e.id);
    if (added) for (const [k, v] of Object.entries(ch.picks)) picks['feature:' + added.id + '/' + k] = v;
  }
  void addChoicePicks;
  // HP last, with the final CON (PHB p.42). Level 1 of the first class is the die's maximum; a new character starts at
  // full HP. Otherwise current HP rises by the change in the unfloored maximum, and only when above 0: a level never
  // revives (the book only raises the maximum; the sheet raises both so a level isn't gained at a deficit).
  const r = x.classes.find((y) => y.id === row)!;
  if (!first && !ans.hp) throw new Error('Hit points: choose the fixed value or type a roll');
  const hp: NonNullable<LevelRecord['hp']> = first ? { mode: 'max', val: r.hd, gain: 0 } : { mode: ans.hp!.mode, val: ans.hp!.val, gain: 0 };
  hp.gain = hpGain(hp.val, abilityMod(x, 'con'), c.conBase);
  x = { ...x, maxHp: x.maxHp + hp.gain, ...(x.origOn ? { origHp: x.origHp + hp.gain } : {}) };
  x = { ...x, hp: first ? maxHpOf(x) : c.hp > 0 ? x.hp + maxHpRaw(x) - maxHpRaw(c) : x.hp };
  const before = refsOf(c);
  const added = [...refsOf(x)].filter((ref) => !before.has(ref));
  const rec: LevelRecord = { n: totalLevel(x), cls: row, hp, added, picks, set: levelSet(c, x) };
  return { c: normalize({ ...x, levels: [...x.levels, rec] }), kept: [] };
}
