import { describe, expect, it } from 'vitest';
import srdEntries from './data/srd/index';
import { mergeCatalog } from './catalog/merge';
import type { Entry, ItemEntry, SpellEntry } from './catalog/schema';
import { addFromCatalog, itemFromEntry, spellFromEntry, type AddChoices } from './catalog/copy';
import { blankCharacter, druidSample, sampleCharacter } from './defaults';
import { attacksPerAction, cantripDice, econOf, extraDamage, extraText, featureActions, hasMastery, lightExtra, masterySlots, otherWeapons, resOfFeature, spellActions, unarmedStrike, weaponAbility, weaponAttacks, weaponProficient, type Use } from './actions';
import { weaponKind } from './hands';
import { takeOut } from './inventory';
import { addGrants, normalize } from './logic';
import { migrate } from './migrate';
import { applyPatch } from './storage';
import { dagger, dart, handaxe, handCrossbow, longbow, longsword, quarterstaff, rapier, shield, shortsword, spear } from './test-fixtures';
import type { Character, Grant, Item, Prof, Spell } from './types';

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
  it('attacks with a catalog magic weapon’s chosen base, its +N and the base’s mastery (plan 7)', () => {
    const c0 = addFromCatalog(ilyra({ mastery: ['longsword'] }), cat, cat.byId.get('item/holy-avenger')!, { picks: {}, counted: {}, links: {}, item: { base: 'item/longsword' } });
    const av = c0.inv.at(-1)!;
    expect(weaponKind(av)).toBe('longsword');
    const [melee] = weaponAttacks(c0, av);
    const plain = weaponAttacks(c0, catItem('item/longsword'))[0];
    expect(melee.hit - plain.hit).toBe(3);
    expect(melee.hitParts).toContainEqual({ label: 'Magic', value: 3 });
    expect(melee.dmg).toMatch(/^1d8/);
    expect(melee.mastery).toBe('sap');
  });
  it('adds loaded magic ammunition’s bonus to a ranged attack, next to the bow’s own (plan 7)', () => {
    const arrows: Item = { id: 'ar', name: 'Arrows', qty: 20, eq: false, cat: 'ammo', cid: 'item/arrows' };
    const arrows2: Item = { id: 'a2', name: 'Arrows +2', qty: 20, eq: false, cat: 'magic', cid: 'item/ammunition-1-2-or-3', base: 'item/arrows', magic: 2 };
    const at = (bow: Item) => weaponAttacks({ ...ilyra(), inv: [bow, arrows, arrows2] }, bow)[0];
    const bare = at(longbow({ id: 'lb' }));
    expect(at(longbow({ id: 'lb', load: 'ar' })).hit).toBe(bare.hit);
    const loaded = at(longbow({ id: 'lb', load: 'a2' }));
    expect([loaded.hit - bare.hit, loaded.hitParts.find((p) => p.label === 'Ammunition')?.value, loaded.dmgParts.find((p) => p.label === 'Ammunition')?.value]).toEqual([2, 2, 2]);
    const both = at(longbow({ id: 'lb', load: 'a2', magic: 1 }));
    expect(both.hit - bare.hit).toBe(3);
    expect(both.dmgParts.filter((p) => p.label === 'Magic' || p.label === 'Ammunition').map((p) => p.value)).toEqual([1, 2]);
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
    const { mastery: _m, ...noMastery } = raw(ilyra({ mastery: ['longbow'] }));
    expect(migrate(noMastery).mastery).toEqual([]);
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
const grant = (g: Omit<Grant, 'id' | 'from'> & { id?: string; from?: string }): Grant => ({ id: 'gt', from: 'feature:fx', ...g } as Grant);
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

  it('lets a ranged Finesse weapon use the better of STR and DEX (PHB p.213, Finesse)', () => {
    const strong = fighter({ str: 16, dex: 10 }, [dart({ id: 'dt' })]);
    expect(weaponAbility(strong, strong.inv[0], 'ranged')).toBe('str');
    expect(use(strong, strong.inv[0], 'ranged')).toMatchObject({ hit: 5, dmg: '1d4+3' });
    const quick = fighter({ str: 10, dex: 16 }, [dart({ id: 'dt' })]);
    expect(weaponAbility(quick, quick.inv[0], 'ranged')).toBe('dex');
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

  it('adds a grant for a list of weapons only to those weapons', () => {
    const c = withGrants(ilyra(), grant({ kind: 'dmgBonus', name: 'Bracers of Archery', val: '2', weapon: 'longbow,shortbow' }));
    expect(weaponAttacks(c, c.inv.find((i) => i.id === 'i2')!)[0].dmg).toBe('1d8+6');
    expect(use(c, c.inv.find((i) => i.id === 'i3')!, 'melee').dmg).toBe('1d6+4');
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

const catSpell = (id: string, p: Partial<Spell> = {}): Spell => ({ ...spellFromEntry(cat.byId.get(id) as SpellEntry), id: id.split('/').pop()!, ...p });
const actionOf = (c: Character, id: string) => spellActions(c).find((a) => a.spellId === id);
// A level 5 Wizard, INT 16 (+3), PB 3.
const wizard = (spells: Spell[], p: Partial<Character> = {}): Character =>
  ({ ...blankCharacter(), level: 5, castAb: 'int', abil: { ...blankCharacter().abil, int: 16 }, spells, ...p });

describe('spell actions', () => {
  it('puts a spell with a save under save, even when it deals damage (Fireball)', () => {
    const a = actionOf(wizard([catSpell('spell/fireball')]), 'fireball')!;
    expect(a).toMatchObject({ group: 'save', dc: 14, save: 'dex', dice: '8d6', dtype: 'Fire', econ: 'action' });
    expect(a.upcast).toMatch(/increases by 1d6/);
  });
  it('says which dice a higher slot adds when a spell has no printed text, and nothing for a cantrip', () => {
    expect(actionOf(wizard([{ ...catSpell('spell/fireball'), higher: undefined }]), 'fireball')!.upcast).toBe('+1d6 for each slot level above 3');
    expect(actionOf(wizard([catSpell('spell/fire-bolt')]), 'fire-bolt')!.upcast).toBeUndefined();
  });
  it('scales cantrip dice at levels 5, 11 and 17 (PHB p.239, Fire Bolt p.274)', () => {
    expect(actionOf(wizard([catSpell('spell/fire-bolt')]), 'fire-bolt')).toMatchObject({ group: 'damage', hit: 6, dice: '2d10' });
    expect(actionOf(wizard([catSpell('spell/fire-bolt')], { level: 11 }), 'fire-bolt')!.dice).toBe('3d10');
    expect(actionOf(wizard([catSpell('spell/eldritch-blast')]), 'eldritch-blast')!.dice).toBe('2 beams × 1d10');
    expect([cantripDice('1d8', 1), cantripDice('1d8', 4), cantripDice('1d8', 5), cantripDice('1d8', 11), cantripDice('1d8', 17), cantripDice('2d6', 5)])
      .toEqual(['1d8', '1d8', '2d8', '3d8', '4d8', '4d6']);
  });
  it('adds the spellcasting modifier to healing that says so (Cure Wounds, PHB p.259)', () => {
    const cure = (wis: number, healMod?: boolean) => actionOf(ilyra({ abil: { ...sampleCharacter().abil, wis }, spells: [catSpell('spell/cure-wounds', { healMod })] }), 'cure-wounds')!;
    expect(cure(14, true)).toMatchObject({ group: 'healing', dice: '2d8 + WIS (+2)' });
    expect(cure(8, true).dice).toBe('2d8 + WIS (−1)');
    expect(cure(14).dice).toBe('2d8');
  });
  it('adds the spellcasting modifier to damage that says so (Spiritual Weapon) and shows a chosen type’s list', () => {
    const sw = actionOf(ilyra({ spells: [catSpell('spell/spiritual-weapon')] }), 'spiritual-weapon')!;
    expect(sw).toMatchObject({ group: 'damage', dice: '1d8 + WIS (+2)', dtype: 'Force' });
    const orb = actionOf(ilyra({ spells: [catSpell('spell/chromatic-orb')] }), 'chromatic-orb')!;
    expect(orb).toMatchObject({ group: 'damage', dice: '3d8', dtypes: 'Acid,Cold,Fire,Lightning,Poison,Thunder' });
    expect(orb.dtype).toBeUndefined();
  });
  it('gives Conjure Minor Elementals no row, and its extra damage only while it is on', () => {
    const c = addFromCatalog({ ...ilyra(), level: 7 }, cat, cat.byId.get('spell/conjure-minor-elementals')!, { picks: {}, counted: {}, links: {} });
    const sp = c.spells.find((s) => s.cid === 'spell/conjure-minor-elementals')!;
    expect(spellActions(c).some((a) => a.spellId === sp.id)).toBe(false);
    const extra = (x: Character) => extraDamage(x).filter((e) => e.name === 'Conjure Minor Elementals');
    expect(extra(c)).toEqual([]);
    expect(extra({ ...c, conc: { id: sp.id, name: sp.name } })).toEqual([expect.objectContaining({ dice: '2d8', dtype: 'Acid/Cold/Fire/Lightning' })]);
  });
  it('adds one row per spell part, named after the part, grouped and scaled by its own fields', () => {
    const knife = catSpell('spell/ice-knife', { parts: [{ label: 'Burst', fx: 'damage', dice: '2d6', dtype: 'Cold', save: 'dex', scale: '1d6/slot' }] });
    const c = ilyra({ spells: [knife] });
    const rows = spellActions(c).filter((a) => a.spellId === 'ice-knife');
    expect(rows.map((r) => [r.name, r.group, r.part, r.dice, r.dtype])).toEqual([['Ice Knife', 'damage', undefined, '1d10', 'Piercing'], ['Ice Knife · Burst', 'save', 0, '2d6', 'Cold']]);
    expect(rows[1]).toMatchObject({ dc: rows[1].dc, save: 'dex', range: knife.range });
    expect(rows[1].dc).toBeGreaterThan(0);
    expect([rows[1].hit, rows[1].effect, rows[1].upcast]).toEqual([undefined, undefined, undefined]);
    // A cantrip part scales by its own scale; a part's modifier is its own; no save or attack groups by fx.
    const toll = catSpell('spell/sacred-flame', { parts: [{ label: 'Missing HP', fx: 'damage', dice: '1d12', dtype: 'Necrotic', save: 'wis', scale: 'cantrip' }] });
    expect(spellActions(ilyra({ spells: [toll] })).find((a) => a.part === 0)!.dice).toBe('2d12');
    const hand = catSpell('spell/spiritual-weapon', { parts: [{ label: 'Grasping Hand', fx: 'damage', dice: '4d6', dtype: 'Bludgeoning', dmgMod: true },
      { label: 'Light', fx: 'healing', dice: '4d12', healMod: true }] });
    const hr = spellActions(ilyra({ spells: [hand] })).filter((a) => a.part !== undefined);
    expect(hr.map((r) => [r.group, r.dice])).toEqual([['damage', '4d6 + WIS (+2)'], ['healing', '4d12 + WIS (+2)']]);
  });
  it('shows fixed healing as it is, never with a modifier or dice arithmetic', () => {
    expect(actionOf(ilyra({ spells: [catSpell('spell/heal', { always: true })] }), 'heal')).toMatchObject({ group: 'healing', dice: '70' });
    expect(actionOf(ilyra({ spells: [catSpell('spell/power-word-heal', { always: true, healMod: true })] }), 'power-word-heal')!.dice).toBe('all HP');
  });
  it('adds a cantrip damage bonus to the feature’s class cantrips only', () => {
    const bonus = (from: string) => grant({ id: 'gp', kind: 'dmgBonus', name: 'Potent Spellcasting', val: 'wis', cantrip: true, from });
    const c = { ...druidSample(), grants: [...druidSample().grants, bonus('feature:f7')] };
    expect(actionOf(c, 'ds2')!.dice).toBe('3d8+5');
    expect(actionOf(c, 'ds8')!.dice).toBe('3d10');
    const noCid = { ...druidSample(), grants: [...druidSample().grants, bonus('feature:f16')] };
    expect(actionOf(noCid, 'ds2')!.dice).toBe('3d8');
  });
  it('hurls Produce Flame with a Magic action (PHB p.308)', () => {
    expect(actionOf(druidSample(), 'ds2')).toMatchObject({ econ: 'action', note: 'Cast as a Bonus Action; hurl as a Magic action' });
    expect([econOf('Bonus Action'), econOf('Reaction, which you take when…'), econOf('Action'), econOf('1 minute')]).toEqual(['bonus', 'reaction', 'action', 'other']);
  });
  it('shows Shillelagh as an effect row and leaves out spells that do nothing here', () => {
    expect(actionOf(druidSample(), 'ds3')).toMatchObject({ group: 'damage', effect: true, dice: '' });
    expect(actionOf(druidSample(), 'ds1')).toBeUndefined();
  });
  it('lists only spells castable now', () => {
    const hm = catSpell('spell/healing-word');
    const c = wizard([{ ...hm, id: 'np', prep: false }, { ...hm, id: 'al', prep: false, always: true }, catSpell('spell/fire-bolt', { prep: false })]);
    expect(spellActions(c).map((a) => a.spellId).sort()).toEqual(['al', 'fire-bolt']);
    const granted = (level: number) => ({ ...sampleCharacter(), level, spells: [...sampleCharacter().spells.filter((x) => x.id !== 'sp5'), { ...sampleCharacter().spells.find((x) => x.id === 'sp5')!, from: 'feature:f2', minLvl: 5 }] });
    expect(actionOf(granted(4), 'sp5')).toBeUndefined();
    expect(actionOf(granted(5), 'sp5')).toBeDefined();
  });
  it('puts damage without an attack or save under damage (Hunter’s Mark, Magic Missile)', () => {
    expect(actionOf(ilyra(), 'sp4')).toMatchObject({ group: 'damage', note: 'Extra damage on your hits while it lasts' });
    expect(actionOf(wizard([catSpell('spell/magic-missile')]), 'magic-missile')).toMatchObject({ group: 'damage', dice: '1d4+1' });
  });
});

describe('feature actions', () => {
  it('lists action grants with their timing and resource', () => {
    const acts = featureActions(druidSample());
    expect(acts.find((a) => a.name === 'Wild Shape')).toMatchObject({ econ: 'bonus', resId: 'wild', source: 'Class · Wild Shape' });
    expect(acts.find((a) => a.name === 'Healing Hands')!.dice).toBe('4d4');
  });
});

describe('extra damage', () => {
  const hmGrant: Grant = { id: 'g-hm', kind: 'xdmg', name: 'Hunter’s Mark', dice: '1d6', dtype: 'Force', on: 'the marked target', when: 'active', from: 'spell:sp4', srcKind: 'spell' };
  it('counts Hunter’s Mark only while concentrating on it', () => {
    const c = ilyra({ riders: [], grants: [...sampleCharacter().grants, hmGrant] });
    const on = extraDamage({ ...c, conc: { id: 'sp4', name: 'Hunter’s Mark' } });
    expect(on.map(extraText)).toContain('1d6 Force');
    expect(extraDamage(c).some((x) => x.name === 'Hunter’s Mark')).toBe(false);
  });
  it('reads dice at the level and says when they apply', () => {
    const sneak = grant({ id: 'gs', kind: 'xdmg', name: 'Sneak Attack', dice: '1:1d6,3:2d6,5:3d6', on: 'Finesse or Ranged hit', perTurn: true });
    const c = withGrants(ilyra(), sneak);
    const list = extraDamage(c);
    expect(list.find((x) => x.name === 'Sneak Attack')!.dice).toBe('3d6');
    expect(list.find((x) => x.name === 'Colossus Slayer')!.when).toMatch(/once per turn/);
    expect(list.find((x) => x.name === 'Critical hit')).toMatchObject({ manual: true, dice: 'Roll weapon dice twice' });
  });
  const A = (more: Partial<AddChoices> = {}): AddChoices => ({ picks: {}, counted: {}, links: {}, ...more });
  const E = (id: string) => cat.byId.get(id) as Entry;
  it('comes with Hunter’s Mark when Favored Enemy grants it', () => {
    const c = addFromCatalog(blankCharacter(), cat, E('feature/ranger/favored-enemy'), A());
    const hm = c.spells.find((x) => x.cid === 'spell/hunters-mark')!;
    expect(c.grants.filter((g) => g.kind === 'xdmg')).toEqual([expect.objectContaining({ from: 'spell:' + hm.id, dtype: 'Force', when: 'active' })]);
    const hand: Character = { ...blankCharacter(), spells: [{ id: 'h1', name: 'Hunter’s Mark', lvl: 1, time: 'Bonus Action', range: '90 feet', c: true }] };
    const linked = addFromCatalog(hand, cat, E('feature/ranger/favored-enemy'), A({ links: { g1: 'h1' } }));
    expect(linked.grants.filter((g) => g.kind === 'xdmg')).toEqual([expect.objectContaining({ from: 'spell:h1' })]);
    const picked = addFromCatalog(blankCharacter(), cat, E('spell/hunters-mark'), A());
    const twice = addFromCatalog(picked, cat, E('feature/ranger/favored-enemy'), A({ links: { g1: picked.spells[0].id } }));
    expect(twice.grants.filter((g) => g.kind === 'xdmg')).toHaveLength(1);
  });
});

describe('samples', () => {
  const bowOf = (c: Character) => weaponAttacks(c, c.inv.find((i) => i.id === 'i2')!)[0];
  it('Ilyra: numbers follow DEX and level', () => {
    const c = sampleCharacter();
    expect(bowOf({ ...c, abil: { ...c.abil, dex: 20 } }).hit).toBe(10);
    expect(bowOf({ ...c, level: 9 }).hit).toBe(10);
  });
});

describe('other weapons (plan 6)', () => {
  const bag: Item = { id: 'bag', name: 'Bag of Holding', qty: 1, eq: false, xdim: true, cap: 500 };
  it('lists weapons not in hand, equipped first, and none inside a container', () => {
    const c = { ...blankCharacter(), inv: [bag, dagger({ id: 'dg', eq: false }), shortsword({ id: 'sw', in: 'bag' }), longsword({ id: 'ls' }), longbow({ id: 'bow' })], hands: ['bow', 'bow'] };
    expect(otherWeapons(c).map((i) => i.id)).toEqual(['ls', 'dg']);
    expect(otherWeapons(takeOut(c, 'sw')).map((i) => i.id)).toEqual(['sw', 'ls', 'dg']);
  });
  it('leaves out a weapon with quantity 0', () => {
    const c = { ...blankCharacter(), inv: [dagger({ id: 'dg', qty: 0 }), longsword({ id: 'ls' })] };
    expect(otherWeapons(c).map((i) => i.id)).toEqual(['ls']);
  });
});

describe('critical hit range', () => {
  const crit = (id: string, val: string, p: Partial<Grant> = {}) => ({ id, kind: 'crit', name: 'Critical', val, ...p }) as Grant;
  const fighter = (grants: Grant[], p: Partial<Character> = {}): Character => ilyra({ grants, inv: [longsword({ id: 'ls' })], hands: ['ls'], ...p });
  const sword = (c: Character) => weaponAttacks(c, c.inv[0])[0];

  it('stays silent at the usual 20', () => {
    const c = fighter([]);
    expect(sword(c).crit).toBeUndefined();
    expect(unarmedStrike(c).crit).toBeUndefined();
  });
  it('shows on weapon attacks and Unarmed Strike (PHB p.96), and the lowest grant wins', () => {
    const c = fighter([crit('a', '19'), crit('b', '18')]);
    expect(sword(c).crit).toBe('Critical Hit on 18–20');
    expect(unarmedStrike(c).crit).toBe('Critical Hit on 18–20');
  });
  it('reaches the Light extra attack, built from a weapon attack', () => {
    const c = fighter([crit('a', '19')], { inv: [shortsword({ id: 's1' }), dagger({ id: 'd1' })], hands: ['s1', 'd1'] });
    expect(lightExtra(c)?.crit).toBe('Critical Hit on 19–20');
  });
  it('waits for the grant’s level and ignores a value below 2', () => {
    expect(sword(fighter([crit('a', '18', { minLvl: 15 })])).crit).toBeUndefined();
    expect(sword(fighter([crit('a', '0')])).crit).toBeUndefined();
  });
});

it('survives a spell named Constructor', () => {
  const sp = { id: 'x', name: 'Constructor', lvl: 1, time: 'Action', range: '30 ft', prep: true, fx: 'damage' as const, dmg: '1d6' };
  const c = { ...sampleCharacter(), spells: [sp] };
  expect(() => spellActions(c)).not.toThrow();
  expect(spellActions(c)[0].note).toBeUndefined();
});

describe('typed grant filters', () => {
  const sword = longsword({ id: 'w' });
  const c = (g: Grant): Character => ({ ...blankCharacter(), inv: [sword], hands: ['w'], feats: [{ id: 'f', g: 'feat', name: 'Feat', desc: '' }], grants: [{ ...g, from: 'feature:f' }] });
  it('matches a typed property', () => {
    const on = c({ id: 'g', kind: 'atkBonus', name: 'Bonus', val: '1', prop: 'Versatile', from: '' });
    expect(weaponAttacks(on, sword)[0].hit).toBe(weaponAttacks({ ...on, grants: [] }, sword)[0].hit + 1);
  });
  it('matches a typed Unarmed Strike', () => {
    const u = unarmedStrike(c({ id: 'g', kind: 'dmgBonus', name: 'Claws', val: '2', weapon: 'Unarmed Strike', from: '' }));
    expect(u.dmgParts.map((p) => p.label)).toContain('Claws');
  });
});

it('falls back to the normal die for a blank Versatile die', () => {
  const str16 = { ...blankCharacter(), abil: { ...blankCharacter().abil, str: 16 } };
  for (const vers of [undefined, '']) {
    const sword = longsword({ id: 'w', vers });
    expect(weaponAttacks({ ...str16, inv: [sword], hands: ['w', 'w'] }, sword).find((a) => a.use === 'two-handed')!.dmg).toBe('1d8+3');
  }
});

it('says 1 beam', () => {
  const sp: Spell = { id: 'e', name: 'Eldritch Blast', lvl: 0, time: 'Action', range: '120 ft', atk: 'ranged', fx: 'damage', dmg: '1d10', dtype: 'Force', scale: 'beams', cid: 'spell/eldritch-blast' };
  const dice = (level: number) => spellActions({ ...blankCharacter(), level, castAb: 'cha', spells: [sp] })[0].dice;
  expect(dice(1)).toBe('1 beam × 1d10');
  expect(dice(5)).toBe('2 beams × 1d10');
});

it('names a missing Proficiency Bonus', () => {
  const sword = longsword({ id: 'w' });
  const c: Character = { ...blankCharacter(), abil: { ...blankCharacter().abil, str: 16 }, inv: [sword], hands: ['w'] };
  const a = weaponAttacks(c, sword)[0];
  expect(a.hitParts).toContainEqual({ label: 'Proficiency Bonus', value: 0, note: 'no training' });
  expect(a.hit).toBe(3);
  const trained = weaponAttacks({ ...c, profs: [{ id: 'p', cat: 'weapon', name: 'Martial weapons' }] }, sword)[0];
  expect(trained.hitParts).toContainEqual({ label: 'Proficiency Bonus', value: 2 });
});

describe('pinned rules', () => {
  it('reach is 10 ft', () => {
    const glaive = catItem('item/glaive'), sword = longsword({ id: 'w' });
    const c: Character = { ...blankCharacter(), inv: [glaive, sword] };
    expect(weaponAttacks(c, glaive)[0].range).toBe('Melee 10 ft');
    expect(weaponAttacks(c, sword)[0].range).toBe('Melee 5 ft');
  });
  it('ranged bonuses skip Unarmed Strike', () => {
    const c: Character = { ...blankCharacter(), feats: [{ id: 'f', g: 'feat', name: 'Feat', desc: '' }],
      grants: [{ id: 'g', kind: 'atkBonus', name: 'Far', val: '2', weapon: 'unarmed-strike', amode: 'ranged', from: 'feature:f' }] };
    expect(unarmedStrike(c).hitParts.map((p) => p.label)).not.toContain('Far');
  });
  it('the Light extra attack keeps a negative modifier', () => {
    const at = (str: number): Character => ({ ...blankCharacter(), abil: { ...blankCharacter().abil, str, dex: 8 }, inv: [dagger({ id: 'a' }), dagger({ id: 'b' })], hands: ['a', 'b'] });
    expect(lightExtra(at(8))!.dmg).toBe('1d4−1');
    expect(lightExtra(at(16))!.dmg).toBe('1d4');
  });
  it('the third cantrip tier starts at 11', () => {
    expect(cantripDice('1d10', 10)).toBe('2d10');
    expect(cantripDice('1d10', 11)).toBe('3d10');
  });
});

describe('spell row notes (catalog audit)', () => {
  it('says when a spell’s damage comes, on rows that would read as damage on casting', () => {
    const row = (cid: string) => spellActions({ ...sampleCharacter(), spells: [{ id: 'x', name: 'X', cid, lvl: 1, time: 'Bonus Action', range: 'Self', prep: true, fx: 'damage', dmg: '1d6' }] as Character['spells'] })[0].note;
    expect(row('spell/hex')).toBe('Extra damage on your hits while it lasts');
    expect(row('spell/divine-favor')).toBe('Extra damage on your hits while it lasts');
    for (const s of ['banishing', 'blinding', 'divine', 'searing', 'shining', 'staggering', 'thunderous', 'wrathful'])
      expect(row(`spell/${s}-smite`)).toBe('Cast after a hit: the damage comes with that hit');
  });
});

describe('a feature row that spends another feature\'s counter', () => {
  const cd = 'feature/cleric/channel-divinity';
  const c = (feats: Character['feats']): Character => ({
    ...blankCharacter(), feats,
    res: [{ id: 'r1', name: 'Channel Divinity', count: 2, max: 2, recharge: 'short', from: 'feature:a' }],
    grants: [{ id: 'x', kind: 'action', name: 'Preserve Life', econ: 'action', uses: cd, from: 'feature:b' }]
  });
  const a = { id: 'a', g: 'class' as const, name: 'Channel Divinity', desc: '', cid: cd }, b = { id: 'b', g: 'sub' as const, name: 'Life', desc: '' };
  it('shows the counter of the feature it names', () => expect(featureActions(c([a, b]))[0].resId).toBe('r1'));
  it('shows no counter, and throws nothing, when the sheet lacks that feature', () => expect(featureActions(c([b]))[0].resId).toBeUndefined());
  it('resOfFeature finds the first resource of that feature', () => {
    expect(resOfFeature(c([a, b]), cd)?.id).toBe('r1');
    expect(resOfFeature(c([b]), cd)).toBeUndefined();
  });
  it('carries a regain amount, a Value or all', () => {
    const sheet = { ...c([a, b]), level: 5, grants: [
      { id: 'x', kind: 'action' as const, name: 'R', econ: 'free' as const, uses: cd, regainTo: '2', from: 'feature:b' },
      { id: 'y', kind: 'action' as const, name: 'S', econ: 'free' as const, uses: cd, regainTo: 'all', from: 'feature:b' }] };
    expect(featureActions(sheet).map((f) => f.regainTo)).toEqual([2, 'all']);
  });
});
