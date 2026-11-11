// @vitest-environment happy-dom
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeCatalog } from './catalog/merge';
import type { ClassEntry } from './catalog/schema';
import App from './App';
import { blankCharacter } from './defaults';
import { modeSpeed, speedNow } from './logic';
import srdEntries from './data/srd/index';
import { addFromCatalog } from './catalog/copy';
import { firstMasteryFeature } from './components/tabs/FeaturesTab';
import { btnStarting, label, mount, tap, unmount } from './test-dom';
import { haAura, holyAvenger, paladin, withClass, withClasses } from './test-fixtures';
import type { Character, Feature, Item } from './types';


// The catalog, in this file only: a synthetic Ranger with no features, so the level-up wizard has a class to read.
const ranger: ClassEntry = { id: 'class/ranger', kind: 'class', name: 'Ranger', src: 'srd', desc: '', hd: 10, saves: 'str,dex',
  skills: { kind: 'choice', id: 'skills', name: 'Skills', pick: 1, pool: 'skill:any' }, armor: '', weapons: '', slots: [] };
vi.mock('./catalog/useCatalog', () => ({ useCatalog: () => ({ status: 'ready', cat: mergeCatalog([ranger], null) }) }));

const renderSheet = (p: Partial<Character>) => {
  localStorage.setItem('dnd-index-v3', JSON.stringify({ active: 'x', list: [{ id: 'x', name: 'Test' }] }));
  localStorage.setItem('dnd-sheet-v3:x', JSON.stringify({ ...blankCharacter(), ...p }));
  mount(<App />);
};
const saved = (): Character => JSON.parse(localStorage.getItem('dnd-sheet-v3:x')!);
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

describe('entry forms and rows', () => {
  it('shows Advantage on Initiative under the value', () => {
    renderSheet({ feats: [{ id: 'f', g: 'class', name: 'Feral Instinct', desc: '' }],
      grants: [{ id: 'g', kind: 'checkAdv', name: 'Feral Instinct', target: 'init', adv: 'adv', from: 'feature:f' }] });
    const stat = document.querySelector('[aria-label^="Initiative"]');
    expect(stat?.textContent).toContain('Adv');
    expect(stat?.getAttribute('aria-label')).toContain('Advantage');
  });
  it('types the rolled Initiative total into the Initiative panel and clears it', () => {
    renderSheet({});
    tap(document.querySelector('[aria-label^="Initiative"]'));
    typeInto(label('Rolled initiative total'), '17');
    expect(saved().initRoll).toBe(17);
    expect(document.querySelector('[aria-label^="Initiative"]')?.textContent).toContain('Rolled 17');
    tap(label('Clear the rolled initiative'));
    expect(saved().initRoll).toBeUndefined();
  });
  it('shows a granted skill source only after a tap, and names the grant first in Edit mode', () => {
    renderSheet({ feats: [{ id: 'f', g: 'species', name: 'Keen Senses', desc: '' }],
      grants: [{ id: 'g', kind: 'prof', name: 'Perception', cat: 'skill', target: 'perception', from: 'feature:f' }] });
    const row = () => [...document.querySelectorAll('.skill-row')].find((e) => e.textContent?.startsWith('Perception'));
    expect(row()?.textContent).not.toContain('from');
    tap(row());
    expect(row()?.textContent).toContain('Proficient from');
    editMode();
    const edit = label('Perception: Proficient from Species · Keen Senses. Tap to change.');
    expect(edit?.textContent).not.toContain('Not proficient');
  });
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
  describe('a wand’s spell', () => {
    const wand: Item = { id: 'w', name: 'Wand of Fireballs', qty: 1, eq: true, count: 7, max: 7 };
    const fb = { id: 'fb', name: 'Fireball', lvl: 3, time: 'Action', range: '150 feet', always: true, from: 'item:w', needEq: true,
      chg: 1, chgMax: 3, fx: 'damage' as const, dmg: '8d6', dtype: 'Fire', save: 'dex' as const, dc: 15 };
    const sheet = (eq = true) => renderSheet({ inv: [{ ...wand, eq }], spells: [fb], slotMax: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0] });
    const buttons = () => [...document.querySelectorAll('button')].filter((b) => /charges? · /.test(b.textContent ?? ''));
    it('casts from charges in the Spells tab, with no slot button', () => {
      sheet();
      tab('Spells');
      expect(buttons().map((b) => b.textContent)).toEqual(['1 charge · 3rd level', '2 charges · 4th level', '3 charges · 5th level']);
      expect(label('Cast Fireball with a level 3 slot, 1 left')).toBeFalsy();
      tap(buttons()[1]);
      expect(saved().inv[0].count).toBe(5);
      expect(saved().slotUsed[3]).toBe(0);
    });
    it('casts from charges in the Actions tab, with no slot button', () => {
      sheet();
      tab('Actions');
      expect(buttons().map((b) => b.textContent)).toContain('1 charge · 3rd level');
      expect(label('Cast Fireball with a level 3 slot, 1 left')).toBeFalsy();
    });
    it('disables the buttons while the wand is unequipped', () => {
      sheet(false);
      tab('Spells');
      expect(buttons().length).toBe(3);
      expect(buttons().every((b) => b.disabled)).toBe(true);
      tab('Actions');
      expect(buttons().every((b) => b.disabled)).toBe(true);
    });
  });
  it('reads a Spell Scroll from its spell row, with no slot button', () => {
    const scroll: Item = { id: 'sc', name: 'Spell Scroll', qty: 2, eq: false, cid: 'item/spell-scroll' };
    const fb = { id: 'fb', name: 'Fireball', lvl: 3, time: 'Action', range: '150 feet', always: true, from: 'item:sc', classes: 'wizard',
      fx: 'damage' as const, dmg: '8d6', dtype: 'Fire', save: 'dex' as const };
    renderSheet({ inv: [scroll], spells: [fb], slotMax: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0] });
    tab('Spells');
    expect(label('Cast Fireball with a level 3 slot, 1 left')).toBeFalsy();
    expect(document.body.textContent).toContain('Not on your spell list: the scroll is unintelligible');
    tap(label('Read the scroll of Fireball, 2 left'));
    expect(saved().inv[0].qty).toBe(1);
    expect(saved().slotUsed[3]).toBe(0);
    tab('Actions');
    expect(label('Read the scroll of Fireball, 1 left')).toBeTruthy();
  });
  it('chooses the weapon Magic Weapon is on, from nonmagical weapons', () => {
    const mw = { id: 'mw', name: 'Magic Weapon', lvl: 2, time: 'Bonus Action', range: 'Touch' };
    const sword: Item = { id: 'ls', name: 'Longsword', qty: 1, eq: true, cat: 'weapon', wrange: 'melee', dmg: '1d8' };
    const plus: Item = { id: 'p1', name: 'Mace +1', qty: 1, eq: true, cat: 'weapon', wrange: 'melee', dmg: '1d6', magic: 1 };
    renderSheet({ inv: [sword, plus], spells: [mw], effectsOn: ['spell:mw'],
      grants: [{ id: 'g', kind: 'atkBonus', name: 'Magic Weapon', val: '@2:1,3:2,6:3', onItem: true, when: 'active', from: 'spell:mw' }] });
    tab('Spells');
    const sel = label('Weapon for Magic Weapon') as HTMLSelectElement;
    expect([...sel.options].map((o) => o.textContent)).toEqual(['Choose a weapon', 'Longsword']);
    act(() => { sel.value = 'ls'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(saved().castFx).toEqual({ 'spell:mw': { item: 'ls' } });
  });
  it('reads a manual from its Inventory row', () => {
    renderSheet({ inv: [{ id: 'bk', name: 'Manual of Gainful Exercise', qty: 1, eq: false, reads: 'str' }] });
    tab('Inventory');
    tap(label('Read Manual of Gainful Exercise'));
    expect(saved().inv[0].reads).toBe('str');
    tap(label('Tap again to read Manual of Gainful Exercise'));
    expect(saved().inv[0].reads).toBeUndefined();
    expect(saved().feats.some((f) => f.name === 'Manual of Gainful Exercise')).toBe(true);
    expect(label('Read Manual of Gainful Exercise')).toBeFalsy();
  });
  it('takes Haste out of AC when it is cast on another creature', () => {
    const haste = { id: 'h', name: 'Haste', lvl: 3, time: 'Action', range: '30 feet', c: true, acFx: 'bonus' as const, acVal: 2 };
    renderSheet({ spells: [haste], conc: { id: 'h', name: 'Haste' }, slotMax: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0] });
    tab('Spells');
    const sw = label('Cast Haste on another creature, so it adds no AC');
    expect(label('Cast Haste on me')?.getAttribute('aria-pressed')).toBe('true');
    expect(sw?.getAttribute('aria-pressed')).toBe('false');
    tap(sw);
    expect(saved().spells[0].acOther).toBe(true);
    expect(label('Cast Haste on another creature, so it adds no AC')?.getAttribute('aria-pressed')).toBe('true');
    tap(label('Cast Haste on another creature, so it adds no AC'));
    expect(saved().spells[0].acOther).toBe(true); // tapping the pressed choice changes nothing
    tap(label('Cast Haste on me'));
    expect(saved().spells[0].acOther).toBeUndefined();
  });
  it('takes Fly off your speed when it is cast on another creature', () => {
    const fly = { id: 's', name: 'Fly', lvl: 3, time: 'Action', range: 'Touch', c: true };
    renderSheet({ spells: [fly], conc: { id: 's', name: 'Fly' }, slotMax: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
      grants: [{ id: 'g', kind: 'speed', name: 'Fly', mode: 'fly', val: '60', when: 'active', from: 'spell:s' }] });
    tab('Spells');
    const sw = label('Cast Fly on another creature, so it counts only for them');
    expect(sw?.getAttribute('aria-pressed')).toBe('false');
    expect(modeSpeed(saved(), 'fly').base).toBe(60);
    tap(sw);
    expect(saved().spells[0].acOther).toBe(true);
    expect(modeSpeed(saved(), 'fly').base).toBe(0);
    expect(label('Cast Fly on another creature, so it counts only for them')?.getAttribute('aria-pressed')).toBe('true');
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
    unmount();
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

describe('Hit Dice pools', () => {
  const two = () => withClasses({ ...blankCharacter(), maxHp: 60, hp: 30, hdUsed: {} }, [{ name: 'Ranger', lvl: 5, hd: 10 }, { name: 'Rogue', lvl: 2, hd: 8 }]);
  const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === text);
  it('a Hit Die heal then Undo refunds one pool only', () => {
    renderSheet(two());
    const select = label('Hit Die size') as HTMLSelectElement;
    act(() => { select.value = '8'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    tap(button('Spend Hit Die'));
    expect(saved().hdUsed).toEqual({ 8: 1 });
    act(() => { (document.getElementById('hp-amount') as HTMLInputElement).blur(); });
    tap(button('Heal'));
    tap(button('Undo'));
    expect(saved().hdUsed).toEqual({ 8: 0 });
  });
  it('shows no die select with one pool', () => {
    renderSheet(withClass(blankCharacter(), { lvl: 3 }));
    expect(label('Hit Die size')).toBeNull();
  });
});

describe('the pact slot pool', () => {
  const hex = { id: 's', name: 'Hex', lvl: 1, time: 'Bonus Action', range: '90 feet', prep: true };
  it('shows the pact slots and casts with one', () => {
    renderSheet({ pactMax: 2, pactLvl: 3, pactUsed: 0, spells: [hex] });
    tab('Spells');
    expect(document.body.textContent).toContain('Pact slots (3rd)');
    expect(document.body.textContent).toContain('2 of 2 left');
    const cast = [...document.querySelectorAll('button')].find((b) => b.textContent === '3rd (pact)');
    tap(cast);
    expect(saved().pactUsed).toBe(1);
  });
  it('edits the pact slot count and level in Edit mode', () => {
    renderSheet({ spells: [hex] });
    tab('Spells');
    expect(label('Pact slot count')).toBeNull();
    editMode();
    expect(label('Pact slot count')).not.toBeNull();
    tap(label('More pact slots'));
    tap(label('Raise pact slot level'));
    expect(saved()).toMatchObject({ pactMax: 1, pactLvl: 1 });
  });
});

describe('prepared spells per class', () => {
  const sp = (id: string, p: object = {}) => ({ id, name: id, lvl: 1, time: 'Action', range: '60 feet', prep: true, ...p });
  it('shows a counter per casting row only', () => {
    renderSheet(withClasses({ ...blankCharacter(), usePrep: true, spells: [sp('a')] }, [{ name: 'Fighter', lvl: 1 }, { name: 'Wizard', lvl: 3, castAb: 'int', prep: 5 }]));
    tab('Spells');
    expect(document.body.textContent).toContain('Wizard 1/5');
    expect(document.body.textContent).not.toContain('Fighter 0');
  });
  it('edits each row’s maximum and casting ability, and lists both abilities', () => {
    renderSheet(withClasses({ ...blankCharacter(), usePrep: true, spells: [sp('a'), sp('b', { cls: 'c2' })] },
      [{ name: 'Ranger', castAb: 'wis', prep: 5 }, { name: 'Sorcerer', castAb: 'cha', prep: 6 }]));
    tab('Spells');
    expect(document.body.textContent).toContain('Ranger 1/5 · Sorcerer 1/6');
    expect(document.body.textContent).toContain('Ranger Wisdom · Sorcerer Charisma');
    editMode();
    expect(label('Maximum prepared, Ranger')).not.toBeNull();
    tap(label('Raise maximum prepared, Ranger'));
    expect(saved().classes[0].prep).toBe(6);
    const sel = label('Spellcasting ability, Sorcerer') as HTMLSelectElement;
    act(() => { sel.value = 'int'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(saved().classes[1].castAb).toBe('int');
  });
});

describe('class rows in Edit details', () => {
  const two = () => withClasses(blankCharacter(), [{ name: 'Ranger', lvl: 3, hd: 10 }, { name: 'Rogue', lvl: 2 }]);
  it('lists each row, with a remove button on all but the first and level inputs while there is no history', () => {
    renderSheet(two());
    editMode();
    expect(label('Remove class Ranger')).toBeNull();
    expect(label('Remove class Rogue')).not.toBeNull();
    expect(label('Level, Rogue')).not.toBeNull();
    expect(label('Hit die, Rogue')).not.toBeNull();
    tap([...document.querySelectorAll('button')].find((b) => b.textContent === '+ Add class'));
    expect(saved().classes).toHaveLength(3);
    expect(saved().levels.map((r) => r.n)).toEqual([3, 5, 6]);
    tap(label('Remove class Rogue'));
    tap(label('Tap again to remove class Rogue'));
    expect(saved().classes.map((r) => r.name)).toEqual(['Ranger', '']);
  });
  it('keeps name, subclass and die editable but not levels once there is history', () => {
    const c = two();
    renderSheet({ ...c, classes: [c.classes[0], { ...c.classes[1], lvl: 3 }], levels: [...c.levels, { n: 6, cls: 'c2', added: [], picks: {}, set: [] }] });
    editMode();
    expect(label('Level, Rogue')).toBeNull();
    expect([...document.querySelectorAll('button')].some((b) => b.textContent === '+ Add class')).toBe(false);
    expect(label('Class name, Rogue')).not.toBeNull();
    expect(label('Hit die, Rogue')).not.toBeNull();
  });
});

describe('level-up and undo from the menu', () => {
  const button = btnStarting;
  // Opening the menu mounts the PHB data row, whose pack lookup settles a tick later: let it finish inside the test.
  const menu = async () => { tap(label('Menu: rests and characters')); await act(async () => {}); };
  it('the menu has one Characters section: the button, Duplicate, Delete; no list, no examples', async () => {
    renderSheet({});
    await menu();
    expect(button('Characters')).toBeTruthy();
    expect(button('Duplicate this character')).toBeTruthy();
    expect(button('Delete this character')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Your characters');
    expect(document.body.textContent).not.toContain('Example Characters');
    expect(button('+ New character')).toBeFalsy();
  });
  it('level-up then undo', async () => {
    renderSheet(withClass({ ...blankCharacter(), maxHp: 10, hp: 10 }, { name: 'Ranger', clsId: 'class/ranger', hd: 10, lvl: 1 }));
    const before = saved().levels.length;
    await menu();
    tap(button('Level up'));
    tap(button('Next'));
    tap(button('Next'));
    tap(button('Fixed (6)'));
    for (let i = 0; i < 5 && !button('Finish'); i++) tap(button('Next'));
    tap(button('Finish'));
    expect(saved().classes[0].lvl).toBe(2);
    expect(saved().levels).toHaveLength(before + 1);
    await menu();
    tap(button('Undo level 2'));
    tap(button('Undo the level'));
    expect(saved().classes[0].lvl).toBe(1);
    expect(saved().levels).toHaveLength(before);
  });
  it('undo is greyed on a base-only character, and level-up at level 20', async () => {
    renderSheet(withClass(blankCharacter(), { lvl: 20 }));
    await menu();
    const undo = button('Undo level')!;
    expect(undo.getAttribute('aria-disabled')).toBe('true');
    expect(undo.textContent).toContain('baseline, can’t be undone');
    const up = button('Level up')!;
    expect(up.getAttribute('aria-disabled')).toBe('true');
    expect(up.textContent).toContain('Level 20: nothing more to gain');
  });
});

describe('ability "Was" (spec 2026-11-10 §2.4)', () => {
  const bg: Feature = { id: 'bg', g: 'background', name: 'Soldier', desc: '' };
  const fx: Feature = { id: 'fx', g: 'class', name: 'Surge', desc: '' };
  const plus2 = { id: 'g', kind: 'abil' as const, name: 'STR +2', ab: 'str', val: '2', cap: 20 as const, from: 'feature:bg' };
  const active = { id: 'h', kind: 'abil' as const, name: 'Surge', ab: 'str', val: '2', cap: 20 as const, from: 'feature:fx', when: 'active' as const };
  it('a permanent bonus shows no Was', () => {
    renderSheet({ feats: [bg], grants: [plus2] });
    expect(document.body.textContent).not.toContain('Was ');
  });
  it('a switched-on bonus shows Was and the permanent score', () => {
    renderSheet({ feats: [bg, fx], grants: [plus2, active], effectsOn: ['feature:fx'] });
    expect(document.body.textContent).toContain('Was 12');
  });
  it('edit mode names the score before bonuses and the score with them', () => {
    renderSheet({ abil: { ...blankCharacter().abil, str: 14 }, feats: [bg], grants: [plus2] });
    editMode();
    expect(document.body.textContent).toContain('Score before bonuses · 16 with bonuses');
    expect(label('Score before bonuses, strength')).not.toBeNull();
  });
});

// Large Form from character level 5 (PHB p.192); the Elven Lineage spells at levels 3 and 5 (PHB p.190) wait the same way.
describe('Later levels (spec 2026-11-10 §2.6)', () => {
  const srd = mergeCatalog(srdEntries, null);
  const goliath = (lvl: number): Character => {
    const c0 = withClass({ ...blankCharacter(), tab: 'features' }, { name: 'Barbarian', lvl, hd: 12 });
    return addFromCatalog(c0, srd, srd.byId.get('species/goliath')!, { picks: {}, counted: {}, links: {},
      nested: { 'trait/goliath/giant-ancestry': { picks: { anc: ['trait/goliath/clouds-jaunt-cloud-giant'] }, counted: {}, links: {} } } });
  };
  const block = (title: string) => [...document.querySelectorAll('.block')].find((b) => b.querySelector('.block-title')?.textContent?.startsWith(title));
  const laterBtn = () => [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Later levels'));
  it('a Goliath 1 has no Large Form yet, only a line in the species description', () => {
    const c = goliath(1);
    expect(c.feats.some((f) => f.cid === 'trait/goliath/large-form')).toBe(false);
    expect(c.feats.find((f) => f.cid === 'species/goliath')!.desc).toContain('Large Form: added at character level 5.');
    renderSheet(c);
    expect(laterBtn()).toBeUndefined();
  });
  it('a feature waiting for its level sits under a closed Later levels', () => {
    renderSheet(withClass({ ...blankCharacter(), tab: 'features', feats: [{ id: 'w', g: 'class', name: 'Waiting', desc: '', minLvl: 5 }] }, { lvl: 1 }));
    expect(laterBtn()!.getAttribute('aria-expanded')).toBe('false');
    expect(document.body.textContent).not.toContain('Waiting · from level 5');
    tap(laterBtn());
    expect(document.body.textContent).toContain('Waiting · from level 5');
  });
  it('at level 5 Large Form is in Species and Later levels is gone', () => {
    const c = goliath(5);
    renderSheet(c);
    expect(block('Species')!.querySelector('#feat-' + c.feats.find((f) => f.cid === 'trait/goliath/large-form')!.id)).not.toBeNull();
    expect(laterBtn()).toBeUndefined();
  });
  it('a group whose only feature waits shows no heading', () => {
    renderSheet(withClass({ ...blankCharacter(), tab: 'features', feats: [{ id: 'w', g: 'other', name: 'Waiting', desc: '', minLvl: 5 }] }, { lvl: 1 }));
    expect(block('Other')).toBeUndefined();
    expect(laterBtn()).toBeTruthy();
  });
  it('a reveal of a waiting feature opens Later levels and its row', () => {
    const c = withClass({ ...blankCharacter(), tab: 'features', feats: [{ id: 'w', g: 'class', name: 'Waiting', desc: '', minLvl: 5 }],
      res: [{ id: 'r', name: 'Waiting', count: 1, max: 1, recharge: 'long', from: 'feature:w' }] }, { lvl: 1 });
    renderSheet(c);
    tap(document.querySelector('#res-r .entry-head'));
    tap([...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Source:') && b.closest('#res-r')));
    expect(laterBtn()!.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('#feat-w .entry-head')!.getAttribute('aria-expanded')).toBe('true');
  });
  it('firstMasteryFeature skips a waiting feature for one in a group', () => {
    const wm = (id: string, minLvl?: number) => ({ id, g: 'class' as const, name: 'WM ' + id, desc: '', ...(minLvl ? { minLvl } : {}) });
    const g = (id: string) => ({ id: 'g' + id, kind: 'prof' as const, name: 'Weapon Mastery', cat: 'mastery' as const, val: '2', from: 'feature:' + id });
    const c = withClass({ ...blankCharacter(), feats: [wm('later', 5), wm('now')], grants: [g('later'), g('now')] }, { lvl: 1 });
    expect(firstMasteryFeature(c)).toBe('now');
  });
});

