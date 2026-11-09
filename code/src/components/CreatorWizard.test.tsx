// @vitest-environment happy-dom
import { act, StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeCatalog } from '../catalog/merge';
import type { ClassEntry, Entry, GrantSpec } from '../catalog/schema';
import { DRAFT_KEY, type CreatorAnswers, type Draft } from '../creator';
import { btn, label, mount, tap, type, unmount } from '../test-dom';
import type { Character } from '../types';
import { CreatorWizard, NEW_ANSWERS } from './CreatorWizard';

const skills = { kind: 'choice' as const, id: 'skills', name: 'Skills', pick: 2, pool: 'skill:athletics|survival|insight' };
const cls = (name: string, p: Partial<ClassEntry> = {}): ClassEntry => ({ id: 'class/' + name.toLowerCase(), kind: 'class', name, src: 'srd', desc: '', hd: 12, saves: 'str,con', primary: 'str',
  skills, armor: '', weapons: '', slots: [], equipA: 'Rope', gpB: 75, ...p });
const lang = (name: string): Entry => ({ id: 'prof/' + name.toLowerCase(), kind: 'prof', name, src: 'srd', desc: '', cat: 'language' } as Entry);
const abil = (id: string, ab: 'str' | 'dex' | 'con'): GrantSpec => ({ id, kind: 'abil', name: ab.toUpperCase() + ' +1', ab, val: '1', cap: 20 });
const weapon = (n: string): Entry => ({ id: 'item/' + n.toLowerCase(), kind: 'item', name: n, src: 'srd', desc: '', cat: 'weapon', mastery: 'Cleave' } as Entry);
const entries: Entry[] = [
  cls('Barbarian'), cls('Wizard', { hd: 6, primary: 'int', saves: 'int,wis', equipA: undefined }),
  { id: 'feature/barbarian/weapon-mastery', kind: 'feature', name: 'Weapon Mastery', src: 'srd', desc: 'Use the mastery of two weapons. More text.', cls: 'barbarian', lvl: 1,
    grants: [{ id: 'g1', kind: 'prof', name: 'Weapon Mastery', cat: 'mastery', val: '2' }] } as Entry,
  { id: 'feature/barbarian/rage', kind: 'feature', name: 'Rage', src: 'srd', desc: 'You rage.', cls: 'barbarian', lvl: 2, grants: [] } as Entry,
  weapon('Greataxe'), weapon('Handaxe'), weapon('Maul'),
  { id: 'background/soldier', kind: 'background', name: 'Soldier', src: 'srd', desc: '', feat: 'feat/mi', equip: '', equipA: 'Spear', gpB: 50,
    grants: [{ kind: 'choice', id: 'abil', name: 'Ability scores', pick: 3, repeat: true, options: [abil('o1', 'str'), abil('o2', 'dex'), abil('o3', 'con')] },
      { kind: 'choice', id: 'tool', name: 'Gaming set', pick: 1, options: [{ id: 't1', kind: 'prof', name: 'Dice', cat: 'tool', target: 'Dice' }] }] } as Entry,
  { id: 'feat/mi', kind: 'feat', name: 'Magic Initiate', src: 'srd', desc: '', cat: 'origin', grants: [
    { kind: 'choice', id: 'ab', name: 'Spellcasting ability', pick: 1, pool: 'ability:int|wis|cha' }, { id: 'g1', kind: 'spell', name: 'Light', spell: 'Light', castAb: '$ab' }] } as Entry,
  { id: 'species/elf', kind: 'species', name: 'Elf', src: 'srd', desc: '', sizes: 'medium', speed: 30 } as Entry,
  lang('Common'), lang('Elvish'), lang('Dwarvish')];
const cat = mergeCatalog(entries, null);

beforeEach(() => localStorage.clear());
const render = (onCreate: (c: Character) => void, initial?: Draft, strict = false) => {
  const el = <CreatorWizard cat={cat} initial={initial} onCreate={onCreate} onClose={() => {}} />;
  mount(strict ? <StrictMode>{el}</StrictMode> : el);
};
const draft = (): Draft => JSON.parse(localStorage.getItem(DRAFT_KEY)!);
const tile = (t: string) => [...document.querySelectorAll('.tile-pick')].find((b) => b.textContent?.startsWith(t));
const next = () => tap(btn('Next'));
const setStart = (n: number) => {
  const input = label('Starting level') as HTMLInputElement;
  act(() => { input.focus(); });
  type(input, String(n));
  act(() => { input.blur(); });
};
// Every origin and ability answer of a Barbarian (Soldier: Dice, ab INT; Elf; Elvish + Dwarvish; Athletics + Survival).
const ready = (p: Partial<CreatorAnswers> = {}): CreatorAnswers => ({
  ...NEW_ANSWERS(), cls: 'class/barbarian', equip: 'none', background: 'background/soldier', species: 'species/elf',
  bgFlow: { '': { picks: { abil: ['o1', 'o2', 'o3'], tool: ['t1'] }, counted: {}, links: {}, equip: 'none' }, '>feat/mi': { picks: { ab: ['int'] }, counted: {}, links: {} } },
  languages: ['Elvish', 'Dwarvish'], skills: ['athletics', 'survival'], scores: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
  first: { flows: {}, spells: {}, mastery: ['greataxe', 'handaxe'] }, ...p
});
const at = (step: string, answers: CreatorAnswers): Draft => ({ v: 1, step, answers });
const lvl2 = { pick: { cls: 'class/barbarian' }, ans: { hp: { mode: 'fixed' as const, val: 7 }, flows: {}, spells: {} } };

describe('CreatorWizard', () => {
  it('walks a Barbarian 1 (Weapon Mastery included) from Class to Create: one summary, no This level, no Already counted, no nested bar', () => {
    const made = vi.fn();
    render(made);
    tap(tile('Barbarian')); next();          // class
    next();                                  // starting level
    tap(tile('Soldier')); next();
    tap(tile('Dice')); next();               // Soldier's tool
    next();                                  // Magic Initiate's ability (preselected)
    tap(tile('Elf')); next();
    tap(tile('Elvish')); tap(tile('Dwarvish')); next();
    tap(tile('Athletics')); tap(tile('Survival')); next();
    next();                                  // scores: filled for the class
    tap(tile('+1 to all three')); next();
    for (const b of [...document.querySelectorAll('.tile-pick')].filter((x) => x.textContent?.startsWith('None'))) tap(b);
    next();                                  // equipment
    next();                                  // details
    expect(document.body.textContent).toContain('Level 1: Barbarian');
    next();                                  // features
    tap(tile('Greataxe')); tap(tile('Handaxe')); next();
    expect(document.querySelectorAll('.stepper')).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/This level|Already counted/);
    tap(btn('Create character'));
    expect(made).toHaveBeenCalledTimes(1);
    expect(made.mock.calls[0][0].classes.map((r: { name: string; lvl: number }) => r.name + ' ' + r.lvl)).toEqual(['Barbarian 1']);
  });
  it('a double tap on Create adds one character', () => {
    const made = vi.fn();
    render(made, at('summary', ready()));
    const b = btn('Create character')!;
    expect(b.getAttribute('aria-disabled')).toBe('false');
    tap(b); tap(b);
    expect(made).toHaveBeenCalledTimes(1);
  });
  it('Create is refused while a.levels.length < start − 1', () => {
    const made = vi.fn();
    render(made, at('summary', ready({ start: 2 })));
    const b = btn('Create character')!;
    expect(b.getAttribute('aria-disabled')).toBe('true');
    tap(b);
    expect(made).not.toHaveBeenCalled();
  });
  it('a disabled Next shows the screen\'s missing text', () => {
    render(vi.fn());
    tap(tile('Barbarian')); next(); next();
    expect(btn('Next')!.getAttribute('aria-disabled')).toBe('true');
    expect(document.body.textContent).toContain('Choose a background');
  });
  it('the level 2 features effect writes level 2 once under StrictMode', () => {
    render(() => {}, at('level/2/features', ready({ start: 2 })), true);
    expect(draft().answers.levels).toEqual([{ pick: { cls: 'class/barbarian' }, ans: { flows: {}, spells: {} } }]);
  });
  it('Next from level 2\'s last screen reaches level 3 features, creates levels[1] and makes it ready', () => {
    render(() => {}, at('level/2/hp', ready({ start: 3, levels: [lvl2] })));
    next();
    expect(document.body.textContent).toContain('Level 3: Barbarian');
    expect(draft().answers.levels).toHaveLength(2);
    expect(btn('Next')!.getAttribute('aria-disabled')).toBe('false');
  });
  it('Change class shows the current class of the level pressed', () => {
    render(() => {}, at('level/2/features', ready({ start: 2, levels: [lvl2] })));
    tap(btn('Change class'));
    expect([...document.querySelectorAll('button.pick-opt')].find((b) => b.textContent?.startsWith('Barbarian 1 → 2'))!.getAttribute('aria-pressed')).toBe('true');
  });
  it('another class at level 2 replaces the pick and resets its answers', () => {
    render(() => {}, at('level/2/features', ready({ start: 2, levels: [lvl2] })));
    tap(btn('Change class'));
    tap(btn('+ Add a class'));
    tap([...document.querySelectorAll('button.pick-opt')].find((b) => b.textContent?.startsWith('Wizard'))!);
    expect(draft().answers.levels).toEqual([{ pick: { cls: 'class/wizard' }, ans: { flows: {}, spells: {} } }]);
  });
  it('writes the draft on every answer and moving to another screen saves its key', () => {
    render(() => {});
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    tap(tile('Barbarian'));
    expect(draft()).toMatchObject({ step: 'class', answers: { cls: 'class/barbarian' } });
    next();
    expect(draft().step).toBe('class/start');
  });
  it('the spell-ability preselection writes once under StrictMode and never over a stored pick', () => {
    const noAb = ready({ bgFlow: { '': { picks: { abil: ['o1', 'o2', 'o3'], tool: ['t1'] }, counted: {}, links: {}, equip: 'none' } } });
    render(() => {}, at('origin/bg/>feat/mi/ab', noAb), true);
    expect(draft().answers.bgFlow['>feat/mi'].picks.ab).toEqual(['int']);
    unmount();
    localStorage.clear();
    const stored = ready({ bgFlow: { ...noAb.bgFlow, '>feat/mi': { picks: { ab: ['cha'] }, counted: {}, links: {} } } });
    render(() => {}, at('origin/bg/>feat/mi/ab', stored), true);
    expect(draft().answers.bgFlow['>feat/mi'].picks.ab).toEqual(['cha']);
  });
  it('a draft opened on a later screen whose level entry is missing creates it before writing level answers', () => {
    render(() => {}, at('level/2/hp', ready({ start: 2 })));
    tap(btn('Fixed (7)'));
    expect(draft().answers.levels).toEqual([{ pick: { cls: 'class/barbarian' }, ans: { hp: { mode: 'fixed', val: 7 }, flows: {}, spells: {} } }]);
  });
  it('changing the class clears the skill picks and the level answers', () => {
    render(() => {}, at('class', ready({ start: 2, levels: [lvl2] })));
    tap(tile('Wizard'));
    expect(draft().answers).toMatchObject({ cls: 'class/wizard', skills: [], levels: [], first: { flows: {}, spells: {} } });
  });
  it('lowering the starting level keeps only the levels that still apply', () => {
    render(() => {}, at('class/start', ready({ start: 3, levels: [lvl2, lvl2] })));
    setStart(2);
    expect(draft().answers.levels).toHaveLength(1);
  });
  it('Point Buy never goes over 27 points', () => {
    render(() => {}, at('abilities/scores', ready()));
    tap(tile('Point Buy'));
    for (let i = 0; i < 8; i++) for (const k of ['STR', 'DEX', 'CON', 'INT']) tap(label('Raise ' + k));
    const cost: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
    expect(Object.values(draft().answers.scores).reduce((t, v) => t + cost[v!], 0)).toBeLessThanOrEqual(27);
  });
  it('a stale draft key lands on the first not-ready screen', () => {
    render(() => {}, at('origin/gone', ready({ languages: [] })));
    expect(document.body.textContent).toContain('Choose 2 more languages');
  });
});
