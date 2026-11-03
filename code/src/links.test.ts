import { describe, expect, it } from 'vitest';
import { sampleCharacter } from './defaults';
import { activeGrants, fixLinks, hasActiveEffect, inactiveReason, isActive, parseLink, sourceLabel, wouldLoop } from './links';
import { castSpell, effectsAfterEdit, longRest, toggleEffect } from './logic';
import { migrate } from './migrate';
import type { Character, Feature, Grant, Item } from './types';

const make = (p: Partial<Character> = {}): Character => ({ ...sampleCharacter(), ...p });
const feat = (id: string, from?: string): Feature => ({ id, g: 'other', name: id.toUpperCase(), desc: '', ...(from ? { from } : {}) });

describe('links', () => {
  it('parses a link to a feature, item or spell, and nothing else', () => {
    expect(parseLink('feature:f2')).toEqual({ kind: 'feature', id: 'f2' });
    expect(parseLink('item:i9')).toEqual({ kind: 'item', id: 'i9' });
    expect(parseLink('spell:sp4')).toEqual({ kind: 'spell', id: 'sp4' });
    expect([parseLink('res:x'), parseLink('feature:'), parseLink(3), parseLink(undefined)]).toEqual([null, null, null, null]);
  });

  it('labels a source by its link, else by srcKind and srcName', () => {
    const c = make();
    expect(sourceLabel(c, { from: 'feature:f11' })).toBe('Species · Darkvision');
    expect(sourceLabel(c, { from: 'item:i9' })).toBe('Item · Cloak of Elvenkind');
    expect(sourceLabel(c, { from: 'spell:sp4' })).toBe('Spell · Hunter’s Mark');
    expect(sourceLabel(c, { srcKind: 'species', srcName: 'Wood Elf' })).toBe('Species · Wood Elf');
    expect(sourceLabel(c, { srcName: 'Wood Elf' })).toBe('Wood Elf');
    expect(sourceLabel(c, {})).toBeUndefined();
  });

  it('finds a link that would close a loop, and stops on loops already there', () => {
    const c = make({ feats: [feat('A'), feat('B', 'feature:A'), feat('X')] });
    expect(wouldLoop(c, 'feature:A', 'feature:B')).toBe(true);
    expect(wouldLoop(c, 'feature:A', 'feature:A')).toBe(true);
    expect(wouldLoop(c, 'feature:A', 'feature:X')).toBe(false);
    const ring = make({ feats: [feat('A', 'feature:C'), feat('B', 'feature:A'), feat('C', 'feature:B'), feat('X')] });
    expect(wouldLoop(ring, 'feature:X', 'feature:A')).toBe(false);
  });

  it('repairs dangling links, loops and self-links, keeping the source text', () => {
    const dangling = fixLinks(make({ senses: [{ id: 's', name: 'Darkvision', range: '60 ft', from: 'feature:gone', srcKind: 'species', srcName: 'Elf' }] }));
    expect(dangling.senses[0]).toEqual({ id: 's', name: 'Darkvision', range: '60 ft', srcKind: 'species', srcName: 'Elf' });
    const loop = fixLinks(make({ feats: [feat('A', 'feature:B'), feat('B', 'feature:A')] }));
    expect(loop.feats.map((x) => x.from)).toEqual([undefined, 'feature:A']);
    expect(fixLinks(loop)).toEqual(loop);
    expect(fixLinks(make({ feats: [feat('A', 'feature:A')] })).feats[0].from).toBeUndefined();
    const ok = make({ feats: [feat('A'), feat('B', 'feature:A')] });
    expect(fixLinks(ok).feats).toEqual(ok.feats);
  });

  it('drops the fields that need a link when a link goes, once', () => {
    const raw = { ...sampleCharacter(), senses: [{ id: 's', name: 'Darkvision', range: '60 ft', from: 'item:gone', needEq: true, when: 'active' }] };
    const once = migrate(raw);
    expect(once.senses[0]).toEqual({ id: 's', name: 'Darkvision', range: '60 ft' });
    expect(migrate(once)).toEqual(once);
  });

  it('checks link fields on load: unknown kinds read Other, bad values go, a spell level is never a gate', () => {
    const c = migrate({ ...sampleCharacter(), senses: [{ id: 's', name: 'Blindsight', range: '10 ft', srcKind: 'race', when: 'always', minLvl: 0, needEq: 'yes' },
      { id: 't', name: 'Tremorsense', range: '5 ft', minLvl: 3, when: 'noHeavy' }] });
    expect(c.senses[0]).toEqual({ id: 's', name: 'Blindsight', range: '10 ft', srcKind: 'other' });
    expect(c.senses[1]).toMatchObject({ minLvl: 3, when: 'noHeavy' });
    const cantrip = migrate(sampleCharacter()).spells.find((x) => x.id === 'sp1')!;
    expect(cantrip.lvl).toBe(0);
    expect(cantrip.minLvl).toBeUndefined();
  });
});

describe('when a grant counts', () => {
  const ring: Item = { id: 'r', name: 'Ring of Protection', qty: 1, eq: false };
  const mail: Item = { id: 'm', name: 'Chain Mail', qty: 1, eq: true, armor: 'heavy', acBase: 16 };
  const acRing: Grant = { id: 'g1', kind: 'ac', name: '+1 AC', acMode: 'bonus', val: '1', from: 'item:r', needEq: true, needAtt: true };
  const base = (p: Partial<Character> = {}) => make({ inv: [ring], attuneIds: ['', '', ''], grants: [], effectsOn: [], ...p });
  it('checks equipped, then attuned, for an item grant', () => {
    expect(inactiveReason(base(), acRing)).toBe('not equipped');
    const worn = { ...ring, eq: true };
    expect(inactiveReason(base({ inv: [worn] }), acRing)).toBe('not attuned');
    expect(inactiveReason(base({ inv: [worn], attuneIds: ['r', '', ''] }), acRing)).toBeNull();
  });
  it('checks the character level, and armor and Shield conditions, on hand entries too', () => {
    expect(inactiveReason(base({ level: 2 }), { minLvl: 3 })).toBe('from level 3');
    expect(inactiveReason(base({ level: 3 }), { minLvl: 3 })).toBeNull();
    expect(inactiveReason(base({ inv: [mail] }), { when: 'noHeavy' })).toBe('not with Heavy armor');
    expect(inactiveReason(base({ inv: [{ ...mail, eq: false }] }), { when: 'noHeavy' })).toBeNull();
    expect(inactiveReason(base(), { when: 'armor' })).toBe('needs armor');
    const shield: Item = { id: 's', name: 'Shield', qty: 1, eq: true, armor: 'shield', acBase: 2 };
    expect(inactiveReason(base({ inv: [shield] }), { when: 'noShield' })).toBe('not with a Shield');
    expect(inactiveReason(base({ inv: [shield] }), { when: 'noArmorNoShield' })).toBe('not with armor or a Shield');
    expect(inactiveReason(base({ inv: [mail] }), { when: 'noArmor' })).toBe('not with armor');
  });
  it('a grant that needs its source switched on counts once toggleEffect adds it', () => {
    const g: Grant = { id: 'g', kind: 'abil', name: 'x', ab: 'str', val: '2', cap: 20, from: 'feature:f2', when: 'active' };
    const c = base({ grants: [g] });
    expect(inactiveReason(c, g)).toBe('not switched on');
    expect(hasActiveEffect(c, 'feature:f2')).toBe(true);
    expect(inactiveReason({ ...c, ...toggleEffect(c, 'feature:f2') }, g)).toBeNull();
  });
  it('a Concentration spell\'s effect is on exactly while concentrating on it', () => {
    const g: Grant = { id: 'g', kind: 'speed', name: 'x', mode: 'walk', val: '10', from: 'spell:sp4', when: 'active' };
    expect(isActive(base({ grants: [g], conc: null }), g)).toBe(false);
    expect(isActive(base({ grants: [g], conc: { id: 'sp4', name: 'Hunter’s Mark' }, effectsOn: [] }), g)).toBe(true);
  });
  it('an entry is inactive when its source is, through a chain', () => {
    const c0 = base();
    const c = { ...c0, spells: [...c0.spells, { id: 'zz', name: 'Gift', lvl: 1, time: 'Action', range: 'Self', from: 'item:r', needEq: true }],
      senses: [{ id: 'x', name: 'Truesight', range: '30 ft', from: 'spell:zz' }] };
    expect(inactiveReason(c, c.senses[0])).toBe('not equipped');
  });
  it('a spell level is not a gate', () => {
    const c = base({ level: 1, spells: [{ id: 'a', name: 'Aid', lvl: 2, time: 'Action', range: '30 ft' }] });
    expect(isActive(c, c.spells[0])).toBe(true);
  });
  it('lists the active grants of a kind, counted ones only when asked', () => {
    const a: Grant = { id: 'a', kind: 'abil', name: 'a', ab: 'dex', val: '2', cap: 20, from: 'feature:f10', counted: true };
    const b: Grant = { id: 'b', kind: 'abil', name: 'b', ab: 'dex', val: '1', cap: 20, from: 'feature:f10' };
    const c = base({ grants: [a, b, acRing] });
    expect(activeGrants(c, 'abil').map((g) => g.id)).toEqual(['b']);
    expect(activeGrants(c, 'abil', true).map((g) => g.id)).toEqual(['a', 'b']);
    expect(activeGrants(c, 'ac')).toEqual([]);
  });
});

describe('grants and effects on load', () => {
  const abil = { id: 'g', kind: 'abil', name: 'ASI', ab: 'dex', val: '2', cap: 20 };
  it('gives a save without grants or effects the blank values', () => {
    const { grants: _g, effectsOn: _e, ...raw } = sampleCharacter();
    expect(migrate(raw)).toMatchObject({ grants: [], effectsOn: [] });
  });
  it('keeps a valid grant and drops a broken or unlinked one', () => {
    const ok = { ...abil, from: 'feature:f10', srcKind: 'feat', counted: true };
    const c = migrate({ ...sampleCharacter(), grants: [ok, { ...abil, id: 'h', from: 'feature:f10', cap: 21 }, { ...abil, id: 'i', from: 'feature:gone' },
      { ...abil, id: 'j', from: 'junk' }, { ...abil, id: 'k' }] });
    expect(c.grants).toEqual([ok]);
  });
  it('keeps effect links that parse, once, to something there, and never a Concentration spell', () => {
    const c = migrate({ ...sampleCharacter(), effectsOn: ['feature:f2', 'feature:f2', 'item:i9', 'feature:gone', 'junk', 7, 'spell:sp4', 'spell:sp3'] });
    expect(c.effectsOn).toEqual(['feature:f2', 'item:i9', 'spell:sp3']);
  });
  it('drops the link-only fields from an entry without a from', () => {
    const c = migrate({ ...sampleCharacter(), senses: [{ id: 's', name: 'Blindsight', range: '10 ft', needEq: true, when: 'active' }] });
    expect(c.senses[0]).toEqual({ id: 's', name: 'Blindsight', range: '10 ft' });
  });
});

describe('switching effects', () => {
  const g: Grant = { id: 'g', kind: 'speed', name: 'x', mode: 'walk', val: '10', from: 'spell:s1', when: 'active' };
  const spell = { id: 's1', name: 'Longstrider', lvl: 1, time: 'Action', range: 'Touch' };
  const c = make({ spells: [spell], grants: [g], effectsOn: [], slotMax: [0, 4, 0, 0, 0, 0, 0, 0, 0, 0], slotUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
  it('a Long Rest switches every effect off', () => {
    expect(longRest(make({ effectsOn: ['feature:f2'] })).effectsOn).toEqual([]);
  });
  it('casting a non-Concentration spell with an effect switches it on once', () => {
    const cast = castSpell(c, spell, 1);
    expect(cast.effectsOn).toEqual(['spell:s1']);
    const on = { ...c, ...cast };
    expect({ ...on, ...castSpell(on, spell, 1) }.effectsOn).toEqual(['spell:s1']);
    expect(castSpell(make({ effectsOn: [], slotMax: c.slotMax, slotUsed: c.slotUsed }), spell, 1)).not.toHaveProperty('effectsOn');
  });
  it('editing a spell to Concentration takes its effect out of the list', () => {
    const on = { ...c, effectsOn: ['spell:s1'] };
    expect(effectsAfterEdit(on, { id: 's1', c: true })).toEqual({ effectsOn: [] });
    expect(effectsAfterEdit(on, { id: 's1', c: false })).toEqual({});
  });
});

describe('items inside a container (plan 6)', () => {
  // Built without migrate(), so an equipped item inside the bag stays as a damaged save would have it.
  const bag: Item = { id: 'bag', name: 'Bag of Holding', qty: 1, eq: false, xdim: true, cap: 500, wt: 5 };
  const ring: Item = { id: 'ring', name: 'Ring of Protection', qty: 1, eq: true, attune: true, in: 'bag' };
  const g = (p: Partial<Grant> = {}): Grant => ({ id: 'g', kind: 'ac', name: 'Ring', acMode: 'bonus', val: '1', from: 'item:ring', needEq: true, needAtt: true, ...p });

  it('a grant from an item in a container does not count, with or without the item checks', () => {
    const c = make({ inv: [bag, ring], attuneIds: ['ring', '', ''] });
    expect(inactiveReason(c, g())).toBe('in Bag of Holding');
    const custom = g();
    delete custom.needEq; delete custom.needAtt;
    expect(inactiveReason(c, custom)).toBe('in Bag of Holding');
  });

  it('a grant from an item with quantity 0 does not count, with or without the item checks', () => {
    const gone = { ...ring, in: undefined, qty: 0 };
    const custom = g({ needEq: undefined });
    expect(inactiveReason(make({ inv: [gone], attuneIds: ['ring', '', ''] }), custom)).toBe('none left');
  });

  it('reads "in a container" when the container is missing', () => {
    expect(inactiveReason(make({ inv: [ring], attuneIds: ['ring', '', ''] }), g())).toBe('in a container');
  });

  it('armor in a container does not satisfy or break armor conditions', () => {
    const c = make({ inv: [bag, { id: 'mail', name: 'Chain Mail', qty: 1, eq: true, armor: 'heavy', acBase: 16, in: 'bag' }] });
    expect(inactiveReason(c, { when: 'armor' })).toBe('needs armor');
    expect(inactiveReason(c, { when: 'noArmor' })).toBeNull();
    expect(inactiveReason(c, { when: 'noHeavy' })).toBeNull();
  });
});
