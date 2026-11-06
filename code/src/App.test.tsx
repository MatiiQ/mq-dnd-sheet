// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import App from './App';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tap = (el: Element | null | undefined) => {
  if (!el) throw new Error('nothing to tap');
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
};
const tab = (name: string) => tap([...document.querySelectorAll('nav a, nav button')].find((e) => e.textContent?.trim().startsWith(name)));

describe('App', () => {
  it('closes a tab form when the tab changes, so reopening cannot save a blank edit', () => {
    // Open Ilyra as the active example (a fresh install now opens the welcome screen).
    localStorage.setItem('dnd-index-v3', JSON.stringify({ active: 'example:ilyra', list: [] }));
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    act(() => root.render(<App />));
    tap(document.querySelector('[aria-label="Edit character"]'));
    tab('Spells');
    tap(document.querySelector('#sec-tabs [aria-label^="Edit "]'));
    expect(document.getElementById('form-spell')).not.toBeNull();
    tab('Actions');
    tab('Spells');
    expect(document.getElementById('form-spell')).toBeNull();
    act(() => root.unmount());
  });
});
