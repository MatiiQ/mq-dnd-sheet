// @vitest-environment happy-dom
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { blankCharacter } from './defaults';
import { writeDraft } from './creator';
import { NEW_ANSWERS } from './components/CreatorWizard';
import { btnStarting as btn, label, mount, tap, unmount } from './test-dom';
import { withClass } from './test-fixtures';

beforeEach(() => localStorage.clear());
const tab = (name: string) => tap([...document.querySelectorAll('nav a, nav button')].find((e) => e.textContent?.trim().startsWith(name)));
const named = (name: string) => ({ ...withClass(blankCharacter(), { name: 'Ranger', lvl: 2 }), ch: { ...blankCharacter().ch, name } });
const saveTwo = () => {
  localStorage.setItem('dnd-sheet-v3:a', JSON.stringify(named('Ann')));
  localStorage.setItem('dnd-sheet-v3:b', JSON.stringify(named('Bob')));
  localStorage.setItem('dnd-index-v3', JSON.stringify({ active: 'a', list: [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }] }));
};

const isEditing = () => label('Done editing')?.getAttribute('aria-pressed') === 'true';
const openMenu = () => tap(label('Menu: rests and characters'));

describe('Welcome', () => {
  it('+ New character opens a chooser; Cancel closes only the chooser', () => {
    mount(<App />);
    const add = btn('+ New character')!;
    expect(add.getAttribute('aria-expanded')).toBe('false');
    tap(add);
    expect(add.getAttribute('aria-expanded')).toBe('true');
    expect(btn('Step by step') && btn('Blank sheet') && btn('Cancel')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Copy of/);
    tap(btn('Cancel'));
    expect(btn('Step by step')).toBeFalsy();
    expect(label('Characters')).toBeTruthy();
  });
  it('Step by step opens the creator above the welcome screen (later in the DOM, same fixed z-index)', () => {
    mount(<App />);
    tap(btn('+ New character')); tap(btn('Step by step'));
    const creator = document.querySelector('[aria-label="Create a character"]')!;
    const welcome = document.querySelector('main.welcome')!;
    expect(creator).toBeTruthy();
    expect(welcome.compareDocumentPosition(creator) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('Blank sheet adds a character and opens it in edit mode once', () => {
    mount(<StrictMode><App /></StrictMode>);
    tap(btn('+ New character')); tap(btn('Blank sheet'));
    expect(document.querySelector('.sheet')).toBeTruthy();
    expect(isEditing()).toBe(true);
    openMenu(); tap(btn('Characters')); tap(btn('Back to'));
    expect(isEditing()).toBe(false);
  });
  it('shows on a store with no characters', () => {
    mount(<App />);
    expect(btn('+ New character')).toBeTruthy();
    expect(document.body.textContent).toContain('Examples');
    expect(document.querySelector('.sheet')).toBeNull();
    tap(btn('Ilyra Moonbrook'));
    expect(document.querySelector('.char-name')?.textContent).toBe('Ilyra Moonbrook');
  });
  it('menu › Characters over an open sheet: Back returns, and a card opens its character', () => {
    saveTwo();
    mount(<App />);
    expect(document.querySelector('.char-name')?.textContent).toBe('Ann');
    tap(label('Menu: rests and characters'));
    tap(btn('Characters'));
    expect(btn('Back to Ann')).toBeTruthy();
    tap(btn('Back to Ann'));
    expect(document.querySelector('.char-name')?.textContent).toBe('Ann');
    tap(label('Menu: rests and characters'));
    tap(btn('Characters'));
    tap([...document.querySelectorAll('.welcome-card')].find((b) => b.textContent?.includes('Bob')));
    expect(document.querySelector('.char-name')?.textContent).toBe('Bob');
  });
  it('the draft prompt shows with a string step key and with an old numeric step', () => {
    const answers = { ...NEW_ANSWERS(), cls: 'class/ranger', details: { name: 'Thorin', align: '', appearance: '', notes: '' } };
    localStorage.setItem('dnd-draft', JSON.stringify({ v: 1, step: 'abilities/scores', answers }));
    mount(<App />);
    expect(document.body.textContent).toContain('Continue creating Thorin (Abilities)?');
    unmount();
    localStorage.setItem('dnd-draft', JSON.stringify({ v: 1, step: 3, answers }));
    mount(<App />);
    expect(document.body.textContent).toContain('Continue creating Thorin (Details)?');
  });
  it('shows the draft bar with a draft', () => {
    writeDraft({ v: 1, step: 'abilities/scores', answers: { ...NEW_ANSWERS(), cls: 'class/ranger', details: { name: 'Thorin', align: '', appearance: '', notes: '' } } });
    mount(<App />);
    expect(document.body.textContent).toContain('Continue creating Thorin');
  });
});

describe('tabs', () => {
  it('closes a tab form when the tab changes, so reopening cannot save a blank edit', () => {
    // Open Ilyra as the active example: an example opens only next to a character of your own.
    localStorage.setItem('dnd-sheet-v3:a1', JSON.stringify(blankCharacter()));
    localStorage.setItem('dnd-index-v3', JSON.stringify({ active: 'example:ilyra', list: [{ id: 'a1', name: 'A' }] }));
    mount(<App />);
    tap(label('Edit character'));
    tab('Spells');
    tap(document.querySelector('#sec-tabs [aria-label^="Edit "]'));
    expect(document.getElementById('form-spell')).not.toBeNull();
    tab('Actions');
    tab('Spells');
    expect(document.getElementById('form-spell')).toBeNull();
  });
});
