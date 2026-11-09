import { describe, expect, it } from 'vitest';
import { ABILITIES, ARMORS, SIZES } from '../logic';
import { STANDARD_ARRAY } from '../creator';
import { ABILITY_KEYS, ARMOR_KINDS, catalogId, grantErrors, SCHEMA_STANDARD_ARRAY, SIZE_KEYS, slug, validateEntry } from './schema';

describe('older packs', () => {
  // Review Focus: a pack already on a device still holds the fields removed from the schema.
  it('accepts an entry from an older pack that still holds the removed fields', () => {
    const b = { id: 'background/x', kind: 'background', name: 'X', src: 'phb', desc: '', feat: 'feat/a', equip: '', grants: [] };
    expect(validateEntry(b)).toEqual([]);
    expect(validateEntry({ ...b, page: 12, abils: 'str,dex,con', skills: 'arc,rel', tool: 'drum' })).toEqual([]);
    expect(validateEntry({ id: 'prof/light-armor', kind: 'prof', name: 'Light armor', src: 'srd', desc: '', cat: 'armor', short: 'Light' })).toEqual([]);
  });
});

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
  const wizardFixture = { id: 'class/wizard', kind: 'class', name: 'Wizard', src: 'srd', desc: '', hd: 6, saves: 'int,wis',
    skills: { kind: 'choice', id: 's', name: 'Skills', pick: 2, pool: 'skill:any' }, armor: '', weapons: '' };
  it('a class accepts blurb, likes, complexity and a Standard Array permutation, and refuses a bad array', () => {
    const ok = { ...wizardFixture, blurb: 'x', likes: 'y', complexity: 'Low', stdArray: { str: 8, dex: 12, con: 13, int: 15, wis: 14, cha: 10 } };
    expect(validateEntry(ok)).toEqual([]);
    expect(validateEntry({ ...ok, stdArray: { ...ok.stdArray, cha: 9 } })[0]).toMatch(/bad stdArray/);
    expect(validateEntry({ ...ok, stdArray: { str: 15, dex: 14, con: 13, int: 12, wis: 10 } })[0]).toMatch(/bad stdArray/);
  });
  it("the schema's Standard Array copy equals creator.ts's STANDARD_ARRAY", () => {
    expect([...SCHEMA_STANDARD_ARRAY]).toEqual(STANDARD_ARRAY);
  });
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
      { ...venom, grants: [{ id: 'g1', kind: 'spell', name: 'x', spell: 'spell/fireball', dc: '15', atkB: '7', chg: 1, chgMax: 3, castLvl: 5 }] },
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
      ['chgMax below chg', { ...venom, grants: [{ id: 'g1', kind: 'spell', name: 'x', spell: 'spell/fireball', chg: 2, chgMax: 1 }] }],
      ['chgMax without chg', { ...venom, grants: [{ id: 'g1', kind: 'spell', name: 'x', spell: 'spell/fireball', chgMax: 3 }] }],
      ['castLvl without chg', { ...venom, grants: [{ id: 'g1', kind: 'spell', name: 'x', spell: 'spell/fireball', castLvl: 5 }] }],
      ['castLvl above 9', { ...venom, grants: [{ id: 'g1', kind: 'spell', name: 'x', spell: 'spell/fireball', chg: 1, castLvl: 10 }] }],
      ['chg 0', { ...venom, grants: [{ id: 'g1', kind: 'spell', name: 'x', spell: 'spell/fireball', chg: 0 }] }],
      ['chg 51', { ...venom, grants: [{ id: 'g1', kind: 'spell', name: 'x', spell: 'spell/fireball', chg: 51 }] }],
      ['chg 1.5', { ...venom, grants: [{ id: 'g1', kind: 'spell', name: 'x', spell: 'spell/fireball', chg: 1.5 }] }],
      ['floor on a fly speed', { ...trait, grants: [{ id: 'g1', kind: 'speed', name: 'x', mode: 'fly', val: '30', floor: true }] }],
      ['floor equal to the Speed', { ...trait, grants: [{ id: 'g1', kind: 'speed', name: 'x', mode: 'walk', val: 'walk2', floor: true }] }],
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
  it('needs a range on a sense grant', () => {
    expect(grantErrors({ id: 'g', kind: 'sense', name: 'Blindsight' }, 'feature')).toHaveLength(1);
  });
});

describe('a choice with ifPick', () => {
  const feat = (ifPick: string) => ({ id: 'feat/x', kind: 'feat', name: 'X', src: 'srd', desc: '', cat: 'general', grants: [
    { kind: 'choice', id: 'a', name: 'A', pick: 1, pool: 'list:one|two' }, { kind: 'choice', id: 'b', name: 'B', pick: 1, pool: 'skill:any', ifPick }] });
  it('is valid when it names an earlier choice', () => expect(validateEntry(feat('a=one'))).toEqual([]));
  it.each(['nope=x', 'b=x', 'a'])('%s names no earlier choice', (v) => {
    expect(validateEntry(feat(v))).toEqual(['feat/x: ifPick names no earlier choice']);
  });
});

describe('an action grant with uses', () => {
  const feat = (g: object) => ({ id: 'feat/x', kind: 'feat', name: 'X', src: 'srd', desc: '', cat: 'general', grants: [
    { id: 'r', kind: 'resource', name: 'R', recharge: 'long' }, { id: 'a', kind: 'action', name: 'A', econ: 'action', ...g }] });
  it('names a feature by catalog id', () => {
    expect(validateEntry(feat({ uses: 'feature/cleric/channel-divinity' }))).toEqual([]);
    expect(validateEntry(feat({ uses: 'feature/fighter/psi-warrior/psionic-power' }))).toEqual([]);
    expect(validateEntry(feat({ uses: 'spell/fireball' }))).not.toEqual([]);
  });
  it('fails with res as well', () => expect(validateEntry(feat({ uses: 'feature/cleric/channel-divinity', res: 'r' })).join()).toContain('res and uses together'));
  it('regainTo is a Value or all', () => {
    expect(validateEntry(feat({ regainTo: 'all' }))).toEqual([]);
    expect(validateEntry(feat({ regainTo: '2' }))).toEqual([]);
    expect(validateEntry(feat({ regainTo: 'most' }))).not.toEqual([]);
  });
});

it('checks a checkAdv grant', () => {
  const e = (g: object) => validateEntry({ id: 'feat/x', kind: 'feat', name: 'X', src: 'srd', desc: '', cat: 'general', grants: [{ id: 'a', kind: 'checkAdv', name: 'A', target: 'perception', ...g }] });
  expect(e({ adv: 'adv', always: true, note: 'n' })).toEqual([]);
  expect(e({ adv: 'maybe' })).not.toEqual([]);
});

it('lets a resource grant carry a note (addGrants copies it)', () => {
  expect(validateEntry({ id: 'feat/x', kind: 'feat', name: 'X', src: 'srd', desc: '', cat: 'general', grants: [{ id: 'r', kind: 'resource', name: 'R', recharge: 'long', note: 'Type the rolls here.' }] })).toEqual([]);
});

describe('a background\'s equipment packages', () => {
  const b = (p: object) => ({ id: 'background/x', kind: 'background', name: 'X', src: 'srd', desc: '', feat: 'feat/a', equip: '', grants: [], ...p });
  it('are valid with both coin amounts, which must be whole and both present', () => {
    expect(validateEntry(b({ equipA: 'item/dagger;Rope*2', gpA: 15, gpB: 50 }))).toEqual([]);
    expect(validateEntry(b({ equipA: 'item/dagger', gpB: 50 }))).toEqual(['background/x: equipA needs gpA and gpB']);
    expect(validateEntry(b({ equipA: 'item/dagger', gpA: 1.5, gpB: 50 }))).not.toEqual([]);
  });
});

describe('class starting equipment and multiclass traits', () => {
  const base = { id: 'class/x', kind: 'class', name: 'X', src: 'srd', desc: '', hd: 8, saves: 'str,dex', armor: '', weapons: '',
    skills: { kind: 'choice', id: 'skills', name: 'Skills', pick: 2, pool: 'skill:any' } };
  it('accepts the new fields', () => {
    expect(validateEntry({ ...base, primary: 'dex,wis', equipA: 'item/dagger', gpA: 5, gpB: 50,
      tools: { kind: 'choice', id: 'tools', name: 'Tools', pick: 1, pool: 'tool:artisan' },
      multi: { armor: 'Light armor', tools: 'Thieves’ Tools', skills: { kind: 'choice', id: 'mskills', name: 'Skill', pick: 1, pool: 'skill:any' } } })).toEqual([]);
  });
  it('refuses equipA without both gold amounts, a bad multiclass pick and a bad primary', () => {
    expect(validateEntry({ ...base, equipA: 'item/dagger', gpA: 5 })).not.toEqual([]);
    expect(validateEntry({ ...base, multi: { skills: { kind: 'choice', id: 'mskills', name: 'Skill', pick: 0, pool: 'skill:any' } } })).not.toEqual([]);
    expect(validateEntry({ ...base, multi: { feats: 'x' } })).not.toEqual([]);
    expect(validateEntry({ ...base, primary: 'str|dex,wis' })).not.toEqual([]);
  });
});

describe('needAura and needHand on a catalog grant', () => {
  const feature = (g: object) => validateEntry({ id: 'feat/x', kind: 'feat', name: 'X', src: 'srd', desc: '', cat: 'general', grants: [{ id: 'a', kind: 'saveBonus', name: 'A', ab: 'all', val: '1', ...g }] });
  it('accepts needAura, refuses needHand on a feat', () => {
    expect(feature({ needHand: true })).not.toEqual([]);
    expect(feature({ needAura: 'feature/paladin/aura-of-protection' })).toEqual([]);
  });
});

describe('makes and single (companions)', () => {
  const spell = { id: 'spell/x', kind: 'spell', name: 'X', src: 'srd', desc: '', lvl: 1, school: 'Conjuration', classes: 'wizard', time: 'Action', range: '10 feet', comp: 'V', dur: 'Instantaneous', conc: false, ritual: false, fx: 'other' };
  it('accepts makes and single on a spell and makes on a feature, and refuses bad values', () => {
    expect(validateEntry({ ...spell, makes: 'pet', single: true } as never)).toEqual([]);
    expect(validateEntry({ ...spell, makes: 'dragon' } as never)).not.toEqual([]);
    const feature = { id: 'feature/druid/x', kind: 'feature', name: 'X', src: 'srd', desc: '', cls: 'druid', lvl: 2, grants: [] };
    expect(validateEntry({ ...feature, makes: 'form' } as never)).toEqual([]);
    expect(validateEntry({ ...feature, makes: 1 } as never)).not.toEqual([]);
  });
});
