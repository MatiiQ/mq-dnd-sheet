import { describe, expect, it } from 'vitest';
import { ABILITIES, ARMORS, SIZES } from '../logic';
import { ABILITY_KEYS, ARMOR_KINDS, catalogId, grantErrors, SIZE_KEYS, slug, validateEntry } from './schema';

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
  it('makes an id from a name found on Object.prototype', () => {
    for (const n of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) expect(catalogId('spell', n)).toBe('spell/' + slug(n));
  });
});

describe('validateEntry', () => {
  const trait = { id: 'trait/elf/darkvision', kind: 'trait', name: 'Darkvision', src: 'srd', desc: '…', species: 'elf', lvl: 1,
    grants: [{ id: 'g1', kind: 'sense', name: 'Darkvision 60 ft', range: '60' }] };
  const feature = { id: 'feature/ranger/extra-attack', kind: 'feature', name: 'Extra Attack', src: 'srd', desc: '…', cls: 'ranger', lvl: 5,
    grants: [{ id: 'g1', kind: 'attacks', name: 'Two attacks', val: '2' }] };
  const wood = { id: 'trait/elf/wood-elf', kind: 'trait', name: 'Wood Elf', src: 'srd', desc: '…', species: 'elf', lvl: 1, grants: [] };
  const order = { ...feature, id: 'feature/druid/primal-order', name: 'Primal Order', cls: 'druid', lvl: 1, grants: [{ kind: 'choice', id: 'c1', name: 'Primal Order', pick: 1, options: [
    { id: 'o1', kind: 'prof', name: 'Martial weapons', cat: 'weapon', target: 'Martial weapons', opt: 'Warden' },
    { id: 'o2', kind: 'prof', name: 'Medium armor', cat: 'armor', target: 'Medium armor', opt: 'Warden' },
    { id: 'o3', kind: 'checkBonus', name: 'Arcana', target: 'arcana', val: 'wis>=1', opt: 'Magician' }] }] };
  const feat = { id: 'feat/war-caster', kind: 'feat', name: 'War Caster', src: 'phb', desc: '…', cat: 'general', grants: [] };
  const abil = { id: 'g1', kind: 'abil', name: 'STR +4', ab: 'str', val: '4' };
  const ek = { id: 'g1', kind: 'casting', name: 'Spellcasting', ab: 'int', list: 'wizard', cantrips: '3:2,10:3', prepared: '3:3,4:4', s1: '3:2,4:3,7:4', s2: '7:2,10:3' };
  const spell = { id: 'spell/shillelagh', kind: 'spell', name: 'Shillelagh', src: 'srd', desc: '…', lvl: 0, school: 'Transmutation', classes: 'druid',
    time: 'Bonus Action', range: 'Self', comp: 'V, S, M', dur: '1 minute', conc: false, ritual: false, fx: 'other' };
  const orb = { ...spell, fx: 'damage', dice: '3d8' };
  const burst = { label: 'Burst', fx: 'damage', dice: '2d6', dtype: 'Cold', save: 'dex', scale: '1d6/slot' };
  const venom = { id: 'item/dagger-of-venom', kind: 'item', name: 'Dagger of Venom', src: 'srd', desc: '…', cat: 'magic', rarity: 'Rare' };
  const itemN = { ...venom, id: 'item/weapon-1-2-or-3', name: 'Weapon, +1, +2, or +3', base: 'weapon' };

  // Each base above must pass, or the refusals below would pass for the wrong reason.
  it('accepts the bases and the values next to the refused ones', () => {
    const good = [
      trait, feature, wood, order, feat, spell, orb, venom, itemN,
      { ...wood, of: 'trait/elf/elven-lineage' }, { ...feature, again: '8,12,16' },
      { ...feat, prereq: 'lvl>=4;feature=spellcasting|pact-magic' }, { ...feat, prereq: 'lvl>=4;armor=heavy;str>=13' },
      ...[20, 25, 30].map((cap) => ({ ...feature, grants: [{ ...abil, cap }] })),
      { ...feature, grants: [ek] }, { ...trait, grants: [{ id: 'g1', kind: 'speed', name: 'x', mode: 'climb', val: 'walk' }] },
      { ...feature, grants: [{ id: 'g1', kind: 'action', name: 'Woe', econ: 'reaction', dice: '-1d6' }] },
      { ...spell, healMod: true }, { ...orb, dmgMod: true }, { ...orb, dtypes: 'Acid,Cold,Fire' }, { ...spell, parts: [burst] },
      { ...spell, parts: [burst, { label: 'Light', fx: 'healing', dice: '4d12', healMod: true }] },
      // Grant levels are never compared with the spell level.
      { ...spell, lvl: 3, grants: [{ id: 'g1', kind: 'speed', name: 'x', mode: 'fly', val: '60', lvl: 1 }] },
      { ...venom, magic: 3 }, { ...venom, base: 'item/dagger' }, { ...venom, base: 'armor' }, { ...venom, base: 'weapon' },
      { ...itemN, magicPick: true }, { ...itemN, baseOf: 'item/longsword,item/shortsword' }, { ...itemN, base: 'ammo', baseOf: 'item/arrows,item/bolts' }
    ];
    for (const e of good) expect([e.id, validateEntry(e)]).toEqual([e.id, []]);
  });

  it('refuses a malformed entry', () => {
    const bad: [string, unknown][] = [
      ['id off the rule', { ...trait, id: 'darkvision' }],
      ['unknown grant kind', { ...trait, grants: [{ id: 'g1', kind: 'glow', name: 'x' }] }],
      ['regain on the recharge', { ...trait, grants: [{ id: 'g1', kind: 'resource', name: 'x', max: '2', recharge: 'short', regain: '1', regainOn: 'short' }] }],
      ['repeats out of order', { ...feature, again: '8,4' }],
      ['grant level 0', { ...feature, grants: [{ ...feature.grants[0], lvl: 0 }] }],
      ['grant level 21', { ...feature, grants: [{ ...feature.grants[0], lvl: 21 }] }],
      ['bad range', { ...trait, grants: [{ id: 'g1', kind: 'sense', name: 'x', range: 'sixty' }] }],
      ['of without an id', { ...wood, of: 'elven-lineage' }],
      ['opt outside a choice', { ...order, grants: [{ ...order.grants[0].options[0] }] }],
      ['bad prerequisite', { ...feat, prereq: 'level 4' }],
      ['cap 24', { ...feature, grants: [{ ...abil, cap: 24 }] }],
      ['bad slot table', { ...feature, grants: [{ ...ek, s2: 'two' }] }],
      ['bad action dice', { ...feature, grants: [{ id: 'g1', kind: 'action', name: 'Woe', econ: 'reaction', dice: 'd6-' }] }],
      ['walking speed from itself', { ...trait, grants: [{ id: 'g1', kind: 'speed', name: 'x', mode: 'walk', val: 'walk' }] }],
      ['healMod not true', { ...spell, healMod: 'yes' }],
      ['dmgMod not true', { ...orb, dmgMod: false }],
      ['one damage type', { ...orb, dtypes: 'Acid' }],
      ['a type twice', { ...orb, dtypes: 'Acid,Acid' }],
      ['no such type', { ...orb, dtypes: 'Acid,Sonic' }],
      ['dtypes next to dtype', { ...orb, dtypes: 'Acid,Cold', dtype: 'Acid' }],
      ['no parts', { ...spell, parts: [] }],
      ['same label twice', { ...spell, parts: [burst, burst] }],
      ['blank label', { ...spell, parts: [{ ...burst, label: '' }] }],
      ['part fx other', { ...spell, parts: [{ ...burst, fx: 'other' }] }],
      ['part without dice', { ...spell, parts: [{ ...burst, dice: undefined }] }],
      ['part save', { ...spell, parts: [{ ...burst, save: 'luck' }] }],
      ['part attack', { ...spell, parts: [{ ...burst, atk: 'thrown' }] }],
      ['part dtypes next to dtype', { ...spell, parts: [{ ...burst, dtypes: 'Radiant,Necrotic' }] }],
      ['unknown part key', { ...spell, parts: [{ ...burst, extra: 1 }] }],
      ['part dmgMod not true', { ...spell, parts: [{ ...burst, dmgMod: false }] }],
      ['part not an object', { ...spell, parts: ['burst'] }],
      ['object in a plain field', { ...spell, desc: { x: 1 } }],
      ...[0, 4, 1.5, '2'].map((magic): [string, unknown] => [`magic ${magic}`, { ...venom, magic }]),
      ['magicPick not true', { ...itemN, magicPick: false }],
      ['baseOf without ids', { ...itemN, baseOf: 'longsword' }],
      ['empty baseOf', { ...itemN, baseOf: '' }],
      ['baseOf on a fixed base', { ...venom, base: 'item/dagger', baseOf: 'item/longsword' }],
      ['base ammo word', { ...itemN, base: 'arrows' }],
      ['base without an id', { ...venom, base: 'dagger' }],
      ['base shield', { ...venom, base: 'shield' }],
      ['base on a mundane item', { id: 'item/dagger', kind: 'item', name: 'Dagger', src: 'srd', desc: '', cat: 'weapon', base: 'item/dagger' }]
    ];
    for (const [why, e] of bad) expect([why, validateEntry(e)]).not.toEqual([why, []]);
  });
});

describe('enum lists', () => {
  it('match the app lists they copy', () => {
    expect(new Set(ABILITY_KEYS)).toEqual(new Set(ABILITIES.map(([k]) => k)));
    expect(new Set(ARMOR_KINDS)).toEqual(new Set(ARMORS.map(([, k]) => k)));
    expect(new Set(SIZE_KEYS)).toEqual(new Set(SIZES.map(([k]) => k)));
  });
});

describe('grantErrors (a grant stored on a character)', () => {
  const g = { id: 'g', kind: 'abil', name: 'x', ab: 'wis', val: '1', cap: 20 };
  it('accepts a grant with or without the character-only fields', () => {
    expect(grantErrors(g, 'feature')).toEqual([]);
    expect(grantErrors({ ...g, from: 'feature:f1', srcKind: 'feat', counted: true }, 'feature')).toEqual([]);
  });
  it('rejects an unresolved choice, item fields from a feature, and a bad level', () => {
    expect(grantErrors({ ...g, val: '$c1' }, 'feature')).toHaveLength(1);
    expect(grantErrors({ ...g, needEq: true }, 'feature')).toHaveLength(1);
    expect(grantErrors({ ...g, needEq: true }, 'item')).toEqual([]);
    expect(grantErrors({ ...g, minLvl: 3 }, 'feature')).toEqual([]);
    expect(grantErrors({ ...g, minLvl: 0 }, 'feature')).toHaveLength(1);
    expect(grantErrors({ ...g, counted: 'yes' }, 'feature')).toHaveLength(1);
    expect(grantErrors({ id: 'g', kind: 'resource', name: 'X', recharge: 'long', max: '1d4' }, 'feature')).not.toEqual([]);
    expect(grantErrors({ id: 'g', kind: 'resource', name: 'X', recharge: 'long', max: 'pb' }, 'feature')).toEqual([]);
  });
});
