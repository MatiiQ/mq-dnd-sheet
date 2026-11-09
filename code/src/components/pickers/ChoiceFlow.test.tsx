// @vitest-environment happy-dom
// ChoiceFlow's answers as onDone hands them on, pinned on SRD entries with the steps' answers given through `initial`.
import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import srdEntries from '../../data/srd/index';
import { mergeCatalog } from '../../catalog/merge';
import type { AddChoices } from '../../catalog/copy';
import { spellAbilityDefault, type FlowAnswers } from '../../catalog/flow';
import type { Entry } from '../../catalog/schema';
import { blankCharacter } from '../../defaults';
import { Sheet } from '../../sheet';
import { btn, mount, tap, unmount } from '../../test-dom';
import type { Character } from '../../types';
import { ChoiceFlow, type FlowState } from './ChoiceFlow';

const cat = mergeCatalog(srdEntries, null);

// Renders the flow at its first step with the answers given, taps Next until Add, and returns what onDone got.
function runFlow(c: Character, id: string, answers: FlowState['answers']): AddChoices {
  let got: AddChoices | null = null;
  mount(
    <Sheet.Provider value={{ c, update: () => {}, edit: false, form: null, setForm: () => {}, focus: null, reveal: () => {}, markFocusUsed: () => {} }}>
      <ChoiceFlow entry={cat.byId.get(id)!} cat={cat} initial={{ answers, at: 0 }} onDone={(a) => { got = a; }} onCancel={() => {}} />
    </Sheet.Provider>);
  for (let i = 0; i < 20 && !got; i++) {
    const next = btn('Next') ?? btn('Add');
    if (!next) break;
    tap(next);
  }
  if (!got) throw new Error('flow did not finish');
  return got;
}

const SKILLED = { '': { picks: { c1: ['athletics', 'stealth', 'perception'] }, counted: {}, links: {} } };
const ACOLYTE = {
  '': { picks: { abil: ['o2', 'o2', 'o3'] }, counted: {}, links: {}, equip: 'A' as const },
  '>feat/magic-initiate': { picks: { cantrips: ['spell/guidance', 'spell/light'], spell1: ['spell/bless'], ab: ['wis'] }, counted: {}, links: {} }
};
const SKILLED_OUT: AddChoices = { picks: { c1: ['athletics', 'stealth', 'perception'] }, counted: {}, links: {} };
const ACOLYTE_OUT: AddChoices = {
  picks: { abil: ['o2', 'o2', 'o3'] }, counted: {}, links: {}, equip: 'A',
  nested: { 'feat/magic-initiate': { picks: { list: ['cleric'], cantrips: ['spell/guidance', 'spell/light'], spell1: ['spell/bless'], ab: ['wis'] }, counted: {}, links: {} } }
};

describe('ChoiceFlow hands on its answers', () => {
  it('for a feat with a skill choice', () => expect(runFlow(blankCharacter(), 'feat/skilled', SKILLED)).toEqual(SKILLED_OUT));
  it('for a background with a nested feat and starting equipment', () => expect(runFlow(blankCharacter(), 'background/acolyte', ACOLYTE)).toEqual(ACOLYTE_OUT));
});

describe('ChoiceFlow for the level-up wizard', () => {
  it('crosses out held options and asks only the count owed', () => {
    let got: AddChoices | null = null;
    mount(
      <Sheet.Provider value={{ c: blankCharacter(), update: () => {}, edit: false, form: null, setForm: () => {}, focus: null, reveal: () => {}, markFocusUsed: () => {} }}>
        <ChoiceFlow entry={cat.byId.get('feat/skilled')!} cat={cat} held={['athletics']} pick={{ c1: 1 }} onDone={(a) => { got = a; }} onCancel={() => {}} />
      </Sheet.Provider>);
    const opt = (t: string) => [...document.querySelectorAll('button.pick-opt')].find((b) => b.textContent?.startsWith(t))!;
    expect(opt('Athletics').getAttribute('aria-disabled')).toBe('true');
    tap(opt('Athletics'));
    expect(opt('Athletics').getAttribute('aria-pressed')).toBe('false');
    expect(document.body.textContent).toContain('choose 1');
    tap(opt('Stealth'));
    tap(btn('Add'));
    expect(got).toMatchObject({ picks: { c1: ['stealth'] } });
  });
  it('a held option already in the initial picks can be tapped out; a held option not picked can\'t be tapped in', () => {
    mount(
      <Sheet.Provider value={{ c: blankCharacter(), update: () => {}, edit: false, form: null, setForm: () => {}, focus: null, reveal: () => {}, markFocusUsed: () => {} }}>
        <ChoiceFlow entry={cat.byId.get('feat/skilled')!} cat={cat} held={['athletics', 'stealth']} initial={{ answers: { '': { picks: { c1: ['athletics'] }, counted: {}, links: {} } }, at: 0 }}
          onDone={() => {}} onCancel={() => {}} />
      </Sheet.Provider>);
    const opt = (t: string) => [...document.querySelectorAll('button.pick-opt')].find((b) => b.textContent?.startsWith(t))!;
    expect(opt('Athletics').getAttribute('aria-pressed')).toBe('true');
    tap(opt('Athletics'));
    expect(opt('Athletics').getAttribute('aria-pressed')).toBe('false');
    tap(opt('Stealth'));
    expect(opt('Stealth').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('uncontrolled ChoiceFlow', () => {
  const withAlert: Character = { ...blankCharacter(), skillProf: { arcana: 1 }, feats: [{ id: 'x', g: 'feat', name: 'Alert', desc: '', cid: 'feat/alert' }] };
  const render = (id: string) => mount(
    <Sheet.Provider value={{ c: withAlert, update: () => {}, edit: false, form: null, setForm: () => {}, focus: null, reveal: () => {}, markFocusUsed: () => {} }}>
      <ChoiceFlow entry={cat.byId.get(id)!} cat={cat} onDone={() => {}} onCancel={() => {}} />
    </Sheet.Provider>);
  const opt = (t: string) => [...document.querySelectorAll('button.pick-opt')].find((b) => b.textContent?.startsWith(t))!;
  it('still renders pick-opt', () => {
    render('feat/skilled');
    expect(document.querySelectorAll('button.pick-opt').length).toBeGreaterThan(0);
  });
  it('a taken entry option (a feat the sheet already has) can\'t be tapped in, while a taken skill option can', () => {
    mount(
      <Sheet.Provider value={{ c: withAlert, update: () => {}, edit: false, form: null, setForm: () => {}, focus: null, reveal: () => {}, markFocusUsed: () => {} }}>
        <ChoiceFlow entry={{ id: 'feat/pick-origin', kind: 'feat', name: 'Pick', src: 'srd', desc: '', cat: 'general', grants: [{ kind: 'choice', id: 'f', name: 'Feat', pick: 1, pool: 'feat:cat=origin' }] }}
          cat={cat} onDone={() => {}} onCancel={() => {}} />
      </Sheet.Provider>);
    tap(opt('Alert'));
    expect(opt('Alert').getAttribute('aria-pressed')).toBe('false');
    expect(opt('Alert').getAttribute('aria-disabled')).toBe('true');
    unmount();
    render('feat/skilled');
    tap(opt('Arcana'));
    expect(opt('Arcana').getAttribute('aria-pressed')).toBe('true');
  });
});

// ---- Controlled mode (creator fixes, Task 10) ----
const ctxValue = (c: Character = blankCharacter()) => ({ c, update: () => {}, edit: false, form: null, setForm: () => {}, focus: null, reveal: () => {}, markFocusUsed: () => {} });
const Ctx = ({ children }: { children: ReactNode }) => <Sheet.Provider value={ctxValue()}>{children}</Sheet.Provider>;
const two: Entry = { id: 'feat/two-choices', kind: 'feat', name: 'Two Choices', src: 'srd', desc: '', cat: 'general', grants: [
  { kind: 'choice', id: 'first', name: 'First', pick: 1, options: [{ id: 'a', kind: 'prof', name: 'Option A', cat: 'language', target: 'A' }, { id: 'b', kind: 'prof', name: 'Option B', cat: 'language', target: 'B' }] },
  { kind: 'choice', id: 'second', name: 'Second', pick: 1, options: [{ id: 'c', kind: 'prof', name: 'Option C', cat: 'language', target: 'C' }] }] } as Entry;
const tile = (t: string) => [...document.querySelectorAll('.tile-pick')].find((b) => b.textContent?.startsWith(t));
const MI = cat.byId.get('feat/magic-initiate')!;
const WIZ = { '': { picks: { list: ['wizard'] }, counted: {}, links: {} } };

describe('ChoiceFlow controlled', () => {
  it('remounting per step keeps the answers held by the parent', () => {
    let answers: FlowAnswers = {};
    const onAnswers = (u: (a: FlowAnswers) => FlowAnswers) => { answers = u(answers); };
    mount(<Ctx><ChoiceFlow entry={two} cat={cat} at="_/first" answers={answers} onAnswers={onAnswers} onDone={() => {}} onCancel={() => {}} /></Ctx>);
    expect(document.body.textContent).toContain('First · Two Choices');
    expect(document.body.textContent).toContain('0 of 1 chosen');
    tap(tile('Option A'));
    unmount();
    mount(<Ctx><ChoiceFlow entry={two} cat={cat} at="_/second" answers={answers} onAnswers={onAnswers} onDone={() => {}} onCancel={() => {}} /></Ctx>);
    expect(answers[''].picks.first).toEqual(['a']);
    expect(tile('Option C')).toBeTruthy();
    expect(btn('Next')).toBeFalsy();
    expect(document.querySelector('.pick-opt')).toBeNull();
  });
  it('a step key that is not in the list renders nothing', () => {
    mount(<Ctx><ChoiceFlow entry={two} cat={cat} at="_/gone" answers={{}} onAnswers={() => {}} onDone={() => {}} onCancel={() => {}} /></Ctx>);
    expect(document.querySelector('.tile')).toBeNull();
  });
  it('two onAnswers updates in one tick both survive (a tap and the preselection)', () => {
    let seen: FlowAnswers = {};
    function Parent() {
      const [a, setA] = useState<FlowAnswers>(WIZ);
      seen = a;
      // Runs in the same commit as ChoiceFlow's preselection effect (child effects run first).
      useEffect(() => { setA((cur) => ({ ...cur, '': { ...cur[''], picks: { ...cur[''].picks, cantrips: ['spell/light'] } } })); }, []);
      return <ChoiceFlow entry={MI} cat={cat} at="_/ab" answers={a} onAnswers={setA} ctx={{ castAb: 'int', className: 'Wizard' }} onDone={() => {}} onCancel={() => {}} />;
    }
    mount(<Ctx><Parent /></Ctx>);
    expect(seen[''].picks.ab).toEqual(['int']);
    expect(seen[''].picks.cantrips).toEqual(['spell/light']);
  });
  it('Magic Initiate: the spellcasting ability is preselected to the class castAb, once, never over a pick', () => {
    let answers: FlowAnswers = WIZ, calls = 0;
    const onAnswers = (u: (a: FlowAnswers) => FlowAnswers) => { calls++; answers = u(answers); };
    mount(<StrictMode><Ctx><ChoiceFlow entry={MI} cat={cat} at="_/ab" answers={answers} onAnswers={onAnswers} ctx={{ castAb: 'wis', className: 'Cleric' }} onDone={() => {}} onCancel={() => {}} /></Ctx></StrictMode>);
    expect(answers[''].picks.ab).toEqual(['wis']);
    expect(calls).toBe(1);
    expect(document.body.textContent).toContain('Used only for this feat’s spells.');
    expect(document.body.textContent).toContain('Your Cleric casts with Wisdom.');
    unmount();
    answers = { '': { picks: { list: ['wizard'], ab: ['cha'] }, counted: {}, links: {} } };
    mount(<StrictMode><Ctx><ChoiceFlow entry={MI} cat={cat} at="_/ab" answers={answers} onAnswers={onAnswers} ctx={{ castAb: 'int', className: 'Wizard' }} onDone={() => {}} onCancel={() => {}} /></Ctx></StrictMode>);
    expect(answers[''].picks.ab).toEqual(['cha']);
  });
  it('without ctx the hint names no class', () => {
    mount(<Ctx><ChoiceFlow entry={MI} cat={cat} at="_/ab" answers={WIZ} onAnswers={() => {}} onDone={() => {}} onCancel={() => {}} /></Ctx>);
    expect(document.body.textContent).toContain('Used only for this feat’s spells.');
    expect(document.body.textContent).not.toContain('casts');
  });
  it('a class with no castAb: "casts no spells"', () => {
    mount(<Ctx><ChoiceFlow entry={MI} cat={cat} at="_/ab" answers={WIZ} onAnswers={() => {}} ctx={{ className: 'Fighter' }} onDone={() => {}} onCancel={() => {}} /></Ctx>);
    expect(document.body.textContent).toContain('Your Fighter casts no spells.');
  });
  it('a pool option shows the first sentence of its entry and More for the rest', () => {
    mount(<Ctx><ChoiceFlow entry={MI} cat={cat} at="_/cantrips" answers={WIZ} onAnswers={() => {}} onDone={() => {}} onCancel={() => {}} /></Ctx>);
    expect(document.querySelector('.tile-grid')).toBeTruthy();
    expect(document.querySelectorAll('.tile-more').length).toBeGreaterThan(0);
  });
});

describe('spellAbilityDefault', () => {
  it('class castAb, else INT, else the first option', () => {
    expect(spellAbilityDefault(['int', 'wis', 'cha'], 'wis')).toBe('wis');
    expect(spellAbilityDefault(['int', 'wis', 'cha'])).toBe('int');
    expect(spellAbilityDefault(['wis', 'cha'], 'int')).toBe('wis');
  });
});
