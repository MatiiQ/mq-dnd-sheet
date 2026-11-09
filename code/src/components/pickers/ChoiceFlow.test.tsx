// @vitest-environment happy-dom
// ChoiceFlow's answers as onDone hands them on, pinned on SRD entries with the steps' answers given through `initial`.
import { describe, expect, it } from 'vitest';
import srdEntries from '../../data/srd/index';
import { mergeCatalog } from '../../catalog/merge';
import type { AddChoices } from '../../catalog/copy';
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
