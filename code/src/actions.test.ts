import { describe, expect, it } from 'vitest';
import srdEntries from './data/srd/index';
import { mergeCatalog } from './catalog/merge';
import type { Entry, ItemEntry, SpellEntry } from './catalog/schema';
import { addFromCatalog, itemFromEntry, spellFromEntry, type AddChoices } from './catalog/copy';
import { blankCharacter, druidSample, sampleCharacter } from './defaults';
import { attacksPerAction, cantripDice, econOf, extraDamage, extraText, featureActions, hasMastery, lightExtra, masterySlots, otherWeapons, spellActions, unarmedStrike, weaponAbility, weaponAttacks, weaponProficient, type Use } from './actions';
import { weaponKind } from './hands';
import { takeOut } from './inventory';
import { addGrants, migrate, normalize } from './logic';
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
  it('Ilyra: Longbow with Archery, two attacks, Unarmed Strike, no typed attacks', () => {
    const c = sampleCharacter();
    expect(c.hands).toEqual(['i2', 'i2']);
    expect(bowOf(c)).toMatchObject({ hit: 9, dmg: '1d8+4', held: true, mastery: 'slow' });
    expect(bowOf(c).hitParts).toContainEqual({ label: 'Archery', value: 2 });
    expect(attacksPerAction(c)).toBe(2);
    expect(unarmedStrike(c).name).toBe('Unarmed Strike');
    expect(c.attacks).toEqual([]);
    expect(c.riders.map((r) => r.name)).toEqual(['Critical hit']);
  });
  it('Ilyra: Hunter’s Mark only while concentrating; Hail of Thorns and Cure Wounds', () => {
    const c = sampleCharacter();
    expect(extraDamage(c).some((x) => x.name === 'Hunter’s Mark')).toBe(false);
    expect(extraDamage({ ...c, conc: { id: 'sp4', name: 'Hunter’s Mark' } }).map(extraText)).toContain('1d6 Force');
    expect(spellActions(c).find((a) => a.name === 'Hail of Thorns')).toMatchObject({ group: 'save', dc: 13, dice: '1d10', dtype: 'Piercing' });
    expect(spellActions(c).find((a) => a.name === 'Cure Wounds')!.dice).toBe('2d8 + WIS (+2)');
    const withDagger = { ...c, inv: [...c.inv, dagger({ id: 'dg' })] };
    const thrown = weaponAttacks(withDagger, withDagger.inv.find((i) => i.id === 'dg')!).find((a) => a.use === 'thrown')!;
    expect(thrown.hitParts.some((p) => p.label === 'Archery')).toBe(false);
  });
  it('Ilyra: numbers follow DEX and level', () => {
    const c = sampleCharacter();
    expect(bowOf({ ...c, abil: { ...c.abil, dex: 20 } }).hit).toBe(10);
    expect(bowOf({ ...c, level: 9 }).hit).toBe(10);
  });
  it('Seren: Shillelagh, Unarmed Strike, Thorn Whip, Produce Flame, Healing Word', () => {
    const c = druidSample();
    const qs = c.inv.find((i) => i.id === 'i3')!;
    expect(c.hands).toEqual(['i3']);
    expect(c.effectsOn).toEqual([]);
    expect(weaponAttacks(c, qs)[0]).toMatchObject({ hit: 3, dmg: '1d6−1' });
    expect(weaponAttacks({ ...c, effectsOn: ['spell:ds3'] }, qs)[0]).toMatchObject({ hit: 9, dmg: '1d12+5' });
    const spells = spellActions(c);
    expect(spells.find((a) => a.name === 'Shillelagh')).toMatchObject({ effect: true });
    expect(unarmedStrike(c).name).toBe('Unarmed Strike');
    expect(spells.find((a) => a.name === 'Thorn Whip')).toMatchObject({ group: 'damage', hit: 9, dice: '3d6', dtype: 'Piercing' });
    expect(spells.find((a) => a.name === 'Produce Flame')).toMatchObject({ dice: '3d8', econ: 'action' });
    expect(spells.find((a) => a.name === 'Healing Word')!.dice).toBe('2d4 + WIS (+5)');
    expect(c.attacks).toEqual([expect.objectContaining({ name: 'Starry Form · Archer', econ: 'bonus', group: 'other' })]);
    expect(c.riders.map((r) => r.id)).toEqual(['r2', 'r3']);
  });
});

describe('other weapons (plan 6)', () => {
  const bag: Item = { id: 'bag', name: 'Bag of Holding', qty: 1, eq: false, xdim: true, cap: 500 };
  it('lists weapons not in hand, equipped first, and none inside a container', () => {
    const c = { ...blankCharacter(), inv: [bag, dagger({ id: 'dg', eq: false }), shortsword({ id: 'sw', in: 'bag' }), longsword({ id: 'ls' }), longbow({ id: 'bow' })], hands: ['bow', 'bow'] };
    expect(otherWeapons(c).map((i) => i.id)).toEqual(['ls', 'dg']);
    expect(otherWeapons(takeOut(c, 'sw')).map((i) => i.id)).toEqual(['sw', 'ls', 'dg']);
  });
});
