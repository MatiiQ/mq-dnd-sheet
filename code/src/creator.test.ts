// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeCatalog } from './catalog/merge';
import type { ChoiceSpec, ClassEntry, Entry, FeatureEntry } from './catalog/schema';
import { applyRolled, arrayFill, assignScore, bonusMode, chooseClass, classArray, classTileText, clearDraft, DRAFT_KEY, dropLowest, ensureLevel, isAnswers, OLD_STEP_KEYS, parseTotals, pointsSpent, readDraft, replay, setBonusMode, setBonusPick, setFirst, setLevelAns, setLevelPick, setMethod, setStart, stageName, STANDARD_ARRAY, staleStep, toAnswerPick, writeDraft, type CreatorAnswers } from './creator';
import { isActive } from './links';
import { maxHpOf } from './logic';
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
    expect(staleStep(cat, base({ background: 'background/gone' }))).toBe(1);
    expect(staleStep(cat, base({ cls: 'class/gone' }))).toBe(0);
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
