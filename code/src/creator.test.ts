// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeCatalog } from './catalog/merge';
import type { ChoiceSpec, ClassEntry, Entry, FeatureEntry, GrantSpec } from './catalog/schema';
import { creatorScreens, dropLevelTicks, firstOpen, nextOpen, replayOrigin, replaySteps, stepperModel, type Screen } from './creator';
import { applyRolled, arrayFill, assignScore, bonusMode, chooseClass, classArray, classTileText, clearDraft, DRAFT_KEY, dropLowest, ensureLevel, isAnswers, languageOptions, OLD_STEP_KEYS, parseTotals, pointsSpent, readDraft, replay, setBonusMode, setBonusPick, setFirst, setLevelAns, setLevelPick, setMethod, setStart, stageName, STANDARD_ARRAY, staleStep, toAnswerPick, writeDraft, type CreatorAnswers } from './creator';
import { isActive } from './links';
import { maxHpOf, skillLevel } from './logic';
import type { Character } from './types';
import { noIds } from './test-fixtures';

const skills: ChoiceSpec = { kind: 'choice', id: 'skills', name: 'Skills', pick: 2, pool: 'skill:stealth|insight|survival|nature' };
const ranger: ClassEntry = { id: 'class/ranger', kind: 'class', name: 'Ranger', src: 'srd', desc: '', hd: 10, saves: 'str,dex', skills, armor: '', weapons: '', slots: [], primary: 'dex,wis' };
const rogue: ClassEntry = { ...ranger, id: 'class/rogue', name: 'Rogue', hd: 8, primary: 'dex' };
const feat = (c: string, s: string, lvl: number, p: Partial<FeatureEntry> = {}): FeatureEntry => ({ id: `feature/${c}/${s}`, kind: 'feature', name: s, src: 'srd', desc: '', cls: c, lvl, grants: [], ...p });
const lang = (name: string): Entry => ({ id: 'prof/' + name.toLowerCase(), kind: 'prof', name, src: 'srd', desc: '', cat: 'language' } as Entry);
const entries: Entry[] = [ranger, rogue, feat('ranger', 'tracker', 2), feat('ranger', 'scout', 3),
  feat('ranger', 'deft', 1, { grants: [{ kind: 'choice', id: 'exp', name: 'Expertise', pick: 1, pool: 'skill:proficient' }, { id: 'g1', kind: 'prof', name: 'Expertise', cat: 'expertise', target: '$exp' }] }),
  { id: 'background/sage', kind: 'background', name: 'Sage', src: 'srd', desc: '', feat: 'feat/none', equip: '',
    grants: [{ kind: 'choice', id: 'abil', name: 'Ability scores', pick: 2, options: [{ id: 'o1', kind: 'abil', name: 'INT +1', ab: 'int', val: '1', cap: 20 }, { id: 'o2', kind: 'abil', name: 'WIS +1', ab: 'wis', val: '1', cap: 20 }] }] } as Entry,
  { id: 'background/acolyte', kind: 'background', name: 'Acolyte', src: 'srd', desc: '', feat: 'feat/none', equip: '',
    grants: [{ kind: 'choice', id: 'tool', name: 'Tool', pick: 1, options: [{ id: 't1', kind: 'prof', name: 'Lute', cat: 'tool', target: 'Lute' }] }, { id: 'g1', kind: 'prof', name: 'Insight', cat: 'skill', target: 'insight' }] } as Entry,
  { id: 'species/elf', kind: 'species', name: 'Elf', src: 'srd', desc: '', sizes: 'medium', speed: 30 } as Entry,
  { id: 'trait/elf/late-gift', kind: 'trait', name: 'Late Gift', src: 'srd', desc: '', species: 'elf', lvl: 3, grants: [] } as Entry,
  lang('Common'), lang('Elvish'), lang('Dwarvish')];
const cat = mergeCatalog(entries, null);

const flow = (picks: Record<string, string[]>) => ({ '': { picks, counted: {}, links: {} } });
const base = (p: Partial<CreatorAnswers> = {}): CreatorAnswers => ({
  cls: 'class/ranger', equip: 'none', start: 1, background: 'background/sage', bgFlow: flow({ abil: ['o1', 'o2'] }), species: 'species/elf', spFlow: {},
  skills: ['stealth', 'survival'], languages: [], method: 'array', scores: { str: 10, dex: 15, con: 14, int: 12, wis: 13, cha: 8 },
  details: { name: 'Thorin', align: 'Neutral', appearance: 'Tall', notes: 'From the north' },
  first: { flows: { 'feature:feature/ranger/deft@1': flow({ exp: ['stealth'] }) }, spells: {} },
  levels: [], ...p
});
const lvl = (_n: number) => ({ pick: { cls: 'class/ranger' }, ans: { hp: { mode: 'fixed' as const, val: 6 }, flows: {}, spells: {} } });

describe('creator replay', () => {
  it('two replays give the same character with ids ignored, and answers replay on a fresh sheet', () => {
    const a = base({ start: 3, levels: [lvl(2), lvl(3)] });
    const one = replay(cat, a), two = replay(cat, a);
    expect(one.dropped).toEqual([]);
    expect(two.dropped).toEqual([]);
    expect(one.c.classes[0].id).not.toBe(two.c.classes[0].id);
    expect(noIds(one.c)).toEqual(noIds(two.c));
    expect(one.c.classes[0].lvl).toBe(3);
    expect(one.c).toMatchObject({ ch: { name: 'Thorin', align: 'Neutral', species: 'Elf' }, notes: { appearance: 'Tall', backstory: 'From the north' } });
  });
  it('Point Buy 15,15,15,8,8,8 costs 27; 4 dice each drops the lowest', () => {
    expect(pointsSpent({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 })).toBe(27);
    expect(dropLowest([1, 6, 4, 3])).toBe(13);
  });
  it('species features gated by level are added before level 1 and active at their level', () => {
    const one = replay(cat, base()).c;
    const gift = one.feats.find((f) => f.cid === 'trait/elf/late-gift')!;
    expect(gift.minLvl).toBe(3);
    expect(isActive(one, gift)).toBe(false);
    const three = replay(cat, base({ start: 3, levels: [lvl(2), lvl(3)] })).c;
    expect(isActive(three, three.feats.find((f) => f.cid === 'trait/elf/late-gift')!)).toBe(true);
  });
  it('lowering the starting level drops later level answers', () => {
    const r = replay(cat, base({ start: 3, levels: [lvl(2), lvl(3), lvl(4), lvl(5)] }));
    expect(r.c.classes[0].lvl).toBe(3);
    expect(r.dropped.join(' ')).toContain('Level 4');
    expect(r.dropped.join(' ')).toContain('Level 5');
  });
  it('languages are added', () => {
    const r = replay(cat, base({ languages: ['Elvish', 'Dwarvish', 'Gnomish'] }));
    expect(r.c.profs.filter((p) => p.cat === 'language').map((p) => p.name)).toEqual(['Common', 'Elvish', 'Dwarvish']);
    expect(r.dropped.join(' ')).toContain('Gnomish');
  });
  it('class and skills have one copy', () => {
    const r = replay(cat, base({ first: { flows: { 'profs/skills': flow({ skills: ['nature', 'insight'] }), 'feature:feature/ranger/deft@1': flow({ exp: ['stealth'] }) }, spells: {} } }));
    const id = r.c.classes[0].id;
    expect(r.c.grants.filter((g) => g.from === 'class:' + id && g.cat === 'skill').map((g) => g.target).sort()).toEqual(['stealth', 'survival']);
  });
  it('a new background drops the class skill picks it now holds', () => {
    const r = replay(cat, base({ background: 'background/acolyte', bgFlow: flow({ tool: ['t1'] }), skills: ['stealth', 'insight'] }));
    expect(r.dropped.join(' ')).toContain('insight');
  });
  it('a stale background flow does not throw', () => {
    const r = replay(cat, base({ background: 'background/acolyte', bgFlow: flow({ abil: ['o1', 'o2'] }) }));
    expect(r.dropped.join(' ')).toContain('Tool');
    expect(r.c.feats.some((f) => f.cid === 'background/acolyte')).toBe(false);
  });
  it('level 1 starts at full HP', () => {
    const c = replay(cat, base()).c;
    expect(c.hp).toBe(maxHpOf(c));
    expect(c.hp).toBe(12);
  });
  it('staleStep finds the first step naming a missing catalog id', () => {
    expect(staleStep(cat, base())).toBeNull();
    expect(staleStep(cat, base({ background: 'background/gone' }))).toBe('origin/background');
    expect(staleStep(cat, base({ cls: 'class/gone' }))).toBe('class');
  });
});

describe('the draft', () => {
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
  it('drops a draft that does not parse or has an unknown version, with a notice', () => {
    localStorage.setItem(DRAFT_KEY, '{');
    const r = readDraft();
    expect(r.draft).toBeNull();
    expect(r.notice).toBeTruthy();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 99, step: 0, answers: base() }));
    expect(readDraft()).toMatchObject({ draft: null });
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
  it('drops a draft whose answers do not fit the creator, with a notice', () => {
    const { details: _d, ...noDetails } = base();
    for (const answers of [noDetails, { ...base(), levels: 'x' }, { ...base(), start: 99 }, { ...base(), first: { flows: {}, spells: { k: [1] } } }]) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1, step: 0, answers }));
      expect(readDraft()).toMatchObject({ draft: null, notice: expect.stringContaining('damaged') });
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1, step: 9, answers: base() }));
    expect(readDraft().draft).toBeNull();
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1, step: 5, answers: base({ start: 2, levels: [lvl(2)] }) }));
    expect(readDraft().draft).toMatchObject({ step: 'summary' });
  });
  it('writes, reads back and clears; storage full gives false and nothing throws', () => {
    expect(writeDraft({ v: 1, step: 'abilities/scores', answers: base() })).toBe(true);
    expect(readDraft().draft).toMatchObject({ step: 'abilities/scores' });
    clearDraft();
    expect(readDraft().draft).toBeNull();
    const full = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(writeDraft({ v: 1, step: 'abilities/scores', answers: base() })).toBe(false);
    full.mockRestore();
  });
});

describe('class tiles', () => {
  const WIZ_ARRAY = { str: 8, dex: 12, con: 13, int: 15, wis: 14, cha: 10 };
  it('classTileText: likes and complexity when both are set, else the blurb', () => {
    expect(classTileText({ ...ranger, likes: 'Battle', complexity: 'Low', blurb: 'x' }).body).toBe('Likes Battle · Low complexity');
    expect(classTileText({ ...ranger, likes: 'Battle', blurb: 'x' }).body).toBe('x');
    expect(classTileText(ranger).body).toBe('');
  });
  it('classTileText meta: die, primary abilities, saves', () => {
    expect(classTileText(ranger).meta).toBe('d10 · Primary: Dexterity and Wisdom · Saves: STR, DEX');
    expect(classTileText({ ...ranger, primary: 'str|dex' }).meta).toBe('d10 · Primary: Strength or Dexterity · Saves: STR, DEX');
    expect(classTileText({ ...ranger, primary: undefined }).meta).toBe('d10 · Saves: STR, DEX');
  });
  it('classArray: a permutation, else undefined', () => {
    expect(classArray({ ...ranger, stdArray: WIZ_ARRAY })).toEqual(WIZ_ARRAY);
    expect(classArray({ ...ranger, stdArray: { ...WIZ_ARRAY, cha: 9 } })).toBeUndefined();
    expect(classArray(ranger)).toBeUndefined();
  });
});

describe('answers and draft', () => {
  afterEach(() => { localStorage.clear(); });
  const writeRaw = (d: unknown) => localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  const FIXED = { mode: 'fixed' as const, val: 6 };
  const NEW = (): CreatorAnswers => ({ cls: '', start: 1, bgFlow: {}, spFlow: {}, skills: [], languages: [], method: 'array', scores: {},
    details: { name: '', align: '', appearance: '', notes: '' }, first: { flows: {}, spells: {} }, levels: [] });
  const WIZ_ARRAY = { str: 8, dex: 12, con: 13, int: 15, wis: 14, cha: 10 };
  const wizardWithArray: ClassEntry = { ...ranger, id: 'class/wizard', name: 'Wizard', hd: 6, primary: 'int', stdArray: WIZ_ARRAY };
  const fighterNoArray: ClassEntry = { ...ranger, id: 'class/fighter', name: 'Fighter', primary: 'str|dex' };
  const withPicks = (abil: string[]): CreatorAnswers => ({ ...NEW(), bgFlow: { '': { picks: { abil }, counted: {}, links: {} } } });

  it('old numeric steps map to the first screen of their stage; bad numbers discard the draft', () => {
    for (const [n, key] of OLD_STEP_KEYS.entries()) { writeRaw({ v: 1, step: n, answers: base() }); expect(readDraft().draft!.step).toBe(key); }
    for (const bad of [-1, 2.5, 99]) { writeRaw({ v: 1, step: bad, answers: base() }); expect(readDraft().notice).toMatch(/damaged/); }
  });
  it('screen keys with / and > round-trip through the draft', () => {
    writeDraft({ v: 1, step: 'origin/sp/>trait/elf/elven-lineage/lineage', answers: base() });
    expect(readDraft().draft!.step).toBe('origin/sp/>trait/elf/elven-lineage/lineage');
  });
  it('an old rolled draft keeps its six scores as the pool; with fewer, scores clear', () => {
    writeRaw({ v: 1, step: 2, answers: base({ method: 'rolled', scores: { str: 14, dex: 14, con: 12, int: 10, wis: 9, cha: 8 } }) });
    expect(readDraft().draft!.answers.rolled).toEqual([14, 14, 12, 10, 9, 8]);
    writeRaw({ v: 1, step: 2, answers: base({ method: 'rolled', scores: { str: 14 } }) });
    expect(readDraft().draft!.answers.scores).toEqual({});
    writeRaw({ v: 1, step: 2, answers: base({ method: 'rolled', scores: { str: 8, dex: 14, con: 12, int: 10, wis: 9, cha: 20 } }) });
    expect(readDraft().draft!.answers).toMatchObject({ scores: {} });
    expect(readDraft().draft!.answers.rolled).toBeUndefined();
    writeRaw({ v: 1, step: 2, answers: base({ method: 'rolled', scores: { str: 8, dex: 14, con: 12, int: 10, wis: 9, cha: 15 } }) });
    expect(readDraft().draft!.answers.rolled).toEqual([8, 14, 12, 10, 9, 15]);
  });
  it('isAnswers accepts unset equip and old none; refuses a bad rolled', () => {
    expect(isAnswers({ ...base(), equip: undefined })).toBe(true);
    expect(isAnswers(base({ equip: 'none' }))).toBe(true);
    expect(isAnswers({ ...base(), rolled: [3, 4, 5, 6, 7] })).toBe(false);
    expect(isAnswers({ ...base(), rolled: [3, 4, 5, 6, 7, 19] })).toBe(false);
    expect(isAnswers({ ...base(), rolled: [3, 4, 5, 6, 7, 18] })).toBe(true);
  });
  it('an old draft with a typed-class level pick opens', () => {
    const a = base({ start: 2, levels: [{ pick: { name: 'Mystic', hd: 8 }, ans: { hp: FIXED, flows: {}, spells: {} } }] });
    writeRaw({ v: 1, step: 4, answers: a });
    expect(readDraft().draft).not.toBeNull();
  });
  it('stageName from a key', () => {
    expect(['class/start', 'origin/bg/_/tool', 'abilities/bonus', 'equipment', 'details', 'level/3/features', 'summary', 'nope'].map(stageName))
      .toEqual(['Class', 'Origin', 'Abilities', 'Equipment', 'Details', 'Level 3', 'Summary', undefined]);
  });
  it('arrayFill: stdArray (Wizard), the shortcut (Fighter STR|DEX), Rolled by rank', () => {
    expect(arrayFill(wizardWithArray, STANDARD_ARRAY)).toEqual({ int: 15, wis: 14, con: 13, dex: 12, cha: 10, str: 8 });
    expect(arrayFill(fighterNoArray, STANDARD_ARRAY)).toEqual({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 });
    expect(arrayFill(wizardWithArray, [17, 16, 12, 11, 9, 7])).toEqual({ int: 17, wis: 16, con: 12, dex: 11, cha: 9, str: 7 });
    expect(arrayFill(rogue, STANDARD_ARRAY)).toEqual({ dex: 15, con: 14, str: 13, int: 12, wis: 10, cha: 8 });
    expect(arrayFill(rogue, [15, 14])).toEqual({});
  });
  it('a class change refills untouched scores and keeps changed ones; leaves equip unset', () => {
    let a = chooseClass({ ...NEW(), equip: 'A' }, cat, 'class/ranger');
    expect(a.equip).toBeUndefined();
    expect(a.scores).toEqual(arrayFill(ranger, STANDARD_ARRAY));
    expect(chooseClass(a, cat, 'class/ranger')).toBe(a);
    a = chooseClass(a, cat, 'class/rogue');
    expect(a.scores).toEqual(arrayFill(rogue, STANDARD_ARRAY));
    a = assignScore(a, 'cha', 15);
    expect(chooseClass(a, cat, 'class/ranger').scores).toEqual(a.scores);
    const buy = { ...NEW(), method: 'buy' as const, scores: { str: 15, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } };
    expect(chooseClass(buy, cat, 'class/rogue').scores).toEqual(buy.scores);
  });
  it('assignScore swaps, and two equal rolled totals both stay assignable', () => {
    const a = applyRolled({ ...NEW(), method: 'rolled' }, [14, 14, 12, 10, 9, 8], rogue);
    const b = assignScore(a, 'str', 14);
    expect(Object.values(b.scores).filter((v) => v === 14)).toHaveLength(2);
  });
  it('a method change clears scores and keeps rolled: Rolled → Array → Rolled finds the totals', () => {
    const a = applyRolled({ ...NEW(), cls: 'class/rogue', method: 'rolled' }, [16, 14, 12, 11, 10, 9], rogue);
    const arr = setMethod(a, 'array', rogue);
    expect(arr.scores).toEqual(arrayFill(rogue, STANDARD_ARRAY));
    const back = setMethod(arr, 'rolled', rogue);
    expect(back.rolled).toEqual([16, 14, 12, 11, 10, 9]);
    expect(back.scores).toEqual(arrayFill(rogue, back.rolled!));
    expect(setMethod(a, 'buy', rogue).scores).toEqual({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 });
  });
  it('assignScore with two equal rolled totals swaps with the first holder in STR..CHA order', () => {
    const a = { ...NEW(), method: 'rolled' as const, rolled: [14, 14, 12, 10, 9, 8], scores: { str: 8, dex: 14, con: 14, int: 12, wis: 10, cha: 9 } };
    const b = assignScore(a, 'str', 14);
    expect([b.scores.str, b.scores.dex, b.scores.con]).toEqual([14, 8, 14]);
  });
  it('parseTotals refuses anything but six totals from 3 to 18', () => {
    expect(parseTotals('15 14 13 12 10 8')).toEqual([15, 14, 13, 12, 10, 8]);
    expect(parseTotals('15, 14, 13, 12, 10, 8')).toEqual([15, 14, 13, 12, 10, 8]);
    expect(parseTotals('15 14 1')).toBeNull();
    expect(parseTotals('15 14 13 12 10 19')).toBeNull();
    expect(parseTotals('15 14 13 12 10 8.5')).toBeNull();
  });
  it('bonus mode writes picks.abil in one write: three ids, or cleared', () => {
    expect(setBonusMode(withPicks(['o1', 'o2']), 'three', ['o1', 'o2', 'o3']).bgFlow[''].picks.abil).toEqual(['o1', 'o2', 'o3']);
    expect(setBonusMode(withPicks(['o1', 'o2', 'o3']), 'two', ['o1', 'o2', 'o3']).bgFlow[''].picks.abil).toEqual([]);
    expect(bonusMode(['o1', 'o1', 'o2'])).toBe('two');
    expect(bonusMode(['o1', 'o2', 'o3'])).toBe('three');
    expect(bonusMode([])).toBeNull();
  });
  it('setBonusPick: +2 is the repeated id, +1 another; the same ability for both moves it', () => {
    let a = setBonusPick(withPicks([]), 'o1', 2);
    expect(a.bgFlow[''].picks.abil).toEqual(['o1', 'o1']);
    a = setBonusPick(a, 'o2', 1);
    expect(a.bgFlow[''].picks.abil).toEqual(['o1', 'o1', 'o2']);
    a = setBonusPick(a, 'o2', 2);
    expect(a.bgFlow[''].picks.abil).toEqual(['o2', 'o2']);
  });
  it('ensureLevel creates every missing entry up to i and is a no-op on an existing one', () => {
    expect(ensureLevel({ ...base(), levels: [] }, 1).levels).toHaveLength(2);
    expect(ensureLevel({ ...base(), levels: [] }, 1).levels[1]).toEqual({ pick: { cls: 'class/ranger' }, ans: { flows: {}, spells: {} } });
    const a = ensureLevel(base(), 0);
    expect(ensureLevel(a, 0)).toBe(a);
    const typed = { ...base(), levels: [{ pick: { name: 'Mystic', hd: 8 as const }, ans: { flows: {}, spells: {} } }] };
    expect(ensureLevel(typed, 1).levels[1].pick).toEqual({ name: 'Mystic', hd: 8 });
  });
  it('truncation: another class at level k resets its ans and drops later levels; a subclass change keeps level k\'s other answers', () => {
    const a = base({ start: 4, levels: [lvl(2), lvl(3), lvl(4)] });
    const p = setLevelPick(a, 0, { cls: 'class/rogue' });
    expect(p.levels).toEqual([{ pick: { cls: 'class/rogue' }, ans: { flows: {}, spells: {} } }]);
    // The class already chosen, tapped again: nothing changes.
    expect(setLevelPick(a, 0, a.levels[0].pick)).toBe(a);
    const s = setLevelAns(a, 1, (x) => ({ ...x, sub: 'subclass/ranger/x' }));
    expect(s.levels).toHaveLength(2);
    expect(s.levels[1].ans).toMatchObject({ hp: FIXED, sub: 'subclass/ranger/x' });
    expect(setLevelAns(a, 1, (x) => ({ ...x, spells: { k: ['spell/a'] } })).levels).toHaveLength(3);
    const f = setFirst(a, (x) => ({ ...x, sub: 'subclass/ranger/x' }));
    expect(f.levels).toEqual([]);
    expect(setFirst(a, (x) => ({ ...x, mastery: ['dagger'] })).levels).toHaveLength(3);
  });
  it('setStart 5 → 3 truncates levels', () => {
    expect(setStart({ ...base(), start: 5, levels: [lvl(2), lvl(3), lvl(4), lvl(5)] }, 3).levels).toHaveLength(2);
    expect(setStart(base(), 25).start).toBe(20);
    expect(setStart(base(), 0).start).toBe(1);
  });
  it('toAnswerPick names a row by its class id, or its typed name', () => {
    const c = replay(cat, base()).c;
    expect(toAnswerPick(c, { row: c.classes[0].id })).toEqual({ cls: 'class/ranger' });
    expect(toAnswerPick(c, { cls: 'class/rogue' })).toEqual({ cls: 'class/rogue' });
  });
});

// ---- The screen list (creator fixes, Task 14) ----
// base() with both languages chosen, so every Origin screen is ready.
const full = (p: Partial<CreatorAnswers> = {}): CreatorAnswers => base({ languages: ['Elvish', 'Dwarvish'], ...p });
const opt = (id: string, name: string, ab: 'str' | 'dex' | 'con'): GrantSpec => ({ id, kind: 'abil', name, ab, val: '1', cap: 20 });
const soldier = { id: 'background/soldier', kind: 'background', name: 'Soldier', src: 'srd', desc: '', feat: 'feat/none', equip: '', equipA: 'Rope', gpA: 10, gpB: 50,
  grants: [{ kind: 'choice', id: 'abil', name: 'Ability scores', pick: 3, repeat: true, options: [opt('o1', 'STR +1', 'str'), opt('o2', 'DEX +1', 'dex'), opt('o3', 'CON +1', 'con')] },
    { id: 'g1', kind: 'prof', name: 'Athletics', cat: 'skill', target: 'athletics' }] } as Entry;
const fighter: ClassEntry = { ...ranger, id: 'class/fighter', name: 'Fighter', primary: 'str|dex', skills: { ...skills, pool: 'skill:athletics|perception|insight|survival' }, equipA: 'Rope', gpB: 100 };
const wizard: ClassEntry = { ...ranger, id: 'class/wizard', name: 'Wizard', hd: 6, primary: 'int', skills: { ...skills, pool: 'skill:arcana|history|insight|nature' } };
const styleChoice: ChoiceSpec = { kind: 'choice', id: 'style', name: 'Fighting Style', pick: 2, options: ['Archery', 'Defense', 'Dueling'].map((n, i): GrantSpec => ({ id: 's' + (i + 1), kind: 'prof', name: n, cat: 'language', target: n })) };
const prest = { id: 'spell/prestidigitation', kind: 'spell', name: 'Prestidigitation', src: 'srd', desc: '', lvl: 0, school: 'Transmutation', classes: 'wizard', time: 'Action', range: '10 feet', comp: 'V, S', dur: '1 hour', conc: false, ritual: false, fx: 'other' } as Entry;
const extra: Entry[] = [soldier, fighter, wizard, prest,
  feat('fighter', 'style', 2, { grants: [styleChoice] }),
  feat('fighter', 'fighter-subclass', 3, { grants: [{ kind: 'choice', id: 'sub', name: 'Subclass', pick: 1, pool: 'subclass:cls=fighter' }] }),
  { id: 'subclass/fighter/champ', kind: 'subclass', name: 'Champ', src: 'srd', desc: '', cls: 'fighter' } as Entry,
  feat('fighter', 'champ-pick', 3, { sub: 'champ', grants: [{ kind: 'choice', id: 'c', name: 'Champ pick', pick: 1, options: [{ id: 'x1', kind: 'prof', name: 'One', cat: 'language', target: 'One' }] }] }),
  { id: 'feat/mi', kind: 'feat', name: 'Magic Initiate', src: 'srd', desc: '', cat: 'origin', grants: [{ id: 'g1', kind: 'spell', name: 'Prestidigitation', spell: 'spell/prestidigitation' }] } as Entry,
  { id: 'background/sage-mi', kind: 'background', name: 'Sage MI', src: 'srd', desc: '', feat: 'feat/mi', equip: '', grants: [] } as Entry,
  { id: 'species/high-elf', kind: 'species', name: 'High Elf', src: 'srd', desc: '', sizes: 'medium', speed: 30 } as Entry,
  { id: 'trait/high-elf/cantrip', kind: 'trait', name: 'Cantrip', src: 'srd', desc: '', species: 'high-elf', lvl: 1, grants: [{ id: 'g1', kind: 'spell', name: 'Prestidigitation', spell: 'spell/prestidigitation' }] } as Entry,
  feat('wizard', 'gift', 2, { grants: [{ id: 'g1', kind: 'spell', name: 'Prestidigitation', spell: 'spell/prestidigitation' }] })];
const cat2 = mergeCatalog([...entries, ...extra], null);
const keysOf = (r: { screens: { key: string }[] }, prefix = '') => r.screens.map((s) => s.key).filter((k) => k.startsWith(prefix));
const screen = (r: { screens: { key: string; ready: boolean; missing?: string }[] }, key: string) => r.screens.find((s) => s.key === key)!;
const NEW2 = (): CreatorAnswers => ({ cls: '', start: 1, bgFlow: {}, spFlow: {}, skills: [], languages: [], method: 'array', scores: {},
  details: { name: '', align: '', appearance: '', notes: '' }, first: { flows: {}, spells: {} }, levels: [] });
// A Fighter with every origin screen answered (Acolyte: Lute; Elf; Elvish + Dwarvish; Perception + Survival).
const fighterBase = (p: Partial<CreatorAnswers> = {}): CreatorAnswers => full({ cls: 'class/fighter', equip: 'A', background: 'background/acolyte',
  bgFlow: { '': { picks: { tool: ['t1'] }, counted: {}, links: {} } }, languages: ['Elvish', 'Dwarvish'], skills: ['perception', 'survival'],
  scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }, first: { flows: {}, spells: {} }, ...p });
const FX = { mode: 'fixed' as const, val: 6 };
const styleFlow = (picks: string[]) => ({ 'feature:feature/fighter/style@2': { '': { picks: { style: picks }, counted: {}, links: {} } } });

describe('creatorScreens', () => {
  it('no class: only class and class/start, later stages listed without screens', () => {
    const r = creatorScreens(cat2, NEW2(), { fill: true });
    expect(keysOf(r)).toEqual(['class', 'class/start']);
    expect(r.stages.map((s) => s.id)).toEqual(['class', 'origin', 'abilities', 'equipment', 'details', 'level/1', 'summary']);
    expect(r.stages.find((s) => s.id === 'origin')).toMatchObject({ listed: false, done: false });
  });
  it('stage order with one level stage per starting level; no abil and no package question in Origin', () => {
    const r = creatorScreens(cat2, fighterBase({ start: 2, background: 'background/soldier', bgFlow: {} }), { fill: true });
    expect(r.stages.map((s) => s.id)).toEqual(['class', 'origin', 'abilities', 'equipment', 'details', 'level/1', 'level/2', 'summary']);
    expect(keysOf(r, 'origin/')).toEqual(['origin/background', 'origin/species', 'origin/languages', 'origin/skills']);
    expect(keysOf(r, 'abilities/')).toEqual(['abilities/scores', 'abilities/bonus']);
  });
  it('HP and class skills are absent at level 1; level 1 opens with features', () => {
    const r = creatorScreens(cat, full(), { fill: true });
    const l1 = keysOf(r, 'level/1/');
    expect(l1[0]).toBe('level/1/features');
    expect(l1.some((k) => k.includes('/hp') || k.includes('profs/skills'))).toBe(false);
    expect(r.screens.every((s) => s.ready)).toBe(true);
  });
  it('a level lists its screens only once every earlier screen is ready', () => {
    const r = creatorScreens(cat, full({ start: 2, first: { flows: {}, spells: {} } }), { fill: true });
    expect(screen(r, 'level/1/feature:feature/ranger/deft@1/_/exp').ready).toBe(false);
    expect(keysOf(r, 'level/2/')).toEqual([]);
    expect(r.stages.find((s) => s.id === 'level/2')!.listed).toBe(false);
  });
  it('levels never skipped: level 2 features not ready until levels[0] exists; start 3 leaves level 3 unlisted', () => {
    const r = creatorScreens(cat, full({ start: 3 }), { fill: true });
    expect(screen(r, 'level/2/features').ready).toBe(false);
    expect(screen(r, 'level/2/features').missing).toBeTruthy();
    expect(keysOf(r, 'level/3/')).toEqual([]);
    const r2 = creatorScreens(cat, ensureLevel(full({ start: 3 }), 0), { fill: true });
    expect(screen(r2, 'level/2/features').ready).toBe(true);
  });
  it('another class at level 2 (Ranger 1 → Rogue 1) replays a two-class character', () => {
    const a = setLevelAns(setLevelPick(full({ start: 2 }), 0, { cls: 'class/rogue' }), 0, (x) => ({ ...x, hp: FX, flows: { 'profs/skills': flow({ skills: ['insight'] }) } }));
    expect(replay(cat, a).c.classes.map((r) => r.name + ' ' + r.lvl)).toEqual(['Ranger 1', 'Rogue 1']);
  });
  it('fill: Soldier with no bonus or package keeps its skills in the Origin preview; answers unchanged; Create replay has none', () => {
    const a = fighterBase({ background: 'background/soldier', bgFlow: {}, skills: ['perception', 'survival'] });
    const copy = JSON.stringify(a);
    const r = creatorScreens(cat2, a, { fill: true });
    expect(skillLevel(r.replay.originFor.full, 'athletics').level).toBe(1);
    expect(JSON.stringify(a)).toBe(copy);
    expect(replay(cat2, a).dropped.some((d) => d.startsWith('Background'))).toBe(true);
    expect(screen(r, 'abilities/bonus')).toMatchObject({ ready: false, missing: 'Choose your background bonus' });
  });
  it('partial bonus [o1, o1] still replays the background', () => {
    const a = fighterBase({ background: 'background/soldier', bgFlow: { '': { picks: { abil: ['o1', 'o1'] }, counted: {}, links: {} } } });
    const r = replaySteps(cat2, a, { fill: true });
    expect(skillLevel(r.originFor.full, 'athletics').level).toBe(1);
    expect(r.originFor.full.feats.length + r.originFor.full.grants.length).toBeGreaterThan(0);
  });
  it('a background without abil has no bonus screen and ready ignores it', () => {
    const r = creatorScreens(cat2, fighterBase(), { fill: true });
    expect(keysOf(r, 'abilities/')).toEqual(['abilities/scores']);
  });
  it('Equipment: always listed; not ready until answered; old none counts; no group at all is ready', () => {
    const r = creatorScreens(cat2, fighterBase({ equip: undefined }), { fill: true });
    expect(screen(r, 'equipment')).toMatchObject({ ready: false, missing: 'Choose the class starting equipment' });
    expect(screen(creatorScreens(cat2, fighterBase({ equip: 'none' }), { fill: true }), 'equipment').ready).toBe(true);
    expect(screen(creatorScreens(cat, full({ equip: undefined }), { fill: true }), 'equipment').ready).toBe(true);
    const both = creatorScreens(cat2, fighterBase({ equip: undefined, background: 'background/soldier', bgFlow: { '': { picks: { abil: ['o1', 'o2', 'o3'] }, counted: {}, links: {} } } }), { fill: true });
    expect(screen(both, 'equipment').missing).toBe('Choose both starting equipment options');
  });
  it('missing: each not-ready kind has text, a ready screen has none', () => {
    const partial = fighterBase({ bgFlow: {}, languages: [], skills: [], scores: {} });
    const r = creatorScreens(cat2, partial, { fill: true });
    for (const k of ['abilities/scores', 'origin/languages', 'origin/skills', 'origin/bg/_/tool']) expect(screen(r, k).missing).toBeTruthy();
    expect(screen(r, 'origin/languages').missing).toBe('Choose 2 more languages');
    expect(screen(r, 'origin/skills').missing).toBe('Choose 2 more Fighter skills');
    expect(r.screens.filter((s) => s.ready).every((s) => s.missing === undefined)).toBe(true);
    const buy = creatorScreens(cat2, fighterBase({ method: 'buy', scores: { str: 15, dex: 15, con: 15, int: 15, wis: 8, cha: 8 } }), { fill: true });
    expect(screen(buy, 'abilities/scores').missing).toBe('9 points over budget');
  });
  it('the Languages screen offers only the Standard Languages (PHB p.37)', () => {
    const names = languageOptions(mergeCatalog([...entries, lang('Druidic'), lang('Abyssal')], null)).map((p) => p.name);
    expect(names).toContain('Elvish');
    for (const rare of ['Common', 'Druidic', 'Abyssal']) expect(names).not.toContain(rare);
  });
  it('one non-Common language in the catalog: languages asks for 1', () => {
    const oneLangCat = mergeCatalog(entries.filter((e) => e.id !== 'prof/dwarvish'), null);
    expect(screen(creatorScreens(oneLangCat, full({ languages: [] }), { fill: true }), 'origin/languages').missing).toBe('Choose 1 more language');
  });
  it('a background that fails to add makes its Origin screen not ready with a missing text', () => {
    const r = creatorScreens(cat, full({ background: 'background/gone' }), { fill: true });
    expect(screen(r, 'origin/background').ready).toBe(false);
    expect(screen(r, 'origin/background').missing).toMatch(/no longer fits/);
  });
  it('a background choice screen reads a character without the background', () => {
    const r = creatorScreens(cat2, fighterBase({ bgFlow: {} }), { fill: true });
    const s = r.screens.find((x) => x.key === 'origin/bg/_/tool')!;
    expect(s.body).toMatchObject({ kind: 'origin-choice', source: 'bg' });
    expect((s.body as { c: Character }).c.feats).toEqual([]);
  });
  it('Sage (Magic Initiate, Prestidigitation) plus High Elf (Prestidigitation): one Prestidigitation row on the replayed character', () => {
    const a = fighterBase({ background: 'background/sage-mi', bgFlow: {}, species: 'species/high-elf' });
    expect(creatorScreens(cat2, a, { fill: true }).screens.some((s) => s.key.endsWith('/review'))).toBe(false);
    expect(replay(cat2, a).c.spells.filter((s) => s.name === 'Prestidigitation')).toHaveLength(1);
  });
  it('a level feature granting a spell the sheet already has links it in the creator replay (applyLevel noLinks)', () => {
    const a = fighterBase({ cls: 'class/wizard', skills: ['arcana', 'history'], equip: undefined, background: 'background/sage-mi', bgFlow: {}, start: 2, levels: [{ pick: { cls: 'class/wizard' }, ans: { hp: FX, flows: {}, spells: {} } }] });
    const c = replay(cat2, a).c;
    expect(c.classes[0].lvl).toBe(2);
    expect(c.spells.filter((s) => s.name === 'Prestidigitation')).toHaveLength(1);
  });
  it('a typed-class level pick titles its stage "Level 2: Mystic"', () => {
    const a = full({ start: 2, levels: [{ pick: { name: 'Mystic', hd: 8 }, ans: { hp: FX, flows: {}, spells: {} } }] });
    expect(creatorScreens(cat, a, { fill: true }).stages.find((s) => s.id === 'level/2')!.title).toBe('Level 2: Mystic');
  });
  it('picking a subclass adds its feature-choice screens and un-does the level\'s done state', () => {
    const lv2 = { pick: { cls: 'class/fighter' }, ans: { hp: FX, flows: styleFlow(['s1', 's2']), spells: {} } };
    const a = fighterBase({ start: 3, levels: [lv2, { pick: { cls: 'class/fighter' }, ans: { hp: FX, flows: {}, spells: {} } }] });
    const r = creatorScreens(cat2, a, { fill: true });
    expect(r.stages.find((s) => s.id === 'level/3')!.done).toBe(false);
    const withSub = setLevelAns(a, 1, (x) => ({ ...x, sub: 'subclass/fighter/champ' }));
    const r2 = creatorScreens(cat2, withSub, { fill: true });
    expect(keysOf(r2, 'level/3/').some((k) => k.includes('champ-pick'))).toBe(true);
    expect(r2.stages.find((s) => s.id === 'level/3')!.done).toBe(false);
  });
  it('no key has an empty segment; node key "" is written _', () => {
    const r = creatorScreens(cat2, fighterBase({ bgFlow: {}, start: 2 }), { fill: true });
    expect(r.screens.every((s) => !s.key.includes('//') && !s.key.endsWith('/'))).toBe(true);
    expect(keysOf(r)).toContain('origin/bg/_/tool');
  });
});

describe('replaySteps', () => {
  it('every screen ready: the filled replay (the summary preview) equals Create\'s replay', () => {
    const a = fighterBase({ start: 2, levels: [{ pick: { cls: 'class/fighter' }, ans: { hp: FX, flows: styleFlow(['s1', 's2']), spells: {} } }] });
    const r = creatorScreens(cat2, a, { fill: true });
    expect(r.screens.filter((s) => !s.ready).map((s) => s.key)).toEqual([]);
    expect(noIds(r.replay.c)).toEqual(noIds(replaySteps(cat2, a).c));
    expect(r.replay.c.classes[0].lvl).toBe(2);
  });
  it('before[0] holds the class skills so Expertise offers them; replay\'s character is unchanged', () => {
    const a = full({ background: 'background/acolyte', bgFlow: { '': { picks: { tool: ['t1'] }, counted: {}, links: {} } } });
    const r = replaySteps(cat, a, { fill: true });
    expect(r.before[0].skillProf.stealth).toBe(1);
    expect(r.before[0].classes).toEqual([]);
    expect(noIds(replay(cat, a).c)).toEqual(noIds({ ...r.c, ch: replay(cat, a).c.ch, notes: replay(cat, a).c.notes }));
  });
  it('unfinished level 2 (Fighting Style half answered): no dropped entry; Create\'s replay reports it', () => {
    const a = fighterBase({ start: 2, levels: [{ pick: { cls: 'class/fighter' }, ans: { hp: FX, flows: styleFlow(['s1']), spells: {} } }] });
    const r = replaySteps(cat2, a, { fill: true });
    expect(r.dropped).toEqual([]);
    expect(r.c.classes[0].lvl).toBe(1);
    expect(replay(cat2, a).dropped.some((d) => d.startsWith('Level 2'))).toBe(true);
  });
  it('a background with a question still open is not reported while filling; Create\'s replay reports it', () => {
    const a = full({ background: 'background/acolyte', bgFlow: {} });
    expect(replaySteps(cat, a, { fill: true }).dropped.filter((d) => d.startsWith('Background'))).toEqual([]);
    expect(replay(cat, a).dropped.some((d) => d.startsWith('Background'))).toBe(true);
  });
  it('level 1 half answered gives the origin with no class and no dropped', () => {
    const r = replaySteps(cat, full({ first: { flows: {}, spells: {} } }), { fill: true });
    expect(r.c.classes).toEqual([]);
    expect(r.dropped).toEqual([]);
  });
  it('old counted ticks replay as if unticked, in the origin', () => {
    const counted = full({ bgFlow: { '': { picks: { abil: ['o1', 'o2'] }, counted: { o1: true }, links: {} } } });
    expect(replay(cat, counted).c.abil.int).toBe(replay(cat, full()).c.abil.int);
  });
  it('a Ranger 1 with Expertise on a class skill is ready and applies', () => {
    const r = creatorScreens(cat, full(), { fill: true });
    expect(keysOf(r, 'level/1/').every((k) => screen(r, k).ready)).toBe(true);
    expect(r.replay.c.classes[0].clsId).toBe('class/ranger');
  });
});

describe('navigation', () => {
  it('a removed screen moves to the next screen not ready', () => {
    const prev = [{ key: 'level/3/features', ready: true }, { key: 'level/3/feature:feature/x/style@3/_/style', ready: false }, { key: 'level/3/hp', ready: false }] as Screen[];
    const now = [prev[0], prev[2]];
    expect(nextOpen(prev, now, 'level/3/feature:feature/x/style@3/_/style')).toBe('level/3/hp');
    expect(nextOpen(prev, now, 'level/3/features')).toBe('level/3/features');
  });
  it('a level whose entry is missing lists the same screens as after ensureLevel', () => {
    const a = full({ start: 3, levels: [lvl(2)] });
    const before = creatorScreens(cat, a, { fill: true }).screens.filter((s) => s.stage === 'level/3').map((s) => s.key);
    const after = creatorScreens(cat, ensureLevel(a, 1), { fill: true }).screens.filter((s) => s.stage === 'level/3').map((s) => s.key);
    expect(before.length).toBeGreaterThan(0);
    expect(before).toEqual(after);
  });
  it('the collapsed Levels stage jumps to the first not-ready level screen', () => {
    const r = creatorScreens(cat, full({ start: 5, levels: [lvl(2)] }), { fill: true });
    const m = stepperModel(r, 'summary', 5);
    expect(m.jump.levels).toBe('level/3/features');
  });
  it('a saved key that no longer exists lands on the first not-ready screen, or summary when all are ready', () => {
    const r = creatorScreens(cat, full({ languages: [] }), { fill: true });
    expect(firstOpen(r.screens)).toBe('origin/languages');
    expect(firstOpen(creatorScreens(cat, full(), { fill: true }).screens)).toBe('summary');
  });
  it('stepperModel collapses levels above 3 and counts within the level', () => {
    const r5 = creatorScreens(cat, full({ start: 5, levels: [lvl(2)] }), { fill: true });
    const m = stepperModel(r5, 'level/2/hp', 5);
    expect(m.stages.map((s) => s.label)).toContain('Levels 1–5');
    expect(m.line).toMatch(/^Level 2 · .+ \(\d of \d\)$/);
    const m3 = stepperModel(creatorScreens(cat, full(), { fill: true }), 'origin/languages', 1);
    expect(m3.line).toBe('Origin · Languages (3 of 4)');
    expect(m3.stages.find((s) => s.id === 'origin')!.state).toBe('current');
  });
  it('jump goes to the first not-ready screen of a stage, or its first when all are ready', () => {
    const m = stepperModel(creatorScreens(cat, full({ languages: [] }), { fill: true }), 'class', 1);
    expect(m.jump.origin).toBe('origin/languages');
    expect(m.jump.class).toBe('class');
    expect(m.stages.find((s) => s.id === 'abilities')!.enabled).toBe(false);
  });
  it('staleStep returns a screen key', () => {
    expect(staleStep(cat, { ...full(), background: 'background/gone' })).toBe('origin/background');
    expect(staleStep(cat, { ...full(), cls: 'class/gone' })).toBe('class');
    expect(staleStep(cat, full({ start: 2, levels: [{ pick: { cls: 'class/gone' }, ans: { flows: {}, spells: {} } }] }))).toBe('level/2/features');
    expect(staleStep(cat, full())).toBeNull();
  });
});

describe('no-class notice and Stepper ticks (spec 2026-11-10 §1.1, §1.2)', () => {
  const keysOf = (r: ReturnType<typeof creatorScreens>, stage: string) => r.screens.filter((x) => x.stage === stage).map((x) => x.key);
  it('an empty class adds no notice; an unknown one does', () => {
    expect(replayOrigin(cat, { ...full(), cls: '' }).dropped.some((d) => d.includes('Class:'))).toBe(false);
    expect(replayOrigin(cat, { ...full(), cls: 'class/nope' }).dropped).toContain('Class: not in the loaded catalog');
  });
  it('a stage is done only when its screens are ready and every key was passed; Summary never', () => {
    const r = creatorScreens(cat, full(), { fill: true });
    expect(r.screens.every((x) => x.ready)).toBe(true);
    expect(stepperModel(r, 'summary', 1).stages.some((s) => s.state === 'done')).toBe(false);
    const m = stepperModel(r, 'summary', 1, keysOf(r, 'class'));
    expect(m.stages.find((s) => s.id === 'class')!.state).toBe('done');
    expect(m.stages.find((s) => s.id === 'origin')!.state).toBe('ahead');
    const all = r.screens.map((x) => x.key);
    expect(stepperModel(r, 'class', 1, all).stages.find((s) => s.id === 'summary')!.state).not.toBe('done');
  });
  it('the collapsed Levels stage is done only when every level key was passed', () => {
    const a = full({ start: 5, levels: [lvl(2), lvl(3), lvl(4), lvl(5)] });
    const r = creatorScreens(cat, a, { fill: true });
    const levelKeys = r.screens.filter((x) => x.stage.startsWith('level/')).map((x) => x.key);
    expect(levelKeys.length).toBeGreaterThan(5);
    const lv = (passed: string[]) => stepperModel(r, 'class', 5, passed).stages.find((s) => s.id === 'levels')!.state;
    expect(lv(levelKeys.slice(1))).toBe('ahead');
    expect(lv(levelKeys)).toBe('done');
  });
  it('chooseClass drops level, skills and equipment ticks; the scores tick only when they were refilled', () => {
    const passed = ['class', 'origin/background', 'origin/skills', 'equipment', 'abilities/scores', 'level/1/features', 'level/2/hp'];
    const hand = chooseClass(base({ passed, scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 } }), cat, 'class/rogue');
    expect(hand.passed).toEqual(['class', 'origin/background', 'abilities/scores']);
    const fill = chooseClass(base({ passed, scores: arrayFill(ranger, STANDARD_ARRAY) }), cat, 'class/rogue');
    expect(fill.passed).toEqual(['class', 'origin/background']);
    const buy = chooseClass(base({ passed, method: 'buy' }), cat, 'class/rogue');
    expect(buy.passed).toEqual(['class', 'origin/background', 'abilities/scores']);
  });
  it('setStart drops ticks of levels above the new start', () => {
    expect(setStart(base({ start: 5, passed: ['level/4/features', 'level/2/hp'] }), 3).passed).toEqual(['level/2/hp']);
  });
  it('setLevelPick to another class drops that level and later; the same class keeps them', () => {
    const passed = ['level/2/hp', 'level/3/features', 'level/4/hp'];
    const a = base({ start: 4, passed, levels: [lvl(2), lvl(3), lvl(4)] });
    expect(setLevelPick(a, 1, { cls: 'class/rogue' }).passed).toEqual(['level/2/hp']);
    expect(setLevelPick(a, 1, { cls: 'class/ranger' }).passed).toEqual(passed);
  });
  it('setLevelAns drops ticks from the next level on a reshape only', () => {
    const passed = ['level/2/hp', 'level/3/features', 'level/4/hp'];
    const a = base({ start: 4, passed, levels: [lvl(2), lvl(3), lvl(4)] });
    expect(setLevelAns(a, 0, (x) => ({ ...x, sub: 'subclass/x' })).passed).toEqual(['level/2/hp']);
    expect(setLevelAns(a, 0, (x) => ({ ...x, hp: { mode: 'fixed', val: 5 } })).passed).toEqual(passed);
  });
  it('setFirst drops level 2 and later ticks on a reshape', () => {
    const a = base({ start: 3, passed: ['level/1/hp', 'level/2/hp', 'level/3/features'], levels: [lvl(2), lvl(3)] });
    expect(setFirst(a, (x) => ({ ...x, sub: 'subclass/x' })).passed).toEqual(['level/1/hp']);
  });
  it('dropLevelTicks without passed returns the same object', () => {
    const a = base();
    expect(dropLevelTicks(a, 1)).toBe(a);
  });
  it('isAnswers accepts an absent or string-list passed; refuses a damaged one', () => {
    expect(isAnswers(base())).toBe(true);
    expect(isAnswers(base({ passed: ['class'] }))).toBe(true);
    expect(isAnswers({ ...base(), passed: 3 })).toBe(false);
    expect(isAnswers({ ...base(), passed: [1] })).toBe(false);
  });
});
