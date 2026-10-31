import { describe, expect, it } from 'vitest';
import srdEntries from './data/srd/index';
import { mergeCatalog } from './catalog/merge';
import type { ItemEntry } from './catalog/schema';
import { itemFromEntry } from './catalog/copy';
import { blankCharacter, druidSample, sampleCharacter } from './defaults';
import { attacksPerAction, hasMastery, lightExtra, masterySlots, unarmedStrike, weaponAbility, weaponAttacks, weaponProficient, type Use } from './actions';
import { weaponKind } from './hands';
import { addGrants, migrate, normalize } from './logic';
import { applyPatch } from './storage';
import { dagger, dart, handaxe, handCrossbow, longbow, longsword, quarterstaff, rapier, shield, shortsword, spear } from './test-fixtures';
import type { Character, Grant, Item, Prof } from './types';

const cat = mergeCatalog(srdEntries, null);
const catItem = (id: string, p: Partial<Item> = {}): Item => ({ ...itemFromEntry(cat.byId.get(id) as ItemEntry), id: id.split('/').pop()!, eq: true, ...p });

const ilyra = (p: Partial<Character> = {}): Character => ({ ...sampleCharacter(), ...p });
const raw = (c: Character) => JSON.parse(JSON.stringify(c)) as Record<string, unknown>;

describe('weapon mastery', () => {
  it('counts picks up to the Weapon Mastery slots, oldest first', () => {
    const c = ilyra({ mastery: ['longbow', 'shortsword'] });
    expect(masterySlots(c)).toBe(2);
    expect(hasMastery(c, 'longbow')).toBe(true);
    expect(hasMastery(ilyra({ mastery: ['longbow', 'shortsword', 'dagger'] }), 'dagger')).toBe(false);
    expect(hasMastery(ilyra({ mastery: ['dagger', 'longbow'] }), 'dagger')).toBe(true);
    expect(hasMastery(ilyra({ mastery: [] }), 'longbow')).toBe(false);
  });
  it('gives mastery of a weapon named by a grant', () => {
    const g: Grant = { id: 'gx', kind: 'prof', name: 'Hand Crossbow mastery', cat: 'mastery', target: 'Hand Crossbow', from: 'feature:f3' };
    expect(hasMastery(ilyra({ mastery: [], grants: [...sampleCharacter().grants, g] }), 'hand-crossbow')).toBe(true);
  });
  it('reads the slot count at the level (Fighter: 3, 4 from level 4)', () => {
    const c: Character = {
      ...blankCharacter(), level: 4, feats: [{ id: 'fw', g: 'class', name: 'Weapon Mastery', desc: '' }],
      grants: [{ id: 'gm', kind: 'prof', name: 'Weapon Mastery', cat: 'mastery', val: '1:3,4:4', from: 'feature:fw' }]
    };
    expect(masterySlots(c)).toBe(4);
    expect(masterySlots({ ...c, level: 3 })).toBe(3);
  });
  it('keeps the picks valid on load and on every change', () => {
    const { mastery: _m, ...old } = raw(ilyra({ mastery: ['longbow'] }));
    expect(migrate(old).mastery).toEqual([]);
    expect(migrate({ ...raw(ilyra()), mastery: ['x', 'x', 3] }).mastery).toEqual(['x']);
    expect(applyPatch(ilyra(), { mastery: ['x', 'x'] }).mastery).toEqual(['x']);
    const ok = ilyra({ mastery: ['longbow'] });
    expect(normalize(ok)).toBe(ok);
  });
});

// A level 1 character (PB 2) with these scores, weapons and weapon proficiencies.
const fighter = (abil: Partial<Character['abil']>, inv: Item[], profs: string[] = ['Simple weapons', 'Martial weapons'], p: Partial<Character> = {}): Character => ({
  ...blankCharacter(), abil: { ...blankCharacter().abil, ...abil }, inv,
  profs: profs.map((name, i): Prof => ({ id: 'pw' + i, cat: 'weapon', name })), ...p
});
const use = (c: Character, it: Item, u: Use) => weaponAttacks(c, it).find((a) => a.use === u)!;
const grant = (g: Omit<Grant, 'id' | 'from'> & { id?: string }): Grant => ({ id: 'gt', from: 'feature:fx', ...g } as Grant);
const withGrants = (c: Character, ...gs: Grant[]): Character => ({ ...c, feats: [...c.feats, { id: 'fx', g: 'class', name: 'Test feature', desc: '' }], grants: [...c.grants, ...gs] });
const dueling = grant({ id: 'gd', kind: 'dmgBonus', name: 'Dueling', val: '2', wrange: 'melee', oneHand: true });

describe('weapon attacks', () => {
  it('adds Archery to the Longbow (PHB p.209) and shows its mastery when chosen', () => {
    const c = ilyra({ mastery: ['longbow'] });
    const bow = c.inv.find((i) => i.id === 'i2')!;
    const a = weaponAttacks(c, bow);
    expect(a.map((x) => x.use)).toEqual(['ranged']);
    expect(a[0]).toMatchObject({ hit: 9, dmg: '1d8+4', dtype: 'Piercing', mastery: 'slow' });
    expect(a[0].hitParts).toContainEqual({ label: 'Archery', value: 2 });
    expect(weaponAttacks(ilyra({ mastery: [] }), bow)[0].mastery).toBeUndefined();
  });

  it('gives a thrown Dagger no Archery and Thrown Weapon Fighting only to the thrown use', () => {
    const c = ilyra({ inv: [...sampleCharacter().inv, dagger({ id: 'dg' })] });
    const d = c.inv.find((i) => i.id === 'dg')!;
    expect(use(c, d, 'melee').hit).toBe(7);
    expect(use(c, d, 'thrown').hit).toBe(7);
    expect(use(c, d, 'thrown').hitParts.some((p) => p.label === 'Archery')).toBe(false);
    const twf = withGrants(c, grant({ kind: 'dmgBonus', name: 'Thrown Weapon Fighting', val: '2', amode: 'ranged', prop: 'thrown' }));
    expect(use(twf, d, 'thrown').dmg).toBe('1d4+6');
    expect(use(twf, d, 'melee').dmg).toBe('1d4+4');
  });

  it('throws a melee weapon with its melee ability (PHB p.214, Thrown)', () => {
    const c = fighter({ str: 16, dex: 10 }, [handaxe({ id: 'ax' })]);
    expect(weaponAbility(c, c.inv[0], 'thrown')).toBe('str');
    expect(use(c, c.inv[0], 'thrown')).toMatchObject({ hit: 5, dmg: '1d6+3' });
  });

  it('adds Dueling only to a Melee weapon alone in one hand (PHB p.209)', () => {
    const ls = longsword({ id: 'ls' });
    const alone = withGrants(fighter({ str: 16 }, [ls], undefined, { hands: ['ls'] }), dueling);
    expect(use(alone, ls, 'melee').dmg).toBe('1d8+5');
    expect(use(alone, ls, 'two-handed').dmg).toBe('1d10+3');
    const withShield = withGrants(fighter({ str: 16 }, [ls, shield({ id: 'sh' })], undefined, { hands: ['ls'] }), dueling);
    expect(use(withShield, ls, 'melee').dmg).toBe('1d8+5');
    const withDagger = withGrants(fighter({ str: 16 }, [ls, dagger({ id: 'dg' })], undefined, { hands: ['ls', 'dg'] }), dueling);
    expect(use(withDagger, ls, 'melee').dmg).toBe('1d8+3');
    const twoHands = withGrants(fighter({ str: 16 }, [ls], undefined, { hands: ['ls', 'ls'] }), dueling);
    expect(use(twoHands, ls, 'melee').dmg).toBe('1d8+3');
    expect(use(twoHands, ls, 'two-handed').dmg).toBe('1d10+3');
  });

  it('adds the Proficiency Bonus only with proficiency (PHB p.12)', () => {
    const ls = longsword({ id: 'ls' });
    expect(use(fighter({ str: 16 }, [ls], ['Simple weapons']), ls, 'melee').hit).toBe(3);
    expect(use(fighter({ str: 16 }, [ls]), ls, 'melee').hit).toBe(5);
    const rogue = fighter({}, [], ['Simple weapons', 'Martial weapons that have the Finesse or Light property']);
    expect(weaponProficient(rogue, rapier({ id: 'x' }))).toBe(true);
    expect(weaponProficient(rogue, shortsword({ id: 'x' }))).toBe(true);
    expect(weaponProficient(rogue, longsword({ id: 'x' }))).toBe(false);
    const monk = fighter({}, [], ['Simple weapons', 'Martial weapons that have the Light property']);
    expect(weaponProficient(monk, shortsword({ id: 'x' }))).toBe(true);
    expect(weaponProficient(monk, rapier({ id: 'x' }))).toBe(false);
    const handBow: Item = { ...longbow({ id: 'x' }), name: 'Longbow +1', cid: undefined };
    expect(weaponProficient(fighter({}, [], ['Longbow']), handBow)).toBe(true);
    expect(weaponProficient(fighter({}, [], ['Hand Crossbow']), handCrossbow({ id: 'x' }))).toBe(true);
    expect(weaponProficient(fighter({}, [], ['Longbow']), shortsword({ id: 'x' }))).toBe(false);
  });

  it('adds a magic bonus to attack and damage', () => {
    const ls = longsword({ id: 'ls', magic: 1 });
    expect(use(fighter({ str: 16 }, [ls]), ls, 'melee')).toMatchObject({ hit: 6, dmg: '1d8+4' });
  });

  it('adds a grant for a list of weapons only to those weapons', () => {
    const c = withGrants(ilyra(), grant({ kind: 'dmgBonus', name: 'Bracers of Archery', val: '2', weapon: 'longbow,shortbow' }));
    expect(weaponAttacks(c, c.inv.find((i) => i.id === 'i2')!)[0].dmg).toBe('1d8+6');
    expect(use(c, c.inv.find((i) => i.id === 'i3')!, 'melee').dmg).toBe('1d6+4');
  });

  it('counts a magic weapon as its base weapon', () => {
    const venom = catItem('item/dagger-of-venom');
    expect(venom.base).toBe('item/dagger');
    expect(weaponKind(venom)).toBe('dagger');
    expect(hasMastery(ilyra({ mastery: ['dagger'] }), weaponKind(venom))).toBe(true);
    expect(weaponKind({ ...longsword({ id: 'x' }), name: 'Longsword +1', cid: undefined })).toBe('longsword');
  });

  it('lists each use of a weapon', () => {
    const c = ilyra({ inv: [...sampleCharacter().inv, spear({ id: 'sp' }), dart({ id: 'dt' })] });
    expect(weaponAttacks(c, spear({ id: 'sp' })).map((a) => a.use)).toEqual(['melee', 'thrown', 'two-handed']);
    expect(weaponAttacks(c, longbow({ id: 'lb' })).map((a) => a.use)).toEqual(['ranged']);
    const d = weaponAttacks(c, dart({ id: 'dt' }));
    expect(d.map((a) => a.use)).toEqual(['ranged']);
    expect(d[0].hitParts).toContainEqual({ label: 'Archery', value: 2 });
  });

  it('uses Shillelagh while it is on (PHB p.316)', () => {
    const on: Character = { ...druidSample(), effectsOn: ['spell:ds3'] };
    const qs = on.inv.find((i) => i.id === 'i3')!;
    expect(use(on, qs, 'melee')).toMatchObject({ hit: 9, dmg: '1d12+5', dtype: 'Bludgeoning or Force' });
    expect(use(on, qs, 'two-handed')).toMatchObject({ hit: 9, dmg: '1d12+5', dtype: 'Bludgeoning or Force' });
    const off = druidSample();
    expect(use(off, qs, 'melee')).toMatchObject({ hit: 3, dmg: '1d6−1', dtype: 'Bludgeoning' });
    expect(use(off, qs, 'two-handed')).toMatchObject({ hit: 3, dmg: '1d8−1', dtype: 'Bludgeoning' });
  });

  it('uses the better ability and the bigger die of Martial Arts (PHB p.101)', () => {
    const ma = grant({ kind: 'atkAbil', name: 'Martial Arts', ab: 'dex', weapons: 'simple-melee,martial-melee-light', die: '1:1d6,5:1d8,11:1d10,17:1d12', when: 'noArmorNoShield' });
    const monk = withGrants(fighter({ str: 16, dex: 12 }, [quarterstaff({ id: 'qs' }), spear({ id: 'sp' })], ['Simple weapons']), ma);
    expect(weaponAbility(monk, monk.inv[0], 'melee')).toBe('str');
    expect(use(monk, monk.inv[1], 'two-handed').dmg).toBe('1d8+3');
    const quick = withGrants(fighter({ str: 10, dex: 16 }, [quarterstaff({ id: 'qs' })], ['Simple weapons']), ma);
    expect(weaponAbility(quick, quick.inv[0], 'melee')).toBe('dex');
    expect(use(quick, quick.inv[0], 'melee').dmg).toBe('1d6+3');
  });
});

describe('Unarmed Strike (PHB p.377)', () => {
  it('uses Strength and PB, with the Grapple and Shove DC', () => {
    expect(unarmedStrike(ilyra())).toMatchObject({ name: 'Unarmed Strike', hit: 4, dmg: '2', dtype: 'Bludgeoning', dc: 12 });
    expect(unarmedStrike(druidSample())).toMatchObject({ hit: 3, dmg: '0', dc: 11 });
    expect(unarmedStrike(fighter({ str: 6 }, [])).dmg).toBe('0');
  });
  it('uses the Martial Arts die and the better ability (PHB p.101)', () => {
    const ma = grant({ kind: 'unarmed', name: 'Martial Arts', die: '1:1d6,5:1d8,11:1d10,17:1d12', abs: 'str,dex', when: 'noArmorNoShield' });
    const monk = withGrants(fighter({ str: 10, dex: 16 }, [], ['Simple weapons'], { level: 5 }), ma);
    expect(unarmedStrike(monk)).toMatchObject({ hit: 6, dmg: '1d8+3', dc: 14 });
  });
  it('adds bonuses for Unarmed Strikes from an equipped, attuned item', () => {
    const c = withGrants(ilyra({ inv: [...sampleCharacter().inv, { id: 'gl', name: 'Gloves', qty: 1, eq: true }], attuneIds: ['i9', 'gl', ''] }),
      grant({ id: 'ga', kind: 'atkBonus', name: '+1 to Unarmed Strikes', val: '1', weapon: 'unarmed-strike', from: 'item:gl', needEq: true, needAtt: true } as Grant),
      grant({ id: 'gb', kind: 'dmgBonus', name: '+1 damage', val: '1', weapon: 'unarmed-strike', from: 'item:gl', needEq: true, needAtt: true } as Grant),
      grant({ id: 'gc', kind: 'atkBonus', name: 'Archery', val: '2', wrange: 'ranged' }));
    expect(unarmedStrike(c)).toMatchObject({ hit: 5, dmg: '3', dc: 12 });
  });
  it('deals Demon Armor’s Slashing damage', () => {
    const e = cat.byId.get('item/demon-armor') as ItemEntry;
    const base = ilyra({ inv: [...sampleCharacter().inv.filter((i) => i.id !== 'i1'), catItem('item/demon-armor')], attuneIds: ['i9', 'demon-armor', ''] });
    const c = addGrants(base, 'item:demon-armor', e.grants!.map((spec) => ({ spec: spec as Exclude<typeof spec, { kind: 'choice' }> })));
    expect(unarmedStrike(c)).toMatchObject({ hit: 5, dmg: '1d8+2', dtype: 'Slashing' });
  });
});

describe('attacks per Attack action', () => {
  it('reads Extra Attack (PHB p.120)', () => {
    expect(attacksPerAction(ilyra())).toBe(2);
    expect(attacksPerAction(ilyra({ grants: sampleCharacter().grants.filter((g) => g.kind !== 'attacks') }))).toBe(1);
  });
});

describe('the Light extra attack (PHB p.213)', () => {
  // DEX 18 (+4), STR 10, PB 3, two Weapon Mastery picks.
  const duo = (inv: Item[], hands: string[], mastery: string[] = [], ...gs: Grant[]) => withGrants(
    fighter({ dex: 18, str: 10 }, inv, undefined, { level: 5, hands, mastery }),
    grant({ id: 'gm', kind: 'prof', name: 'Weapon Mastery', cat: 'mastery', val: '2' }), ...gs);
  const twf = grant({ id: 'gt2', kind: 'lightExtra', name: 'Two-Weapon Fighting', addMod: true });
  it('needs two Light weapons in hand and adds no positive modifier', () => {
    const pair = duo([dagger({ id: 'd', qty: 2 })], ['d', 'd']);
    expect(lightExtra(pair)).toMatchObject({ itemId: 'd', dmg: '1d4', econ: 'bonus', nick: false });
    expect(lightExtra(duo([dagger({ id: 'd', qty: 2 })], ['d', 'd'], [], twf))!.dmg).toBe('1d4+4');
    expect(lightExtra(applyPatch(pair, (s) => ({ inv: s.inv.map((i) => ({ ...i, qty: 1 })) })))).toBeNull();
    expect(lightExtra(duo([shortsword({ id: 'ss' })], ['ss']))).toBeNull();
    expect(lightExtra(duo([shortsword({ id: 'ss' }), handaxe({ id: 'ax' })], ['ss', 'ax']))!.itemId).toBe('ax');
    expect(lightExtra(duo([shortsword({ id: 'ss' }), longsword({ id: 'ls' })], ['ss', 'ls']))).toBeNull();
    expect(lightExtra(duo([shortsword({ id: 'ss' }), dagger({ id: 'd' })], ['ss', 'd']))!.itemId).toBe('d');
  });
  it('is part of the Attack action with Nick (PHB p.214)', () => {
    const nick = lightExtra(duo([dagger({ id: 'd', qty: 2 })], ['d', 'd'], ['dagger']))!;
    expect(nick).toMatchObject({ nick: true, econ: 'action', note: 'part of the Attack action, once per turn' });
    expect(lightExtra(duo([dagger({ id: 'd' }), shortsword({ id: 'ss' })], ['d', 'ss'], ['dagger']))).toMatchObject({ itemId: 'd', nick: true });
    expect(lightExtra(duo([dagger({ id: 'd' }), shortsword({ id: 'ss' })], ['d', 'ss'], []))).toMatchObject({ itemId: 'ss', nick: false });
  });
});
