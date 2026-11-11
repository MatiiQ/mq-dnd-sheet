// @vitest-environment happy-dom
// The status row's chips for switched-on effects and the active form (spec 2026-11-10 §2.8).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { blankCharacter } from '../defaults';
import { label, mount, tap, unmount } from '../test-dom';
import type { Character, Creature, Feature, Grant, Item } from '../types';

vi.mock('../catalog/useCatalog', () => ({ useCatalog: () => ({ status: 'loading' }) }));

const renderSheet = (p: Partial<Character>) => {
  localStorage.setItem('dnd-index-v3', JSON.stringify({ active: 'x', list: [{ id: 'x', name: 'Test' }] }));
  localStorage.setItem('dnd-sheet-v3:x', JSON.stringify({ ...blankCharacter(), ...p }));
  mount(<App />);
};
const saved = (): Character => JSON.parse(localStorage.getItem('dnd-sheet-v3:x')!);
const ft = (id: string, name: string): Feature => ({ id, g: 'class', name, desc: '' });
const on = (id: string): Grant => ({ id: 'g' + id, kind: 'dmgBonus', name: 'Bonus', val: '2', when: 'active', from: 'feature:' + id });
const chips = () => [...document.querySelectorAll('.status-chip, .cond-chip')].map((x) => x.textContent);
const bear: Creature = { id: 'b', name: 'Brown Bear', kind: 'form', on: true, ac: 11, hp: 0, maxHp: 34, temp: 0, speed: '40 ft', init: '', note: '', atk: [], conds: {}, formTemp: 'wildshape' } as Creature;

beforeEach(() => { localStorage.clear(); });

describe('effect and form status chips', () => {
  it('Rage on shows a chip that switches it off', () => {
    renderSheet({ feats: [ft('rage', 'Rage')], grants: [on('rage')], effectsOn: ['feature:rage'] });
    const chip = label('End Rage')!;
    expect(chip.textContent).toBe('Rage');
    tap(chip);
    expect(saved().effectsOn).toEqual([]);
  });
  it('a potion in a bag shows no chip', () => {
    const bag: Item = { id: 'bag', name: 'Bag of Holding', qty: 1, eq: false, xdim: true };
    const pot: Item = { id: 'pot', name: 'Potion of Speed', qty: 1, eq: false, in: 'bag' };
    renderSheet({ inv: [bag, pot], effectsOn: ['item:pot'], grants: [{ id: 'g', kind: 'speed', name: 'Speed', mode: 'walk', val: 'walk2', when: 'active', from: 'item:pot' }] });
    expect(label('End Potion of Speed')).toBeNull();
  });
  it('a removed source and an aura’s source show no chip, also while the aura is greyed', () => {
    const aura: Grant = { id: 'au', kind: 'aura', name: 'Aura of Protection', range: '10', incap: true, from: 'feature:a' } as Grant;
    renderSheet({ feats: [ft('a', 'Aura')], grants: [aura, on('a')], effectsOn: ['feature:gone', 'feature:a'] });
    expect(document.querySelectorAll('.status-chip').length).toBe(0);
    unmount(); localStorage.clear();
    renderSheet({ feats: [ft('a', 'Aura')], grants: [aura, on('a')], effectsOn: ['feature:a'], conds: { Incapacitated: true } });
    expect(label('End Aura')).toBeNull();
  });
  it('three effects collapse into one link; the form chip stays apart', () => {
    renderSheet({ feats: [ft('a', 'A'), ft('b', 'B'), ft('c', 'C')], grants: [on('a'), on('b'), on('c')], effectsOn: ['feature:a', 'feature:b', 'feature:c'], creatures: [bear] });
    const three = [...document.querySelectorAll('a.cond-chip')].find((x) => x.textContent === '3 effects')!;
    expect(three.getAttribute('href')).toBe('#sec-conditions');
    const form = [...document.querySelectorAll('a.cond-chip')].find((x) => x.textContent === 'Brown Bear')!;
    expect(form.getAttribute('href')).toBe('#sec-hp');
  });
  it('the row shows with only an effect or only a form', () => {
    renderSheet({ feats: [ft('rage', 'Rage')], grants: [on('rage')], effectsOn: ['feature:rage'] });
    expect(chips()).toEqual(['Rage']);
    unmount(); localStorage.clear();
    renderSheet({ creatures: [bear] });
    expect(chips()).toContain('Brown Bear');
  });
});
