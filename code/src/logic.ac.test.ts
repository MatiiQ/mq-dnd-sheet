import { describe, expect, it } from 'vitest';
import { blankCharacter } from './defaults';
import { acCanTargetOther, acOnOther, toggleAcTarget, speedOf, armorSlowBy, stealthDisBy, acSpellIdle, untrainedArmor, castFree, refundFree, removeRef, acAfterEdit, armorClass, castSpell, detectAcSpell, detectArmor, longRest, speedNow, toggleAcSpell } from './logic';
import { addFromCatalog, type ItemAnswers } from './catalog/copy';
import { mergeCatalog } from './catalog/merge';
import srdEntries from './data/srd/index';
import type { Character, Feature, Grant, Item, Spell } from './types';
import { make, sp, ac, it_, gr } from './test-fixtures';

describe('armor class', () => {
  it('unarmored is 10 + DEX; a +0 DEX makes no tile (PHB p.12)', () => {
    expect(ac({}).total).toBe(14);
    expect(ac({}).parts).toEqual([{ label: 'Unarmored', value: 10 }, { label: 'Dexterity', value: 4 }]);
    const d0 = ac({ abil: { ...make().abil, dex: 10 } });
    expect(d0.total).toBe(10);
    expect(d0.parts.map((p) => p.label)).toEqual(['Unarmored']);
  });
  it('light armor adds all DEX, medium at most +2, heavy none, negative DEX only without heavy (PHB p.219)', () => {
    expect(ac({ inv: [it_({ name: 'Studded Leather Armor', armor: 'light', acBase: 12 })] }).total).toBe(16);
    expect(ac({ inv: [it_({ name: 'Half Plate', armor: 'medium', acBase: 15 })] }).total).toBe(17);
    expect(ac({ inv: [it_({ name: 'Plate', armor: 'heavy', acBase: 18 })] }).total).toBe(18);
    const weak = { abil: { ...make().abil, dex: 8 } };
    expect(ac({ ...weak, inv: [it_({ armor: 'medium', acBase: 14 })] }).total).toBe(13);
    expect(ac({ ...weak, inv: [it_({ armor: 'heavy', acBase: 16 })] }).total).toBe(16);
  });
  it('armor and shield bonuses count; carried items do not; best equipped armor wins', () => {
    const r = ac({ inv: [
      it_({ id: 'a', name: '+1 Chain Mail', armor: 'heavy', acBase: 16, acBonus: 1 }),
      it_({ id: 'b', name: 'Leather', armor: 'light', acBase: 11 }),
      it_({ id: 's', name: 'Shield', armor: 'shield', acBase: 2 }),
      it_({ id: 'c', name: 'Cloak of Protection' }),
      it_({ id: 'r', name: 'Ring of Protection', eq: false })
    ], grants: [{ id: 'g1', kind: 'ac', name: 'Cloak of Protection', acMode: 'bonus', val: '1', from: 'item:c', needEq: true },
      { id: 'g2', kind: 'ac', name: 'Ring of Protection', acMode: 'bonus', val: '1', from: 'item:r', needEq: true }] });
    expect(r.total).toBe(20); // 17 chain beats 15 leather, +2 shield, +1 cloak
    expect(r.parts.map((p) => [p.label, p.value])).toEqual([['+1 Chain Mail', 17], ['Shield', 2], ['Cloak of Protection', 1]]);
  });
  it('Unarmored Defense: Barbarian keeps it with a shield, Monk loses it (PHB p.51, p.101, p.148, p.64)', () => {
    const shield = [it_({ name: 'Shield', armor: 'shield', acBase: 2 })];
    expect(ac({ acUnarm: 'barbarian' }).total).toBe(16);
    expect(ac({ acUnarm: 'barbarian', inv: shield }).total).toBe(18);
    expect(ac({ acUnarm: 'monk' }).total).toBe(16);
    expect(ac({ acUnarm: 'monk', inv: shield }).total).toBe(16); // falls back to 10 + DEX + 2
    expect(ac({ acUnarm: 'monk', inv: shield }).parts.map((p) => p.label)).toEqual(['Unarmored', 'Dexterity', 'Shield']);
    expect(ac({ acUnarm: 'draconic' }).total).toBe(14); // CHA −1 loses to plain 10 + DEX
    expect(ac({ acUnarm: 'barbarian', inv: [it_({ armor: 'light', acBase: 11 })] }).total).toBe(15); // armor disables it
  });
  it('custom bonuses add, negative ones subtract, zero ones are hidden', () => {
    const r = ac({ acMods: [{ id: 'm1', name: 'Defense', val: 1 }, { id: 'm2', name: 'Curse', val: -2 }, { id: 'm3', name: 'Nothing', val: 0 }] });
    expect(r.total).toBe(13);
    expect(r.parts.map((p) => p.label)).toEqual(['Unarmored', 'Dexterity', 'Defense', 'Curse']);
  });
  it('detects armor by name only for real armor names', () => {
    expect(detectArmor('Studded Leather Armor')).toEqual({ armor: 'light', acBase: 12 });
    expect(detectArmor('leather')).toEqual({ armor: 'light', acBase: 11 });
    expect(detectArmor('Plate Armor')).toEqual({ armor: 'heavy', acBase: 18 });
    expect(detectArmor('Shield')).toEqual({ armor: 'shield', acBase: 2 });
    expect(detectArmor('+1 Chain Mail')).toEqual({ armor: 'heavy', acBase: 16, acBonus: 1 });
    for (const n of ['Leather Pouch', 'Shield Badge', 'Plate of Cheese', 'Rope']) expect(detectArmor(n)).toBeNull();
  });
  describe('AC spells', () => {
    const shieldSp = sp({ id: 'sh', name: 'Shield', acFx: 'bonus', acVal: 5 });
    const faith = sp({ id: 'sf', name: 'Shield of Faith', c: true, acFx: 'bonus', acVal: 2 });
    const mage = sp({ id: 'ma', name: 'Mage Armor', acFx: 'base', acVal: 13 });
    const bark = sp({ id: 'bk', name: 'Barkskin', lvl: 2, acFx: 'floor', acVal: 17 });
    const all = { spells: [shieldSp, faith, mage, bark] };
    it('Shield +5 while on; Shield of Faith +2 only while concentrating on it (PHB p.316)', () => {
      expect(ac({ ...all, acOn: ['sh'] }).total).toBe(19);
      expect(ac({ ...all, acOn: ['sh'] }).parts.at(-1)).toMatchObject({ label: 'Shield', value: 5, active: true });
      expect(ac({ ...all, conc: { id: 'sf', name: 'Shield of Faith' } }).total).toBe(16);
      expect(ac({ ...all, acOn: ['sf'] }).total).toBe(14); // a concentration spell in acOn is ignored
    });
    it('Mage Armor is a base: beats plain unarmored, loses to better armor (PHB p.293)', () => {
      expect(ac({ ...all, acOn: ['ma'] }).total).toBe(17);
      expect(ac({ ...all, acOn: ['ma'] }).parts[0]).toEqual({ label: 'Mage Armor', value: 13, note: 'spell', active: true });
      expect(ac({ ...all, acOn: ['ma'], inv: [it_({ armor: 'heavy', acBase: 18 })] }).total).toBe(18);
    });
    it('Barkskin raises AC to 17 only when lower (PHB p.245)', () => {
      const low = ac({ ...all, acOn: ['bk'], abil: { ...make().abil, dex: 10 } });
      expect(low.total).toBe(17);
      expect(low.parts.at(-1)).toMatchObject({ label: 'Barkskin', value: 7, note: 'AC at least 17', active: true });
      expect(ac({ ...all, acOn: ['bk', 'sh'] }).total).toBe(19); // already above 17: no Barkskin tile
      expect(ac({ ...all, acOn: ['bk', 'sh'] }).parts.some((p) => p.label === 'Barkskin')).toBe(false);
    });
    it('casting a non-concentration AC spell turns it on once; others change nothing', () => {
      const c = make({ ...all, acOn: [], slotMax: [0, 4, 2, 0, 0, 0, 0, 0, 0, 0], slotUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
      expect(castSpell(c, shieldSp, 1)!.acOn).toEqual(['sh']);
      const again = { ...c, acOn: ['sh'] };
      expect({ ...again, ...castSpell(again, shieldSp, 1)! }.acOn).toEqual(['sh']);
      expect(castSpell(c, faith, 1)!).not.toHaveProperty('acOn');
      expect(castSpell(c, sp(), 1)!).not.toHaveProperty('acOn');
    });
    it('a free cast turns the effect on; restoring it does not turn it off', () => {
      const free = (id: string) => ({ id: 'f' + id, name: 'Free', count: 1, max: 1, recharge: 'long' as const, casts: id });
      const c = make({ ...all, acOn: [], res: [free('sh'), free('sf')] });
      const used = castFree(c, shieldSp, 'fsh')!;
      expect(used.acOn).toEqual(['sh']);
      expect(used.res!.find((r) => r.id === 'fsh')!.count).toBe(0);
      expect(castFree({ ...c, ...used }, shieldSp, 'fsh')).toBeNull();
      const back = refundFree({ ...c, ...used }, 'fsh');
      expect(back).not.toHaveProperty('acOn');
      expect(back.res!.find((r) => r.id === 'fsh')!.count).toBe(1);
      expect(castFree(c, faith, 'fsf')!.conc).toEqual({ id: 'sf', name: 'Shield of Faith' });
      const on = { ...c, acOn: ['sh'] }; // already on from a slot cast
      expect({ ...on, ...castFree(on, shieldSp, 'fsh')! }.acOn).toEqual(['sh']);
    });
    it('toggle, edit, removal and Long Rest switch AC spells off', () => {
      const c = make({ ...all, acOn: ['sh', 'bk'] });
      expect(toggleAcSpell(c, 'sh').acOn).toEqual(['bk']);
      expect(toggleAcSpell(c, 'ma').acOn).toEqual(['sh', 'bk', 'ma']);
      expect(acAfterEdit(c, { id: 'sh', c: true, acFx: 'bonus' }).acOn).toEqual(['bk']);
      expect(acAfterEdit(c, { id: 'sh', c: false, acFx: undefined }).acOn).toEqual(['bk']);
      expect(acAfterEdit(c, { id: 'sh', c: false, acFx: 'bonus' })).toEqual({});
      expect(acAfterEdit(c, { id: 'ma', c: true, acFx: 'base' })).toEqual({}); // not on: nothing to remove
      expect(removeRef(c, { kind: 'spell', id: 'sh' }).acOn).toEqual(['bk']);
      const rested = longRest(c);
      expect(rested.acOn).toEqual([]);
      expect(rested.restMsg?.body).toContain('Shield, Barkskin ended');
      expect(longRest(make({ ...all, acOn: [] })).restMsg?.body).not.toContain('ended');
    });
    it('detects the four AC spells by name', () => {
      expect(detectAcSpell('Shield')).toEqual({ acFx: 'bonus', acVal: 5 });
      expect(detectAcSpell(' mage armor ')).toEqual({ acFx: 'base', acVal: 13 });
      expect(detectAcSpell('Shield of Faith')).toEqual({ acFx: 'bonus', acVal: 2 });
      expect(detectAcSpell('Barkskin')).toEqual({ acFx: 'floor', acVal: 17 });
      expect(detectAcSpell('Shillelagh')).toBeNull();
      expect(detectAcSpell('constructor')).toBeNull(); // an inherited key is no spell
    });
  });
  describe('AC grants', () => {
    const ringItem: Item = { id: 'r', name: 'Ring of Protection', qty: 1, eq: false };
    const ringAc: Grant = { id: 'ga', kind: 'ac', name: '+1 AC', acMode: 'bonus', val: '1', from: 'item:r', srcKind: 'item', needEq: true, needAtt: true };
    const leather = it_({ id: 'l', name: 'Leather Armor', armor: 'light', acBase: 11 });
    const shield = it_({ id: 's', name: 'Shield', armor: 'shield', acBase: 2 });
    it('an item bonus counts only while equipped and attuned', () => {
      expect(ac({ inv: [ringItem], grants: [ringAc] }).total).toBe(14);
      expect(ac({ inv: [{ ...ringItem, eq: true }], grants: [ringAc] }).total).toBe(14);
      const on = ac({ inv: [{ ...ringItem, eq: true }], grants: [ringAc], attuneIds: ['r', '', ''] });
      expect(on.total).toBe(15);
      expect(on.parts.at(-1)).toMatchObject({ label: '+1 AC', value: 1, note: 'Item · Ring of Protection' });
    });
    it('conditional bonuses follow armor and Shield (Defense, Bracers of Defense)', () => {
      const defense: Grant = { id: 'd', kind: 'ac', name: 'Defense', acMode: 'bonus', val: '1', when: 'armor', from: 'feature:f5' };
      expect(ac({ grants: [defense] }).total).toBe(14);
      expect(ac({ grants: [defense], inv: [leather] }).total).toBe(16);
      const bracers: Grant = { id: 'b', kind: 'ac', name: 'Bracers', acMode: 'bonus', val: '2', when: 'noArmorNoShield', from: 'feature:f5' };
      expect(ac({ grants: [bracers] }).total).toBe(16);
      expect(ac({ grants: [bracers], inv: [shield] }).total).toBe(16); // +2 Shield, bracers off
    });
    it('an unarmored grant is a base candidate, lost with a Shield when it says so', () => {
      const barb: Grant = { id: 'u', kind: 'ac', name: 'Unarmored Defense', acMode: 'unarmored', ab: 'con', from: 'feature:f5' };
      expect(ac({ grants: [barb] }).total).toBe(16); // 10 + DEX 4 + CON 2
      expect(ac({ grants: [barb] }).parts.at(-1)).toMatchObject({ label: 'Constitution', value: 2, note: 'Unarmored Defense' });
      expect(ac({ grants: [barb], inv: [shield] }).total).toBe(18);
      expect(ac({ grants: [{ ...barb, shieldOk: false }], inv: [shield] }).total).toBe(16);
    });
    it('a counted bonus adds nothing next to the custom bonus that holds it', () => {
      const defense: Grant = { id: 'd', kind: 'ac', name: 'Defense', acMode: 'bonus', val: '1', from: 'feature:f5', counted: true };
      expect(ac({ grants: [defense], acMods: [{ id: 'm', name: 'Defense +1', val: 1 }] }).total).toBe(15);
    });
    it('no longer counts acBonus on an item that is not armor', () => {
      expect(ac({ inv: [it_({ name: 'Cloak', acBonus: 1 })] }).total).toBe(14);
    });
  });
  describe('armor training', () => {
    const base = (p: Partial<Character> = {}): Character => ({ ...blankCharacter(), abil: { ...blankCharacter().abil, dex: 14 }, ...p });
    const robe: Grant = { id: 'g', kind: 'ac', name: 'Robe', acMode: 'unarmored', val: '5', when: 'noArmor', needEq: true, needAtt: true, from: 'item:r' };
    const robeItem: Item = { id: 'r', name: 'Robe of the Archmagi', qty: 1, eq: true, attune: true };
    const leather: Item = { id: 'l', name: 'Leather Armor', qty: 1, eq: true, armor: 'light', acBase: 11 };
    const shield: Item = { id: 's', name: 'Shield', qty: 1, eq: true, armor: 'shield', acBase: 2 };
    it('takes a numeric unarmored base (Robe of the Archmagi)', () => {
      const on = base({ inv: [robeItem], grants: [robe], attuneIds: ['r', '', ''] });
      expect(armorClass(on).total).toBe(17);
      expect(armorClass({ ...on, attuneIds: ['', '', ''] }).total).toBe(12);
      expect(armorClass({ ...on, inv: [robeItem, leather] }).total).toBe(13);
    });
    it('gives a Shield nothing without training (PHB p.219)', () => {
      const c = base({ abil: blankCharacter().abil, inv: [shield] });
      expect(armorClass(c).total).toBe(10);
      expect(armorClass(c).parts).toContainEqual({ label: 'Shield', value: 0, note: 'no Shield training' });
      expect(armorClass({ ...c, profs: [{ id: 'p', cat: 'armor', name: 'Shields' }] }).total).toBe(12);
      const f: Feature = { id: 'f', g: 'feat', name: 'Armor Training', desc: '' };
      expect(armorClass({ ...c, feats: [f], grants: [{ id: 'x', kind: 'prof', name: 'Shields', cat: 'armor', target: 'Shields', from: 'feature:f' }] }).total).toBe(12);
      expect(armorClass({ ...c, inv: [{ ...shield, acBonus: 1 }] }).total).toBe(10);
    });
    it('names worn armor without training', () => {
      const mail: Item = { id: 'm', name: 'Chain Mail', qty: 1, eq: true, armor: 'heavy', acBase: 16 };
      expect(untrainedArmor(base({ inv: [mail] }))?.id).toBe('m');
      expect(untrainedArmor(base({ inv: [mail], profs: [{ id: 'p', cat: 'armor', name: 'Heavy armor' }] }))).toBeUndefined();
      expect(untrainedArmor(base({ inv: [shield] }))).toBeUndefined();
    });
    it('marks Mage Armor idle under armor', () => {
      const sp: Spell = { id: 'ma', name: 'Mage Armor', lvl: 1, time: 'Action', range: 'Touch', prep: true, acFx: 'base', acVal: 13 };
      const on = base({ spells: [sp], acOn: ['ma'] });
      expect(acSpellIdle(on, sp)).toBe(false);
      expect(acSpellIdle({ ...on, inv: [leather] }, sp)).toBe(true);
      expect(acSpellIdle({ ...on, inv: [leather] }, { ...sp, acFx: 'bonus' })).toBe(false);
    });
  });
  describe('armor columns', () => {
    const plate: Item = { id: 'p', name: 'Plate Armor', qty: 1, eq: true, armor: 'heavy', acBase: 18, strReq: 15 };
    const at = (str: number, p: Partial<Character> = {}): Character =>
      ({ ...blankCharacter(), speedBase: 30, abil: { ...blankCharacter().abil, str }, inv: [plate], ...p });
    it('slows a wearer below its Strength by 10 ft (PHB p.219)', () => {
      expect(speedNow(at(10))).toBe(20);
      expect(speedNow(at(15))).toBe(30);
      expect(speedNow(at(10, { inv: [{ ...plate, eq: false }] }))).toBe(30);
      const bag: Item = { id: 'b', name: 'Bag of Holding', qty: 1, eq: false, xdim: true };
      expect(speedNow(at(10, { inv: [bag, { ...plate, in: 'b' }] }))).toBe(30);
      const belt: Item = { id: 'g', name: 'Belt', qty: 1, eq: true };
      expect(speedNow(at(10, { inv: [plate, belt], grants: [{ id: 's', kind: 'abilSet', name: 'Belt', ab: 'str', val: '19', from: 'item:g' }] }))).toBe(30);
      expect(speedNow(at(10, { exh: 1 }))).toBe(15);
      expect(speedNow(at(10, { speedBase: 5 }))).toBe(0);
      expect(speedOf(at(10), 60)).toBe(50);
      expect(armorSlowBy(at(10))?.id).toBe('p');
    });
    it('names the armor that gives Stealth Disadvantage', () => {
      const chain: Item = { id: 'c', name: 'Chain Mail', qty: 1, eq: true, armor: 'heavy', acBase: 16, stealthDis: true };
      expect(stealthDisBy(at(10, { inv: [chain] }))?.id).toBe('c');
      expect(stealthDisBy(at(10, { inv: [{ ...chain, eq: false }] }))).toBeUndefined();
    });
  });
  describe('a magic armor or Shield bonus chosen when added', () => {
    // Armor +N: "a bonus to Armor Class determined by its rarity" on top of the armor's base AC; Shield +N the same on
    // top of the Shield's +2 (PHB p.219 Shield; SRD 5.2.1 Armor and Shield +1, +2, or +3).
    const cat = mergeCatalog(srdEntries, null);
    const add = (c: Character, id: string, item: ItemAnswers) => {
      const n = addFromCatalog(c, cat, cat.byId.get(id)!, { picks: {}, counted: {}, links: {}, item });
      const it = n.inv.at(-1)!;
      return { ...n, inv: n.inv.map((x) => (x.id === it.id ? { ...x, eq: true } : x)) };
    };
    it('counts Armor +1 with its chosen Plate Armor, and Shield +3 on top of the Shield’s 2', () => {
      const base: Character = { ...blankCharacter(), inv: [], profs: [{ id: 'p', cat: 'armor', name: 'Shields' }] };
      const plate = add(base, 'item/armor-1-2-or-3', { base: 'item/plate-armor', bonus: 1 });
      expect(armorClass(plate).total).toBe(19);
      expect(armorClass(add(plate, 'item/shield-1-2-or-3', { bonus: 3 })).total).toBe(24);
    });
  });
  describe('AC spells on another creature', () => {
    const cat = mergeCatalog(srdEntries, null);
    it('gives Haste its AC bonus, and Warding Bond none: its +1 goes to another creature (PHB pp.284, 340)', () => {
      expect(cat.byId.get('spell/haste')).toMatchObject({ acFx: 'bonus', acVal: 2 });
      expect(cat.byId.get('spell/warding-bond')).not.toHaveProperty('acFx');
      expect(detectAcSpell('Haste')).toEqual({ acFx: 'bonus', acVal: 2 });
      expect(detectAcSpell('Warding Bond')).toBeNull();
    });
    it('counts an AC spell only while cast on the caster (PHB pp.284, 245)', () => {
      const haste: Spell = { id: 'h', name: 'Haste', lvl: 3, time: 'Action', range: '30 feet', c: true, acFx: 'bonus', acVal: 2 };
      const conc = { id: 'h', name: 'Haste' };
      expect(ac({ spells: [haste], conc }).total).toBe(16);
      const toOther = toggleAcTarget(make({ spells: [haste] }), 'h');
      expect(toOther.spells![0].acOther).toBe(true);
      expect(ac({ spells: toOther.spells, conc }).total).toBe(14);
      expect(toggleAcTarget(make(toOther), 'h').spells![0]).not.toHaveProperty('acOther');
      // A spell without Concentration keeps running on the other creature, and a wrong choice can be corrected after the cast.
      const bark: Spell = { id: 'b', name: 'Barkskin', lvl: 2, time: 'Bonus Action', range: 'Touch', acFx: 'floor', acVal: 17, acOther: true };
      expect(ac({ spells: [bark], acOn: ['b'] }).total).toBe(14);
      expect(ac({ spells: [{ ...bark, acOther: undefined }], acOn: ['b'] }).total).toBe(17);
    });
    it('gives a Self AC spell no choice of target (Shield, PHB p.316)', () => {
      const shield: Spell = { id: 's', name: 'Shield', lvl: 1, time: 'Reaction', range: 'Self', acFx: 'bonus', acVal: 5, acOther: true };
      expect(acCanTargetOther(shield)).toBe(false);
      expect(acOnOther(shield)).toBe(false);
      expect(ac({ spells: [shield], acOn: ['s'] }).total).toBe(19);
      expect(acCanTargetOther({ id: 'x', name: 'Bless', lvl: 1, time: 'Action', range: '30 feet' })).toBe(false);
    });
  });
  it('raises the Medium armor Dexterity cap (Medium Armor Master, PHB p.205)', () => {
    const scale = { id: 'i', name: 'Scale Mail', qty: 1, eq: true, armor: 'medium', acBase: 14 } as unknown as Item;
    const c = make({ abil: { ...make().abil, dex: 16 }, abilAdj: {}, grants: [], inv: [scale] });
    expect(armorClass(c).total).toBe(16);
    expect(armorClass({ ...c, grants: [gr({ kind: 'ac', acMode: 'dexCap', val: '3' })] }).total).toBe(17);
    expect(armorClass({ ...c, abil: { ...c.abil, dex: 14 }, grants: [gr({ kind: 'ac', acMode: 'dexCap', val: '3' })] }).total).toBe(16);
  });
});
