// Server-render smoke tests for the Actions tab: its sections render from both samples, without a browser.
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { druidSample, sampleCharacter } from '../../defaults';
import { Sheet } from '../../sheet';
import { dagger } from '../../test-fixtures';
import type { Character } from '../../types';
import { ActionsTab, Section } from './ActionsTab';

const render = (c: Character) =>
  renderToString(<Sheet.Provider value={{ c, update: () => {}, edit: false, form: null, setForm: () => {} }}><ActionsTab /></Sheet.Provider>).replace(/<!-- -->/g, '');

describe('ActionsTab', () => {
  it('hides a section whose rows the filter all hid, even with its header lines', () => {
    expect(renderToString(<Section title="Weapon attacks" aside={<span>Mastery: Longbow</span>}>{[false, false]}</Section>)).toBe('');
    expect(renderToString(<Section title="Weapon attacks">{[<span key="a">Row</span>]}</Section>)).toContain('Weapon attacks');
  });
  it('renders Ilyra’s sections in order', () => {
    const html = render(sampleCharacter());
    const at = (s: string) => { const i = html.indexOf(s); expect(i, s).toBeGreaterThan(-1); return i; };
    const order = ['Weapon attacks', 'Attack</strong> · 2 attacks', 'Longbow', 'Unarmed Strike', 'Spells · damage', 'Spells · save', 'Spells · healing', 'Extra damage on a hit', 'Actions in combat', 'Opportunity Attack'];
    order.map(at).reduce((a, b) => { expect(b).toBeGreaterThan(a); return b; });
    expect(html).toContain('Mastery: Longbow (Slow), Shortsword (Vex)');
    expect(html).toContain('Ammunition, Heavy, Two-Handed');
  });
  it('disables two hands on Seren’s Quarterstaff while her Shield is on', () => {
    const html = render({ ...druidSample(), hands: ['i3'] });
    expect(html).toMatch(/aria-disabled="true"[^>]*>2 hands</);
    expect(html).toContain('Take off the Shield first');
    expect(html).toContain('Shillelagh');
  });
  it('shows a chosen damage type as its list on a spell row', () => {
    const orb = { id: 'orb', name: 'Chromatic Orb', lvl: 1, time: 'Action', range: '90 feet', prep: true, atk: 'ranged' as const, fx: 'damage' as const, dmg: '3d8', dtypes: 'Acid,Cold,Fire' };
    expect(render({ ...sampleCharacter(), spells: [...sampleCharacter().spells, orb] })).toContain('3d8 Acid/Cold/Fire');
  });
  it('shows the Light extra attack with two Daggers in hand', () => {
    const c: Character = { ...sampleCharacter(), inv: [...sampleCharacter().inv, dagger({ id: 'dg', qty: 2 })], hands: ['dg', 'dg'] };
    expect(render(c)).toContain('Light extra attack · Dagger');
  });
});
