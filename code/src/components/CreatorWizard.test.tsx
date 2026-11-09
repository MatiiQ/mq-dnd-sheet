// @vitest-environment happy-dom
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeCatalog } from '../catalog/merge';
import type { ClassEntry, Entry } from '../catalog/schema';
import { DRAFT_KEY, replay, type Draft } from '../creator';
import { effScore } from '../logic';
import { btn, label, mount, tap, type } from '../test-dom';
import { noIds } from '../test-fixtures';
import type { Character } from '../types';
import { CreatorWizard, NEW_ANSWERS } from './CreatorWizard';

const cls = (name: string): ClassEntry => ({ id: 'class/' + name.toLowerCase(), kind: 'class', name, src: 'srd', desc: 'About ' + name, hd: 10, saves: 'str,dex', primary: 'dex',
  skills: { kind: 'choice', id: 'skills', name: 'Skills', pick: 2, pool: 'skill:stealth|insight|survival' }, armor: '', weapons: '', slots: [] });
const lang = (name: string): Entry => ({ id: 'prof/' + name.toLowerCase(), kind: 'prof', name, src: 'srd', desc: '', cat: 'language' } as Entry);
const entries: Entry[] = [cls('Ranger'), cls('Rogue'),
  { id: 'feature/rogue/expertise', kind: 'feature', name: 'Expertise', src: 'srd', desc: '', cls: 'rogue', lvl: 1,
    grants: [{ kind: 'choice', id: 'exp', name: 'Expertise', pick: 1, pool: 'skill:proficient' }, { id: 'g1', kind: 'prof', name: 'Expertise', cat: 'expertise', target: '$exp' }] } as Entry,
  { id: 'background/sage', kind: 'background', name: 'Sage', src: 'srd', desc: '', feat: 'feat/none', equip: '',
    grants: [{ kind: 'choice', id: 'abil', name: 'Ability scores', pick: 2, options: [{ id: 'o1', kind: 'abil', name: 'INT +1', ab: 'int', val: '1', cap: 20 }, { id: 'o2', kind: 'abil', name: 'WIS +1', ab: 'wis', val: '1', cap: 20 }] }] } as Entry,
  { id: 'background/acolyte', kind: 'background', name: 'Acolyte', src: 'srd', desc: '', feat: 'feat/none', equip: '',
    grants: [{ id: 'g1', kind: 'prof', name: 'Insight', cat: 'skill', target: 'insight' }] } as Entry,
  { id: 'species/elf', kind: 'species', name: 'Elf', src: 'srd', desc: '', sizes: 'medium', speed: 30 } as Entry,
  lang('Common'), lang('Elvish'), lang('Dwarvish')];
const cat = mergeCatalog(entries, null);

beforeEach(() => localStorage.clear());
const render = (onCreate: (c: Character) => void, initial?: Draft) =>
  mount(<CreatorWizard cat={cat} initial={initial} onCreate={onCreate} onClose={() => {}} />);
const draft = (): Draft => JSON.parse(localStorage.getItem(DRAFT_KEY)!);
// Types into the Starting level field the way a player does: focus, a value, blur.
const setStart = (n: number) => {
  const input = label('Starting level') as HTMLInputElement;
  act(() => { input.focus(); });
  type(input, String(n));
  act(() => { input.blur(); });
};
// Taps Next to the level's summary, then Finish.
function finishLevel() {
  for (let i = 0; i < 6 && !btn('Finish'); i++) tap(btn('Next'));
  tap(btn('Finish'));
}
// A level after the first: its intro, Fixed (6) HP, then to its summary and Finish.
function fixedLevel() {
  tap(btn('Next'));
  tap(btn('Next')); // the features screen
  tap(btn('Fixed (6)'));
  finishLevel();
}
// From the Origin step: Sage (INT, WIS), Elf, Elvish + Dwarvish, Stealth + Survival.
function throughOriginRest() {
  tap(btn('Sage'));
  tap(btn('INT +1'));
  tap(btn('WIS +1'));
  tap(btn('Next')); // the background flow's own Next: its second step asks "Already counted"
  tap(btn('Add'));
  tap(btn('Elf'));
  tap(btn('Elvish'));
  tap(btn('Dwarvish'));
  tap(btn('Stealth'));
  tap(btn('Survival'));
  tap(btn('Next'));
}
// The class at level 1, then the origin above.
function throughOrigin(cls = 'Ranger') {
  tap(btn(cls));
  tap(btn('Next'));
  throughOriginRest();
}
// Point Buy at its start (every score 8, 0 of 27 spent) is a complete set.
const abilities = () => { tap(btn('Point Buy')); tap(btn('Next')); };
// Point Buy 15/15/15/8/8/8, "Thorin", the Levels step's level 1 (no choices for the synthetic Ranger), then the summary.
function toCreate() {
  throughOrigin();
  tap(btn('Point Buy'));
  for (const ab of ['STR', 'DEX', 'CON']) for (let i = 0; i < 7; i++) tap(label('Raise ' + ab));
  expect(document.body.textContent).toContain('Points: 27 / 27');
  tap(btn('Next'));
  type(document.querySelector('.wizard input[type="text"]'), 'Thorin');
  tap(btn('Next'));
  finishLevel();
  tap(btn('Next'));
}

describe('CreatorWizard', () => {
  it('creator with Point Buy to Finish, and Finish equals the last preview', () => {
    const onCreate = vi.fn();
    render(onCreate);
    toCreate();
    tap(btn('Create character'));
    expect(onCreate).toHaveBeenCalledOnce();
    const c: Character = onCreate.mock.calls[0][0];
    expect(c.ch.name).toBe('Thorin');
    expect(c.classes).toHaveLength(1);
    expect(c.levels.filter((r) => !r.base)).toHaveLength(1);
    expect([c.abil.str, c.abil.dex, c.abil.con, c.abil.int]).toEqual([15, 15, 15, 8]);
    expect(effScore(c, 'int')).toBe(9);
    expect(c.profs.filter((p) => p.cat === 'language').map((p) => p.name)).toEqual(['Common', 'Elvish', 'Dwarvish']);
    expect(noIds(c)).toEqual(noIds(replay(cat, draft().answers).c));
  });
  it('writes the draft on every answer, not only when a step changes, with the current step', () => {
    render(() => {});
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    tap(btn('Ranger'));
    expect(draft().answers.cls).toBe('class/ranger');
    expect(draft().step).toBe(0);
    tap(btn('Next'));
    expect(draft().step).toBe(1);
  });
  it('changing the class clears the skill picks and the first level answers', () => {
    render(() => {});
    throughOrigin();
    expect(draft().answers.skills).toEqual(['stealth', 'survival']);
    tap(btn('Class'));
    tap(btn('Rogue'));
    tap(btn('Next'));
    expect(draft().answers.skills).toEqual([]);
    expect(draft().answers.first).toEqual({ flows: {}, spells: {} });
  });
  it('changing the class clears the levels chosen for the old one', () => {
    render(() => {});
    tap(btn('Ranger'));
    setStart(2);
    tap(btn('Next'));
    throughOriginRest();
    abilities();
    tap(btn('Next')); // details
    finishLevel();
    fixedLevel();
    expect(draft().answers.levels).toHaveLength(1);
    tap(btn('Class'));
    tap(btn('Rogue'));
    expect(draft().answers.levels).toEqual([]);
    expect(replay(cat, draft().answers).c.classes.map((r) => r.name)).toEqual(['Rogue']);
  });
  it('lowering the starting level keeps only the levels that still apply', () => {
    render(() => {});
    tap(btn('Ranger'));
    setStart(5);
    tap(btn('Next'));
    throughOriginRest();
    abilities();
    tap(btn('Next')); // details
    expect(document.body.textContent).toContain('Level 1 of 5');
    finishLevel();
    for (let n = 2; n <= 5; n++) {
      expect(document.body.textContent).toContain('Level ' + n + ' of 5');
      fixedLevel();
    }
    tap(btn('Class'));
    setStart(3);
    expect(document.body.textContent).not.toContain('above the starting level');
    expect(draft().answers.levels).toHaveLength(2);
    tap(btn('Summary'));
    expect(document.body.textContent).toContain('Ranger 3');
  });
});

describe('level 1 choices in the creator', () => {
  it('asks a level-1 feature choice, so a Rogue is created with its class', () => {
    const onCreate = vi.fn();
    render(onCreate);
    throughOrigin('Rogue');
    abilities();
    tap(btn('Next')); // details
    expect(document.body.textContent).toContain('Level 1');
    tap(btn('Next')); // the features screen
    tap([...document.querySelectorAll('.tile-pick')].find((b) => b.textContent?.startsWith('Stealth')));
    finishLevel();
    tap(btn('Next'));
    tap(btn('Create character'));
    const c: Character = onCreate.mock.calls[0][0];
    expect(c.classes.map((r) => r.clsId)).toEqual(['class/rogue']);
    expect(c.grants.some((g) => g.cat === 'expertise' && g.target === 'stealth')).toBe(true);
  });
});

describe('the summary waits for the levels', () => {
  it('Summary and Create stay locked until level 1 and every level to the start are chosen', () => {
    const onCreate = vi.fn();
    render(onCreate);
    throughOrigin('Rogue');
    expect(btn('Summary')?.getAttribute('aria-disabled')).toBe('true');
    tap(btn('Summary'));
    expect(btn('Create character')).toBeUndefined();
  });
});

describe('class skills after a background change', () => {
  it('a skill the new background gives can be dropped and replaced', () => {
    render(() => {});
    throughOrigin();               // Sage, Elf, Stealth + Survival
    tap(btn('Origin'));
    tap(btn('Stealth'));           // out
    tap(btn('Insight'));           // in: Insight + Survival
    tap(btn('Acolyte'));           // now gives Insight
    const insight = [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Insight'))!;
    expect(insight.textContent).toContain('from your origin');
    tap(insight);                  // drop it
    tap(btn('Stealth'));           // replace it
    tap(btn('Next'));
    expect(draft().answers.skills.sort()).toEqual(['stealth', 'survival']);
  });
});

describe('the steps wait for complete answers', () => {
  it('Origin needs both languages and every class skill', () => {
    render(() => {});
    tap(btn('Ranger'));
    tap(btn('Next'));
    tap(btn('Sage'));
    tap(btn('INT +1'));
    tap(btn('WIS +1'));
    tap(btn('Next'));
    tap(btn('Add'));
    tap(btn('Elf'));
    tap(btn('Stealth'));
    tap(btn('Survival'));
    expect(btn('Next')?.getAttribute('aria-disabled')).toBe('true');   // no languages
    tap(btn('Elvish'));
    tap(btn('Dwarvish'));
    expect(btn('Next')?.getAttribute('aria-disabled')).toBe('false');
    tap(btn('Survival'));
    expect(btn('Next')?.getAttribute('aria-disabled')).toBe('true');   // one skill short
  });
  it('Abilities needs all six scores, and Point Buy stops at 27 points', () => {
    render(() => {});
    throughOrigin();
    expect(btn('Next')?.getAttribute('aria-disabled')).toBe('true');   // Standard Array, nothing assigned
    tap(btn('Point Buy'));
    for (const ab of ['STR', 'DEX', 'CON', 'INT']) for (let i = 0; i < 7; i++) tap(label('Raise ' + ab));
    expect(document.body.textContent).toContain('Points: 27 / 27');
    expect(draft().answers.scores.int).toBe(8);   // 15,15,15 cost 27: INT cannot rise
    expect(btn('Next')?.getAttribute('aria-disabled')).toBe('false');
  });
  it('Create stays locked while an origin choice is unfinished', () => {
    const onCreate = vi.fn();
    const answers = { ...NEW_ANSWERS(), cls: 'class/ranger', background: 'background/sage', species: 'species/elf', languages: ['Elvish', 'Dwarvish'], skills: ['stealth', 'survival'],
      scores: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }, firstDone: true };
    render(onCreate, { v: 1, step: 5, answers });
    expect(document.body.textContent).toContain('No longer fits');
    expect(btn('Create character')?.getAttribute('aria-disabled')).toBe('true');
    tap(btn('Create character'));
    expect(onCreate).not.toHaveBeenCalled();
  });
});
