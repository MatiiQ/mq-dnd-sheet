import { describe, expect, it } from 'vitest';
import { mergeCatalog } from './catalog/merge';
import type { ChoiceSpec, ClassEntry, Entry, FeatureEntry, SubclassEntry } from './catalog/schema';
import { applyLevel, emptyCharacter, fixedHp, hpGain, levelPlan, levelSet, prereqCheck, withLevel, type ClassPick, type LevelAnswers } from './levelup';
import { abilityMod, longRest, maxHpOf } from './logic';
import { migrate } from './migrate';
import type { Character } from './types';

// ---- A synthetic catalog (invented names and numbers; only the shapes match the SRD) ----
const skills = (pick: number, pool = 'skill:stealth|survival|nature|insight'): ChoiceSpec => ({ kind: 'choice', id: 'skills', name: 'Skills', pick, pool });
const cls = (name: string, hd: 6 | 8 | 10 | 12, p: Partial<ClassEntry> = {}): ClassEntry =>
  ({ id: 'class/' + name.toLowerCase(), kind: 'class', name, src: 'srd', desc: '', hd, saves: 'str,dex', skills: skills(1), armor: 'Light armor', weapons: 'Simple weapons', slots: [], ...p });
const feat = (c: string, slugName: string, lvl: number, p: Partial<FeatureEntry> = {}): FeatureEntry =>
  ({ id: `feature/${c}/${slugName}`, kind: 'feature', name: slugName.replace(/-/g, ' '), src: 'srd', desc: '', cls: c, lvl, grants: [], ...p });
const sub = (c: string, s: string): SubclassEntry => ({ id: `subclass/${c}/${s}`, kind: 'subclass', name: s, src: 'srd', desc: '', cls: c });
const entries: Entry[] = [
  cls('Ranger', 10, { primary: 'dex,wis', weapons: 'Simple weapons,Martial weapons', multi: { weapons: 'Martial weapons', skills: { ...skills(1), id: 'mskills' } } }),
  cls('Sorcerer', 6, { primary: 'cha' }),
  cls('Rogue', 8, { primary: 'dex', skills: skills(2) }),
  cls('Bard', 8, { primary: 'cha', multi: { armor: 'Light armor', tools: { kind: 'choice', id: 'mtools', name: 'Tool', pick: 1, pool: 'tool:musical-instrument' } } }),
  cls('Warlock', 8, { primary: 'cha' }),
  cls('Fighter', 10, { primary: 'str|dex' }),
  feat('ranger', 'favored', 1),
  feat('ranger', 'fighting', 2, { grants: [{ id: 'g1', kind: 'sense', name: 'Blindsight', range: '10' }, { id: 'g2', kind: 'defense', name: 'Poison', def: 'res', target: 'Poison' },
    { id: 'g3', kind: 'resource', name: 'Grit', max: '2', recharge: 'long' }] }),
  feat('ranger', 'ranger-subclass', 3, { grants: [{ kind: 'choice', id: 'sub', name: 'Subclass', pick: 1, pool: 'subclass:cls=ranger' }] }),
  feat('ranger', 'roving', 4),
  feat('ranger', 'extra-attack', 5),
  feat('ranger', 'tireless', 6),
  sub('ranger', 'hunter'), sub('ranger', 'gloom'),
  feat('ranger', 'prey', 3, { sub: 'hunter' }), feat('ranger', 'defense', 7, { sub: 'hunter' }), feat('ranger', 'dread', 3, { sub: 'gloom' }),
  feat('rogue', 'reliable', 1, { again: '3' }),
  feat('warlock', 'eldritch-invocations', 1, { grants: [{ kind: 'choice', id: 'inv', name: 'Invocations', pick: 1, pickAt: '1:1,2:3,5:5', pool: 'other:any' }] }),
  feat('sorcerer', 'metamagic', 2, { again: '10', grants: [{ kind: 'choice', id: 'meta', name: 'Metamagic', pick: 2, pickAt: '2:2,10:4', pool: 'other:any' }] })
];
const cat = mergeCatalog(entries, null);

const A = (p: Partial<LevelAnswers> = {}): LevelAnswers => ({ flows: {}, spells: {}, ...p });
const flow = (picks: Record<string, string[]>) => ({ '': { picks, counted: {}, links: {} } });
const up = (c: Character, pick: ClassPick, ans: LevelAnswers = A()) => applyLevel(c, levelPlan(c, pick, cat, ans)!, ans, cat).c;
const fresh = (abil: Partial<Character['abil']> = {}) => ({ ...emptyCharacter(), abil: { ...emptyCharacter().abil, ...abil } });
const ranger1 = (abil: Partial<Character['abil']> = {}) => up(fresh(abil), { cls: 'class/ranger' }, A({ flows: { 'profs/skills': flow({ skills: ['stealth'] }) } }));
const fixed = (p: Partial<LevelAnswers> = {}) => A({ hp: { mode: 'fixed', val: 6 }, ...p });
const row = (c: Character, clsId: string) => c.classes.find((r) => r.clsId === clsId)!;
const levelTo = (c: Character, clsId: string, n: number) => { while (row(c, clsId).lvl < n) c = up(c, { row: row(c, clsId).id }, fixed()); return c; };

describe('level engine core [11a]', () => {
  it('level 1 stores hp.mode max', () => {
    const c = ranger1({ con: 14 });
    const r = c.classes[0];
    expect(r).toMatchObject({ clsId: 'class/ranger', name: 'Ranger', lvl: 1, hd: 10 });
    expect(r.id).not.toContain('.');
    expect(maxHpOf(c)).toBe(12);
    expect(c.hp).toBe(12);
    expect(c.levels).toHaveLength(1);
    expect(c.levels[0]).toMatchObject({ n: 1, cls: r.id, hp: { mode: 'max', val: 10, gain: 10 } });
    expect(c.levels[0].base).toBeUndefined();
    const saves = c.grants.filter((g) => g.from === 'class:' + r.id && g.cat === 'save').map((g) => g.target);
    expect(saves).toEqual(['str', 'dex']);
    expect(c.grants.some((g) => g.from === 'class:' + r.id && g.cat === 'skill' && g.target === 'stealth')).toBe(true);
    for (const g of c.grants.filter((x) => x.from === 'class:' + r.id)) expect(c.levels[0].added).toContain('grant:' + g.id);
  });
  it('withLevel raises the row before the plan reads it', () => {
    const fighter5 = levelTo(up(fresh(), { cls: 'class/fighter' }, A({ flows: { 'profs/skills': flow({ skills: ['stealth'] }) } })), 'class/fighter', 5);
    const inv = levelPlan(fighter5, { cls: 'class/warlock' }, cat, A())!.steps.find((s) => s.entry?.id === 'feature/warlock/eldritch-invocations')!;
    expect((inv.entry as FeatureEntry).grants[0]).toMatchObject({ pick: 1 });
    expect(withLevel(fighter5, { cls: 'class/warlock' }, cat).c.classes.at(-1)).toMatchObject({ clsId: 'class/warlock', lvl: 1, hd: 8 });
    let s = up(fresh(), { cls: 'class/sorcerer' }, A({ flows: { 'profs/skills': flow({ skills: ['stealth'] }) } }));
    s = { ...s, feats: [...s.feats, { id: 'mm', g: 'class', name: 'Metamagic', desc: '', cid: 'feature/sorcerer/metamagic' }] };
    s = { ...s, classes: [{ ...s.classes[0], lvl: 9 }], levels: [{ base: true, n: 9, cls: s.classes[0].id, added: [], picks: {}, set: [] }] };
    const mm = levelPlan(s, { row: s.classes[0].id }, cat, A())!.steps.find((x) => x.entry?.id === 'feature/sorcerer/metamagic')!;
    expect((mm.entry as FeatureEntry).grants[0]).toMatchObject({ pick: 4 });
  });
  it('HP roll with CON −1 rolling 1 gives 1', () => {
    expect(hpGain(1, -1, 0)).toBe(2);
    expect(fixedHp(10)).toBe(6);
    const c = ranger1({ con: 8 });
    const next = up(c, { row: c.classes[0].id }, A({ hp: { mode: 'roll', val: 1 } }));
    expect(maxHpOf(next) - maxHpOf(c)).toBe(1);
  });
  it('a v1 character with +3 CON keeps the bonus', () => {
    const c = { ...ranger1({ con: 16 }), conBase: 3, maxHp: 13 };
    const next = up(c, { row: c.classes[0].id }, fixed());
    expect(next.levels.at(-1)!.hp).toEqual({ mode: 'fixed', val: 6, gain: 9 });
    expect(maxHpOf(next) - maxHpOf(c)).toBe(9);
  });
  it('current HP rises by the change in the raw maximum', () => {
    const c = ranger1({ con: 16 });
    const next = up(c, { row: c.classes[0].id }, A({ hp: { mode: 'roll', val: 4 } }));
    expect(next.maxHp - c.maxHp).toBe(4);
    expect(next.hp - c.hp).toBe(7);
  });
  it('a level at 0 HP leaves current HP at 0', () => {
    const c = { ...ranger1(), hp: 0, ds: 1 };
    const next = up(c, { row: c.classes[0].id }, fixed());
    expect(next).toMatchObject({ hp: 0, ds: 1 });
    expect(maxHpOf(next)).toBeGreaterThan(maxHpOf(c));
  });
  it('a level for a character whose raw maximum is below 1 raises hp by the raw change', () => {
    // Raw maximum −2 (shown as 1), fixed 6: the raw rise is 6, so hp 1 + 6 reaches the new maximum, 4.
    const c = { ...ranger1(), maxHp: -2, hp: 1 };
    const next = up(c, { row: c.classes[0].id }, fixed());
    expect(maxHpOf(next)).toBe(4);
    expect(next.hp).toBe(4);
  });
  it('origOn: origHp rises with the level and a Long Rest keeps it', () => {
    const c = { ...ranger1(), hp: 30, maxHp: 30, origHp: 40, origOn: true };
    const next = up(c, { row: c.classes[0].id }, fixed());
    expect([next.maxHp, next.origHp]).toEqual([36, 46]);
    expect(longRest(next).maxHp).toBe(46);
  });
  it('a later class gets only its multiclass set', () => {
    const s = up(fresh(), { cls: 'class/sorcerer' }, A({ flows: { 'profs/skills': flow({ skills: ['insight'] }) } }));
    const plan = levelPlan(s, { cls: 'class/ranger' }, cat, A())!;
    expect(plan.steps.filter((x) => x.kind === 'profs').map((x) => x.choice?.pick)).toEqual([1]);
    const c = applyLevel(s, plan, fixed({ anyway: true, flows: { 'profs/mskills': flow({ mskills: ['nature'] }) } }), cat).c;
    const id = row(c, 'class/ranger').id;
    const got = c.grants.filter((g) => g.from === 'class:' + id).map((g) => g.cat + ':' + (g.target ?? g.name));
    expect(got.sort()).toEqual(['skill:nature', 'weapon:Martial weapons']);
  });
  it('Bard multiclass asks one instrument; a class without multi warns and adds nothing', () => {
    const r = ranger1();
    const bard = levelPlan(r, { cls: 'class/bard' }, cat, A())!.steps.filter((x) => x.kind === 'profs');
    expect(bard.map((x) => x.choice?.pick)).toEqual([1]);
    const sorc = levelPlan(r, { cls: 'class/sorcerer' }, cat, A())!.steps.filter((x) => x.kind === 'profs');
    expect(sorc).toHaveLength(1);
    expect(sorc[0].warn).toBeTruthy();
    const c = applyLevel(r, levelPlan(r, { cls: 'class/sorcerer' }, cat, A())!, fixed({ anyway: true }), cat).c;
    expect(c.grants.filter((g) => g.from === 'class:' + row(c, 'class/sorcerer').id)).toEqual([]);
  });
  it('a feature already on the sheet is not added twice', () => {
    const r = { ...ranger1(), feats: [...ranger1().feats, { id: 'hand', g: 'class' as const, name: 'Fighting', desc: '', cid: 'feature/ranger/fighting' }] };
    const step = levelPlan(r, { row: r.classes[0].id }, cat, A())!.steps.find((s) => s.entry?.id === 'feature/ranger/fighting')!;
    expect(step.onSheet).toBe('hand');
    expect(step.title).toContain('Already on your sheet');
    expect(up(r, { row: r.classes[0].id }, fixed()).feats.filter((f) => f.cid === 'feature/ranger/fighting')).toHaveLength(1);
  });
  it('an again feature missing from the sheet is added at its again level', () => {
    let c = up(fresh(), { cls: 'class/rogue' }, A({ flows: { 'profs/skills': flow({ skills: ['stealth', 'insight'] }) } }));
    c = { ...c, feats: c.feats.filter((f) => f.cid !== 'feature/rogue/reliable') };
    c = levelTo(c, 'class/rogue', 3);
    expect(c.feats.filter((f) => f.cid === 'feature/rogue/reliable')).toHaveLength(1);
  });
  it('no plan at level 20', () => {
    const r = ranger1();
    const c = { ...r, classes: [{ ...r.classes[0], lvl: 20 }], levels: [{ base: true as const, n: 20, cls: r.classes[0].id, added: [], picks: {}, set: [] }] };
    expect(levelPlan(c, { row: r.classes[0].id }, cat)).toBeNull();
  });
  it('a class without catalog data asks for its die', () => {
    const r = ranger1({ dex: 13, wis: 13 });
    const plan = levelPlan(r, { name: 'Artificer', hd: 8 }, cat)!;
    expect(plan.steps.map((s) => s.kind)).toEqual(['prereq', 'hp', 'nocat']);
    expect(levelPlan(r, { row: r.classes[0].id }, null)!.steps.map((s) => s.kind)).toEqual(['hp', 'nocat']);
    const c = applyLevel(r, plan, fixed(), cat).c;
    expect(c.classes.at(-1)).toMatchObject({ name: 'Artificer', hd: 8, clsId: '', lvl: 1 });
  });
  it('added covers every list', () => {
    const r = ranger1();
    const c = up(r, { row: r.classes[0].id }, fixed());
    const kinds = c.levels.at(-1)!.added.map((x) => x.split(':')[0]);
    for (const k of ['feature', 'sense', 'defense', 'res']) expect(kinds).toContain(k);
  });
  it('step keys are stable', () => {
    const a = ranger1(), b = ranger1();
    expect(a.classes[0].id).not.toBe(b.classes[0].id);
    const keys = (c: Character) => levelPlan(c, { row: c.classes[0].id }, cat, A())!.steps.map((s) => s.key);
    expect(keys(a)).toEqual(keys(b));
    const ids = [a.classes[0].id, ...a.feats.map((f) => f.id), ...a.grants.map((g) => g.id)];
    for (const k of keys(a)) for (const id of ids) expect(k).not.toContain(id);
  });
  it('a first caster row records castAb with a string was, and none for a new row', () => {
    const r = ranger1();
    const after = { ...r, classes: [{ ...r.classes[0], castAb: 'wis' as const }] };
    const set = levelSet(r, after);
    expect(set).toEqual([{ key: `row.${r.classes[0].id}.castAb`, was: '', now: 'wis' }]);
    const withRec = { ...after, levels: [...after.levels, { n: 2, cls: r.classes[0].id, added: [], picks: {}, set }] };
    const fixedRows = { ...withRec, classes: [{ ...withRec.classes[0], lvl: 2 }] };
    expect(migrate(JSON.parse(JSON.stringify(fixedRows))).levels.at(-1)!.set).toEqual(set);
    const newRow = { ...after, classes: [...after.classes, { id: 'nr', name: 'X', clsId: '', sub: '', subId: '', lvl: 1, hd: 8 as const, prep: 0, castAb: 'int' as const }] };
    expect(levelSet(after, newRow)).toEqual([]);
    void abilityMod;
  });
});

describe('multiclass prerequisite and subclass [11b]', () => {
  it('multiclass prerequisite (PHB p.44)', () => {
    const r = ranger1({ dex: 13, wis: 13, cha: 10 });
    const plan = levelPlan(r, { cls: 'class/sorcerer' }, cat, A())!;
    const step = plan.steps.find((s) => s.kind === 'prereq')!;
    expect(step.warn).toContain('Charisma 13');
    expect(() => applyLevel(r, plan, fixed(), cat)).toThrow();
    expect(applyLevel(r, plan, fixed({ anyway: true }), cat).c.classes).toHaveLength(2);
    const low = ranger1({ dex: 12, wis: 13, cha: 13 });
    expect(prereqCheck(low, cat.byId.get('class/sorcerer') as ClassEntry, cat).missing.join()).toContain('Dexterity 13');
    expect(prereqCheck(ranger1({ dex: 13, wis: 13, cha: 13 }), cat.byId.get('class/sorcerer') as ClassEntry, cat).ok).toBe(true);
    const art = levelPlan(r, { name: 'Artificer', hd: 8 }, cat)!.steps.find((s) => s.kind === 'prereq')!;
    expect(r.abil.dex).toBe(13);
    expect(art.title).toContain('No prerequisite known for Artificer');
    expect(art.warn).toBeUndefined();
    expect(levelPlan(r, { row: r.classes[0].id }, cat)!.steps.some((s) => s.kind === 'prereq')).toBe(false);
  });
  it('subclass picked at level 3 adds its level-3 features once', () => {
    const c2 = levelTo(ranger1(), 'class/ranger', 2);
    const plan = levelPlan(c2, { row: c2.classes[0].id }, cat, fixed())!;
    expect(plan.steps.find((s) => s.kind === 'subclass')!.choice?.pool).toBe('subclass:cls=ranger');
    const ans = fixed({ sub: 'subclass/ranger/hunter' });
    const again = levelPlan(c2, { row: c2.classes[0].id }, cat, ans)!;
    expect(again.steps.filter((s) => s.entry?.id === 'feature/ranger/prey')).toHaveLength(1);
    expect(again.steps.some((s) => s.entry?.id === 'feature/ranger/dread')).toBe(false);
    const c3 = applyLevel(c2, again, ans, cat).c;
    expect(c3.classes[0]).toMatchObject({ sub: 'hunter', subId: 'subclass/ranger/hunter' });
    expect(c3.feats.filter((f) => f.cid === 'feature/ranger/prey')).toHaveLength(1);
    const keys = c3.levels.at(-1)!.set.map((x) => x.key);
    expect(keys).toEqual(expect.arrayContaining([`row.${c2.classes[0].id}.sub`, `row.${c2.classes[0].id}.subId`]));
    const typed = applyLevel(c2, levelPlan(c2, { row: c2.classes[0].id }, cat, fixed({ sub: 'name:Beast Master' }))!, fixed({ sub: 'name:Beast Master' }), cat).c;
    expect(typed.classes[0]).toMatchObject({ sub: 'Beast Master', subId: '' });
  });
});
