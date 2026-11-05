// Server-render smoke tests: the pickers' pieces render for the entries with the deepest choices, without a browser.
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import srdEntries from '../../data/srd/index';
import { mergeCatalog } from '../../catalog/merge';
import { blankCharacter, sampleCharacter } from '../../defaults';
import { Sheet } from '../../sheet';
import type { Entry } from '../../catalog/schema';
import type { Character } from '../../types';
import { ChoiceFlow } from './ChoiceFlow';
import { ItemQuestions } from './ItemQuestions';
import { PickerResult } from './PickerResult';

const cat = mergeCatalog(srdEntries, null);
// Text only joins up without React's <!-- --> separators between adjacent text parts.
const render = (c: Character, el: React.ReactElement) =>
  renderToString(<Sheet.Provider value={{ c, update: () => {}, edit: false, form: null, setForm: () => {}, focus: null, reveal: () => {}, markFocusUsed: () => {} }}>{el}</Sheet.Provider>).replace(/<!-- -->/g, '');
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

describe('ChoiceFlow takes its answers back', () => {
  it('starts at the step it left, with the picks kept (Back from the item questions)', () => {
    const answers = { '': { picks: { list: ['wizard'] }, counted: {}, links: {} } };
    const html = render(blankCharacter(), <ChoiceFlow entry={cat.byId.get('feat/magic-initiate')!} cat={cat} initial={{ answers, at: 0 }} onDone={() => {}} onCancel={() => {}} />);
    expect(html).toMatch(/aria-pressed="true"[^>]*><span class="col"><span>Wizard/);
  });
});

describe('ItemQuestions', () => {
  const q = (id: string, p: object = {}) => render(blankCharacter(), <ItemQuestions entry={{ ...cat.byId.get(id)!, ...p } as Entry} cat={cat} onDone={() => {}} onBack={() => {}} onCancel={() => {}} />);
  it('asks a rolled starting charge count with a number input bounded by the roll', () => {
    expect(q('item/luck-blade')).toContain('Step 1 of 2');
    const html = q('item/luck-blade', { base: undefined, baseOf: undefined });
    expect(html).toContain('Starting charges (roll 1d3)');
    expect(html).toMatch(/<input[^>]*type="number"[^>]*min="1"[^>]*max="3"/);
    expect(html).toContain('Step 1 of 1');
    expect(html).toMatch(/aria-disabled="true"[^>]*>Add</);
  });
  it('asks Ammunition +N’s ammunition first, then its bonus', () => {
    const html = q('item/ammunition-1-2-or-3');
    expect(html).toContain('Which ammunition?');
    expect(html).toContain('Arrows');
    expect(html).toContain('Step 1 of 2');
  });
  it('asks Weapon +N’s weapon first, then its bonus', () => {
    const html = q('item/weapon-1-2-or-3');
    expect(html).toContain('Which weapon?');
    expect(html).toContain('Longsword');
    expect(html).toContain('Step 1 of 2');
    expect(html).toMatch(/aria-disabled="true"[^>]*>Next</);
    expect(q('item/shield-1-2-or-3')).toMatch(/\+1, \+2 or \+3[\s\S]*>\+3</);
  });
});

describe('PickerResult', () => {
  it('no longer sends a base of the player’s choice to Edit: the add flow asks for it (plan 7)', () => {
    const r = (id: string) => render(blankCharacter(), <PickerResult entry={cat.byId.get(id)!} taken={false} onAdd={() => {}} />);
    expect(r('item/armor-1-2-or-3')).not.toContain('Set its armor');
  });
});

describe('a catalog feature’s long description', () => {
  it('shows clamped in the Features row and in full only when tapped open', async () => {
    const { FeaturesTab } = await import('../tabs/FeaturesTab');
    const desc = 'First paragraph of an invented feature.\nSecond paragraph that only the open row shows.';
    const c: Character = { ...blankCharacter(), feats: [{ id: 'f1', g: 'feat', name: 'Invented Feat', desc }] };
    const html = render(c, <FeaturesTab />);
    expect(html).toMatch(/<span class="muted entry-clamp">First paragraph/);
  });
});

describe('a skill:proficient step', () => {
  const feat = { id: 'feat/own-b', kind: 'feat', name: 'Own B', cat: 'general', src: 'srd', desc: '', grants: [
    { kind: 'choice', id: 'c2', name: 'Skill', pick: 1, pool: 'skill:any' }, { kind: 'choice', id: 'exp', name: 'Expertise', pick: 1, pool: 'skill:proficient' }] } as Entry;
  it('shows nothing selected when the pick it held has left the pool', () => {
    const answers = { '': { picks: { c2: ['arcana'], exp: ['stealth'] }, counted: {}, links: {} } };
    const html = render(blankCharacter(), <ChoiceFlow entry={feat} cat={cat} initial={{ answers, at: 1 }} onDone={() => {}} onCancel={() => {}} />);
    expect(html).toContain('Arcana');
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).toContain('aria-disabled="true"');
  });
});

describe('a step that depends on another choice', () => {
  it('Divine Order has no cantrip step until Thaumaturge is picked', () => {
    const e = cat.byId.get('feature/cleric/divine-order')!;
    expect(flow(blankCharacter(), e.id)).toContain('Step 1 of 1');
    const answers = { '': { picks: { order: ['o3'] }, counted: {}, links: {} } };
    expect(render(blankCharacter(), <ChoiceFlow entry={e} cat={cat} initial={{ answers, at: 0 }} onDone={() => {}} onCancel={() => {}} />)).toContain('Step 1 of 2');
  });
});

describe('a background\'s equipment step', () => {
  it('comes last and lists both packages', () => {
    const bg = { ...cat.byId.get('background/acolyte')!, equipA: 'item/dagger*2;Lucky charm', gpA: 15, gpB: 50 } as Entry;
    const html = render(blankCharacter(), <ChoiceFlow entry={bg} cat={cat} initial={{ answers: {}, at: 99 }} onDone={() => {}} onCancel={() => {}} />);
    expect(html).toContain('Starting equipment');
    expect(html).toContain('2 × Dagger, Lucky charm, 15 GP');
    expect(html).toContain('50 GP');
    expect(html).toContain('Skip');
    expect(html).toMatch(/Step (\d+) of \1/);
  });
});
