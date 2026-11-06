// The level engine (spec §2): what the next level of one class gives (levelPlan), applying it (applyLevel) and taking
// the last level back (undoLevel). Pure. The wizards are UI over these functions; the creator replays its stored answers
// through applyLevel, so its preview and its result are the same function.
import { addFromCatalog, addChoicePicks, choicesOf, classProfInputs, poolOptions, prereqMet, resolveChoices, titled, type AddChoices } from './catalog/copy';
import { valueAt } from './catalog/value';
import { masterySlots } from './actions';
import { activeGrants } from './links';
import { buildChoices, type FlowAnswers } from './catalog/flow';
import { entriesOf, type Catalog } from './catalog/merge';
import type { ChoiceSpec, ClassEntry, Entry, FeatureEntry } from './catalog/schema';
import { atLevel } from './catalog/copy';
import { blankCharacter } from './defaults';
import { ABILITIES, abilityMod, addGrants, effScore, num, pactFor, SKILLS, slotsFor, spellForRow, valueCtx, LEVEL_KEYS, LIST_KIND, maxHpOf, maxHpRaw, newId, normalize, removalSummary, removeRef, ROW_FIELDS, totalLevel, withoutKeys, type Ref, type RefKind } from './logic';
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

// ---- Choices counted from the sheet (spec §2, steps 6 and 7) ----

// The picks a choice of a feature already holds on the sheet: the catalog ids (or granted values) of what the feature
// added, among the choice's pool. Counted from the sheet, not from the level history, so a v1 character's or a
// hand-added pick counts too.
export function heldPicks(c: Character, cat: Catalog, featureId: string, choice: ChoiceSpec): string[] {
  if (!choice.pool) return [];
  const from = 'feature:' + featureId;
  const mine = <T extends { from?: string }>(xs: T[]) => xs.filter((x) => x.from === from);
  const vals = [...mine(c.feats).map((f) => f.cid), ...mine(c.spells).map((sp) => sp.cid), ...mine(c.grants).map((g) => g.target)]
    .filter((v): v is string => !!v);
  const kind = choice.pool.split(':')[0];
  const ok = kind === 'skill' ? new Set(SKILLS.map(([k]) => k)) : new Set(poolOptions(cat, c, choice.pool, {}).map((o) => o.value));
  return [...new Set(vals.filter((v) => ok.has(v)))];
}
// What a choice owes now: a pickAt choice (Metamagic, Ritual Caster) its count at the class level minus what the sheet
// holds; a fixed choice (Expertise, Mystic Arcanum) its own pick per occurrence, whatever is held.
export function owedPicks(c: Character, cat: Catalog, featureId: string, e: Entry, choice: ChoiceSpec): number {
  if (!choice.pickAt) return choice.pick;
  const at = e.kind === 'feature' ? { cid: 'feature/' + e.cls + '/' } : { from: 'feature:' + featureId };
  return Math.max(0, num(c, choice.pickAt, at) - heldPicks(c, cat, featureId, choice).length);
}
// A choice whose pool lists one level per occurrence of the feature (Mystic Arcanum: lvl=6|7|8|9 at 11/13/15/17) is
// narrowed to this occurrence's level (Mystic Arcanum, PHB p.155).
function narrowed(e: FeatureEntry, clsLvl: number): FeatureEntry {
  const occ = [e.lvl, ...(e.again ?? '').split(',').filter(Boolean).map(Number)];
  const i = occ.indexOf(clsLvl);
  const grants = e.grants.map((g) => {
    const m = g.kind === 'choice' && g.pool ? /lvl=([\d|]+)/.exec(g.pool) : null;
    const lv = m ? m[1].split('|') : [];
    return m && i >= 0 && lv.length === occ.length ? { ...g, pool: (g as ChoiceSpec).pool!.replace(m[0], 'lvl=' + lv[i]) } : g;
  });
  return { ...e, grants };
}

// ---- Spellcasting of one class row (spec §2, step 9) ----

// A row's casting tables: its class's own (cantrips, prepared, slots), or for a class without them the active casting
// grant from its features (Eldritch Knight, Arcane Trickster). maxLvl: the highest slot level the class prepares on its
// own (PHB p.45): its slots row, the pact slot level for a pact class, the grant's highest sN with a value.
interface CastTables { ab?: Ability; cantrips?: string; prepared?: string; maxLvl: number }
function castTables(x: Character, cls: ClassEntry, r: ClassRow): CastTables | null {
  const top = (row: number[] | undefined) => (row ? row.reduce((m, n, i) => (n > 0 ? i + 1 : m), 0) : 0);
  if (cls.castAb && (cls.slots?.length || cls.cantrips || cls.prepared)) return { ab: cls.castAb, cantrips: cls.cantrips, prepared: cls.prepared, maxLvl: top(cls.slots?.[r.lvl - 1]) };
  const short = cls.id.split('/')[1];
  const g = activeGrants(x, 'casting').find((y) => x.feats.find((f) => 'feature:' + f.id === y.from)?.cid?.startsWith('feature/' + short + '/'));
  if (!g) return null;
  const s = [g.s1, g.s2, g.s3, g.s4, g.s5].map((v) => (v ? num(x, v, g) : 0));
  return { ab: g.ab as Ability, cantrips: g.cantrips, prepared: g.prepared, maxLvl: top(s) };
}
// A level table's value at a class level (the table belongs to the class, so its level is the class level).
const tableAt = (x: Character, t: string | undefined, lvl: number) => { if (!t || lvl < 1) return 0; const v = valueAt(t, { ...valueCtx(x), level: lvl }); return typeof v === 'number' ? v : 0; };

const isAsi = (id: string) => /\/(ability-score-improvement|epic-boon)$/.test(id);
// Warnings for the feat an Ability Score Improvement or Epic Boon takes: unmet prerequisites, and an increase past its
// cap (20, or 30 for an Epic Boon, PHB p.38 and p.92) that would be wasted.
function asiWarn(x: Character, cat: Catalog, a: NonNullable<LevelAnswers['asi']>): string | undefined {
  const e = cat.byId.get(a.feat);
  if (!e) return undefined;
  const out: string[] = [];
  if (e.kind === 'feat') out.push(...prereqMet(x, e.prereq).missing.map((m) => 'Needs ' + m));
  const specs = resolveChoices(cat, e, buildChoices(cat, x, e, a.flow).picks, x).specs.filter((g) => g.kind === 'abil' && g.ab);
  const sum = new Map<string, { add: number; cap: number }>();
  for (const g of specs) { const k = g.ab!; const cur = sum.get(k) ?? { add: 0, cap: g.cap ?? 20 }; sum.set(k, { add: cur.add + Number(g.val ?? 0), cap: cur.cap }); }
  for (const [k, v] of sum) if (effScore(x, k as Ability) + v.add > v.cap) out.push(k.toUpperCase() + ': an increase past ' + v.cap + ' is wasted');
  return out.length ? out.join('; ') : undefined;
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
  const handled = new Set<string>();
  for (const e0 of [...subFeats, ...featuresAt(cat, r, short)]) {
    const e = narrowed(atLevel(x, e0), r.lvl), on = x.feats.find((f) => f.cid === e.id);
    const key = 'feature:' + e.id + '@' + r.lvl;
    handled.add(e.id);
    if (!on) { steps.push({ key, kind: 'feature', title: e.name, entry: e }); continue; }
    const choices = e.lvl === r.lvl ? [] : choicesOf(e);
    // On the sheet already: at its own level it is not added again; at an `again` level each choice is a step on it.
    if (!choices.length) steps.push({ key, kind: 'feature', title: e.name + (e.lvl === r.lvl ? ': Already on your sheet' : ': gained again'), entry: e, onSheet: on.id });
    for (const ch of choices) {
      const owed = owedPicks(x, cat, on.id, e, ch);
      if (owed > 0) steps.push({ key: 'choice:' + e.id + '@' + r.lvl + '/' + ch.id, kind: 'choice', title: e.name + ': ' + ch.name, entry: e, choice: ch, owed, held: heldPicks(x, cat, on.id, ch), onSheet: on.id });
    }
  }
  // Ability Score Improvement / Epic Boon (step 8): a feat at this class level, on the entry once it is on the sheet.
  for (const e of entriesOf(cat, 'feature').filter((y) => y.cls === short && !y.sub && isAsi(y.id) && (y.lvl === r.lvl || (y.again ?? '').split(',').map(Number).includes(r.lvl)))) {
    const on = x.feats.find((f) => f.cid === e.id);
    const warn = ans?.asi ? asiWarn(x, cat, ans.asi) : undefined;
    steps.push({ key: 'asi@' + r.lvl, kind: 'asi', title: e.name, entry: e, ...(on ? { onSheet: on.id } : {}), ...(warn ? { warn } : {}) });
  }
  // Casting (step 9): new cantrips and the rise in prepared spells, from the class's tables at its new level.
  const ct = castTables(x, cls, r);
  if (ct) {
    const cantrips = tableAt(x, ct.cantrips, r.lvl) - tableAt(x, ct.cantrips, r.lvl - 1);
    const prepared = tableAt(x, ct.prepared, r.lvl) - tableAt(x, ct.prepared, r.lvl - 1);
    const list = cls.castAb ? short : (activeGrants(x, 'casting').find((g) => g.ab === ct.ab)?.list ?? short);
    const maxLvl = cls.pact ? pactFor(x, cat).lvl : ct.maxLvl;
    if (cantrips > 0) steps.push({ key: 'cantrips:' + cls.id + '@' + r.lvl, kind: 'cantrips', title: 'Pick ' + cantrips + (cantrips === 1 ? ' cantrip' : ' cantrips'), owed: cantrips, list, maxLvl: 0 });
    if (prepared > 0) steps.push({ key: 'prepare:' + cls.id + '@' + r.lvl, kind: 'prepare', title: 'Prepare ' + prepared + ' more', owed: prepared, list, maxLvl,
      ...(short === 'wizard' ? { warn: 'The whole Wizard list is offered: check your spellbook.' } : {}) });
  }
  // Growing choices (step 7): entries on the sheet whose count follows the level or PB, not handled above.
  for (const f of x.feats) {
    const e = f.cid ? cat.byId.get(f.cid) : undefined;
    if (!e || handled.has(e.id) || !('grants' in e) || OWN_STEP.test(e.id)) continue;
    for (const ch of choicesOf(e).filter((y) => y.pickAt)) {
      const owed = owedPicks(x, cat, f.id, e, ch);
      if (owed > 0) steps.push({ key: 'grow:' + e.id + '/' + ch.id + '@' + n, kind: 'grow', title: e.name + ': ' + owed + ' more', entry: e, choice: ch, owed, held: heldPicks(x, cat, f.id, ch), onSheet: f.id });
    }
  }
  // Weapon Mastery: a slot gained at this level (the Weapon Mastery rules, PHB p.91).
  const slots = masterySlots(x);
  if (slots > c.mastery.length) steps.push({ key: 'mastery@' + n, kind: 'mastery', title: 'Weapon Mastery', owed: slots - c.mastery.length, held: [...c.mastery] });
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
  // More picks on entries already on the sheet (an `again` level, or a count that grew).
  if (cat) for (const s of plan.steps) {
    if ((s.kind !== 'choice' && s.kind !== 'grow') || !s.entry || !s.choice || !s.onSheet) continue;
    const v = ans.flows[s.key]?.['']?.picks[s.choice.id] ?? [];
    if (!v.length) continue;
    x = addChoicePicks(x, cat, s.onSheet, s.entry, s.choice.id, { picks: { [s.choice.id]: v }, counted: {}, links: {} });
    picks['feature:' + s.onSheet + '/' + s.choice.id] = v;
  }
  // Ability Score Improvement / Epic Boon: the feat goes in through the feature's own choice, so its increases are abil
  // grants with the catalog's cap; at a later level the feature is already there and only gains the pick.
  const asiStep = plan.steps.find((s) => s.kind === 'asi');
  if (cat && asiStep?.entry && ans.asi) {
    const feat = cat.byId.get(ans.asi.feat);
    const ch = choicesOf(asiStep.entry)[0];
    if (feat && ch) {
      const a: AddChoices = { picks: { [ch.id]: [feat.id] }, counted: {}, links: {}, nested: { [feat.id]: buildChoices(cat, x, feat, ans.asi.flow) } };
      x = asiStep.onSheet ? addChoicePicks(x, cat, asiStep.onSheet, asiStep.entry, ch.id, a) : addFromCatalog(x, cat, asiStep.entry, a);
      picks['asi'] = [feat.id];
    }
  }
  if (ans.mastery?.length && plan.steps.some((s) => s.kind === 'mastery')) {
    const add = ans.mastery.filter((k) => !x.mastery.includes(k));
    x = { ...x, mastery: [...x.mastery, ...add] };
    picks['mastery'] = add;
  }
  // Spellcasting: the row's ability, the character's when it has none, the slots, the pact pool and the prepared count.
  // A stored value is replaced only while it still equals the table for the level before (or the player asked for the
  // table): a hand edit stays, and goes in kept.
  const kept: { key: LevelKey; table: unknown }[] = [];
  const use = (k: LevelKey) => ans.useTable?.includes(k);
  if (cat && cls) {
    const r0 = x.classes.find((y) => y.id === row)!;
    const ct = castTables(x, cls, r0);
    if (ct?.ab && !r0.castAb && (ct.maxLvl > 0 || tableAt(x, ct.cantrips, r0.lvl) > 0 || cls.pact)) {
      x = { ...x, classes: x.classes.map((y) => (y.id === row ? { ...y, castAb: ct.ab } : y)) };
      if (x.castAb === 'none' && ct.ab !== 'str' && ct.ab !== 'dex' && ct.ab !== 'con') x = { ...x, castAb: ct.ab };
    }
    if (ct?.prepared) {
      const was = c.classes.find((y) => y.id === row)?.prep ?? 0, t0 = tableAt(x, ct.prepared, r0.lvl - 1), t1 = tableAt(x, ct.prepared, r0.lvl);
      const key: LevelKey = `row.${row}.prep`;
      if (was === t0 || use(key)) x = { ...x, classes: x.classes.map((y) => (y.id === row ? { ...y, prep: t1 } : y)) };
      else if (was !== t1) kept.push({ key, table: t1 });
    }
  }
  if (cat) {
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const s0 = slotsFor(c, cat), s1 = slotsFor(x, cat);
    if (same(c.slotMax, s0) || use('slotMax')) x = { ...x, slotMax: s1, slotUsed: x.slotUsed.map((n, i) => Math.min(n, s1[i])) };
    else if (!same(c.slotMax, s1)) kept.push({ key: 'slotMax', table: s1 });
    const p0 = pactFor(c, cat), p1 = pactFor(x, cat);
    if (c.pactMax === p0.max || use('pactMax')) x = { ...x, pactMax: p1.max };
    else if (c.pactMax !== p1.max) kept.push({ key: 'pactMax', table: p1.max });
    if (c.pactLvl === p0.lvl || use('pactLvl')) x = { ...x, pactLvl: p1.lvl };
    else if (c.pactLvl !== p1.lvl) kept.push({ key: 'pactLvl', table: p1.lvl });
    // Spells picked for the cantrip and prepare steps: tied to this class, with its ability; prepared ones prepared.
    const rr = x.classes.find((y) => y.id === row)!;
    for (const s of plan.steps.filter((y) => y.kind === 'cantrips' || y.kind === 'prepare')) {
      for (const id of ans.spells[s.key] ?? []) {
        const e = cat.byId.get(id);
        if (e?.kind !== 'spell') continue;
        const ids = new Set(x.spells.map((sp) => sp.id));
        x = addFromCatalog(x, cat, e, { picks: {}, counted: {}, links: {} });
        x = { ...x, spells: x.spells.map((sp) => (ids.has(sp.id) ? sp : { ...spellForRow(sp, rr), ...(sp.lvl > 0 ? { prep: true } : {}) })) };
      }
      if (ans.spells[s.key]?.length) picks[s.key] = ans.spells[s.key];
    }
  }
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
  return { c: normalize({ ...x, levels: [...x.levels, rec] }), kept };
}

// ---- Undo ----

// The record undo takes: the last one, unless it is a baseline or the one that reached level 1 (the character would
// have no class).
const undoable = (c: Character): LevelRecord | null => { const rec = c.levels.at(-1); return rec && !rec.base && rec.n > 1 ? rec : null; };
const toRef = (s: string): Ref => { const i = s.indexOf(':'); return { kind: s.slice(0, i) as RefKind, id: s.slice(i + 1) }; };
const listOf = (kind: RefKind) => LISTS.find(([, k]) => k === kind)![0];
const entryOf = (c: Character, r: Ref) => (c[listOf(r.kind)] as { id: string; name: string }[]).find((x) => x.id === r.id);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
function fieldOf(c: Character, key: LevelKey): unknown {
  const m = /^row\.(.+)\.(\w+)$/.exec(key);
  if (!m) return c[key as 'castAb'];
  return (c.classes.find((r) => r.id === m[1]) as Record<string, unknown> | undefined)?.[m[2]] ?? '';
}
// Writes a field back; '' for a row's optional castAb deletes the key.
function writeField(c: Character, key: LevelKey, v: unknown): Character {
  const m = /^row\.(.+)\.(\w+)$/.exec(key);
  if (!m) return { ...c, [key]: v };
  return { ...c, classes: c.classes.map((r) => (r.id !== m[1] ? r : m[2] === 'castAb' && v === '' ? withoutKeys(r, ['castAb']) : { ...r, [m[2]]: v })) };
}

// What undoing the last level removes (the entries it added that are still there, and what goes with them) and the
// fields it changed that were edited since (left as they are). Null when nothing can be undone.
export function undoPreview(c: Character): { summary: { goes: string[]; keep: string[] }; unrestored: LevelKey[] } | null {
  const rec = undoable(c);
  if (!rec) return null;
  const goes: string[] = [], keep: string[] = [];
  let x = c;
  for (const r of rec.added.map(toRef)) {
    const e = entryOf(x, r);
    if (!e) continue;
    const sum = removalSummary(x, r);
    goes.push(e.name, ...sum.goes);
    keep.push(...sum.keep);
    x = removeRef(x, r);
  }
  return { summary: { goes: [...new Set(goes)], keep: [...new Set(keep)] }, unrestored: rec.set.filter((e) => !same(fieldOf(c, e.key), e.now)).map((e) => e.key) };
}

// Takes the last level back (spec §2): removes what it added (an entry already gone is skipped), restores each field
// still holding the level's value, takes off its HP, lowers the class level (a row at 0 goes, and spells tied to it
// lose the tie), clamps each Hit Dice pool (so the level's die comes back unspent when gained again), drops its
// Weapon Mastery picks, and pops the record.
export function undoLevel(c: Character): Character {
  const rec = undoable(c);
  if (!rec) return c;
  let x = c;
  for (const r of rec.added.map(toRef)) if (entryOf(x, r)) x = removeRef(x, r);
  for (const e of rec.set) if (same(fieldOf(x, e.key), e.now)) x = writeField(x, e.key, e.was);
  const gain = rec.hp?.gain ?? 0;
  x = { ...x, maxHp: x.maxHp - gain, ...(x.origOn ? { origHp: x.origHp - gain } : {}) };
  const row = x.classes.find((r) => r.id === rec.cls);
  if (row) {
    x = row.lvl > 1
      ? { ...x, classes: x.classes.map((r) => (r === row ? { ...r, lvl: r.lvl - 1 } : r)) }
      : { ...x, classes: x.classes.filter((r) => r !== row), spells: x.spells.map((sp) => (sp.cls === row.id ? withoutKeys(sp, ['cls']) : sp)) };
  }
  // Current HP falls by the drop in the unfloored maximum, taken now; it stays above 0 when it was (normalize clamps).
  const drop = maxHpRaw(c) - maxHpRaw(x);
  const hp = c.hp > 0 ? Math.max(1, c.hp - drop) : c.hp;
  const pool = (d: Die) => x.classes.filter((r) => r.hd === d).reduce((t, r) => t + r.lvl, 0);
  const hdUsed = Object.fromEntries(Object.entries(x.hdUsed).map(([d, n]) => [d, Math.min(n ?? 0, pool(Number(d) as Die))]).filter(([d, n]) => n || pool(Number(d) as Die)));
  const gone = rec.picks['mastery'] ?? [];
  return normalize({ ...x, hp, hdUsed, mastery: x.mastery.filter((k) => !gone.includes(k)), levels: x.levels.slice(0, -1) });
}
