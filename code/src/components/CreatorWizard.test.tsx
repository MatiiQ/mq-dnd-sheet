// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeCatalog } from '../catalog/merge';
import type { ClassEntry, Entry } from '../catalog/schema';
import { DRAFT_KEY, replay, type Draft } from '../creator';
import { effScore } from '../logic';
import type { Character } from '../types';
import { CreatorWizard } from './CreatorWizard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

let root: Root;
beforeEach(() => localStorage.clear());
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });
const render = (onCreate: (c: Character) => void, initial?: Draft) => {
  root = createRoot(document.body.appendChild(document.createElement('div')));
  act(() => root.render(<CreatorWizard cat={cat} initial={initial} onCreate={onCreate} onClose={() => {}} />));
};
const btn = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === t);
const tap = (el: Element | null | undefined) => { if (!el) throw new Error('nothing to tap'); act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const label = (s: string) => document.querySelector(`[aria-label="${s}"]`);
const type = (el: Element | null, v: string) => act(() => {
  const input = el as HTMLInputElement;
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')!.set!.call(input, v);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const draft = (): Draft => JSON.parse(localStorage.getItem(DRAFT_KEY)!);
const noIds = (c: Character) => JSON.parse(JSON.stringify(c).replace(/"n[0-9a-z]{8,}"/g, '"ID"').replace(/(feature|class|grant|item|spell):n[0-9a-z]{8,}/g, '$1:ID'));

// Class Ranger at level 1, Sage (INT, WIS), Elf, Elvish + Dwarvish, Stealth + Survival, Point Buy 15/15/15/8/8/8, "Thorin".
function throughOrigin() {
  tap(btn('Ranger'));
  tap(btn('Next'));
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
function toCreate() {
  throughOrigin();
  tap(btn('Point Buy'));
  for (const ab of ['STR', 'DEX', 'CON']) for (let i = 0; i < 7; i++) tap(label('Raise ' + ab));
  expect(document.body.textContent).toContain('Points: 27 / 27');
  tap(btn('Next'));
  type(document.querySelector('.wizard input[type="text"]'), 'Thorin');
  tap(btn('Next'));
  level1();
  tap(btn('Next'));
}
// The Levels step's level 1 (no choices for the synthetic Ranger): to its summary, then Finish.
function level1() {
  for (let i = 0; i < 6 && !btn('Finish'); i++) tap(btn('Next'));
  tap(btn('Finish'));
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
  it('writes the draft with the current step after each step', () => {
    render(() => {});
    tap(btn('Ranger'));
    tap(btn('Next'));
    expect(draft().step).toBe(1);
    expect(draft().answers.cls).toBe('class/ranger');
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
  it('lowering the starting level drops later level answers', () => {
    render(() => {});
    tap(btn('Ranger'));
    const start = label('Starting level') as HTMLInputElement;
    act(() => { start.focus(); });
    type(start, '5');
    act(() => { start.blur(); });
    tap(btn('Next'));
    throughOriginRest();
    tap(btn('Next')); // abilities (Standard Array, unassigned)
    tap(btn('Next')); // details
    expect(document.body.textContent).toContain('Level 1 of 5');
    level1();
    for (let n = 2; n <= 5; n++) {
      expect(document.body.textContent).toContain('Level ' + n + ' of 5');
      tap(btn('Next'));
      tap(btn('Fixed (6)'));
      for (let i = 0; i < 6 && !btn('Finish'); i++) tap(btn('Next'));
      tap(btn('Finish'));
    }
    tap(btn('Class'));
    const s2 = label('Starting level') as HTMLInputElement;
    act(() => { s2.focus(); });
    type(s2, '3');
    act(() => { s2.blur(); });
    expect(document.body.textContent).toContain('Level 4: above the starting level');
    expect(document.body.textContent).toContain('Level 5: above the starting level');
    tap(btn('Summary'));
    expect(document.body.textContent).toContain('Ranger 3');
  });
});
function throughOriginRest() {
  tap(btn('Sage'));
  tap(btn('INT +1'));
  tap(btn('WIS +1'));
  tap(btn('Next')); // the background flow's own Next: its second step asks "Already counted"
  tap(btn('Add'));
  tap(btn('Elf'));
  tap(btn('Stealth'));
  tap(btn('Survival'));
  tap(btn('Next'));
}

describe('level 1 choices in the creator', () => {
  it('asks a level-1 feature choice, so a Rogue is created with its class', () => {
    const onCreate = vi.fn();
    render(onCreate);
    tap(btn('Rogue'));
    tap(btn('Next'));
    throughOriginRest();
    tap(btn('Next')); // abilities
    tap(btn('Next')); // details
    expect(document.body.textContent).toContain('Level 1');
    tap(btn('Stealth'));
    tap(btn('Add'));
    for (let i = 0; i < 6 && !btn('Finish'); i++) tap(btn('Next'));
    tap(btn('Finish'));
    tap(btn('Next'));
    tap(btn('Create character'));
    const c: Character = onCreate.mock.calls[0][0];
    expect(c.classes.map((r) => r.clsId)).toEqual(['class/rogue']);
    expect(c.grants.some((g) => g.cat === 'expertise' && g.target === 'stealth')).toBe(true);
  });
});

describe('class skills after a background change', () => {
  it('a skill the new background gives can be dropped and replaced', () => {
    render(() => {});
    tap(btn('Ranger'));
    tap(btn('Next'));
    throughOriginRest();          // Sage, Elf, Stealth + Survival
    tap(btn('Origin'));
    tap(btn('Stealth'));          // out
    tap(btn('Insight'));          // in: Insight + Survival
    tap(btn('Acolyte'));          // now gives Insight
    const insight = [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Insight'))!;
    expect(insight.textContent).toContain('from your origin');
    tap(insight);                 // drop it
    tap(btn('Stealth'));          // replace it
    tap(btn('Next'));
    expect(draft().answers.skills.sort()).toEqual(['stealth', 'survival']);
  });
});
