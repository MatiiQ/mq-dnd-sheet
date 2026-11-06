import { describe, expect, it } from 'vitest';
import srdEntries from '../data/srd/index';
import { blankCharacter } from '../defaults';
import type { Character } from '../types';
import { addChoicePicks, resolveChoices } from './copy';
import { withClass } from '../test-fixtures';
import { buildChoices } from './flow';
import { mergeCatalog } from './merge';

const cat = mergeCatalog(srdEntries, null);
const E = (id: string) => cat.byId.get(id)!;

describe('buildChoices', () => {
  it('gives the answers ChoiceFlow hands on (ChoiceFlow.test.tsx pins the same literals)', () => {
    expect(buildChoices(cat, blankCharacter(), E('feat/skilled'), { '': { picks: { c1: ['athletics', 'stealth', 'perception'] }, counted: {}, links: {} } }))
      .toEqual({ picks: { c1: ['athletics', 'stealth', 'perception'] }, counted: {}, links: {} });
    const acolyte = {
      '': { picks: { abil: ['o2', 'o2', 'o3'] }, counted: {}, links: {}, equip: 'A' as const },
      '>feat/magic-initiate': { picks: { cantrips: ['spell/guidance', 'spell/light'], spell1: ['spell/bless'], ab: ['wis'] }, counted: {}, links: {} }
    };
    expect(buildChoices(cat, blankCharacter(), E('background/acolyte'), acolyte)).toEqual({
      picks: { abil: ['o2', 'o2', 'o3'] }, counted: {}, links: {}, equip: 'A',
      nested: { 'feat/magic-initiate': { picks: { list: ['cleric'], cantrips: ['spell/guidance', 'spell/light'], spell1: ['spell/bless'], ab: ['wis'] }, counted: {}, links: {} } }
    });
  });
  it('resolves a link answer against the sheet it is given', () => {
    // The free cast's resource as resolveChoices names it once the spell is picked.
    const RES = resolveChoices(cat, E('feat/magic-initiate'), { list: ['wizard'], spell1: ['spell/magic-missile'] }).specs.find((g) => g.id === 'g3')!.name;
    const ans = { '': { picks: { list: ['wizard'], cantrips: ['spell/light', 'spell/mage-hand'], spell1: ['spell/magic-missile'], ab: ['int'] }, counted: {}, links: {} } };
    const sheet = (id: string): Character => ({ ...blankCharacter(), res: [{ id, name: RES, count: 1, max: 1, recharge: 'long' }] });
    expect(buildChoices(cat, sheet('r1'), E('feat/magic-initiate'), ans).links).toEqual({ g3: 'r1' });
    expect(buildChoices(cat, sheet('r9'), E('feat/magic-initiate'), ans).links).toEqual({ g3: 'r9' });
  });
});

describe('addChoicePicks', () => {
  it('adds the picks of one choice under the feature already on the sheet', () => {
    const c: Character = { ...withClass(blankCharacter(), { clsId: 'class/sorcerer', lvl: 3 }), feats: [{ id: 'm', g: 'class', name: 'Metamagic', desc: '', cid: 'feature/sorcerer/metamagic' }] };
    const out = addChoicePicks(c, cat, 'm', E('feature/sorcerer/metamagic'), 'meta',
      { picks: { meta: ['feature/sorcerer/careful-spell', 'feature/sorcerer/distant-spell'] }, counted: {}, links: {} });
    expect(out.feats.filter((f) => f.from === 'feature:m').map((f) => f.cid)).toEqual(['feature/sorcerer/careful-spell', 'feature/sorcerer/distant-spell']);
    expect(out.feats.filter((f) => f.cid === 'feature/sorcerer/metamagic')).toHaveLength(1);
  });
});
