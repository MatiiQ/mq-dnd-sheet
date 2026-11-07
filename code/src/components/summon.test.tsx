// @vitest-environment happy-dom
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeCatalog } from '../catalog/merge';
import App from '../App';
import { blankCharacter } from '../defaults';
import { btn, label, mount, tap } from '../test-dom';
import { withClasses } from '../test-fixtures';
import type { Character, Creature, Item, Spell } from '../types';

vi.mock('../catalog/useCatalog', () => ({ useCatalog: () => ({ status: 'ready', cat: mergeCatalog([], null) }) }));

const slots = [0, 2, 2, 2, 2, 0, 0, 0, 0, 0];
const renderSheet = (p: Partial<Character>) => {
  localStorage.setItem('dnd-index-v3', JSON.stringify({ active: 'x', list: [{ id: 'x', name: 'Test' }] }));
  localStorage.setItem('dnd-sheet-v3:x', JSON.stringify({ ...blankCharacter(), hp: 20, maxHp: 20, tab: 'spells', slotMax: slots, slotUsed: Array(10).fill(0), ...p }));
  mount(<App />);
};
const saved = (): Character => JSON.parse(localStorage.getItem('dnd-sheet-v3:x')!);
const row = (id: string) => document.getElementById('spell-' + id)!;
const inRow = (id: string, t: string) => [...row(id).querySelectorAll('button')].find((b) => b.textContent === t);
const setValue = (el: Element | null | undefined, v: string) => act(() => {
  const input = el as HTMLInputElement;
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')!.set!.call(input, v);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
const fieldIn = (root: Element, name: string) => [...root.querySelectorAll('label')].find((l) => l.textContent?.startsWith(name))?.querySelector('input, select');
const castLowest = (sp: Spell) => tap(row(sp.id).querySelector(`[aria-label^="Cast ${sp.name} with a level"]`));

const beast: Spell = { id: 'sb', name: 'Summon Beast', lvl: 2, time: 'Action', range: '90 feet', c: true, makes: 'pet', prep: true };
const dead: Spell = { id: 'ad', name: 'Animate Dead', lvl: 3, time: '1 minute', range: '10 feet', makes: 'pet', prep: true };
const ff: Spell = { id: 'ff', name: 'Find Familiar', lvl: 1, time: '1 hour', range: '10 feet', ritual: true, makes: 'pet', single: true, prep: true, cid: 'spell/find-familiar' };
const poly: Spell = { id: 'pm', name: 'Polymorph', lvl: 4, time: 'Action', range: '60 feet', c: true, makes: 'form', prep: true };
const card = (p: Partial<Creature> = {}): Creature => ({
  id: 'k1', name: 'Bestial Spirit', kind: 'pet', on: false, ac: 13, hp: 0, maxHp: 30, temp: 0, speed: '30 ft', init: '', note: '', atk: [], conds: {},
  from: 'spell:sb', srcKind: 'spell', srcName: 'Summon Beast', ...p
});

beforeEach(() => { localStorage.clear(); });

describe('casting a spell that makes a creature', () => {
  it('opens the pre-linked editor under the row on the very next render (R36), and saves it out at the cast level', () => {
    renderSheet({ spells: [beast] });
    castLowest(beast);
    const step = row('sb').querySelector('#form-summon-creature')!;
    expect(step).not.toBeNull();
    expect((fieldIn(step, 'Name') as HTMLInputElement).value).toBe('Summon Beast');
    expect((label('Ends with Concentration') as HTMLInputElement).checked).toBe(true);
    tap([...step.querySelectorAll('button')].find((b) => b.textContent === 'Add companion'));
    expect(saved().creatures).toBeUndefined(); // no HP typed yet
    setValue(fieldIn(step, 'Max HP'), '30');
    tap([...step.querySelectorAll('button')].find((b) => b.textContent === 'Add companion'));
    expect(saved().creatures![0]).toMatchObject({ on: true, lvl: 2, hp: 30, from: 'spell:sb', srcName: 'Summon Beast', ends: 'conc' });
  });
  it('summons one dismissed card with no panel', () => {
    renderSheet({ spells: [beast], creatures: [card()] });
    castLowest(beast);
    expect(saved().creatures![0]).toMatchObject({ on: true, hp: 30, lvl: 2 });
    expect(row('sb').querySelector('#form-summon-creature, [aria-label^="Which"]')).toBeNull();
  });
  it('opens the picker with two cards; Confirm is off with nothing ticked', () => {
    renderSheet({ spells: [beast], creatures: [card({ on: true, hp: 5 }), card({ id: 'k2', name: 'Spirit 2', on: true, hp: 5 })] });
    castLowest(beast);
    const confirm = inRow('sb', 'Confirm') as HTMLButtonElement;
    expect(confirm).toBeDefined();
    expect(confirm.disabled).toBe(true);
    expect(row('sb').textContent).toContain('already out');
  });
  it('with one card already out opens the picker with + New from (R25), which adds summoned copies', () => {
    renderSheet({ spells: [dead], creatures: [card({ id: 'z', name: 'Skeleton', on: true, hp: 13, maxHp: 13, from: 'spell:ad', srcName: 'Animate Dead', ends: undefined })] });
    castLowest(dead);
    expect(row('ad').textContent).toContain('New from');
    setValue(label('Copies of Skeleton'), '2');
    tap(inRow('ad', 'Confirm'));
    expect(saved().creatures!.map((k) => [k.name, k.on])).toEqual([['Skeleton', true], ['Skeleton 2', true], ['Skeleton 3', true]]);
  });
  it('a first cast’s editor makes How many cards (R25, R48)', () => {
    renderSheet({ spells: [dead] });
    castLowest(dead);
    const step = row('ad').querySelector('#form-summon-creature')!;
    setValue(fieldIn(step, 'Name'), 'Skeleton');
    setValue(fieldIn(step, 'Max HP'), '13');
    setValue(fieldIn(step, 'How many'), '3');
    tap([...step.querySelectorAll('button')].find((b) => b.textContent === 'Add companion'));
    expect(saved().creatures!.map((k) => [k.name, k.on, k.lvl])).toEqual([['Skeleton', true, 3], ['Skeleton 2', true, 3], ['Skeleton 3', true, 3]]);
  });
  it('a free-cast tap at 0 uses gives one back and runs no summon step (R20)', () => {
    renderSheet({ spells: [beast], slotMax: Array(10).fill(0), res: [{ id: 'r', name: 'Free', count: 0, max: 1, recharge: 'long', casts: 'sb' }], creatures: [card()] });
    tap(row('sb').querySelector('[aria-label^="Free casts of Summon Beast"]'));
    expect(saved().res[0].count).toBe(1);
    expect(saved().creatures![0].on).toBe(false);
  });
});

describe('single spells (R37) and the Ritual cast', () => {
  it('a Ritual of Find Familiar spends no slot and opens the editor with Pocket dimension ticked, Ends on a Long Rest not (R38)', () => {
    renderSheet({ spells: [{ ...ff, from: 'feature:wc' }], feats: [{ id: 'wc', g: 'class', name: 'Wild Companion', desc: '' }] });
    tap(label('Cast Find Familiar as a Ritual, no slot'));
    expect(saved().slotUsed).toEqual(Array(10).fill(0));
    expect(row('ff').querySelector('#form-summon-creature')).not.toBeNull();
    expect((label('Pocket dimension') as HTMLInputElement).checked).toBe(true);
    expect((label('Ends on a Long Rest') as HTMLInputElement).checked).toBe(false);
  });
  it('a cast with one card out refills it and opens its editor, with no picker', () => {
    renderSheet({ spells: [ff], creatures: [card({ id: 'o', name: 'Owl', on: true, hp: 0, maxHp: 1, from: 'spell:ff', srcName: 'Find Familiar', pocket: true })] });
    castLowest(ff);
    expect(saved().creatures![0]).toMatchObject({ on: true, hp: 1 });
    expect(inRow('ff', 'Confirm')).toBeUndefined();
    expect((fieldIn(row('ff').querySelector('#form-summon-creature')!, 'Name') as HTMLInputElement).value).toBe('Owl');
  });
  it('with two cards opens the picker without + New from', () => {
    const owl = card({ id: 'o', name: 'Owl', maxHp: 1, from: 'spell:ff', srcName: 'Find Familiar' });
    renderSheet({ spells: [ff], creatures: [owl, { ...owl, id: 'o2', name: 'Owl 2' }] });
    castLowest(ff);
    expect(inRow('ff', 'Confirm')).toBeDefined();
    expect(row('ff').textContent).not.toContain('New from');
  });
});

describe('casts from elsewhere', () => {
  it('a cast from the Actions tab reveals the spell row with the summon step open (R23)', () => {
    // Polymorph is listed on the Actions tab through its save; its summon step lists forms.
    renderSheet({ spells: [{ ...poly, save: 'wis' }], tab: 'actions' });
    tap(document.querySelector('[aria-label^="Cast Polymorph with a level"]'));
    expect(saved().tab).toBe('spells');
    expect(saved().conc).toEqual({ id: 'pm', name: 'Polymorph' });
    expect(inRow('pm', '+ New form')).toBeDefined();
  });
  it('a cast from the Actions tab with one card out refills it and opens its editor under the spell row (R23, R37)', () => {
    renderSheet({ spells: [{ ...ff, save: 'wis' }], tab: 'actions', creatures: [card({ id: 'o', name: 'Owl', on: true, hp: 0, maxHp: 1, from: 'spell:ff', srcName: 'Find Familiar' })] });
    tap(document.querySelector('[aria-label^="Cast Find Familiar with a level"]'));
    expect(saved().tab).toBe('spells');
    expect(saved().creatures![0]).toMatchObject({ on: true, hp: 1 });
    expect(inRow('ff', 'Confirm')).toBeUndefined();
    expect((fieldIn(row('ff').querySelector('#form-summon-creature')!, 'Name') as HTMLInputElement).value).toBe('Owl');
  });
  it('reading the last Find Familiar scroll from the Actions tab opens the Companions editor (R21)', () => {
    const scroll: Item = { id: 'sc', name: 'Spell Scroll', qty: 1, eq: false, cid: 'item/spell-scroll' };
    renderSheet({ inv: [scroll], spells: [{ ...ff, save: 'wis', from: 'item:sc', always: true }], tab: 'actions' });
    tap(label('Read the scroll of Find Familiar, 1 left'));
    expect(saved().spells).toEqual([]);
    expect(document.querySelector('#sec-companions #form-creature')).not.toBeNull();
  });
  it('reading the last Find Familiar scroll opens the Companions editor prefilled, with no from (R21)', () => {
    const scroll: Item = { id: 'sc', name: 'Spell Scroll', qty: 1, eq: false, cid: 'item/spell-scroll' };
    renderSheet({ inv: [scroll], spells: [{ ...ff, from: 'item:sc', always: true }] });
    tap(label('Read the scroll of Find Familiar, 1 left'));
    expect(saved().spells).toEqual([]);
    const ed = document.querySelector('#sec-companions #form-creature')!;
    expect(ed).not.toBeNull();
    expect((fieldIn(ed, 'Name') as HTMLInputElement).value).toBe('Find Familiar');
    expect((fieldIn(ed, 'Source') as HTMLSelectElement).value).not.toMatch(/^spell:/);
  });
  it('Cast again reveals the spell row and opens its higher slots', () => {
    renderSheet({ spells: [beast], tab: 'actions', creatures: [card()] });
    tap(btn('Cast again'));
    expect(saved().tab).toBe('spells');
    expect(row('sb').querySelector('[aria-label="Higher slot levels for Summon Beast"]')).not.toBeNull();
  });
});

describe('forms from spells and features', () => {
  const bear = card({ id: 'f', name: 'Brown Bear', kind: 'form', on: false, maxHp: 34, formTemp: 'hp', ends: 'conc', from: 'spell:pm', srcName: 'Polymorph' });
  it('Cast on Polymorph lists its forms and Assume works', () => {
    renderSheet({ spells: [poly], creatures: [bear] });
    castLowest(poly);
    tap(label('Assume Brown Bear'));
    expect(saved().creatures![0].on).toBe(true);
    expect(saved().temp).toBe(34);
  });
  it('+ New form saves the form and assumes it', () => {
    renderSheet({ spells: [poly] });
    castLowest(poly);
    tap(inRow('pm', '+ New form'));
    const step = row('pm').querySelector('#form-summon-creature')!;
    setValue(fieldIn(step, 'Name'), 'Brown Bear');
    setValue(fieldIn(step, 'Max HP'), '34');
    tap([...step.querySelectorAll('button')].find((b) => b.textContent === 'Add form'));
    expect(saved().creatures!.map((k) => [k.name, k.kind, k.on])).toEqual([['Brown Bear', 'form', true]]);
    expect(saved().temp).toBe(34);
  });
  it('Not on me closes the step and keeps Concentration (R42)', () => {
    renderSheet({ spells: [poly], creatures: [bear] });
    castLowest(poly);
    tap(inRow('pm', 'Not on me'));
    expect(inRow('pm', 'Not on me')).toBeUndefined();
    expect(saved().conc).toEqual({ id: 'pm', name: 'Polymorph' });
  });
  it('Change form lists the forms without a cast while the spell is the Concentration (R24)', () => {
    renderSheet({ spells: [poly], conc: { id: 'pm', name: 'Polymorph' }, temp: 5, creatures: [bear] });
    tap(inRow('pm', 'Change form'));
    expect(label('Assume Brown Bear')).not.toBeNull();
    expect(saved().slotUsed).toEqual(Array(10).fill(0));
  });
  it('Summon on a feature row opens the editor; Assume form on Wild Shape lists its forms', () => {
    renderSheet({ ...withClasses(blankCharacter(), [{ name: 'Druid', clsId: 'class/druid', lvl: 2 }]), hp: 20, maxHp: 20, tab: 'features',
      feats: [{ id: 'pc', g: 'class', name: 'Primal Companion', desc: '', makes: 'pet' }, { id: 'ws', g: 'class', name: 'Wild Shape', desc: '', makes: 'form' }],
      creatures: [card({ id: 'w', name: 'Wolf', kind: 'form', maxHp: 11, formTemp: 'wildshape', from: 'feature:ws', srcName: 'Wild Shape', ends: undefined })] });
    tap(btn('Summon'));
    expect(document.getElementById('feat-pc')!.querySelector('#form-summon-creature')).not.toBeNull();
    tap(btn('Assume form'));
    tap(label('Assume Wolf'));
    expect(saved().creatures![0].on).toBe(true);
    expect(saved().temp).toBe(2);
  });
  it('opens a summon step under its own row only (R52)', () => {
    renderSheet({ spells: [beast, { ...beast, id: 'sb2', name: 'Summon Beast II' }] });
    castLowest(beast);
    expect(row('sb').querySelector('#form-summon-creature')).not.toBeNull();
    expect(row('sb2').querySelector('#form-summon-creature')).toBeNull();
  });
});

describe('custom entries', () => {
  it('a custom spell can be marked as making a creature', () => {
    renderSheet({});
    tap(btn('Custom spell'));
    const form = document.getElementById('form-spell')!;
    setValue(fieldIn(form, 'Name'), 'Call Hound');
    tap(label('Makes a creature'));
    tap(btn('Add spell'));
    expect(saved().spells[0]).toMatchObject({ name: 'Call Hound', makes: 'pet' });
  });
});
