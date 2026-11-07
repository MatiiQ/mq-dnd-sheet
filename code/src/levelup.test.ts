import { describe, expect, it } from 'vitest';
import { mergeCatalog } from './catalog/merge';
import srdEntries from './data/srd/index';
import type { ChoiceSpec, ClassEntry, Entry, FeatureEntry, SubclassEntry } from './catalog/schema';
import { applyLevel, emptyCharacter, fixedHp, heldPicks, hpGain, levelPlan, levelSet, owedPicks, prereqCheck, undoLevel, undoPreview, withLevel, type ClassPick, type LevelAnswers } from './levelup';
import { abilityMod, hdSpent, longRest, maxHpOf, removeRef } from './logic';
import { migrate } from './migrate';
import { blankCharacter } from './defaults';
import type { Character } from './types';

// ---- A synthetic catalog (invented names and numbers; only the shapes match the SRD) ----
const skills = (pick: number, pool = 'skill:stealth|survival|nature|insight'): ChoiceSpec => ({ kind: 'choice', id: 'skills', name: 'Skills', pick, pool });
const cls = (name: string, hd: 6 | 8 | 10 | 12, p: Partial<ClassEntry> = {}): ClassEntry =>
  ({ id: 'class/' + name.toLowerCase(), kind: 'class', name, src: 'srd', desc: '', hd, saves: 'str,dex', skills: skills(1), armor: 'Light armor', weapons: 'Simple weapons', slots: [], ...p });
const feat = (c: string, slugName: string, lvl: number, p: Partial<FeatureEntry> = {}): FeatureEntry =>
  ({ id: `feature/${c}/${slugName}`, kind: 'feature', name: slugName.replace(/-/g, ' '), src: 'srd', desc: '', cls: c, lvl, grants: [], ...p });
const sub = (c: string, s: string): SubclassEntry => ({ id: `subclass/${c}/${s}`, kind: 'subclass', name: s, src: 'srd', desc: '', cls: c });
// The casting tables of the SRD classes (real numbers), copied onto the synthetic classes.
const srd = (id: string) => srdEntries.find((e) => e.id === id)!;
const tables = (id: string): Partial<ClassEntry> => { const e = srd(id) as ClassEntry; return { castAb: e.castAb, slots: e.slots, cantrips: e.cantrips, prepared: e.prepared, ...(e.pact ? { pact: true } : {}) }; };
const entries: Entry[] = [
  cls('Ranger', 10, { primary: 'dex,wis', weapons: 'Simple weapons,Martial weapons', multi: { weapons: 'Martial weapons', skills: { ...skills(1), id: 'mskills' } }, ...tables('class/ranger') }),
  cls('Sorcerer', 6, { primary: 'cha', ...tables('class/sorcerer') }),
  cls('Wizard', 6, { primary: 'int', ...tables('class/wizard') }),
  cls('Rogue', 8, { primary: 'dex', skills: skills(2) }),
  cls('Bard', 8, { primary: 'cha', multi: { armor: 'Light armor', tools: { kind: 'choice', id: 'mtools', name: 'Tool', pick: 1, pool: 'tool:musical-instrument' } } }),
  cls('Warlock', 8, { primary: 'cha', ...tables('class/warlock') }),
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
  feat('rogue', 'expertise', 1, { again: '6', grants: [{ kind: 'choice', id: 'exp', name: 'Expertise', pick: 2, pool: 'skill:proficient' },
    { id: 'g1', kind: 'prof', name: 'Expertise', cat: 'expertise', target: '$exp' }] }),
  srd('feature/fighter/ability-score-improvement'), srd('feature/fighter/epic-boon'), srd('feat/ability-score-improvement'), srd('feat/boon-of-combat-prowess'),
  feat('fighter', 'fighter-subclass', 3, { grants: [{ kind: 'choice', id: 'sub', name: 'Subclass', pick: 1, pool: 'subclass:cls=fighter' }] }),
  sub('fighter', 'eldritch-knight'),
  feat('fighter', 'spellcasting', 3, { sub: 'eldritch-knight', grants: [{ id: 'g1', kind: 'casting', name: 'Spellcasting', ab: 'int', list: 'wizard', cantrips: '3:2,10:3', prepared: '3:3,4:4,7:5', s1: '3:2,4:3,7:4', s2: '7:2' }] }),
  feat('fighter', 'weapon-mastery', 1, { grants: [{ id: 'g1', kind: 'prof', name: 'Weapon Mastery', cat: 'mastery', val: '1:3,4:4' }] }),
  feat('warlock', 'mystic-arcanum', 11, { again: '13,15,17', grants: [{ kind: 'choice', id: 'arc', name: 'Arcanum', pick: 1, pool: 'spell:list=warlock;lvl=6|7|8|9' },
    { id: 'g1', kind: 'spell', name: 'Arcanum', spell: '$arc', always: true }] }),
  ...['careful', 'distant', 'empowered', 'extended', 'heightened', 'quickened'].map((m) => feat('sorcerer', m + '-spell', 2, { of: 'metamagic' })),
  ...([['cure', 1, 'ranger', false], ['aid', 2, 'ranger', false], ['fire-bolt', 0, 'sorcerer,wizard', false], ['shield', 1, 'sorcerer,wizard', false], ['hex', 1, 'warlock', false], ['mist', 2, 'warlock', false],
    ['alarm', 1, 'ranger', true], ['comprehend', 1, 'wizard', true], ['detect', 1, 'wizard', true], ['six', 6, 'warlock', false], ['seven', 7, 'warlock', false]] as const)
    .map(([n, lvl, classes, ritual]) => ({ id: 'spell/' + n, kind: 'spell', name: n, src: 'srd', desc: '', lvl, school: 'x', time: 'Action', range: 'Self', classes, ...(ritual ? { ritual: true } : {}) }) as Entry),
  { id: 'feat/ritual-caster', kind: 'feat', name: 'Ritual Caster', src: 'srd', desc: '', cat: 'general', grants: [{ kind: 'choice', id: 'rit', name: 'Rituals', pick: 2, pickAt: 'pb', pool: 'spell:lvl=1;ritual=true' },
    { id: 'g1', kind: 'spell', name: 'Rituals', spell: '$rit', always: true }] } as Entry,
  feat('warlock', 'eldritch-invocations', 1, { grants: [{ kind: 'choice', id: 'inv', name: 'Invocations', pick: 1, pickAt: '1:1,2:3,5:5', pool: 'other:any' }] }),
  feat('sorcerer', 'metamagic', 2, { again: '10,17', grants: [{ kind: 'choice', id: 'meta', name: 'Metamagic', pick: 2, pickAt: '2:2,10:4,17:6', pool: 'feature:of=metamagic' }] })
];
const cat = mergeCatalog(entries, null);

const A = (p: Partial<LevelAnswers> = {}): LevelAnswers => ({ flows: {}, spells: {}, ...p });
const flow = (picks: Record<string, string[]>) => ({ '': { picks, counted: {}, links: {} } });
const up = (c: Character, pick: ClassPick, ans: LevelAnswers = A()) => applyLevel(c, levelPlan(c, pick, cat, ans)!, ans, cat).c;
const fresh = (abil: Partial<Character['abil']> = {}) => ({ ...emptyCharacter(), abil: { ...emptyCharacter().abil, ...abil } });
const ranger1 = (abil: Partial<Character['abil']> = {}) => up(fresh(abil), { cls: 'class/ranger' }, A({ flows: { 'profs/skills': flow({ skills: ['stealth'] }) } }));
const fighter1 = (abil: Partial<Character['abil']> = {}) => up(fresh(abil), { cls: 'class/fighter' }, A({ flows: { 'profs/skills': flow({ skills: ['stealth'] }) } }));
const fixed = (p: Partial<LevelAnswers> = {}) => A({ hp: { mode: 'fixed', val: 6 }, ...p });
const row = (c: Character, clsId: string) => c.classes.find((r) => r.clsId === clsId)!;
const rogue1 = () => up(fresh(), { cls: 'class/rogue' }, A({ flows: { 'profs/skills': flow({ skills: ['stealth', 'insight'] }), 'feature:feature/rogue/expertise@1': flow({ exp: ['stealth', 'insight'] }) } }));
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
    let c = rogue1();
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
    const r = fighter1();
    expect(r.classes[0].castAb).toBeUndefined();
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

// A character compared with its generated ids blanked out.
const noIds = (c: Character) => JSON.parse(JSON.stringify(c).replace(/"n[0-9a-z]{8,}"/g, '"ID"'));

describe('level undo [11c]', () => {
  it('undo restores the maximum and lowers current HP by the raw change', () => {
    const c = { ...ranger1({ con: 16 }), conBase: 3, maxHp: 13 };
    const next = up(c, { row: c.classes[0].id }, fixed());
    const back = undoLevel(next);
    expect(back.maxHp).toBe(c.maxHp);
    expect(maxHpOf(back)).toBe(maxHpOf(c));
    expect(back.hp).toBe(c.hp);
  });
  it('undo back to level 1 restores the level-1 state', () => {
    const one = ranger1();
    const three = levelTo(one, 'class/ranger', 2);
    const back = undoLevel(three);
    expect(noIds(back)).toEqual(noIds(one));
    expect(undoPreview(one)).toBeNull();
    expect(undoPreview(blankCharacter())).toBeNull();
    expect(undoLevel(one)).toBe(one);
  });
  it('undo skips an added entry removed by hand', () => {
    const one = ranger1();
    const two = up(one, { row: one.classes[0].id }, fixed());
    const f = two.feats.find((x) => x.cid === 'feature/ranger/fighting')!;
    const hand = removeRef(two, { kind: 'feature', id: f.id });
    const prev = undoPreview(hand)!;
    expect(prev.summary.goes).not.toContain(f.name);
    const back = undoLevel(hand);
    expect(back.classes[0].lvl).toBe(1);
  });
  it('undo of a subclass pick clears sub and subId, and no added ref remains', () => {
    const c2 = levelTo(ranger1(), 'class/ranger', 2);
    const ans = fixed({ sub: 'subclass/ranger/hunter' });
    const c3 = applyLevel(c2, levelPlan(c2, { row: c2.classes[0].id }, cat, ans)!, ans, cat).c;
    const added = c3.levels.at(-1)!.added;
    const back = undoLevel(c3);
    expect(back.classes[0]).toMatchObject({ sub: '', subId: '', lvl: 2 });
    const present = new Set([...back.feats, ...back.grants, ...back.senses, ...back.defenses, ...back.res].map((x) => x.id));
    for (const ref of added) expect(present.has(ref.split(':')[1])).toBe(false);
  });
  it('undo after a reload clears a first caster row’s castAb', () => {
    const r = ranger1();
    const two = up(r, { row: r.classes[0].id }, fixed());
    const rec = two.levels.at(-1)!;
    const withCast = { ...two, classes: [{ ...two.classes[0], castAb: 'wis' as const }], levels: [...two.levels.slice(0, -1), { ...rec, set: [...rec.set, { key: `row.${r.classes[0].id}.castAb` as const, was: '', now: 'wis' }] }] };
    const back = undoLevel(migrate(JSON.parse(JSON.stringify(withCast))));
    expect(back.classes[0].castAb).toBeUndefined();
  });
  it('undo removes a new class row whole, with its grants and spell ties', () => {
    const r = ranger1({ dex: 13, wis: 13, cha: 13 });
    const two = up(r, { cls: 'class/sorcerer' }, fixed());
    const id = row(two, 'class/sorcerer').id;
    const tied = { ...two, spells: [{ id: 's', name: 'S', lvl: 1, time: 'Action', range: 'Self', cls: id }] };
    const back = undoLevel(tied);
    expect(back.classes.map((x) => x.clsId)).toEqual(['class/ranger']);
    expect(back.spells[0].cls).toBeUndefined();
  });
  it('undo clamps hdUsed so the level’s die comes back unspent', () => {
    const r = ranger1({ dex: 13, wis: 13 });
    const rogueAns = fixed({ flows: { 'feature:feature/rogue/expertise@1': flow({ exp: ['stealth'] }) } });
    const two = up(r, { cls: 'class/rogue' }, rogueAns);
    const spent = { ...two, hdUsed: { ...two.hdUsed, 8: 1 } };
    const back = undoLevel(spent);
    expect(back.hdUsed[8] ?? 0).toBe(0);
    const again = up(back, { cls: 'class/rogue' }, rogueAns);
    expect(hdSpent(again, 8)).toBe(0);
  });
  it('undo keeps a changed field and lists it', () => {
    const r = ranger1();
    const two = up(r, { row: r.classes[0].id }, fixed());
    const rec = two.levels.at(-1)!;
    const c = { ...two, pactMax: 3, levels: [...two.levels.slice(0, -1), { ...rec, set: [{ key: 'pactMax' as const, was: 0, now: 2 }] }] };
    expect(undoPreview(c)!.unrestored).toEqual(['pactMax']);
    expect(undoLevel(c).pactMax).toBe(3);
  });
});

const at = (c: Character, clsId: string, lvl: number): Character => {
  const r = row(c, clsId);
  return { ...c, classes: c.classes.map((x) => (x === r ? { ...x, lvl } : x)), levels: [{ base: true, n: c.classes.reduce((t, x) => t + (x === r ? lvl : x.lvl), 0), cls: r.id, added: [], picks: {}, set: [] }] };
};
const sorc1 = () => up(fresh(), { cls: 'class/sorcerer' }, A({ flows: { 'profs/skills': flow({ skills: ['insight'] }) } }));
const metaOf = (c: Character) => c.feats.filter((f) => f.cid?.startsWith('feature/sorcerer/') && f.cid.endsWith('-spell')).map((f) => f.cid);

describe('choices owed and growing choices [12]', () => {
  it('Sorcerer 1 → 10, Metamagic without duplicates; at 10 one step with 2 more picks', () => {
    let c = sorc1();
    c = up(c, { row: c.classes[0].id }, fixed({ flows: { 'feature:feature/sorcerer/metamagic@2': flow({ meta: ['feature/sorcerer/careful-spell', 'feature/sorcerer/distant-spell'] }) } }));
    expect(metaOf(c)).toHaveLength(2);
    c = levelTo(c, 'class/sorcerer', 9);
    const plan = levelPlan(c, { row: c.classes[0].id }, cat, A())!;
    const mm = plan.steps.filter((s) => s.entry?.id === 'feature/sorcerer/metamagic');
    expect(mm.map((s) => [s.kind, s.owed])).toEqual([['choice', 2]]);
    expect(mm[0].held).toEqual(['feature/sorcerer/careful-spell', 'feature/sorcerer/distant-spell']);
    c = applyLevel(c, plan, fixed({ flows: { [mm[0].key]: flow({ meta: ['feature/sorcerer/empowered-spell', 'feature/sorcerer/extended-spell'] }) } }), cat).c;
    const got = metaOf(c);
    expect(got).toHaveLength(4);
    expect(new Set(got).size).toBe(4);
    expect(c.feats.filter((f) => f.cid === 'feature/sorcerer/metamagic')).toHaveLength(1);
  });
  it('a v1 Sorcerer with Metamagic picked by hand is not asked again', () => {
    const base = at(sorc1(), 'class/sorcerer', 9);
    const c: Character = { ...base, feats: [...base.feats, { id: 'mm', g: 'class', name: 'Metamagic', desc: '', cid: 'feature/sorcerer/metamagic' },
      { id: 'o1', g: 'class', name: 'Careful', desc: '', cid: 'feature/sorcerer/careful-spell', from: 'feature:mm' },
      { id: 'o2', g: 'class', name: 'Distant', desc: '', cid: 'feature/sorcerer/distant-spell', from: 'feature:mm' }] };
    const step = levelPlan(c, { row: c.classes[0].id }, cat, A())!.steps.find((s) => s.entry?.id === 'feature/sorcerer/metamagic')!;
    expect(step.owed).toBe(2);
    const choice = (cat.byId.get('feature/sorcerer/metamagic') as FeatureEntry).grants[0] as ChoiceSpec;
    expect(heldPicks(c, cat, 'mm', choice)).toHaveLength(2);
    expect(owedPicks(withLevel(c, { row: c.classes[0].id }, cat).c, cat, 'mm', cat.byId.get('feature/sorcerer/metamagic')!, choice)).toBe(2);
  });
  it('Rogue 5 → 6 asks 2 Expertise picks', () => {
    const c = levelTo(rogue1(), 'class/rogue', 5);
    const step = levelPlan(c, { row: c.classes[0].id }, cat, A())!.steps.find((s) => s.entry?.id === 'feature/rogue/expertise')!;
    expect(step).toMatchObject({ kind: 'choice', owed: 2 });
    expect(step.held!.sort()).toEqual(['insight', 'stealth']);
  });
  it('Warlock 11 → 13 asks a level-7 Mystic Arcanum pick', () => {
    let c = at(up(fresh(), { cls: 'class/warlock' }, A({ flows: { 'profs/skills': flow({ skills: ['insight'] }), 'feature:feature/warlock/eldritch-invocations@1': flow({ inv: ['x'] }) } })), 'class/warlock', 12);
    c = { ...c, feats: [...c.feats, { id: 'ma', g: 'class', name: 'Mystic Arcanum', desc: '', cid: 'feature/warlock/mystic-arcanum' }],
      spells: [{ id: 'sx', name: 'six', lvl: 6, time: 'Action', range: 'Self', cid: 'spell/six', from: 'feature:ma', always: true }] };
    const step = levelPlan(c, { row: c.classes[0].id }, cat, A())!.steps.find((s) => s.entry?.id === 'feature/warlock/mystic-arcanum')!;
    expect(step).toMatchObject({ kind: 'choice', owed: 1 });
    expect(step.choice!.pool).toBe('spell:list=warlock;lvl=7');
  });
  it('Ritual Caster grows with PB', () => {
    const base = at(ranger1(), 'class/ranger', 4);
    const c: Character = { ...base, feats: [...base.feats, { id: 'rc', g: 'feat', name: 'Ritual Caster', desc: '', cid: 'feat/ritual-caster' }],
      spells: [{ id: 'a', name: 'alarm', lvl: 1, time: 'Action', range: 'Self', cid: 'spell/alarm', from: 'feature:rc', always: true },
        { id: 'b', name: 'detect', lvl: 1, time: 'Action', range: 'Self', cid: 'spell/detect', from: 'feature:rc', always: true }] };
    const plan = levelPlan(c, { row: c.classes[0].id }, cat, A())!;
    const grow = plan.steps.find((s) => s.kind === 'grow')!;
    expect(grow).toMatchObject({ owed: 1 });
    expect(grow.title).toContain('Ritual Caster: 1 more');
    const next = applyLevel(c, plan, fixed({ flows: { [grow.key]: flow({ rit: ['spell/comprehend'] }) } }), cat).c;
    expect(next.spells.filter((x) => x.from === 'feature:rc').map((x) => x.cid)).toEqual(['spell/alarm', 'spell/detect', 'spell/comprehend']);
  });
  it('the level that adds Weapon Mastery asks its picks: Fighter 1, and a first Fighter level in a multiclass', () => {
    const p1 = levelPlan(fresh(), { cls: 'class/fighter' }, cat, A())!;
    expect(p1.steps.find((s) => s.kind === 'mastery')).toMatchObject({ owed: 3 });
    const c = up(fresh(), { cls: 'class/fighter' }, A({ flows: { 'profs/skills': flow({ skills: ['stealth'] }) } , mastery: ['longsword', 'dagger', 'spear'] }));
    expect(c.mastery).toEqual(['longsword', 'dagger', 'spear']);
    expect(levelPlan(c, { row: c.classes[0].id }, cat, fixed())!.steps.some((s) => s.kind === 'mastery')).toBe(false);
    const r = levelTo(ranger1({ str: 14, dex: 14, wis: 14 }), 'class/ranger', 2);
    expect(levelPlan(r, { cls: 'class/fighter' }, cat, fixed())!.steps.find((s) => s.kind === 'mastery')).toMatchObject({ owed: 3 });
  });
  it('a Weapon Mastery slot gained at a level becomes a step, and undo removes the kind', () => {
    let c = at(up(fresh(), { cls: 'class/fighter' }, A({ flows: { 'profs/skills': flow({ skills: ['stealth'] }) } })), 'class/fighter', 3);
    c = { ...c, mastery: ['longsword', 'dagger', 'spear'] };
    const plan = levelPlan(c, { row: c.classes[0].id }, cat, A())!;
    expect(plan.steps.find((s) => s.kind === 'mastery')).toMatchObject({ owed: 1 });
    const next = applyLevel(c, plan, fixed({ mastery: ['rapier'] }), cat).c;
    expect(next.mastery).toEqual(['longsword', 'dagger', 'spear', 'rapier']);
    expect(undoLevel(next).mastery).toEqual(['longsword', 'dagger', 'spear']);
  });
});

const asi = (feat: string, picks: Record<string, string[]>) => ({ feat, flow: flow(picks) });

describe('Ability Score Improvement and spellcasting [13]', () => {
  it('Fighter 5 → 6 is an asi step on the entry from level 4, not a second feature', () => {
    let c = levelTo(fighter1(), 'class/fighter', 3);
    const p4 = levelPlan(c, { row: c.classes[0].id }, cat, A())!;
    expect(p4.steps.filter((s) => s.kind === 'asi').map((s) => s.key)).toEqual(['asi@4']);
    c = applyLevel(c, p4, fixed({ asi: asi('feat/ability-score-improvement', { asi: ['o1', 'o1'] }) }), cat).c;
    expect(c.abil.str).toBe(10);
    c = levelTo(c, 'class/fighter', 5);
    const p6 = levelPlan(c, { row: c.classes[0].id }, cat, A())!;
    expect(p6.steps.filter((s) => s.entry?.id === 'feature/fighter/ability-score-improvement').map((s) => s.kind)).toEqual(['asi']);
    const c6 = applyLevel(c, p6, fixed({ asi: asi('feat/ability-score-improvement', { asi: ['o2', 'o2'] }) }), cat).c;
    expect(c6.feats.filter((f) => f.cid === 'feature/fighter/ability-score-improvement')).toHaveLength(1);
    expect(c6.feats.filter((f) => f.cid === 'feat/ability-score-improvement')).toHaveLength(2);
  });
  it('an Epic Boon increase is capped at 30, not 20; an ASI past 20 warns', () => {
    const c = at(fighter1({ str: 20 }), 'class/fighter', 18);
    const plan = levelPlan(c, { row: c.classes[0].id }, cat, A())!;
    const step = plan.steps.find((s) => s.kind === 'asi')!;
    expect(step.entry!.id).toBe('feature/fighter/epic-boon');
    const next = applyLevel(c, plan, fixed({ asi: asi('feat/boon-of-combat-prowess', { c1: ['o1'] }) }), cat).c;
    expect(effScoreOf(next, 'str')).toBe(21);
    const four = at(fighter1({ str: 20 }), 'class/fighter', 3);
    const ans = fixed({ asi: asi('feat/ability-score-improvement', { asi: ['o1', 'o1'] }) });
    expect(levelPlan(four, { row: four.classes[0].id }, cat, ans)!.steps.find((s) => s.kind === 'asi')!.warn).toContain('wasted');
  });
  it('a casting class sets castAb, slots and prepared count, and its spells carry its castAb', () => {
    const r = ranger1({ dex: 13, wis: 13, cha: 13 });
    expect(r.classes[0]).toMatchObject({ castAb: 'wis', prep: 2 });
    expect(r.castAb).toBe('wis');
    expect(r.slotMax.slice(0, 3)).toEqual([0, 2, 0]);
    const plan = levelPlan(r, { cls: 'class/sorcerer' }, cat, A())!;
    const cantrips = plan.steps.find((s) => s.kind === 'cantrips')!, prepare = plan.steps.find((s) => s.kind === 'prepare')!;
    expect([cantrips.owed, cantrips.list, prepare.owed, prepare.maxLvl]).toEqual([4, 'sorcerer', 2, 1]);
    const c = applyLevel(r, plan, fixed({ spells: { [cantrips.key]: ['spell/fire-bolt'], [prepare.key]: ['spell/shield'] } }), cat).c;
    const sorc = row(c, 'class/sorcerer');
    expect(sorc.castAb).toBe('cha');
    expect(c.castAb).toBe('wis');
    expect(c.spells.find((x) => x.cid === 'spell/shield')).toMatchObject({ cls: sorc.id, castAb: 'cha', prep: true });
    expect(c.spells.find((x) => x.cid === 'spell/fire-bolt')).toMatchObject({ cls: sorc.id, castAb: 'cha' });
  });
  it('a spell already on the sheet is not added again by a spell step', () => {
    const r = ranger1({ dex: 13, wis: 13, cha: 13 });
    const plan = levelPlan(r, { cls: 'class/sorcerer' }, cat, A())!;
    const key = plan.steps.find((s) => s.kind === 'cantrips')!.key;
    const twice = applyLevel(r, plan, fixed({ spells: { [key]: ['spell/fire-bolt', 'spell/fire-bolt'] } }), cat).c;
    expect(twice.spells.filter((x) => x.cid === 'spell/fire-bolt')).toHaveLength(1);
    const known = { ...r, spells: [...r.spells, { id: 'known', name: 'Fire Bolt', lvl: 0, time: '', range: '', cid: 'spell/fire-bolt' }] } as typeof r;
    const planK = levelPlan(known, { cls: 'class/sorcerer' }, cat, A())!;
    const c = applyLevel(known, planK, fixed({ spells: { [key]: ['spell/fire-bolt'] } }), cat).c;
    expect(c.spells.filter((x) => x.cid === 'spell/fire-bolt')).toHaveLength(1);
  });
  it('Eldritch Knight level and its undo restore castAb through the set difference', () => {
    const c2 = levelTo(fighter1(), 'class/fighter', 2);
    const ans = fixed({ sub: 'subclass/fighter/eldritch-knight' });
    const c3 = applyLevel(c2, levelPlan(c2, { row: c2.classes[0].id }, cat, ans)!, ans, cat).c;
    expect(c3.castAb).toBe('int');
    const set = c3.levels.at(-1)!.set;
    expect(set).toEqual(expect.arrayContaining([{ key: 'castAb', was: 'none', now: 'int' }, { key: `row.${c2.classes[0].id}.castAb`, was: '', now: 'int' }]));
    expect(c3.slotMax.slice(0, 3)).toEqual([0, 2, 0]);
    const reloaded = migrate(JSON.parse(JSON.stringify(c3)));
    expect(reloaded.levels.at(-1)!.set).toEqual(set);
    const back = undoLevel(reloaded);
    expect(back.castAb).toBe('none');
    expect(back.classes[0].castAb).toBeUndefined();
  });
  it('slots from classes: Ranger 5 / Rogue 2, Warlock + Sorcerer pact pool', () => {
    let c = levelTo(ranger1({ dex: 13, wis: 13 }), 'class/ranger', 5);
    expect(c.slotMax.slice(0, 3)).toEqual([0, 4, 2]);
    c = up(c, { cls: 'class/rogue' }, fixed({ flows: { 'feature:feature/rogue/expertise@1': flow({ exp: ['stealth'] }) } }));
    expect(c.slotMax.slice(0, 3)).toEqual([0, 4, 2]);
    let w = up(fresh({ cha: 13 }), { cls: 'class/warlock' }, A({ flows: { 'profs/skills': flow({ skills: ['insight'] }), 'feature:feature/warlock/eldritch-invocations@1': flow({ inv: ['x'] }) } }));
    expect([w.pactMax, w.pactLvl]).toEqual([1, 1]);
    w = up(w, { cls: 'class/sorcerer' }, fixed());
    expect([w.pactMax, w.pactLvl]).toEqual([1, 1]);
    expect(w.slotMax.slice(0, 2)).toEqual([0, 2]);
  });
  it('a hand-edited slotMax is kept and listed; useTable writes the table', () => {
    const r = { ...ranger1(), slotMax: [0, 9, 0, 0, 0, 0, 0, 0, 0, 0] };
    const plan = levelPlan(r, { row: r.classes[0].id }, cat, A())!;
    const kept = applyLevel(r, plan, fixed(), cat);
    expect(kept.c.slotMax[1]).toBe(9);
    expect(kept.kept.map((k) => k.key)).toContain('slotMax');
    expect(applyLevel(r, plan, fixed({ useTable: ['slotMax'] }), cat).c.slotMax[1]).toBe(2);
  });
  it('undo keeps a hand-edited slot row', () => {
    const r = ranger1();
    const four = levelTo(r, 'class/ranger', 5);
    const edited = { ...four, slotMax: [0, 4, 3, 0, 0, 0, 0, 0, 0, 0] };
    expect(undoPreview(edited)!.unrestored).toContain('slotMax');
    expect(undoLevel(edited).slotMax.slice(0, 3)).toEqual([0, 4, 3]);
  });
  it('prepare step limits: a Warlock’s equals pactLvl, a Ranger 4 / Sorcerer 3 prepares no level-2 Ranger spells', () => {
    const w = at(up(fresh({ cha: 13 }), { cls: 'class/warlock' }, A({ flows: { 'profs/skills': flow({ skills: ['insight'] }), 'feature:feature/warlock/eldritch-invocations@1': flow({ inv: ['x'] }) } })), 'class/warlock', 2);
    const wp = levelPlan(w, { row: w.classes[0].id }, cat, A())!.steps.find((s) => s.kind === 'prepare')!;
    expect(wp.maxLvl).toBe(2);
    const rs = at(at(levelTo(ranger1({ dex: 13, wis: 13, cha: 13 }), 'class/ranger', 3), 'class/ranger', 3), 'class/ranger', 3);
    const both = up(rs, { cls: 'class/sorcerer' }, fixed({ anyway: true }));
    const r4 = levelPlan(at(both, 'class/sorcerer', 3), { row: row(both, 'class/ranger').id }, cat, A())!.steps.find((s) => s.kind === 'prepare')!;
    expect(r4.maxLvl).toBe(1);
  });
});
const effScoreOf = (c: Character, a: 'str') => c.abil[a] + c.grants.filter((g) => g.kind === 'abil' && g.ab === a).reduce((t, g) => t + Number(g.val), 0);
