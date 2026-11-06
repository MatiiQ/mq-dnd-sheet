// @vitest-environment happy-dom
// ChoiceFlow's answers as onDone hands them on, pinned on SRD entries with the steps' answers given through `initial`.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import srdEntries from '../../data/srd/index';
import { mergeCatalog } from '../../catalog/merge';
import type { AddChoices } from '../../catalog/copy';
import { blankCharacter } from '../../defaults';
import { Sheet } from '../../sheet';
import type { Character } from '../../types';
import { ChoiceFlow, type FlowState } from './ChoiceFlow';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cat = mergeCatalog(srdEntries, null);
let root: Root;
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

// Renders the flow at its first step with the answers given, taps Next until Add, and returns what onDone got.
function runFlow(c: Character, id: string, answers: FlowState['answers']): AddChoices {
  let got: AddChoices | null = null;
  root = createRoot(document.body.appendChild(document.createElement('div')));
  act(() => root.render(
    <Sheet.Provider value={{ c, update: () => {}, edit: false, form: null, setForm: () => {}, focus: null, reveal: () => {}, markFocusUsed: () => {} }}>
      <ChoiceFlow entry={cat.byId.get(id)!} cat={cat} initial={{ answers, at: 0 }} onDone={(a) => { got = a; }} onCancel={() => {}} />
    </Sheet.Provider>));
  for (let i = 0; i < 20 && !got; i++) {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Next' || b.textContent === 'Add');
    if (!btn) break;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
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
    root = createRoot(document.body.appendChild(document.createElement('div')));
    act(() => root.render(
      <Sheet.Provider value={{ c: blankCharacter(), update: () => {}, edit: false, form: null, setForm: () => {}, focus: null, reveal: () => {}, markFocusUsed: () => {} }}>
        <ChoiceFlow entry={cat.byId.get('feat/skilled')!} cat={cat} held={['athletics']} pick={{ c1: 1 }} onDone={(a) => { got = a; }} onCancel={() => {}} />
      </Sheet.Provider>));
    const opt = (t: string) => [...document.querySelectorAll('button.pick-opt')].find((b) => b.textContent?.startsWith(t))!;
    const tapEl = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(opt('Athletics').getAttribute('aria-disabled')).toBe('true');
    tapEl(opt('Athletics'));
    expect(opt('Athletics').getAttribute('aria-pressed')).toBe('false');
    expect(document.body.textContent).toContain('choose 1');
    tapEl(opt('Stealth'));
    tapEl([...document.querySelectorAll('button')].find((b) => b.textContent === 'Add')!);
    expect(got).toMatchObject({ picks: { c1: ['stealth'] } });
  });
});
