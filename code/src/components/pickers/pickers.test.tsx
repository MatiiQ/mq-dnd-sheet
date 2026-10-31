// Server-render smoke tests: the pickers' pieces render for the entries with the deepest choices, without a browser.
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import srdEntries from '../../data/srd/index';
import { mergeCatalog } from '../../catalog/merge';
import { blankCharacter, sampleCharacter } from '../../defaults';
import { Sheet } from '../../sheet';
import type { Character } from '../../types';
import { ChoiceFlow } from './ChoiceFlow';
import { PickerResult } from './PickerResult';

const cat = mergeCatalog(srdEntries, null);
// Text only joins up without React's <!-- --> separators between adjacent text parts.
const render = (c: Character, el: React.ReactElement) =>
  renderToString(<Sheet.Provider value={{ c, update: () => {}, edit: false, form: null, setForm: () => {} }}>{el}</Sheet.Provider>).replace(/<!-- -->/g, '');
const flow = (c: Character, id: string, preset?: Record<string, string[]>) =>
  render(c, <ChoiceFlow entry={cat.byId.get(id)!} cat={cat} preset={preset} onDone={() => {}} onCancel={() => {}} />);

describe('ChoiceFlow renders its first step', () => {
  it('asks Magic Initiate’s list first', () => {
    const html = flow(blankCharacter(), 'feat/magic-initiate');
    expect(html).toContain('Spell list');
    expect(html).toContain('Druid');
    expect(html).toContain('Step 1 of');
  });
  it('asks a background’s ability scores', () => expect(flow(blankCharacter(), 'background/acolyte')).toContain('Ability scores'));
  it('asks a species’ first nested choice', () => expect(flow(blankCharacter(), 'species/elf')).toContain('Elven lineage'));
  it('skips a preset choice', () => expect(flow(blankCharacter(), 'feat/magic-initiate', { list: ['cleric'] })).toContain('Cantrips'));
  it('says when no option qualifies', () => expect(flow(blankCharacter(), 'feature/ranger/expertise')).toContain('No option qualifies'));
  it('asks Ilyra to link her own Favored Enemy resource', () => {
    const c = { ...sampleCharacter(), res: [...sampleCharacter().res, { id: 'rx', name: 'Favored Enemy', count: 2, max: 2, recharge: 'long' as const }] };
    expect(flow(c, 'feature/ranger/favored-enemy')).toContain('Link my ‘Favored Enemy’');
  });
  it('renders nothing for an entry with nothing to ask', () => expect(flow(blankCharacter(), 'spell/fireball')).toBe(''));
});

describe('PickerResult', () => {
  it('shows the base hint only for armor or a weapon of the player’s choice', () => {
    const r = (id: string) => render(blankCharacter(), <PickerResult entry={cat.byId.get(id)!} taken={false} onAdd={() => {}} />);
    expect(r('item/armor-1-2-or-3')).toContain('Set its armor or weapon in Edit');
    expect(r('item/ring-of-protection')).not.toContain('Set its armor');
    expect(r('item/dagger-of-venom')).not.toContain('Set its armor');
  });
});
