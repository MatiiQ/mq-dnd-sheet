import { describe, expect, it } from 'vitest';
import { ABILITIES, AC_EFFECTS as APP_AC_EFFECTS, ARMORS, isEntry, SIZES } from '../logic';
import { ABILITY_KEYS, AC_EFFECTS, ARMOR_KINDS, catalogId, PHB_TO_SRD, SIZE_KEYS, slug, validateEntry } from './schema';

describe('catalog ids', () => {
  it('slugs names: lower case, apostrophes dropped, other runs become -', () => {
    expect(slug('Hunter’s Mark')).toBe('hunters-mark');
    expect(slug("Hunter's Mark")).toBe('hunters-mark');
    expect(slug('  Bigby’s Hand (Arcane) ')).toBe('bigbys-hand-arcane');
  });
  it('scopes class, subclass and species features so shared names differ', () => {
    expect(catalogId('feature', 'Extra Attack', ['Ranger'])).toBe('feature/ranger/extra-attack');
    expect(catalogId('feature', 'Extra Attack', ['Fighter'])).toBe('feature/fighter/extra-attack');
    expect(catalogId('feature', 'Hunter’s Prey', ['Ranger', 'Hunter'])).toBe('feature/ranger/hunter/hunters-prey');
    expect(catalogId('trait', 'Darkvision', ['Elf'])).toBe('trait/elf/darkvision');
    expect(catalogId('spell', 'Fireball')).toBe('spell/fireball');
    expect(catalogId('subclass', 'Hunter', ['Ranger'])).toBe('subclass/ranger/hunter');
    expect(catalogId('feature', 'Extra Attack', ['Ranger', undefined])).toBe('feature/ranger/extra-attack');
  });
  it('applies the alias table before slugging', () => { // checks nothing until Task 9 fills PHB_TO_SRD
    for (const [phb, srd] of Object.entries(PHB_TO_SRD)) expect(catalogId('spell', phb)).toBe(catalogId('spell', srd));
  });
});

describe('validateEntry', () => {
  const darkvision = { id: 'trait/elf/darkvision', kind: 'trait', name: 'Darkvision', src: 'srd', desc: '…', species: 'elf', lvl: 1,
    grants: [{ id: 'g1', kind: 'sense', name: 'Darkvision 60 ft', range: '60' }] };
  const feature = { id: 'feature/ranger/extra-attack', kind: 'feature', name: 'Extra Attack', src: 'srd', desc: '…', cls: 'ranger', lvl: 5,
    grants: [{ id: 'g1', kind: 'attacks', name: 'Two attacks', val: '2' }] };
  it('accepts a well-formed entry', () => expect(validateEntry(darkvision)).toEqual([]));
  it('rejects an id that does not follow the rule, an unknown grant kind and a bad regain pair', () => {
    expect(validateEntry({ ...darkvision, id: 'darkvision' })).not.toEqual([]);
    expect(validateEntry({ ...darkvision, grants: [{ id: 'g1', kind: 'glow', name: 'x' }] })).not.toEqual([]);
    expect(validateEntry({ ...darkvision, grants: [{ id: 'g1', kind: 'resource', name: 'x', max: '2', recharge: 'short', regain: '1', regainOn: 'short' }] })).not.toEqual([]);
  });
  it('keeps grants flat enough for migrate(): every grant passes isEntry', () => {
    expect(isEntry(darkvision.grants[0])).toBe(true);
  });
  it('validates a class feature, whose scope has no subclass', () => expect(validateEntry(feature)).toEqual([]));
  it('checks repeated levels and grant levels', () => {
    expect(validateEntry({ ...feature, again: '8,12,16' })).toEqual([]);
    expect(validateEntry({ ...feature, again: '8,4' })).not.toEqual([]);
    expect(validateEntry({ ...feature, grants: [{ ...feature.grants[0], lvl: 0 }] })).not.toEqual([]);
    expect(validateEntry({ ...feature, grants: [{ ...feature.grants[0], lvl: 21 }] })).not.toEqual([]);
  });
  it('rejects a grant with a malformed value', () => {
    expect(validateEntry({ ...darkvision, grants: [{ id: 'g1', kind: 'sense', name: 'x', range: 'sixty' }] })).not.toEqual([]);
  });
  it('links a lineage option to its trait', () => {
    const wood = { id: 'trait/elf/wood-elf', kind: 'trait', name: 'Wood Elf', src: 'srd', desc: '…', species: 'elf', lvl: 1, grants: [] };
    expect(validateEntry({ ...wood, of: 'trait/elf/elven-lineage' })).toEqual([]);
    expect(validateEntry({ ...wood, of: 'elven-lineage' })).not.toEqual([]);
  });
  it('accepts an AC grant on a magic item', () => {
    const ring = { id: 'item/ring-of-protection', kind: 'item', name: 'Ring of Protection', src: 'srd', desc: '…', cat: 'magic', rarity: 'rare', attune: true,
      grants: [{ id: 'g1', kind: 'ac', name: '+1 AC', acMode: 'bonus', val: '1', needEq: true, needAtt: true }] };
    expect(validateEntry(ring)).toEqual([]);
  });
  it('rejects a walking speed equal to the walking speed', () => {
    expect(validateEntry({ ...darkvision, grants: [{ id: 'g1', kind: 'speed', name: 'x', mode: 'walk', val: 'walk' }] })).not.toEqual([]);
    expect(validateEntry({ ...darkvision, grants: [{ id: 'g1', kind: 'speed', name: 'x', mode: 'climb', val: 'walk' }] })).toEqual([]);
  });
});

describe('enum lists', () => {
  it('match the app lists they copy', () => {
    expect(new Set(ABILITY_KEYS)).toEqual(new Set(ABILITIES.map(([k]) => k)));
    expect(new Set(ARMOR_KINDS)).toEqual(new Set(ARMORS.map(([, k]) => k)));
    expect(new Set(AC_EFFECTS)).toEqual(new Set(APP_AC_EFFECTS));
    expect(new Set(SIZE_KEYS)).toEqual(new Set(SIZES.map(([k]) => k)));
  });
});
