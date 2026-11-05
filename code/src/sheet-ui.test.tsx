// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { blankCharacter } from './defaults';
import { modeSpeed, speedNow } from './logic';
import type { Character, Feature, Item } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
const renderSheet = (p: Partial<Character>) => {
  localStorage.setItem('dnd-index-v3', JSON.stringify({ active: 'x', list: [{ id: 'x', name: 'Test' }] }));
  localStorage.setItem('dnd-sheet-v3:x', JSON.stringify({ ...blankCharacter(), ...p }));
  root = createRoot(document.body.appendChild(document.createElement('div')));
  act(() => root.render(<App />));
};
const saved = (): Character => JSON.parse(localStorage.getItem('dnd-sheet-v3:x')!);
const tap = (el: Element | null | undefined) => {
  if (!el) throw new Error('nothing to tap');
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
};
const label = (s: string) => document.querySelector(`[aria-label="${s}"]`);
const editMode = () => tap(label('Edit character'));
const tab = (name: string) => tap([...document.querySelectorAll('nav a, nav button')].find((e) => e.textContent?.trim().startsWith(name)));
const feat: Feature = { id: 'f', g: 'class', name: 'Rage', desc: 'first\nsecond' };

beforeEach(() => { localStorage.clear(); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

describe('entry forms and rows', () => {
  it('adds a hand resistance beside a switched-off grant', () => {
    renderSheet({ feats: [feat], defenses: [{ id: 'd', kind: 'res', name: 'Slashing', from: 'feature:f', when: 'active' }] });
    editMode();
    const select = label('Add a resistance') as HTMLSelectElement;
    act(() => {
      select.value = 'Slashing';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(saved().defenses.filter((d) => d.kind === 'res' && d.name === 'Slashing' && !d.from)).toHaveLength(1);
  });
  it('takes Haste out of AC when it is cast on another creature', () => {
    const haste = { id: 'h', name: 'Haste', lvl: 3, time: 'Action', range: '30 feet', c: true, acFx: 'bonus' as const, acVal: 2 };
    renderSheet({ spells: [haste], conc: { id: 'h', name: 'Haste' }, slotMax: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0] });
    tab('Spells');
    const sw = label('Cast Haste on another creature, so it adds no AC');
    expect(sw?.textContent).toBe('On: me');
    tap(sw);
    expect(saved().spells[0].acOther).toBe(true);
    expect(label('Cast Haste on another creature, so it adds no AC')?.textContent).toBe('On: other');
  });
  it('takes Fly off your speed when it is cast on another creature', () => {
    const fly = { id: 's', name: 'Fly', lvl: 3, time: 'Action', range: 'Touch', c: true };
    renderSheet({ spells: [fly], conc: { id: 's', name: 'Fly' }, slotMax: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
      grants: [{ id: 'g', kind: 'speed', name: 'Fly', mode: 'fly', val: '60', when: 'active', from: 'spell:s' }] });
    tab('Spells');
    const sw = label('Cast Fly on another creature, so it counts only for them');
    expect(sw?.textContent).toBe('On: me');
    expect(modeSpeed(saved(), 'fly').base).toBe(60);
    tap(sw);
    expect(saved().spells[0].acOther).toBe(true);
    expect(modeSpeed(saved(), 'fly').base).toBe(0);
    expect(label('Cast Fly on another creature, so it counts only for them')?.textContent).toBe('On: other');
  });

  it('keeps line breaks in a feature description', () => {
    renderSheet({ feats: [feat] });
    editMode();
    tab('Features');
    tap(label('Edit Rage'));
    const box = document.querySelector('#form-feat textarea') as HTMLTextAreaElement;
    expect(box.value).toContain('\n');
  });
  it('gives an item with a switched-on grant a switch', () => {
    const boots: Item = { id: 'b', name: 'Boots', qty: 1, eq: true };
    renderSheet({ inv: [boots], grants: [{ id: 'g', kind: 'speed', name: 'Boots', mode: 'walk', val: '10', when: 'active', from: 'item:b' }] });
    tab('Inventory');
    expect(speedNow(saved())).toBe(30);
    tap(label('Switch on Boots'));
    expect(saved().effectsOn).toContain('item:b');
    expect(speedNow(saved())).toBe(40);
  });
  it('says why a spell with AC effect 0 won’t save', () => {
    renderSheet({ spells: [{ id: 's', name: 'Ward', lvl: 1, time: 'Action', range: 'Self', prep: true, acFx: 'bonus', acVal: 0 }] });
    editMode();
    tab('Spells');
    tap(label('Edit Ward'));
    expect(document.getElementById('form-spell')?.textContent).toContain('Enter a value for the AC effect.');
  });
  it('shows Reset only for a typed change', () => {
    const asi = { id: 'g', kind: 'abil' as const, name: 'ASI', ab: 'str', val: '2', cap: 20 as const, from: 'feature:f' };
    renderSheet({ feats: [feat], grants: [asi] });
    editMode();
    expect(label('Reset strength to original 10')).toBeNull();
    act(() => root.unmount());
    document.body.innerHTML = '';
    renderSheet({ abilAdj: { str: 1 } });
    editMode();
    expect(label('Reset strength to original 10')).not.toBeNull();
  });
  it('lists what goes with a spell and an item', () => {
    renderSheet({
      spells: [{ id: 's', name: 'Ward', lvl: 1, time: 'Action', range: 'Self', prep: true }],
      inv: [{ id: 'i', name: 'Goggles', qty: 1, eq: false }],
      senses: [{ id: 'a', name: 'Blindsight', range: '10 ft', from: 'spell:s' }, { id: 'b', name: 'Darkvision', range: '60 ft', from: 'item:i' }]
    });
    editMode();
    tab('Spells');
    tap(label('Remove Ward'));
    expect(document.querySelector('.remove-confirm')?.textContent).toContain('Also removes: Blindsight');
    tab('Inventory');
    tap(label('Remove Goggles'));
    expect(document.querySelector('.remove-confirm')?.textContent).toContain('Also removes: Darkvision');
  });
  it('says grants in an edit form save at once', () => {
    renderSheet({ feats: [feat] });
    editMode();
    tab('Features');
    tap(label('Edit Rage'));
    expect(document.getElementById('form-feat')?.textContent).toContain('Grants save at once; Cancel doesn’t undo them.');
  });
});

describe('custom Advantage on saves', () => {
  const sec = () => document.getElementById('sec-defenses')!;
  const choose = (v: string) => {
    const select = sec().querySelector('[aria-label="Add an advantage on saves"]') as HTMLSelectElement;
    act(() => { select.value = v; select.dispatchEvent(new Event('change', { bubbles: true })); });
  };
  const field = () => sec().querySelector('[aria-label="Advantage on saves, custom"]') as HTMLInputElement | null;
  const type = (v: string) => act(() => {
    const el = field()!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const addBtn = () => [...sec().querySelectorAll('button')].find((b) => b.textContent === 'Add');
  it('adds a custom Advantage on saves from the dropdown', () => {
    renderSheet({});
    choose('__custom');
    type('vs traps');
    tap(addBtn());
    expect(saved().defenses).toContainEqual(expect.objectContaining({ kind: 'adv', name: 'vs traps' }));
    expect(field()).toBeNull();
  });
  it('adds nothing for an empty custom Advantage', () => {
    renderSheet({});
    choose('__custom');
    tap(addBtn());
    expect(saved().defenses).toEqual([]);
    expect(field()).not.toBeNull();
  });
});

describe('Actions hand buttons', () => {
  it('draws a carried weapon from Weapons not held', () => {
    renderSheet({ inv: [{ id: 'h', name: 'Handaxe', qty: 1, eq: false, cat: 'weapon', wcat: 'simple', wrange: 'melee', dmg: '1d6', dtype: 'Slashing', props: 'light,thrown', thrown: '20/60' }] });
    tap([...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Weapons not held (1)')));
    expect(document.body.textContent).toContain('Carried: drawing it equips it');
    const draw = label('Draw Handaxe');
    expect(draw?.textContent).toBe('Draw');
    tap(draw);
    expect(saved().hands).toEqual(['h']);
  });
});

describe('reveal', () => {
  it.todo('reveal opens a spell hidden by the Prepared filter');
  it.todo('a used reveal does not reopen');
});
