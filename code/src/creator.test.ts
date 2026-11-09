// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeCatalog } from './catalog/merge';
import type { ChoiceSpec, ClassEntry, Entry, FeatureEntry } from './catalog/schema';
import { classArray, classTileText, clearDraft, DRAFT_KEY, dropLowest, pointsSpent, readDraft, replay, staleStep, writeDraft, type CreatorAnswers } from './creator';
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
    expect(readDraft().draft).toMatchObject({ step: 5 });
  });
  it('writes, reads back and clears; storage full gives false and nothing throws', () => {
    expect(writeDraft({ v: 1, step: 2, answers: base() })).toBe(true);
    expect(readDraft().draft).toMatchObject({ step: 2 });
    clearDraft();
    expect(readDraft().draft).toBeNull();
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(writeDraft({ v: 1, step: 2, answers: base() })).toBe(false);
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
