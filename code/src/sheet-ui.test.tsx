// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { blankCharacter } from './defaults';
import { modeSpeed, speedNow } from './logic';
import { haAura, holyAvenger, paladin, withClass } from './test-fixtures';
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
// Types into a text input the way a player does: focus, a new value, then blur (TypeInNumber commits on blur).
const typeInto = (el: Element | null, v: string) => {
  const input = el as HTMLInputElement;
  act(() => { input.focus(); });
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => { input.blur(); });
};
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

describe('Inventory Move to', () => {
  it('leaves a bag section but stays in the bag', () => {
    renderSheet({
      sections: [{ id: 'p', name: 'Potions', in: 'bag' }],
      inv: [{ id: 'bag', name: 'Bag of Holding', qty: 1, eq: false, xdim: true, cap: 500 }, { id: 'pot', name: 'Potion', qty: 1, eq: false, in: 'bag', sec: 'p' }]
    });
    tab('Inventory');
    tap(document.querySelector('#item-pot .entry-head'));
    const sel = [...document.querySelectorAll('#item-pot select')].find((x) => x.closest('.move-to')) as HTMLSelectElement;
    expect([...sel.options].find((o) => o.value === 'loose')?.textContent).toBe('In Bag of Holding, no section');
    act(() => { sel.value = 'loose'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    const pot = saved().inv.find((i) => i.id === 'pot')!;
    expect(pot.in).toBe('bag');
    expect(pot).not.toHaveProperty('sec');
  });
});

describe('reveal', () => {
  const spell = { id: 's', name: 'Hunter’s Mark', lvl: 1, time: 'Bonus Action', range: '90 feet', c: true };
  const res = { id: 'r', name: 'Favored Enemy', count: 2, max: 2, recharge: 'long' as const, casts: 's' };
  const head = (id: string) => document.querySelector(`#${id} .entry-head`);
  const open = (id: string) => head(id)?.getAttribute('aria-expanded');
  const spellButton = () => [...document.querySelectorAll('#sec-resources button')].find((b) => b.textContent === 'Spell: Hunter’s Mark');
  it('reveal opens a spell hidden by the Prepared filter', () => {
    renderSheet({ spellFilter: 'prepared', usePrep: true, spells: [spell], res: [res], slotMax: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0] });
    tap(head('res-r'));
    tap(spellButton());
    expect(saved().tab).toBe('spells');
    expect(saved().spellFilter).toBe('prepared');
    expect(open('spell-s')).toBe('true');
  });
  it('a used reveal does not reopen', () => {
    renderSheet({ spellFilter: 'prepared', usePrep: true, spells: [spell], res: [res], slotMax: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0] });
    tap(head('res-r'));
    tap(spellButton());
    tap(head('spell-s'));
    tab('Features');
    tab('Spells');
    expect(document.getElementById('spell-s')).toBeNull();
  });
  it('a used reveal leaves a prepared spell closed', () => {
    renderSheet({ spellFilter: 'prepared', usePrep: true, spells: [{ ...spell, prep: true }], res: [res], slotMax: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0] });
    tap(head('res-r'));
    tap(spellButton());
    expect(open('spell-s')).toBe('true');
    tap(head('spell-s'));
    tab('Features');
    tab('Spells');
    expect(open('spell-s')).toBe('false');
  });
});

describe('ability bonus source', () => {
  it('opens the feat a bonus came from', () => {
    renderSheet({ feats: [{ id: 'f', g: 'feat', name: 'Athlete', desc: '' }],
      grants: [{ id: 'g1', kind: 'abil', name: 'Athlete', ab: 'str', val: '1', cap: 20, from: 'feature:f' }] });
    tap(document.querySelector('[aria-label^="Strength modifier"]'));
    tap([...document.querySelectorAll('#sec-abilities button')].find((b) => b.textContent?.includes('from Feat · Athlete')));
    expect(saved().tab).toBe('features');
    expect(document.querySelector('#feat-f .entry-head')?.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('bag removal choice', () => {
  it('shows only in Edit mode', () => {
    renderSheet({ tab: 'inventory', inv: [{ id: 'bag', name: 'Bag of Holding', qty: 1, eq: false, xdim: true }, { id: 'r', name: 'Rope', qty: 1, eq: false, in: 'bag' }] });
    expect(label('If Bag of Holding is removed')).toBeNull();
    editMode();
    expect(label('If Bag of Holding is removed')).not.toBeNull();
  });
});

describe('Active effects', () => {
  const render = (c: Character) => renderSheet(c);
  const list = () => document.querySelector('[aria-label="Active effects"]');
  const chip = () => [...document.querySelectorAll('a.cond-chip')].find((a) => a.textContent?.startsWith('Aura of Protection'));
  it('lists an active aura with its source shortcut', () => {
    render(paladin(6));
    const l = list()!;
    expect(l.textContent).toContain('Aura of Protection');
    expect(l.textContent).toContain('10-ft Emanation');
    expect(l.textContent).toContain('allies add your save bonus');
    tap([...l.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Source:')));
    expect(saved().tab).toBe('features');
    expect(document.querySelector('#feat-p .entry-head')?.getAttribute('aria-expanded')).toBe('true');
  });
  it('greys an aura stopped by Unconscious, with no top-bar chip', () => {
    render(paladin(10, { conds: { Unconscious: true } }));
    const row = list()!.querySelector('li')!;
    expect(row.className).toContain('inactive');
    expect(row.textContent).toContain('Incapacitated');
    expect(row.textContent).toContain('With: Aura of Courage');
    expect(chip()).toBeUndefined();
  });
  it('names what rides on Protection', () => {
    render(paladin(10));
    expect(list()!.textContent).toContain('With: Aura of Courage');
  });
  it('lists a switched-on effect with its switch', () => {
    render({ ...blankCharacter(), feats: [{ id: 'r', g: 'class', name: 'Rage', desc: '' }], effectsOn: ['feature:r'],
      grants: [{ id: 'g', kind: 'dmgBonus', name: 'Rage', val: '2', when: 'active', from: 'feature:r' }] });
    const sw = list()!.querySelector('[aria-label="Switch off Rage"]');
    tap(sw);
    expect(saved().effectsOn).not.toContain('feature:r');
  });
  it('shows one top-bar chip for two active auras', () => {
    const c = paladin(6);
    render({ ...c, inv: [holyAvenger()], attuneIds: ['ha', '', ''], hands: ['ha'], grants: [...c.grants, haAura] });
    expect(chip()?.textContent).toBe('Aura of Protection · 10 ft +1');
    expect(chip()?.getAttribute('href')).toBe('#sec-conditions');
  });
  it('shows nothing when nothing is active', () => {
    render(blankCharacter());
    expect(list()).toBeNull();
  });
});

describe('Resources', () => {
  const head = (id: string) => document.querySelector(`#${id} .entry-head`);
  it('resource body falls back to its feature description', () => {
    renderSheet({ feats: [feat], res: [{ id: 'r', name: 'Rage', count: 2, max: 2, recharge: 'long', from: 'feature:f' }] });
    tap(head('res-r'));
    const body = document.querySelector('#res-r .entry-body')!;
    expect(body.textContent).toContain('first');
    tap([...body.querySelectorAll('button')].find((b) => b.textContent === 'Source: Class · Rage'));
    expect(saved().tab).toBe('features');
    expect(head('feat-f')?.getAttribute('aria-expanded')).toBe('true');
  });
  it('shows a gone source as text and no gone spell', () => {
    renderSheet({ res: [{ id: 'r', name: 'Thing', count: 1, max: 1, recharge: 'long', from: 'feature:gone', casts: 'gone' }] });
    tap(head('res-r'));
    const body = document.querySelector('#res-r .entry-body')!;
    expect(body.textContent).not.toContain('Spell:');
    expect([...body.querySelectorAll('button')].some((b) => b.textContent?.startsWith('Source:'))).toBe(false);
  });
  it('hides Inspiration while off, with its switch in Edit mode', () => {
    renderSheet({ inspOn: false });
    expect(label('Spend Inspiration')).toBeNull();
    editMode();
    expect(label('Show Inspiration')?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('max HP with the CON part derived', () => {
  // Level 5, CON 14 (+2), conBase 0: the derived part is 10.
  const sheet = (p: Partial<Character> = {}) => withClass({ ...blankCharacter(), maxHp: 50, hp: 50, conBase: 0, abil: { ...blankCharacter().abil, con: 14 }, ...p }, { lvl: 5 });
  it('shows and edits the maximum with CON included', () => {
    renderSheet(sheet());
    editMode();
    expect((label('Max HP') as HTMLInputElement).value).toBe('60');
    tap(label('Increase max HP'));
    expect(saved().maxHp).toBe(51);
    typeInto(label('Max HP'), '70');
    expect((label('Max HP') as HTMLInputElement).value).toBe('70');
    expect(saved().maxHp).toBe(60);
  });
  it('resets to the original maximum with CON added', () => {
    renderSheet(sheet({ maxHp: 40, hp: 40, origOn: true, origHp: 50 }));
    editMode();
    tap([...document.querySelectorAll('button')].find((b) => b.textContent === 'Reset to original'));
    expect(saved().maxHp).toBe(50);
  });
});
