import { describe, expect, it } from 'vitest';
import { ABILITIES, AC_EFFECTS as APP_AC_EFFECTS, ARMORS, isEntry, SIZES } from '../logic';
import items from '../data/srd/items.json';
import srdSpells from '../data/srd/spells.json';
import { ABILITY_KEYS, AC_EFFECTS, ARMOR_KINDS, catalogId, grantErrors, PHB_TO_SRD, SIZE_KEYS, slug, validateEntry, type ItemEntry, type SpellEntry } from './schema';

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
  it('groups several grants into one option with opt', () => {
    const order = { ...feature, id: 'feature/druid/primal-order', name: 'Primal Order', cls: 'druid', lvl: 1, grants: [{ kind: 'choice', id: 'c1', name: 'Primal Order', pick: 1, options: [
      { id: 'o1', kind: 'prof', name: 'Martial weapons', cat: 'weapon', target: 'Martial weapons', opt: 'Warden' },
      { id: 'o2', kind: 'prof', name: 'Medium armor', cat: 'armor', target: 'Medium armor', opt: 'Warden' },
      { id: 'o3', kind: 'checkBonus', name: 'Arcana', target: 'arcana', val: 'wis>=1', opt: 'Magician' }] }] };
    expect(validateEntry(order)).toEqual([]);
    expect(validateEntry({ ...order, grants: [{ ...order.grants[0].options[0] }] })).not.toEqual([]); // opt only inside a choice
  });
  it('flags healing that adds the spellcasting ability modifier', () => {
    const spells = (srdSpells as unknown as SpellEntry[]);
    const cure = spells.find((e) => e.id === 'spell/cure-wounds')!;
    expect(validateEntry({ ...cure, healMod: true })).toEqual([]);
    expect(validateEntry({ ...cure, healMod: 'yes' })).not.toEqual([]);
    const flagged = (id: string) => spells.find((e) => e.id === id)!.healMod;
    for (const id of ['spell/cure-wounds', 'spell/healing-word', 'spell/mass-cure-wounds', 'spell/mass-healing-word']) expect([id, flagged(id)]).toEqual([id, true]);
    for (const id of ['spell/heal', 'spell/prayer-of-healing']) expect([id, flagged(id)]).toEqual([id, undefined]);
  });
  it('takes dmgMod and a list of damage types (dtypes) on a spell', () => {
    const cure = (srdSpells as unknown as SpellEntry[]).find((e) => e.id === 'spell/cure-wounds')!;
    const orb = { ...cure, fx: 'damage', dice: '3d8', healMod: undefined };
    expect(validateEntry({ ...orb, dmgMod: true })).toEqual([]);
    expect(validateEntry({ ...orb, dmgMod: false })).not.toEqual([]);
    expect(validateEntry({ ...orb, dtypes: 'Acid,Cold,Fire' })).toEqual([]);
    expect(validateEntry({ ...orb, dtypes: 'Acid' })).not.toEqual([]);              // two or more
    expect(validateEntry({ ...orb, dtypes: 'Acid,Acid' })).not.toEqual([]);         // no repeats
    expect(validateEntry({ ...orb, dtypes: 'Acid,Sonic' })).not.toEqual([]);        // damage types only
    expect(validateEntry({ ...orb, dtypes: 'Acid,Cold', dtype: 'Acid' })).not.toEqual([]); // never both
  });
  it('takes parts on a spell: a non-empty list of well-formed parts with unique labels', () => {
    const cure = (srdSpells as unknown as SpellEntry[]).find((e) => e.id === 'spell/cure-wounds')!;
    const burst = { label: 'Burst', fx: 'damage', dice: '2d6', dtype: 'Cold', save: 'dex', scale: '1d6/slot' };
    expect(validateEntry({ ...cure, parts: [burst] })).toEqual([]);
    expect(validateEntry({ ...cure, parts: [burst, { label: 'Light', fx: 'healing', dice: '4d12', healMod: true }] })).toEqual([]);
    expect(validateEntry({ ...cure, parts: [] })).not.toEqual([]);
    expect(validateEntry({ ...cure, parts: [burst, burst] })).not.toEqual([]);                       // labels unique
    expect(validateEntry({ ...cure, parts: [{ ...burst, label: '' }] })).not.toEqual([]);
    expect(validateEntry({ ...cure, parts: [{ ...burst, fx: 'other' }] })).not.toEqual([]);
    expect(validateEntry({ ...cure, parts: [{ ...burst, dice: undefined }] })).not.toEqual([]);
    expect(validateEntry({ ...cure, parts: [{ ...burst, save: 'luck' }] })).not.toEqual([]);
    expect(validateEntry({ ...cure, parts: [{ ...burst, atk: 'thrown' }] })).not.toEqual([]);
    expect(validateEntry({ ...cure, parts: [{ ...burst, dtypes: 'Radiant,Necrotic' }] })).not.toEqual([]); // never both
    expect(validateEntry({ ...cure, parts: [{ ...burst, extra: 1 }] })).not.toEqual([]);             // SpellPart keys only
    expect(validateEntry({ ...cure, parts: [{ ...burst, dmgMod: false }] })).not.toEqual([]);
    expect(validateEntry({ ...cure, parts: ['burst'] })).not.toEqual([]);
    expect(validateEntry({ ...cure, desc: { x: 1 } })).not.toEqual([]);                           // other fields stay plain values
  });
  it('takes magic (1–3), magicPick, and a baseOf list only on a base of the player’s choice', () => {
    const its = items as unknown as ItemEntry[];
    const avenger = its.find((e) => e.id === 'item/holy-avenger')!, weaponN = its.find((e) => e.id === 'item/weapon-1-2-or-3')!;
    expect(validateEntry({ ...avenger, magic: 3 })).toEqual([]);
    for (const bad of [0, 4, 1.5, '2']) expect([bad, validateEntry({ ...avenger, magic: bad })]).not.toEqual([bad, []]);
    expect(validateEntry({ ...weaponN, magicPick: true })).toEqual([]);
    expect(validateEntry({ ...weaponN, magicPick: false })).not.toEqual([]);
    expect(validateEntry({ ...avenger, baseOf: 'item/longsword,item/shortsword' })).toEqual([]);
    expect(validateEntry({ ...avenger, baseOf: 'longsword' })).not.toEqual([]);
    expect(validateEntry({ ...avenger, baseOf: '' })).not.toEqual([]);
    const sun = its.find((e) => e.id === 'item/sun-blade')!;
    expect(validateEntry({ ...sun, baseOf: 'item/longsword' })).not.toEqual([]);           // a fixed base takes no list
  });
  it('takes base ammo with an ammunition baseOf (Ammunition +1, +2, or +3)', () => {
    const ammoN = (items as unknown as ItemEntry[]).find((e) => e.id === 'item/ammunition-1-2-or-3')!;
    expect(validateEntry({ ...ammoN, base: 'ammo', magicPick: true, baseOf: 'item/arrows,item/bolts' })).toEqual([]);
    expect(validateEntry({ ...ammoN, base: 'arrows' })).not.toEqual([]);
  });
  it('takes a damage type on an Unarmed Strike grant (Demon Armor)', () => {
    expect(validateEntry({ ...feature, grants: [{ id: 'g1', kind: 'unarmed', name: 'Claws', die: '1d8', abs: 'str', dtype: 'Slashing' }] })).toEqual([]);
    const demon = (items as unknown as ItemEntry[]).find((e) => e.id === 'item/demon-armor')!;
    expect(demon.grants!.find((g) => g.id === 'g2')).toMatchObject({ kind: 'unarmed', die: '1d8', dtype: 'Slashing' });
  });
  it('takes a cantrip damage bonus and a die on an action', () => {
    expect(validateEntry({ ...feature, grants: [{ id: 'g1', kind: 'dmgBonus', name: 'Potent Spellcasting', val: 'wis', cantrip: true }] })).toEqual([]);
    expect(validateEntry({ ...feature, grants: [{ id: 'g1', kind: 'action', name: 'Woe', econ: 'reaction', dice: '-1d6' }] })).toEqual([]);
    expect(validateEntry({ ...feature, grants: [{ id: 'g1', kind: 'action', name: 'Woe', econ: 'reaction', dice: 'd6-' }] })).not.toEqual([]);
  });
  it('reads feat prerequisites, including a choice of features', () => {
    const feat = { id: 'feat/war-caster', kind: 'feat', name: 'War Caster', src: 'phb', desc: '…', cat: 'general', grants: [] };
    expect(validateEntry({ ...feat, prereq: 'lvl>=4;feature=spellcasting|pact-magic' })).toEqual([]);
    expect(validateEntry({ ...feat, prereq: 'lvl>=4;armor=heavy;str>=13' })).toEqual([]);
    expect(validateEntry({ ...feat, prereq: 'level 4' })).not.toEqual([]);
  });
  it('takes grants that count only while the entry’s effect is on', () => {
    expect(validateEntry({ ...feature, grants: [{ id: 'g1', kind: 'defense', name: 'Rage: Slashing', def: 'res', target: 'Slashing', when: 'active' }] })).toEqual([]);
  });
  it('raises a score to 20, 25 (Primal Champion) or 30 (Epic Boons)', () => {
    const g = { id: 'g1', kind: 'abil', name: 'STR +4', ab: 'str', val: '4' };
    for (const cap of [20, 25, 30]) expect(validateEntry({ ...feature, grants: [{ ...g, cap }] })).toEqual([]);
    expect(validateEntry({ ...feature, grants: [{ ...g, cap: 24 }] })).not.toEqual([]);
  });
  it('takes a subclass’s own spellcasting and a wider critical range', () => {
    const ek = { id: 'g1', kind: 'casting', name: 'Spellcasting', ab: 'int', list: 'wizard', cantrips: '3:2,10:3', prepared: '3:3,4:4', s1: '3:2,4:3,7:4', s2: '7:2,10:3' };
    expect(validateEntry({ ...feature, grants: [ek] })).toEqual([]);
    expect(validateEntry({ ...feature, grants: [{ ...ek, s2: 'two' }] })).not.toEqual([]);
    expect(validateEntry({ ...feature, grants: [{ id: 'g1', kind: 'crit', name: 'Critical Hit on 19–20', val: '19' }] })).toEqual([]);
  });
  it('accepts an AC grant on a magic item', () => {
    const ring = { id: 'item/ring-of-protection', kind: 'item', name: 'Ring of Protection', src: 'srd', desc: '…', cat: 'magic', rarity: 'rare', attune: true,
      grants: [{ id: 'g1', kind: 'ac', name: '+1 AC', acMode: 'bonus', val: '1', needEq: true, needAtt: true }] };
    expect(validateEntry(ring)).toEqual([]);
  });
  it('accepts base only on a magic item, as an item id or armor/weapon', () => {
    const venom = { id: 'item/dagger-of-venom', kind: 'item', name: 'Dagger of Venom', src: 'srd', desc: '…', cat: 'magic', rarity: 'Rare' };
    expect(validateEntry({ ...venom, base: 'item/dagger' })).toEqual([]);
    expect(validateEntry({ ...venom, base: 'armor' })).toEqual([]);
    expect(validateEntry({ ...venom, base: 'weapon' })).toEqual([]);
    expect(validateEntry({ ...venom, base: 'dagger' })).not.toEqual([]);
    expect(validateEntry({ ...venom, base: 'shield' })).not.toEqual([]);
    expect(validateEntry({ id: 'item/dagger', kind: 'item', name: 'Dagger', src: 'srd', desc: '', cat: 'weapon', base: 'item/dagger' })).not.toEqual([]);
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
  });
});

describe('grants on catalog spells', () => {
  const spell = { id: 'spell/shillelagh', kind: 'spell', name: 'Shillelagh', src: 'srd', desc: '…', lvl: 0, school: 'Transmutation', classes: 'druid',
    time: 'Bonus Action', range: 'Self', comp: 'V, S, M', dur: '1 minute', conc: false, ritual: false, fx: 'other' };
  it('allows an optional grants list on a spell, and never compares grant levels with the spell level', () => {
    expect(validateEntry(spell)).toEqual([]);
    expect(validateEntry({ ...spell, grants: [{ id: 'g1', kind: 'atkAbil', name: 'Shillelagh', ab: 'cast', when: 'active' }] })).toEqual([]);
    expect(validateEntry({ ...spell, lvl: 3, grants: [{ id: 'g1', kind: 'speed', name: 'x', mode: 'fly', val: '60', lvl: 1 }] })).toEqual([]);
  });
});

it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('makes an id from %s', (n) => {
  expect(catalogId('spell', n)).toBe('spell/' + slug(n));
});

it('refuses dice as a resource maximum', () => {
  expect(grantErrors({ id: 'g', kind: 'resource', name: 'X', recharge: 'long', max: '1d4' }, 'feature')).not.toEqual([]);
  expect(grantErrors({ id: 'g', kind: 'resource', name: 'X', recharge: 'long', max: 'pb' }, 'feature')).toEqual([]);
});
