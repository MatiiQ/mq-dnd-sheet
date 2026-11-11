import { describe, expect, it } from 'vitest';
import { withClass } from './test-fixtures';
import { sampleCharacter } from './defaults';
import { activeGrants, charLevel, effectApplies, laterLevel, effectCanTargetOther, fixLinks, hasActiveEffect, isOn, inactiveReason, isActive, parseLink, sourceLabel, sourceOf, srcKindOfLink, totalLevel, wouldLoop } from './links';
import { grantErrors } from './catalog/schema';
import { castSpell, effectsAfterEdit, longRest, toggleEffect } from './logic';
import { migrate } from './migrate';
import srdEntries from './data/srd/index';
import { blankCharacter } from './defaults';
import { entriesOf, mergeCatalog } from './catalog/merge';
import { addFromCatalog } from './catalog/copy';
import type { Character, Feature, Grant, Item, Spell } from './types';

const make = (p: Partial<Character> = {}): Character => ({ ...sampleCharacter(), ...p });
const feat = (id: string, from?: string): Feature => ({ id, g: 'other', name: id.toUpperCase(), desc: '', ...(from ? { from } : {}) });

const row = { id: 'c1', name: 'Ranger', clsId: 'class/ranger', sub: '', subId: '', lvl: 5, hd: 10 as const, prep: 0 };

describe('class links', () => {
  it('parses a class link', () => expect(parseLink('class:c1')).toEqual({ kind: 'class', id: 'c1' }));
  it('labels a class grant by its row', () => {
    const c = { ...make(), classes: [row] } as Character;
    expect(sourceLabel(c, { from: 'class:c1' })).toBe('Class · Ranger');
    expect(sourceOf(c, 'class:c1')).toBe(row);
    expect(srcKindOfLink(c, 'class:c1')).toBe('class');
  });
  it('treats a class grant as always on, and a row ends a loop chain', () => {
    const c = { ...make(), classes: [row] } as Character;
    expect(inactiveReason(c, { from: 'class:c1' })).toBeNull();
    expect(wouldLoop(c, 'feature:A', 'class:c1')).toBe(false);
  });
  it('accepts a proficiency grant from a class', () => {
    expect(grantErrors({ id: 'g', kind: 'prof', name: 'Stealth', cat: 'skill', target: 'stealth', from: 'class:c1' } as never, 'class')).toEqual([]);
  });
  it('counts levels over the rows, never below 1 for charLevel', () => {
    expect(totalLevel({ classes: [] })).toBe(0);
    expect(charLevel({ classes: [] })).toBe(1);
    expect(totalLevel({ classes: [row, { ...row, id: 'c2', lvl: 2 }] })).toBe(7);
  });
});

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
      { id: 't', name: 'Tremorsense', range: '5 ft', minLvl: 3, when: 'noHeavy', desc: 'Feel the ground' }] });
    expect(c.senses[0]).toEqual({ id: 's', name: 'Blindsight', range: '10 ft', srcKind: 'other' });
    expect(c.senses[1]).toMatchObject({ minLvl: 3, when: 'noHeavy', desc: 'Feel the ground' });
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
    expect(inactiveReason(withClass(base(), { lvl: 2 }), { minLvl: 3 })).toBe('from level 3');
    expect(inactiveReason(withClass(base(), { lvl: 3 }), { minLvl: 3 })).toBeNull();
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
    const c = withClass(base({ spells: [{ id: 'a', name: 'Aid', lvl: 2, time: 'Action', range: '30 ft' }] }), { lvl: 1 });
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
});

describe('switching effects', () => {
  const g: Grant = { id: 'g', kind: 'speed', name: 'x', mode: 'walk', val: '10', from: 'spell:s1', when: 'active' };
  const spell = { id: 's1', name: 'Longstrider', lvl: 1, time: 'Action', range: 'Touch' };
  const c = make({ spells: [spell], grants: [g], effectsOn: [], slotMax: [0, 4, 0, 0, 0, 0, 0, 0, 0, 0], slotUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
  it('a Long Rest switches every effect off', () => {
    expect(longRest(make({ effectsOn: ['feature:f2'] })).effectsOn).toEqual([]);
  });
  it('casting a non-Concentration spell with an effect switches it on once', () => {
    const cast = castSpell(c, spell, 1)!;
    expect(cast.effectsOn).toEqual(['spell:s1']);
    const on = { ...c, ...cast };
    expect({ ...on, ...castSpell(on, spell, 1)! }.effectsOn).toEqual(['spell:s1']);
    expect(castSpell(make({ effectsOn: [], slotMax: c.slotMax, slotUsed: c.slotUsed }), spell, 1)!).not.toHaveProperty('effectsOn');
  });
  it('editing a spell to Concentration takes its effect out of the list', () => {
    const on = { ...c, effectsOn: ['spell:s1'] };
    expect(effectsAfterEdit(on, { id: 's1', c: true })).toEqual({ effectsOn: [] });
    expect(effectsAfterEdit(on, { id: 's1', c: false })).toEqual({});
  });
});

describe('items inside a container', () => {
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

describe('when: empty (hands free)', () => {
  const x = { when: 'empty' as const };
  it('counts with empty hands and no Shield, and stops with a weapon in hand', () => {
    expect(inactiveReason(make({ hands: [], inv: [] }), x)).toBeNull();
    expect(inactiveReason(make({ hands: ['w'], inv: [] }), x)).toBe('a weapon is in hand');
  });
  it('stops with a Shield on', () => {
    const sh: Item = { id: 's', name: 'Shield', qty: 1, eq: true, armor: 'shield' };
    expect(inactiveReason(make({ hands: [], inv: [sh] }), x)).toBe('not with a Shield');
  });
  it('survives a reload', () => {
    const c = make({ feats: [feat('a')], grants: [{ id: 'g', kind: 'unarmed', name: 'U', die: '1d8', abs: 'str', when: 'empty', from: 'feature:a' }] });
    expect(migrate(c).grants.find((g) => g.id === 'g')!.when).toBe('empty');
  });
});

describe('a buff cast on someone else', () => {
  const haste = (p: Partial<Spell> = {}): Spell => ({ id: 's', name: 'Haste', lvl: 3, time: 'Action', range: '30 feet', c: true, ...p });
  const on = (sp: Spell, p: Partial<Character> = {}): Character => ({ ...blankCharacter(), spells: [sp], conc: { id: 's', name: sp.name },
    grants: [{ id: 'g', kind: 'speed', name: 'Speed doubled', mode: 'walk', val: 'walk2', when: 'active', from: 'spell:s' }], ...p });
  it('counts a ranged Concentration spell with any active grant (Haste, PHB p.284)', () => {
    expect(effectCanTargetOther(on(haste()), haste())).toBe(true);
    expect(isOn(on(haste({ acOther: true })), 'spell:s')).toBe(false);
    expect(isOn(on(haste()), 'spell:s')).toBe(true);
  });
  it('counts a checkAdv grant and a sense entry', () => {
    const adv = on(haste(), { grants: [{ id: 'g', kind: 'checkAdv', name: 'Adv', target: 'str', adv: 'adv', when: 'active', from: 'spell:s' }] });
    expect(effectCanTargetOther(adv, haste())).toBe(true);
    const sense = on(haste(), { grants: [], senses: [{ id: 'x', name: 'Darkvision', range: '60', when: 'active', from: 'spell:s' }] });
    expect(effectCanTargetOther(sense, haste())).toBe(true);
  });
  it('leaves effects that ride on the caster, Self spells and non-Concentration spells alone', () => {
    const mark = on(haste({ range: '90 feet' }), { grants: [{ id: 'g', kind: 'xdmg', name: 'Hunter’s Mark', dice: '1d6', on: 'hits', when: 'active', from: 'spell:s' }] });
    expect(effectCanTargetOther(mark, mark.spells[0])).toBe(false);
    const aura = on(haste(), { grants: [{ id: 'g', kind: 'aura', name: 'Aura', range: '10', when: 'active', from: 'spell:s' }] });
    expect(effectCanTargetOther(aura, haste())).toBe(false);
    expect(effectCanTargetOther(on(haste({ range: 'Self' })), haste({ range: 'Self' }))).toBe(false);
    expect(effectCanTargetOther(on(haste({ range: 'Self (30-foot radius)' })), haste({ range: 'Self (30-foot radius)' }))).toBe(false);
    expect(effectCanTargetOther(on(haste({ c: false })), haste({ c: false }))).toBe(false);
  });
  it('offers the switch on these catalog spells', () => {
    const cat = mergeCatalog(srdEntries, null);
    const ids = entriesOf(cat, 'spell').filter((e) => {
      const c = addFromCatalog(blankCharacter(), cat, e, { picks: {}, counted: {}, links: {} });
      return c.spells.some((s) => s.cid === e.id && effectCanTargetOther(c, s));
    }).map((e) => e.id);
    // Before the widening: Fly, Gaseous Form, Spider Climb, Stoneskin (all Touch). New: Beacon of Hope, Haste. Summon
    // Dragon's resistance is the caster's, so it stays out.
    expect(ids).toEqual(['spell/beacon-of-hope', 'spell/fly', 'spell/gaseous-form', 'spell/haste', 'spell/spider-climb', 'spell/stoneskin']);
  });
});

describe('a spent Spell Scroll', () => {
  const sc: Item = { id: 'sc', name: 'Spell Scroll', qty: 0, eq: false, cid: 'item/spell-scroll' };
  const sp: Spell = { id: 's', name: 'Haste', lvl: 3, time: 'Action', range: '30 feet', c: true, always: true, from: 'item:sc' };
  it('keeps its spell row counting while its effect is on, and only then', () => {
    const c: Character = { ...blankCharacter(), inv: [sc], spells: [sp], conc: { id: 's', name: 'Haste' } };
    expect(inactiveReason(c, c.spells[0])).toBeNull();
    expect(inactiveReason({ ...c, conc: null }, c.spells[0])).toBe('none left');
    const potion = { ...sc, cid: 'item/potion-of-speed' };
    expect(inactiveReason({ ...c, inv: [potion] }, c.spells[0])).toBe('none left');
  });
});

describe('effectApplies (spec 2026-11-10 §2.8)', () => {
  it('Rage switched on applies', () => {
    const c: Character = { ...blankCharacter(), feats: [feat('rage')], effectsOn: ['feature:rage'],
      grants: [{ id: 'g', kind: 'dmgBonus', name: 'Rage', val: '2', when: 'active', from: 'feature:rage' }] };
    expect(effectApplies(c, 'feature:rage')).toBe(true);
  });
  it('a potion’s effect while the potion is in a bag applies to nothing', () => {
    const bag: Item = { id: 'bag', name: 'Bag of Holding', qty: 1, eq: false, xdim: true };
    const pot: Item = { id: 'pot', name: 'Potion of Speed', qty: 1, eq: false, in: 'bag' };
    const c: Character = { ...blankCharacter(), inv: [bag, pot], effectsOn: ['item:pot'],
      grants: [{ id: 'g', kind: 'speed', name: 'Speed', mode: 'walk', val: 'walk2', when: 'active', from: 'item:pot' }] };
    expect(effectApplies(c, 'item:pot')).toBe(false);
  });
});

describe('laterLevel (spec 2026-11-10 §2.6)', () => {
  it('a feature from level 5 waits at level 1, not at level 5', () => {
    const x: Feature = { ...feat('lf'), minLvl: 5 };
    expect(laterLevel(withClass({ ...blankCharacter(), feats: [x] }, { lvl: 1 }), x)).toBe(5);
    expect(laterLevel(withClass({ ...blankCharacter(), feats: [x] }, { lvl: 5 }), x)).toBe(0);
  });
});

