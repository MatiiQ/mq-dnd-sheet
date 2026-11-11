// @vitest-environment happy-dom
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { mergeCatalog } from '../catalog/merge';
import type { ClassEntry, Entry, FeatureEntry } from '../catalog/schema';
import { blankCharacter } from '../defaults';
import { btn as button, mount, tap, type } from '../test-dom';
import { withClass, withClasses } from '../test-fixtures';
import type { Character } from '../types';
import { applyLevel, levelPlan, withLevel, type LevelAnswers, type LevelScreenSpec } from '../levelup';
import { ClassScreen, LevelScreen, LevelUpWizard, UndoLevelPrompt } from './LevelUpWizard';

const cls = (name: string, hd: 6 | 8 | 10 | 12): ClassEntry => ({ id: 'class/' + name.toLowerCase(), kind: 'class', name, src: 'srd', desc: '', hd, saves: 'str,dex',
  skills: { kind: 'choice', id: 'skills', name: 'Skills', pick: 1, pool: 'skill:any' }, armor: '', weapons: '', slots: [] });
const feat = (c: string, s: string, lvl: number, p: Partial<FeatureEntry> = {}): FeatureEntry => ({ id: `feature/${c}/${s}`, kind: 'feature', name: s, src: 'srd', desc: '', cls: c, lvl, grants: [], ...p });
const spellyChoice = { kind: 'choice' as const, id: 'c', name: 'Gift', pick: 1, options: [{ id: 'o1', kind: 'prof' as const, name: 'Elvish', cat: 'language' as const, target: 'Elvish' }] };
const entries: Entry[] = [cls('Ranger', 10), cls('Warlock', 8), feat('ranger', 'roving', 2, { desc: 'Gains a thing. Long rest.' }),
  feat('ranger', 'spelly', 3, { grants: [spellyChoice, { id: 'g1', kind: 'spell', name: 'Light', spell: 'Light' }] }),
  feat('ranger', 'ability-score-improvement', 4, { grants: [{ kind: 'choice', id: 'feat', name: 'Feat', pick: 1, pool: 'feat:any' }] }),
  { id: 'feat/ac-feat', kind: 'feat', name: 'AC Feat', src: 'srd', desc: '', cat: 'general', grants: [{ id: 'g1', kind: 'ac', name: 'AC +1', acMode: 'bonus', val: '1' }] } as Entry,
  ...['dagger', 'spear'].map((n) => ({ id: 'item/' + n, kind: 'item', name: n[0].toUpperCase() + n.slice(1), src: 'srd', desc: '', cat: 'weapon', mastery: 'Sap' }) as Entry),
  feat('warlock', 'eldritch-invocations', 1, { grants: [{ kind: 'choice', id: 'inv', name: 'Invocations', pick: 1, pickAt: '1:1,2:3', pool: 'feature:of=invocation' }] }),
  ...['a', 'b', 'c', 'd'].map((x) => feat('warlock', 'inv-' + x, 1, { of: 'invocation' }))];
const cat = mergeCatalog(entries, null);

const render = (c: Character, onApply: (n: Character) => void, catalog: typeof cat | null = cat) =>
  mount(<LevelUpWizard c={c} cat={catalog} onApply={onApply} onClose={() => {}} />);
const next = () => tap(button('Next'));

describe('LevelUpWizard', () => {
  it('Ranger 1 → 2: the class is preselected, the roll is checked, the summary shows HP, Finish applies', () => {
    const c = withClass({ ...blankCharacter(), maxHp: 10, conBase: 0, hp: 12, abil: { ...blankCharacter().abil, con: 14 } }, { name: 'Ranger', clsId: 'class/ranger', hd: 10, lvl: 1 });
    const onApply = vi.fn();
    render(c, onApply);
    expect(document.querySelector('[aria-pressed="true"]')?.textContent).toContain('Ranger 1 → 2');
    next();
    next();
    const roll = document.querySelector('[aria-label="HP roll"]');
    type(roll, '0');
    expect(button('Next')?.getAttribute('aria-disabled')).toBe('true');
    type(roll, '11');
    expect(button('Next')?.getAttribute('aria-disabled')).toBe('true');
    type(roll, '6');
    expect(button('Next')?.getAttribute('aria-disabled')).toBe('false');
    for (let i = 0; i < 5 && !button('Finish'); i++) next();
    expect(document.body.textContent).toContain('HP 12 → 20');
    tap(button('Finish'));
    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply.mock.calls[0][0].classes[0].lvl).toBe(2);
  });
  it('Warlock 1 → 2 asks for 2 more Invocations, read at the raised level', () => {
    const base = withClass({ ...blankCharacter(), maxHp: 8, hp: 8 }, { name: 'Warlock', clsId: 'class/warlock', hd: 8, lvl: 1 });
    const c: Character = { ...base, feats: [{ id: 'ei', g: 'class', name: 'Eldritch Invocations', desc: '', cid: 'feature/warlock/eldritch-invocations' },
      { id: 'ia', g: 'class', name: 'inv-a', desc: '', cid: 'feature/warlock/inv-a', from: 'feature:ei' }] };
    render(c, () => {});
    next();
    next();
    tap(button('Fixed (5)'));
    for (let i = 0; i < 5 && !document.body.textContent?.includes('Invocations ·'); i++) next();
    expect(document.body.textContent).toContain('Choose 2');
  });
  it('without the catalog: level up with HP only, and say features are added by hand', () => {
    const c = withClass({ ...blankCharacter(), maxHp: 10, hp: 10 }, { name: 'Ranger', clsId: 'class/ranger', hd: 10, lvl: 1 });
    const onApply = vi.fn();
    render(c, onApply, null);
    expect(document.body.textContent).toContain('Level-up needs the class catalog');
    tap(button('Level up without it'));
    next();
    expect(document.body.textContent).toContain('No class data');
    next();
    tap(button('Fixed (6)'));
    for (let i = 0; i < 5 && !button('Finish'); i++) next();
    expect(document.body.textContent).toContain('Features are added by hand');
    tap(button('Finish'));
    expect(onApply.mock.calls[0][0].classes[0].lvl).toBe(2);
  });
  it('the undo prompt shows the real HP drop, the CON part included', () => {
    // conBase 0 with CON +2: the level's stored gain is 6, the maximum falls by 8.
    const c = withClass({ ...blankCharacter(), maxHp: 10, conBase: 0, hp: 12, abil: { ...blankCharacter().abil, con: 14 } }, { name: 'Ranger', clsId: 'class/ranger', hd: 10, lvl: 1 });
    const ans = { flows: {}, spells: {}, hp: { mode: 'fixed' as const, val: 6 } };
    const up = applyLevel(c, levelPlan(c, { row: c.classes[0].id }, cat, ans)!, ans, cat).c;
    expect(up.levels.at(-1)!.hp!.gain).toBe(6);
    mount(<UndoLevelPrompt c={up} onConfirm={() => {}} onCancel={() => {}} />);
    expect(document.body.textContent).toContain('HP maximum −8.');
  });
  it('the undo prompt reads the unfloored maximum', () => {
    // Raw maximum −5 → 1 with a fixed 6: maxHpOf reads 1 on both sides, the real drop is 6.
    const c = withClass({ ...blankCharacter(), maxHp: -5, conBase: 0, hp: 1 }, { name: 'Ranger', clsId: 'class/ranger', hd: 10, lvl: 1 });
    const ans = { flows: {}, spells: {}, hp: { mode: 'fixed' as const, val: 6 } };
    const up = applyLevel(c, levelPlan(c, { row: c.classes[0].id }, cat, ans)!, ans, cat).c;
    mount(<UndoLevelPrompt c={up} onConfirm={() => {}} onCancel={() => {}} />);
    expect(document.body.textContent).toContain('HP maximum −6.');
  });
  const ranger = (lvl: number, p: Partial<Character> = {}) => withClass({ ...blankCharacter(), maxHp: 10, hp: 10, ...p }, { name: 'Ranger', clsId: 'class/ranger', hd: 10, lvl });
  const walkTo = (text: string) => { for (let i = 0; i < 12 && !document.body.textContent?.includes(text); i++) next(); };
  it('still opens on "Which class gets the level?" and ends in its summary with Finish', () => {
    render(ranger(1), () => {});
    expect(document.body.textContent).toContain('Which class gets the level?');
    next(); next();
    tap(button('Fixed (6)'));
    for (let i = 0; i < 8 && !button('Finish'); i++) next();
    expect(button('Finish')).toBeTruthy();
  });
  it('the features screen shows a feature\'s description', () => {
    render(ranger(1), () => {});
    next();
    expect(document.body.textContent).toContain('Gains a thing.');
    expect(document.querySelector('.tile-more')).toBeTruthy();
    expect(document.body.textContent).not.toContain('This level');
    expect(document.querySelector('.stepper')).toBeTruthy();
  });
  it('an ASI feat with a countable grant still gets its "Already counted" screen', () => {
    render(ranger(3, { acMods: [{ id: 'm', name: 'Ring', val: 1 }] as Character['acMods'] }), () => {});
    next(); next();
    tap(button('Fixed (6)'));
    next();
    tap([...document.querySelectorAll('.tile-pick')].find((b) => b.textContent?.startsWith('AC Feat'))!);
    walkTo('Already counted in my numbers?');
    expect(document.body.textContent).toContain('Already counted in my numbers?');
  });
  it('a level-up spell the sheet already has still gets its link-or-add question', () => {
    render(ranger(2, { spells: [{ id: 's1', name: 'Light', lvl: 0 } as Character['spells'][number]] }), () => {});
    next(); next();
    tap(button('Fixed (6)'));
    next();
    tap([...document.querySelectorAll('.tile-pick')].find((b) => b.textContent === 'Elvish')!);
    walkTo('You already have');
    expect(document.body.textContent).toContain('You already have ‘Light’.');
  });
  it('a held Weapon Mastery kind already chosen can be tapped out, never in', () => {
    const c = ranger(1), plan = levelPlan(c, { row: c.classes[0].id }, cat, { flows: {}, spells: {} })!;
    const screen: LevelScreenSpec = { kind: 'step', key: 'mastery@2', title: 'Weapon Mastery', ready: false, step: { key: 'mastery@2', kind: 'mastery', title: 'Weapon Mastery', owed: 1, held: ['dagger'] } };
    let seen: LevelAnswers = { flows: {}, spells: {} };
    function H() {
      const [a, setA] = useState<LevelAnswers>({ flows: {}, spells: {}, mastery: ['dagger'] });
      seen = a;
      return <LevelScreen cat={cat} c={withLevel(c, { row: c.classes[0].id }, cat).c} plan={plan} screen={screen} answers={a} set={setA} />;
    }
    mount(<H />);
    const dagger = () => [...document.querySelectorAll('.tile-pick')].find((b) => b.textContent?.startsWith('Dagger'))!;
    tap(dagger());
    expect(seen.mastery).toEqual([]);
    tap(dagger());
    expect(seen.mastery).toEqual([]);
    tap([...document.querySelectorAll('.tile-pick')].find((b) => b.textContent?.startsWith('Spear'))!);
    expect(seen.mastery).toEqual(['spear']);
  });
  it('the features screen shows the warnings of steps without a screen', () => {
    render(ranger(1, { abil: { ...blankCharacter().abil, cha: 14 } }), () => {});
    tap(button('+ Add a class'));
    tap([...document.querySelectorAll('button.pick-opt')].find((b) => b.textContent?.startsWith('Warlock'))!);
    next();
    expect(document.body.textContent).toContain('No multiclass proficiencies known');
  });
  it('ClassScreen shows a new class pick pressed, with the class list open', () => {
    mount(<ClassScreen c={ranger(1)} cat={cat} pick={{ cls: 'class/warlock' }} onPick={() => {}} />);
    expect([...document.querySelectorAll('button.pick-opt')].find((b) => b.textContent?.startsWith('Warlock'))?.getAttribute('aria-pressed')).toBe('true');
  });
  it('the HP screen reads the die of the row gaining the level, not another row at the same level', () => {
    const c = withClasses({ ...blankCharacter(), maxHp: 10, hp: 10 }, [{ name: 'Rogue', hd: 8, lvl: 3 }, { name: 'Fighter', hd: 10, lvl: 2 }]);
    const fighter = c.classes.find((r) => r.name === 'Fighter')!;
    const pick = { row: fighter.id };
    const plan = levelPlan(c, pick, null, { flows: {}, spells: {} })!;
    const screen: LevelScreenSpec = { kind: 'step', key: 'hp', title: 'Hit points', ready: false, step: plan.steps.find((s) => s.kind === 'hp')! };
    mount(<LevelScreen cat={null} c={withLevel(c, pick, null).c} plan={plan} screen={screen} answers={{ flows: {}, spells: {} }} set={() => {}} />);
    expect(button('Fixed (6)')).toBeTruthy();
  });
});

describe('SpellScreen (spec 2026-11-10 §2.1, §2.2)', () => {
  const spell = (n: string, lvl: number): Entry => ({ id: 'spell/' + n, kind: 'spell', name: n, src: 'srd', desc: '', lvl, school: 'Evocation', time: 'Action', range: 'Self', classes: 'cleric' } as Entry);
  const scat = mergeCatalog([...entries, spell('light', 0), spell('bless', 1), spell('cure', 1)], null);
  const show = (kind: 'cantrips' | 'prepare') => {
    const c = withClass({ ...blankCharacter(), maxHp: 10, hp: 10 }, { name: 'Ranger', clsId: 'class/ranger', hd: 10, lvl: 1 }), plan = levelPlan(c, { row: c.classes[0].id }, scat, { flows: {}, spells: {} })!;
    const step = { key: kind + ':x', kind, title: 'Cleric ' + kind, owed: 2, list: 'cleric', maxLvl: kind === 'cantrips' ? 0 : 1, source: 'From the Cleric table at Cleric level 1.' };
    const screen: LevelScreenSpec = { kind: 'step', key: step.key, title: step.title, ready: false, step };
    function H() {
      const [a, setA] = useState<LevelAnswers>({ flows: {}, spells: {} });
      return <LevelScreen cat={scat} c={c} plan={plan} screen={screen} answers={a} set={setA} />;
    }
    mount(<H />);
  };
  const heads = () => [...document.querySelectorAll('h4.block-title')].map((h) => h.textContent);
  it('shows the source line and level headings with the chosen count; tiles start with their level', () => {
    show('prepare');
    expect(document.body.textContent).toContain('From the Cleric table at Cleric level 1.');
    expect(heads()).toEqual(['Level 1 spells']);
    tap([...document.querySelectorAll('.tile-pick')].find((b) => b.textContent?.startsWith('bless'))!);
    expect(heads()).toEqual(['Level 1 spells · 1 chosen']);
    expect([...document.querySelectorAll('.tile-pick .small')][0].textContent!.startsWith('Level 1')).toBe(true);
  });
  it('cantrips read Cantrips and Cantrip', () => {
    show('cantrips');
    expect(heads()).toEqual(['Cantrips']);
    expect([...document.querySelectorAll('.tile-pick .small')][0].textContent!.startsWith('Cantrip')).toBe(true);
  });
});

describe('AsiScreen groups (spec 2026-11-10 §2.3)', () => {
  const ft = (n: string, prereq?: string): Entry => ({ id: 'feat/' + n, kind: 'feat', name: n, src: 'srd', desc: '', cat: 'general', ...(prereq ? { prereq } : {}) } as Entry);
  const asi = feat('ranger', 'asi', 4, { grants: [{ kind: 'choice', id: 'feat', name: 'Feat', pick: 1, pool: 'feat:cat=general' }] });
  const acat = mergeCatalog([cls('Ranger', 10), asi, ft('zeta'), ft('alpha'), ft('strong', 'str>=19'), ft('held'), ft('mighty', 'str>=19')], null);
  const show = (p: Partial<Character> = {}) => {
    const c = withClass({ ...blankCharacter(), maxHp: 10, hp: 10, ...p }, { name: 'Ranger', clsId: 'class/ranger', hd: 10, lvl: 3 });
    const plan = levelPlan(c, { row: c.classes[0].id }, acat, { flows: {}, spells: {} })!;
    const step = { key: 'asi@4', kind: 'asi' as const, title: 'Ability Score Improvement', entry: asi };
    mount(<LevelScreen cat={acat} c={c} plan={plan} screen={{ kind: 'step', key: step.key, title: step.title, ready: false, step }} answers={{ flows: {}, spells: {} }} set={() => {}} />);
  };
  const groups = () => [...document.querySelectorAll('h4.block-title')].map((h) => [h.textContent, [...h.parentElement!.querySelectorAll('.tile-title')].map((t) => t.textContent)]);
  it('available, needs a prerequisite, already on your sheet; held and unmet goes last; sorted', () => {
    show({ feats: [{ id: 'h', g: 'feat', name: 'held', desc: '', cid: 'feat/held' }, { id: 'm', g: 'feat', name: 'mighty', desc: '', cid: 'feat/mighty' }] });
    expect(groups()).toEqual([['Available', ['alpha', 'zeta']], ['Needs a prerequisite', ['strong']], ['Already on your sheet', ['held', 'mighty']]]);
  });
  it('an empty group has no heading', () => {
    show();
    expect(groups().map((g) => g[0])).toEqual(['Available', 'Needs a prerequisite']);
  });
});

