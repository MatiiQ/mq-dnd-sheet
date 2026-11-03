import { describe, expect, it } from 'vitest';
import { blankCharacter, druidSample, sampleCharacter } from './defaults';
import { ammoType, canLoad, equipShield, putAway, putInHand, setHands, trimHands, weaponKind, weaponMatches, weaponsHeld } from './hands';
import { removeRef, normalize } from './logic';
import { migrate } from './migrate';
import { applyPatch } from './storage';
import { dagger, longbow, longsword, quarterstaff, shield, shortsword } from './test-fixtures';
import type { Character, Item } from './types';

const make = (inv: Item[], hands: string[] = [], p: Partial<Character> = {}): Character => ({ ...blankCharacter(), inv, hands, ...p });
const qty = (c: Character, id: string, n: number) => applyPatch(c, (s) => ({ inv: s.inv.map((i) => (i.id === id ? { ...i, qty: n } : i)) }));
const raw = (c: Character) => JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
// Seren with Shillelagh switched on and the Quarterstaff (i3) in one hand; her Shield (i2) taken off unless asked.
const seren = (p: Partial<Character> = {}, shieldOn = false): Character => {
  const c = druidSample();
  return { ...c, inv: c.inv.map((i) => (i.id === 'i2' ? { ...i, eq: shieldOn } : i)), hands: ['i3'], effectsOn: ['spell:ds3'], restMsg: null, ...p };
};
const ended = { title: 'Shillelagh ended', body: 'You let go of the Quarterstaff.' };

describe('weapons in hand', () => {
  it('keeps a Two-Handed weapon with quantity 1 in both hands through normalize', () => {
    const c = make([longbow({ id: 'bow' })], ['bow', 'bow']);
    expect(normalize(c).hands).toEqual(['bow', 'bow']);
    expect(weaponsHeld(c)).toEqual([{ id: 'bow', two: true }]);
  });

  it('returns the same character when hands are already valid', () => {
    const c = make([dagger({ id: 'd', qty: 2 })], ['d', 'd']);
    expect(normalize(c)).toBe(c);
  });

  it('drops a Dagger from hand when one of a pair held in both hands is thrown', () => {
    const c = make([dagger({ id: 'd', qty: 2 })], ['d', 'd']);
    expect(weaponsHeld(c)).toEqual([{ id: 'd', two: false }, { id: 'd', two: false }]);
    expect(qty(c, 'd', 1).hands).toEqual(['d']);
    expect(qty(c, 'd', 0).hands).toEqual([]);
  });

  it('takes the second Dagger of a pair in the other hand', () => {
    let c = make([dagger({ id: 'd', qty: 2 })]);
    c = putInHand(c, 'd').c;
    expect(c.hands).toEqual(['d']);
    const r = putInHand(c, 'd');
    expect(r.c.hands).toEqual(['d', 'd']);
    expect(r.away).toEqual([]);
    const one = putInHand(putInHand(make([dagger({ id: 'd' })]), 'd').c, 'd');
    expect(one.c.hands).toEqual(['d']);
    // Versatile: taking it again re-takes it, never a second one-handed copy.
    const qs = make([quarterstaff({ id: 'qs', qty: 2 })], ['qs']);
    expect(putInHand(qs, 'qs').c.hands).toEqual(['qs']);
  });

  it('puts a Two-Handed weapon away whole to make room', () => {
    const r = putInHand(make([longbow({ id: 'bow' }), shortsword({ id: 'ss' })], ['bow', 'bow']), 'ss');
    expect(r.c.hands).toEqual(['ss']);
    expect(r.away).toEqual(['Longbow']);
  });

  it('equips a carried weapon taken in hand', () => {
    const r = putInHand(make([shortsword({ id: 'ss', eq: false })]), 'ss');
    expect(r.c.hands).toEqual(['ss']);
    expect(r.c.inv[0].eq).toBe(true);
  });

  it('switches a Versatile weapon between one and two hands', () => {
    const c = make([quarterstaff({ id: 'qs' })], ['qs']);
    const two = putInHand(c, 'qs', true).c;
    expect(two.hands).toEqual(['qs', 'qs']);
    expect(weaponsHeld(two)).toEqual([{ id: 'qs', two: true }]);
    expect(putInHand(two, 'qs', false).c.hands).toEqual(['qs']);
  });

  it('refuses two hands while a Shield is equipped', () => {
    const c = make([longbow({ id: 'bow' }), shield({ id: 'sh' })]);
    const r = putInHand(c, 'bow');
    expect(r.blocked).toBe('shield');
    expect(r.c).toBe(c);
    expect(r.away).toEqual([]);
    const s = seren({}, true);
    const q = putInHand(s, 'i3', true);
    expect(q.blocked).toBe('shield');
    expect(q.c.hands).toEqual(['i3']);
    expect(q.c.effectsOn).toEqual(['spell:ds3']);
    expect(q.c.restMsg).toBeNull();
  });

  it('trims hands when a Shield is equipped, oldest weapon first', () => {
    const daggers = equipShield(make([dagger({ id: 'd', qty: 2 }), shield({ id: 'sh', eq: false })], ['d', 'd']), 'sh');
    expect(daggers.c.hands).toEqual(['d']);
    expect(daggers.away).toEqual(['Dagger']);
    expect(daggers.c.inv[1].eq).toBe(true);
    const bow = equipShield(make([longbow({ id: 'bow' }), shield({ id: 'sh', eq: false })], ['bow', 'bow']), 'sh');
    expect(bow.c.hands).toEqual([]);
    expect(bow.away).toEqual(['Longbow']);
  });

  it('validates hands on load', () => {
    const c = make([longbow({ id: 'bow' }), shortsword({ id: 'ss', eq: false }), dagger({ id: 'd' })]);
    expect(migrate(raw({ ...c, hands: ['bow'] })).hands).toEqual([]);
    expect(migrate(raw({ ...c, hands: ['nope', 'd'] })).hands).toEqual(['d']);
    expect(migrate(raw({ ...c, hands: ['ss'] })).hands).toEqual([]);
    const { hands: _h, ...noHands } = raw({ ...sampleCharacter(), hands: ['i3'] });
    expect(migrate(noHands).hands).toEqual([]);
  });
});

describe('letting go ends Shillelagh (PHB p.316)', () => {
  it('ends on every path that lets go of the Quarterstaff', () => {
    const paths: [string, (c: Character) => Character][] = [
      ['put away', (c) => putAway(c, 'i3')],
      ['unequip', (c) => applyPatch(c, (s) => ({ inv: s.inv.map((i) => (i.id === 'i3' ? { ...i, eq: false } : i)) }))],
      ['remove', (c) => removeRef(c, { kind: 'item', id: 'i3' })],
      ['quantity 0', (c) => qty(c, 'i3', 0)]
    ];
    for (const [name, go] of paths) {
      const out = go(seren());
      expect(out.effectsOn, name).toEqual([]);
      expect(out.restMsg, name).toEqual(ended);
    }
  });

  it('stays on when a Shield moves the Quarterstaff to one hand', () => {
    const out = equipShield(putInHand(seren(), 'i3', true).c, 'i2').c;
    expect(out.effectsOn).toEqual(['spell:ds3']);
    expect(out.hands).toEqual(['i3']);
  });

  it('stays on with nothing in hand', () => {
    const c = seren({ hands: [] });
    expect(normalize(c).effectsOn).toEqual(['spell:ds3']);
    expect(setHands(c, []).effectsOn).toEqual(['spell:ds3']);
  });

  it('adds a line to a rest summary that is still shown', () => {
    const out = putAway(seren({ restMsg: { title: 'Short Rest', body: 'Refilled: Wild Shape +1.' } }), 'i3');
    expect(out.restMsg).toEqual({ title: 'Short Rest', body: 'Refilled: Wild Shape +1.\nShillelagh ended: You let go of the Quarterstaff.' });
  });
});

describe('weapon kinds', () => {
  it('reads the kind from the catalog id or the name', () => {
    expect(weaponKind(longbow({ id: 'x' }))).toBe('longbow');
    expect(weaponKind({ id: 'x', name: 'Dagger of Venom', qty: 1, eq: true, cid: 'item/dagger-of-venom', base: 'item/dagger' })).toBe('dagger');
    expect(weaponKind({ id: 'x', name: 'Longsword +1', qty: 1, eq: true })).toBe('longsword');
    expect(weaponKind({ id: 'x', name: '+1 Longsword', qty: 1, eq: true })).toBe('longsword');
  });
  it('matches kinds and categories', () => {
    expect(weaponMatches(quarterstaff({ id: 'x' }), 'club,quarterstaff')).toBe(true);
    expect(weaponMatches(quarterstaff({ id: 'x' }), 'simple-melee')).toBe(true);
    expect(weaponMatches(shortsword({ id: 'x' }), 'martial-melee-light')).toBe(true);
    expect(weaponMatches(longsword({ id: 'x' }), 'martial-melee-light')).toBe(false);
    expect(weaponMatches(longbow({ id: 'x' }), 'simple-melee')).toBe(false);
  });
});

describe('a typed Unarmed Strike', () => {
  const attacks = [
    { id: 'u', name: ' unarmed strike ', hit: '+4', dmg: '2 Bludgeoning', info: 'or Grapple / Shove (DC 12)', mastery: '' },
    { id: 'b', name: 'Longbow', hit: '+9', dmg: '1d8 +4 Piercing', info: '', mastery: '' }
  ];
  it('stays as typed', () => {
    expect(migrate(raw({ ...sampleCharacter(), attacks, hands: [] })).attacks).toEqual(attacks);
  });
  it('is not on the samples', () => {
    for (const c of [sampleCharacter(), druidSample()]) expect(c.attacks.some((a) => a.name === 'Unarmed Strike')).toBe(false);
  });
});

describe('items inside a container (plan 6)', () => {
  const bag: Item = { id: 'bag', name: 'Bag of Holding', qty: 1, eq: false, xdim: true, cap: 500 };
  it('drops a weapon inside the bag even when it is marked equipped', () => {
    const c = make([bag, shortsword({ id: 'sw', in: 'bag' })], ['sw']);
    expect(trimHands(c, ['sw'])).toEqual([]);
  });

  it('a Shield inside the bag takes no hand', () => {
    const c = make([bag, shield({ id: 'sh', in: 'bag' }), longbow({ id: 'bow' })], ['bow', 'bow']);
    expect(trimHands(c, ['bow', 'bow'])).toEqual(['bow', 'bow']);
  });
});

describe('ammunition types (plan 7, Task 9b)', () => {
  // A weapon's ammunition type is the part of its Ammunition field after ';' (PHB p.213: "Ammo type listed with the range").
  const arrows: Item = { id: 'ar', name: 'Arrows', qty: 20, eq: false, cat: 'ammo', cid: 'item/arrows' };
  const arrows1: Item = { id: 'a1', name: 'Arrows +1', qty: 20, eq: false, cat: 'magic', cid: 'item/ammunition-1-2-or-3', base: 'item/arrows', magic: 1 };
  const bolts: Item = { id: 'bo', name: 'Bolts', qty: 20, eq: false, cat: 'ammo', cid: 'item/bolts' };
  const firearm: Item = { id: 'fb', name: 'Firearm Bullets', qty: 10, eq: false, cat: 'ammo', cid: 'item/firearm-bullets' };
  const typed: Item = { id: 'ty', name: 'Arrows', qty: 20, eq: false, cat: 'gear' };
  it('reads a weapon’s type from its ammo field and an ammunition item’s from its catalog id or base', () => {
    expect([ammoType(longbow({ id: 'lb' })), ammoType(arrows), ammoType(arrows1), ammoType(bolts), ammoType(firearm), ammoType(typed)]).toEqual(['arrow', 'arrow', 'arrow', 'bolt', 'firearm', '']);
  });
  it('keeps a weapon’s load only while it names ammunition in the inventory, out of any container, that fits', () => {
    const bag: Item = { id: 'bag', name: 'Bag of Holding', qty: 1, eq: false, xdim: true, cap: 500 };
    const c = make([{ ...longbow({ id: 'lb' }), load: 'a1' }, arrows1, arrows, bag, bolts]);
    expect(normalize(c).inv[0].load).toBe('a1');
    expect(migrate(raw(c)).inv[0].load).toBe('a1');
    expect(removeRef(c, { kind: 'item', id: 'a1' }).inv[0].load).toBeUndefined();
    expect(normalize({ ...c, inv: c.inv.map((i) => (i.id === 'a1' ? { ...i, in: 'bag' } : i)) }).inv[0].load).toBeUndefined();
    expect(normalize({ ...c, inv: c.inv.map((i, k) => (k === 0 ? { ...i, load: 'bo' } : i)) }).inv[0].load).toBeUndefined();
    expect(normalize({ ...c, inv: c.inv.map((i, k) => (k === 0 ? { ...i, load: 'nope' } : i)) }).inv[0].load).toBeUndefined();
    // An edit that takes the Ammunition property off clears it; one that keeps it keeps the load.
    expect(normalize({ ...c, inv: c.inv.map((i, k) => (k === 0 ? { ...i, props: 'heavy,two-handed' } : i)) }).inv[0].load).toBeUndefined();
    expect(normalize({ ...c, inv: c.inv.map((i, k) => (k === 0 ? { ...i, name: 'My Bow' } : i)) }).inv[0].load).toBe('a1');
  });
  it('loads only ammunition of the weapon’s type into a weapon with the Ammunition property', () => {
    expect([canLoad(longbow({ id: 'lb' }), arrows), canLoad(longbow({ id: 'lb' }), arrows1), canLoad(longbow({ id: 'lb' }), bolts), canLoad(longbow({ id: 'lb' }), typed), canLoad(longbow({ id: 'lb' }), firearm)]).toEqual([true, true, false, false, false]);
    expect(canLoad(longsword({ id: 'ls' }), arrows)).toBe(false);
    expect(canLoad({ ...longbow({ id: 'lb' }), props: 'heavy,two-handed' }, arrows)).toBe(false);
  });
});

it('matches typed weapon names', () => {
  const sword = longsword({ id: 'a' }), xbow: Item = { id: 'x', name: 'Hand Crossbow', qty: 1, eq: true, cat: 'weapon', cid: 'item/hand-crossbow', wcat: 'martial', wrange: 'ranged' };
  expect(weaponMatches(sword, 'Longsword')).toBe(true);
  expect(weaponMatches(xbow, 'hand crossbow')).toBe(true);
  expect(weaponMatches(sword, 'Martial Melee')).toBe(true);
  expect(weaponMatches(longbow({ id: 'b' }), 'Longsword')).toBe(false);
});

describe('firearms', () => {
  const gun = (cid: string, ammo: string): Item => ({ id: 'g', name: cid, qty: 1, eq: true, cat: 'weapon', cid, props: 'ammunition,loading', ammo });
  const fire: Item = { id: 'fb', name: 'Firearm Bullets', qty: 10, eq: false, cat: 'ammo', cid: 'item/firearm-bullets' };
  const slingB: Item = { id: 'sb', name: 'Sling Bullets', qty: 10, eq: false, cat: 'ammo', cid: 'item/sling-bullets' };
  const plus: Item = { id: 'pb', name: 'Ammunition +1', qty: 5, eq: false, cat: 'ammo', cid: 'item/ammunition-1-2-or-3', base: 'item/firearm-bullets' };
  it('loads firearms with Firearm Bullets only', () => {
    for (const g of [gun('item/musket', '40/120;bullet'), gun('item/pistol', '30/90;bullet')]) {
      expect(canLoad(g, fire)).toBe(true);
      expect(canLoad(g, slingB)).toBe(false);
      expect(canLoad(g, plus)).toBe(true);
    }
    const sling = gun('item/sling', '30/120;bullet');
    expect(canLoad(sling, fire)).toBe(false);
    expect(canLoad(sling, slingB)).toBe(true);
  });
});

it('moves a Versatile weapon to one hand for a Shield', () => {
  const c: Character = { ...blankCharacter(), inv: [quarterstaff({ id: 'q' }), shield({ id: 's', eq: false })], hands: ['q', 'q'] };
  const r = equipShield(c, 's');
  expect(r.c.hands).toEqual(['q']);
  expect(r.away).toEqual([]);
  const bow: Character = { ...blankCharacter(), inv: [longbow({ id: 'b' }), shield({ id: 's', eq: false })], hands: ['b', 'b'] };
  expect(equipShield(bow, 's').c.hands).toEqual([]);
});

describe('pinned rules', () => {
  it('a weapon isn’t ammunition', () => {
    const short: Item = { ...longbow({ id: 's' }), name: 'Shortbow', cid: 'item/shortbow', ammo: '80/320;arrow' };
    expect(canLoad(longbow({ id: 'b' }), short)).toBe(false);
  });
  it('quantity 0 leaves the hand', () => {
    const c = (qty: number): Character => ({ ...blankCharacter(), inv: [dagger({ id: 'd', qty })] });
    expect(trimHands(c(0), ['d'])).toEqual([]);
    expect(trimHands(c(1), ['d'])).toEqual(['d']);
  });
});
