// Shared by the happy-dom component tests: mounts one React tree per test (unmounted after it) and taps and types like a player.
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
// Unmounts what mount() put up; runs after every test, and a test may call it to start again.
export const unmount = () => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.innerHTML = '';
};
afterEach(unmount);

export const mount = (el: ReactElement) => {
  root = createRoot(document.body.appendChild(document.createElement('div')));
  act(() => root!.render(el));
};
export const tap = (el: Element | null | undefined) => {
  if (!el) throw new Error('nothing to tap');
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
};
// A button by its exact text, or by its start (a card or row whose text goes on).
export const btn = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === t);
export const btnStarting = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith(t));
export const label = (s: string) => document.querySelector(`[aria-label="${s}"]`);
export const type = (el: Element | null, v: string) => act(() => {
  const input = el as HTMLInputElement;
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')!.set!.call(input, v);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
