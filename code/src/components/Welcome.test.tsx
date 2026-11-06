// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { blankCharacter } from '../defaults';
import { withClass } from '../test-fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
beforeEach(() => localStorage.clear());
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });
const render = () => { root = createRoot(document.body.appendChild(document.createElement('div'))); act(() => root.render(<App />)); };
const btn = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith(t));
const tap = (el: Element | null | undefined) => { if (!el) throw new Error('nothing to tap'); act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const named = (name: string) => ({ ...withClass(blankCharacter(), { name: 'Ranger', lvl: 2 }), ch: { ...blankCharacter().ch, name } });
const saveTwo = () => {
  localStorage.setItem('dnd-sheet-v3:a', JSON.stringify(named('Ann')));
  localStorage.setItem('dnd-sheet-v3:b', JSON.stringify(named('Bob')));
  localStorage.setItem('dnd-index-v3', JSON.stringify({ active: 'a', list: [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }] }));
};

describe('Welcome', () => {
  it('shows on a store with no characters', () => {
    render();
    expect(btn('+ New character')).toBeTruthy();
    expect(document.body.textContent).toContain('Examples');
    expect(document.querySelector('.sheet')).toBeNull();
    tap(btn('Ilyra Moonbrook'));
    expect(document.querySelector('.char-name')?.textContent).toBe('Ilyra Moonbrook');
  });
  it('menu › Characters over an open sheet: Back returns, and a card opens its character', () => {
    saveTwo();
    render();
    expect(document.querySelector('.char-name')?.textContent).toBe('Ann');
    tap(document.querySelector('[aria-label="Menu: rests and characters"]'));
    tap(btn('Characters'));
    expect(btn('Back to Ann')).toBeTruthy();
    tap(btn('Back to Ann'));
    expect(document.querySelector('.char-name')?.textContent).toBe('Ann');
    tap(document.querySelector('[aria-label="Menu: rests and characters"]'));
    tap(btn('Characters'));
    tap([...document.querySelectorAll('.welcome-card')].find((b) => b.textContent?.includes('Bob')));
    expect(document.querySelector('.char-name')?.textContent).toBe('Bob');
  });
  it('shows the draft bar with a draft', () => {
    localStorage.setItem('dnd-draft', JSON.stringify({ v: 1, step: 2, answers: { cls: 'class/ranger', details: { name: 'Thorin', align: '', appearance: '', notes: '' }, levels: [], bgFlow: {}, spFlow: {}, skills: [], languages: [], scores: {}, first: { flows: {}, spells: {} }, method: 'array', equip: 'none', start: 1 } }));
    render();
    expect(document.body.textContent).toContain('Continue creating Thorin');
  });
});
