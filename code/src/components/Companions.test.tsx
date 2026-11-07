// @vitest-environment happy-dom
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeCatalog } from '../catalog/merge';
import App from '../App';
import { BLANK_CREATURE, saveCreature } from './Companions';
import { blankCharacter } from '../defaults';
import { btn, btnStarting, label, mount, tap } from '../test-dom';
import { withClasses } from '../test-fixtures';
import type { Character, Creature, Spell } from '../types';

vi.mock('../catalog/useCatalog', () => ({ useCatalog: () => ({ status: 'ready', cat: mergeCatalog([], null) }) }));

const renderSheet = (p: Partial<Character>) => {
  localStorage.setItem('dnd-index-v3', JSON.stringify({ active: 'x', list: [{ id: 'x', name: 'Test' }] }));
  localStorage.setItem('dnd-sheet-v3:x', JSON.stringify({ ...blankCharacter(), hp: 20, maxHp: 20, ...p }));
  mount(<App />);
};
const saved = (): Character => JSON.parse(localStorage.getItem('dnd-sheet-v3:x')!);
const section = () => document.getElementById('sec-companions');
const inSection = (t: string) => [...(section()?.querySelectorAll('button') ?? [])].find((b) => b.textContent === t);
const setValue = (el: Element | null | undefined, v: string) => act(() => {
  const input = el as HTMLInputElement;
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')!.set!.call(input, v);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
const field = (name: string) => [...document.querySelectorAll('#form-creature label')].find((l) => l.textContent?.startsWith(name))?.querySelector('input, select');
const pet = (p: Partial<Creature> = {}): Creature => ({
  id: 'k1', name: 'Wolf', kind: 'pet', on: true, ac: 13, hp: 11, maxHp: 11, temp: 0, speed: '40 ft', init: '+2', note: '', atk: [], conds: {}, ...p
});
const form = (p: Partial<Creature> = {}): Creature => pet({ id: 'f1', name: 'Bear', kind: 'form', on: false, ac: 11, hp: 0, maxHp: 34, formTemp: 'wildshape', ...p });

beforeEach(() => { localStorage.clear(); });

describe('Companions section', () => {
  it('is hidden with its nav link when there is no creature and no source; edit mode shows it with + Add companion', () => {
    renderSheet({});
    expect(section()).toBeNull();
    expect(document.querySelector('nav a[href="#sec-companions"]')).toBeNull();
    tap(label('Edit character'));
    expect(section()).not.toBeNull();
    expect(inSection('+ Add companion')).toBeDefined();
    expect(document.querySelector('nav a[href="#sec-companions"]')).not.toBeNull();
  });
  it('damages and heals a pet with the amount field and the round buttons', () => {
    renderSheet({ creatures: [pet({ temp: 2 })] });
    setValue(label('Amount for Wolf'), '5');
    tap(label('Damage Wolf'));
    expect(saved().creatures![0]).toMatchObject({ temp: 0, hp: 8 });
    setValue(label('Amount for Wolf'), '2');
    tap(label('Heal Wolf'));
    expect(saved().creatures![0].hp).toBe(10);
  });
  it('a dismissed card shows no HP buttons; a card linked to an item offers Summon again (R27)', () => {
    renderSheet({ inv: [{ id: 'fig', name: 'Figurine', qty: 1, eq: false }], creatures: [pet({ on: false, hp: 0, from: 'item:fig', srcKind: 'item', srcName: 'Figurine' })] });
    expect(label('Damage Wolf')).toBeNull();
    expect(section()!.textContent).toContain('Dismissed');
    tap(inSection('Summon again'));
    expect(saved().creatures![0]).toMatchObject({ on: true, hp: 11 });
  });
  it('sends a familiar to its pocket and recalls it, with no HP buttons while away', () => {
    renderSheet({ creatures: [pet({ name: 'Owl', pocket: true, hp: 1, maxHp: 1 })] });
    tap(btnStarting('Owl'));
    tap(inSection('Send to pocket'));
    expect(saved().creatures![0].away).toBe(true);
    expect(label('Damage Owl')).toBeNull();
    tap(inSection('Recall'));
    expect(saved().creatures![0].away).toBe(false);
  });
  it('the editor refuses a pet with no HP (R47), then adds it out by default', () => {
    renderSheet({});
    tap(label('Edit character'));
    tap(inSection('+ Add companion'));
    setValue(field('Name'), 'Mastiff');
    tap(btn('Add companion'));
    expect(document.getElementById('form-creature')!.textContent).toContain('Enter the creature’s HP');
    expect(saved().creatures).toBeUndefined();
    setValue(field('Max HP'), '5');
    tap(btn('Add companion'));
    expect(saved().creatures![0]).toMatchObject({ name: 'Mastiff', maxHp: 5, hp: 5, on: true });
  });
  it('warns and saves dismissed a Concentration pet without its Concentration', () => {
    const ss: Spell = { id: 'ss', name: 'Summon Beast', lvl: 2, time: 'Action', range: '90 feet', c: true, makes: 'pet' };
    renderSheet({ spells: [ss] });
    tap(label('Edit character'));
    tap(inSection('+ Add companion'));
    setValue(field('Name'), 'Spirit');
    setValue(field('Max HP'), '20');
    setValue(field('Source'), 'spell:ss');
    tap(label('Ends with Concentration'));
    expect(document.getElementById('form-creature')!.textContent).toContain('Not concentrating on Summon Beast: saved as dismissed');
    tap(btn('Add companion'));
    expect(saved().creatures![0]).toMatchObject({ on: false, from: 'spell:ss', srcName: 'Summon Beast', ends: 'conc' });
  });
  it('assumes a saved Wild Shape form, with its Temporary HP and the Hit Points banner', () => {
    renderSheet({ ...withClasses(blankCharacter(), [{ name: 'Druid', clsId: 'class/druid', lvl: 4 }]), hp: 20, maxHp: 20,
      feats: [{ id: 'ws', g: 'class', name: 'Wild Shape', desc: '', makes: 'form' }], creatures: [form({ from: 'feature:ws', srcName: 'Wild Shape' })] });
    tap(label('Assume Bear'));
    expect(saved().creatures![0].on).toBe(true);
    expect(saved().temp).toBe(4);
    expect(document.getElementById('sec-hp')!.textContent).toContain('Wild Shape: Bear');
    tap(label('End form Bear'));
    expect(saved().creatures![0].on).toBe(false);
  });
  it('a dismissed spell card has Cast again, disabled with the reason when nothing can cast it (R28)', () => {
    const ss: Spell = { id: 'ss', name: 'Summon Beast', lvl: 2, time: 'Action', range: '90 feet', c: true, makes: 'pet', prep: true };
    renderSheet({ spells: [ss], slotMax: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], creatures: [pet({ on: false, from: 'spell:ss', srcName: 'Summon Beast' })] });
    const b = inSection('Cast again') as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(section()!.textContent).toContain('No slot left');
  });
  it('a dismissed Find Familiar card’s Ritual brings it back at once, spending no slot (R36)', () => {
    const ff: Spell = { id: 'ff', name: 'Find Familiar', lvl: 1, time: '1 hour', range: '10 feet', ritual: true, makes: 'pet', single: true, prep: true };
    renderSheet({ spells: [ff], slotMax: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0], creatures: [pet({ name: 'Owl', on: false, hp: 0, maxHp: 1, from: 'spell:ff', srcName: 'Find Familiar' })] });
    tap(section()!.querySelector('[aria-label="Cast Find Familiar as a Ritual, no slot"]'));
    expect(saved().creatures![0]).toMatchObject({ on: true, hp: 1, lvl: 1 });
    expect(saved().slotUsed[1]).toBe(0);
    expect(label('Damage Owl')).not.toBeNull();
  });
});

describe('saveCreature', () => {
  it('keeps a passed id on a new card', () => {
    const out = saveCreature(blankCharacter(), { ...BLANK_CREATURE, name: 'Wolf', maxHp: 11, id: 'w' });
    expect(out.creatures!.map((k) => k.id)).toEqual(['w']);
  });
  it('saves a card off when its kind changes: a form turns on only through assumeForm', () => {
    const c = { ...blankCharacter(), creatures: [pet()] };
    expect(saveCreature(c, { ...pet(), kind: 'form' }).creatures![0]).toMatchObject({ kind: 'form', on: false });
  });
});
