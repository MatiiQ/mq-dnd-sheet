// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeCatalog } from '../catalog/merge';
import type { ClassEntry, Entry, FeatureEntry } from '../catalog/schema';
import { blankCharacter } from '../defaults';
import { withClass } from '../test-fixtures';
import type { Character } from '../types';
import { LevelUpWizard } from './LevelUpWizard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cls = (name: string, hd: 6 | 8 | 10 | 12): ClassEntry => ({ id: 'class/' + name.toLowerCase(), kind: 'class', name, src: 'srd', desc: '', hd, saves: 'str,dex',
  skills: { kind: 'choice', id: 'skills', name: 'Skills', pick: 1, pool: 'skill:any' }, armor: '', weapons: '', slots: [] });
const feat = (c: string, s: string, lvl: number, p: Partial<FeatureEntry> = {}): FeatureEntry => ({ id: `feature/${c}/${s}`, kind: 'feature', name: s, src: 'srd', desc: '', cls: c, lvl, grants: [], ...p });
const entries: Entry[] = [cls('Ranger', 10), cls('Warlock', 8), feat('ranger', 'roving', 2),
  feat('warlock', 'eldritch-invocations', 1, { grants: [{ kind: 'choice', id: 'inv', name: 'Invocations', pick: 1, pickAt: '1:1,2:3', pool: 'feature:of=invocation' }] }),
  ...['a', 'b', 'c', 'd'].map((x) => feat('warlock', 'inv-' + x, 1, { of: 'invocation' }))];
const cat = mergeCatalog(entries, null);

let root: Root;
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });
const render = (c: Character, onApply: (n: Character) => void, catalog: typeof cat | null = cat) => {
  root = createRoot(document.body.appendChild(document.createElement('div')));
  act(() => root.render(<LevelUpWizard c={c} cat={catalog} onApply={onApply} onClose={() => {}} />));
};
const button = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === t);
const tap = (el: Element | null | undefined) => { if (!el) throw new Error('nothing to tap'); act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const type = (el: Element | null, v: string) => act(() => {
  const input = el as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const next = () => tap(button('Next'));

describe('LevelUpWizard', () => {
  it('Ranger 1 → 2: the class is preselected, the roll is checked, the summary shows HP, Finish applies', () => {
    const c = withClass({ ...blankCharacter(), maxHp: 10, conBase: 0, hp: 12, abil: { ...blankCharacter().abil, con: 14 } }, { name: 'Ranger', clsId: 'class/ranger', hd: 10, lvl: 1 });
    const onApply = vi.fn();
    render(c, onApply);
    expect(document.querySelector('[aria-pressed="true"]')?.textContent).toContain('Ranger 1 → 2');
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
    tap(button('Fixed (5)'));
    for (let i = 0; i < 5 && !document.body.textContent?.includes('Invocations'); i++) next();
    expect(document.body.textContent).toContain('choose 2');
  });
  it('without the catalog: level up with HP only, and say features are added by hand', () => {
    const c = withClass({ ...blankCharacter(), maxHp: 10, hp: 10 }, { name: 'Ranger', clsId: 'class/ranger', hd: 10, lvl: 1 });
    const onApply = vi.fn();
    render(c, onApply, null);
    expect(document.body.textContent).toContain('Level-up needs the class catalog');
    tap(button('Level up without it'));
    next();
    tap(button('Fixed (6)'));
    for (let i = 0; i < 5 && !button('Finish'); i++) next();
    expect(document.body.textContent).toContain('Features are added by hand');
    tap(button('Finish'));
    expect(onApply.mock.calls[0][0].classes[0].lvl).toBe(2);
  });
});
