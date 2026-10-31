import { describe, expect, it } from 'vitest';
import { blankCharacter, druidSample, sampleCharacter } from './defaults';
import {
  ABILITIES, SKILLS, grantChips, addGrants, findUnlinked, removalChain, removalSummary, removeFeature, removeResource, castFree, freeCastsOf, ownFreeCasts, setOwnFreeCast, spellAttackFor, spellSaveDcFor, toggleEffect, dawn, restRolls, maxFields, maxOf, normalize, resourceGroups, mergedDefenses, mergedSenses, removeRef, abilityParts, carryUpOf, maxHpOf, modeSpeed, sizeOf, walkSpeed, effScore, hasProf, profList, saveProficient, skillLevel, splitTraining, applyDamage, applyHeal, applySetTemp, acAfterEdit, armorClass, carriedWeight, carryCapacity, castSpell, detectAcSpell, detectArmor, clearHpUndo, concAfterEdit, fmt, hdSpent, healHitDie, hitDieRoll, hpColor, hpRingStops, initiative, isDead, longRest, migrate, NEW_FIELDS, parseWeight, passiveScore, pillView, resPill, setPill, preparedCount, removeItem, removeSpell, saveMod, setHp, setMaxHp, shortRest, skillMod, slotsLeft,
  setExhaustion, sortSpells, speedNow, spellAttack, spellAttackParts, spellDcParts, spellSaveDC, spellUsable, spendHitDie, toggleAcSpell, toggleCondition, undoHp
} from './logic';
import { grantErrors, type GrantSpec } from './catalog/schema';
import { activeGrants, isActive } from './links';
import { inventoryGroups } from './inventory';
import { applyPatch } from './storage';
import { oldIlyra, oldSeren } from './test-fixtures';
import type { Character, Grant, Item, Spell } from './types';

const make = (p: Partial<Character> = {}): Character => ({ ...sampleCharacter(), ...p });
const sp = (p: Partial<Spell> = {}): Spell => ({ id: 's1', name: 'Bless', lvl: 1, time: 'Action', range: '30 ft', srcName: 'Cleric', ...p });
const hm = { id: 'sp4', name: 'Hunter’s Mark' };
const ac = (p: Partial<Character>) => armorClass(make({ inv: [], spells: [], acMods: [], acOn: [], acUnarm: 'none', conc: null, ...p }));
const it_ = (p: Partial<Item>): Item => ({ id: 'a', name: 'X', qty: 1, eq: true, ...p });

describe('derived numbers', () => {
  it('adds ability modifiers, proficiency and expertise', () => {
    const c = make(); // Ilyra: Ranger 5 (PB 3), DEX 18, WIS 14, INT 10, STR 12 proficient, CON 14 not
    expect([fmt(3), fmt(0), fmt(-1)]).toEqual(['+3', '+0', '−1']);
    expect(skillMod(c, 'perception', 'wis')).toBe(5);
    expect(skillMod(c, 'survival', 'wis')).toBe(8);
    expect(skillMod(c, 'medicine', 'wis')).toBe(2);
    expect(saveMod(c, 'str')).toBe(4);
    expect(saveMod(c, 'con')).toBe(2);
    expect(saveMod(make({ abilAdj: { con: 2 } }), 'con')).toBe(3);
    expect(passiveScore(c, 'perception')).toBe(15);
    expect(passiveScore(c, 'insight')).toBe(15);
    expect(passiveScore(c, 'investigation')).toBe(10);
    expect(initiative(c)).toBe(4);
    expect(initiative(make({ initMisc: 2, abilAdj: { dex: -4 } }))).toBe(4); // DEX 14 +2
    expect(hitDieRoll(c)).toBe('1d10 +2');
  });
  it('derives spellcasting numbers', () => {
    expect(spellSaveDC(make())).toBe(13);
    expect(spellAttack(make())).toBe(5);
    expect(spellSaveDC(make({ castAb: 'none' }))).toBeNull();
    expect(spellAttack(make({ castAb: 'none' }))).toBeNull();
    const c = make({ slotMax: [0, 4, 2, 0, 0, 0, 0, 0, 0, 0], slotUsed: [0, 1, 3, 0, 0, 0, 0, 0, 0, 0] });
    expect([slotsLeft(c, 1), slotsLeft(c, 2), slotsLeft(c, 5)]).toEqual([3, 0, 0]);
    expect(spellUsable(make(), sp({ prep: true }))).toBe(true);
    expect(spellUsable(make(), sp({ always: true }))).toBe(true);
    expect(spellUsable(make(), sp())).toBe(false);
    expect(spellUsable(make({ usePrep: false }), sp())).toBe(true);
    expect(preparedCount(make())).toBe(5); // leaves out always-prepared spells and cantrips
  });
  it('breaks spell save DC and spell attack into their parts (PHB p.41)', () => {
    expect(spellDcParts(make())).toEqual([{ label: 'Base', value: 8 }, { label: 'Wisdom modifier', value: 2 }, { label: 'Proficiency Bonus', value: 3 }]);
    expect(spellAttackParts(make())).toEqual([{ label: 'Wisdom modifier', value: 2 }, { label: 'Proficiency Bonus', value: 3 }]);
    expect(spellDcParts(make({ castAb: 'none' }))).toBeNull();
  });
  it('keeps max HP at least 1, HP at or under it, and spent Hit Dice at most the level', () => {
    expect(setMaxHp(make({ hp: 40, maxHp: 44 }), 30)).toEqual({ maxHp: 30, hp: 30 });
    expect(setMaxHp(make({ hp: 10, maxHp: 44 }), 30)).toEqual({ maxHp: 30, hp: 10 });
    expect(setMaxHp(make({ hp: 5 }), 0)).toEqual({ maxHp: 1, hp: 1 });
    expect(setMaxHp(make({ hp: 44, maxHp: 44 }), 45)).toEqual({ maxHp: 45, hp: 44 });
    expect(hdSpent(make({ level: 5, hdUsed: 2 }))).toBe(2);
    expect(hdSpent(make({ level: 3, hdUsed: 5 }))).toBe(3);
  });
  it('lowers speed for exhaustion and sets it to 0 when Grappled', () => {
    expect(speedNow(make({ exh: 2 }))).toBe(25);
    expect(speedNow(make({ conds: { Grappled: true } }))).toBe(0);
  });
  it('colours HP green from 65%, yellow from 30%, red below, ignoring temp HP', () => {
    const at = (hp: number, maxHp: number, temp = 0) => hpColor(make({ hp, maxHp, temp }));
    expect([at(44, 44), at(29, 44), at(13, 20)]).toEqual(Array(3).fill('var(--hp-high)'));
    expect([at(28, 44), at(14, 44), at(6, 20)]).toEqual(Array(3).fill('var(--hp-mid)'));
    expect([at(13, 44), at(5, 20), at(0, 44), at(13, 44, 20)]).toEqual(Array(4).fill('var(--hp-low)'));
  });
});

describe('casting and Concentration', () => {
  const slots = { slotMax: [0, 4, 2, 0, 0, 0, 0, 0, 0, 0], slotUsed: [0, 1, 2, 0, 0, 0, 0, 0, 0, 0], conc: null };
  const check = { concCheck: 'Concentration on Hunter’s Mark: CON save DC 10', conc: { id: 'hm', name: 'Hunter’s Mark' } };
  it('uses one slot of that level, or does nothing with none left', () => {
    expect(castSpell(make(slots), sp(), 1).slotUsed).toEqual([0, 2, 2, 0, 0, 0, 0, 0, 0, 0]);
    expect(castSpell(make(slots), sp(), 2)).toEqual({});
  });
  it('a Concentration spell starts Concentration and clears the save notice; others leave both', () => {
    expect(castSpell(make(slots), sp({ c: true }), 1).conc).toEqual({ id: 's1', name: 'Bless' });
    expect(castSpell(make(slots), sp(), 1)).not.toHaveProperty('conc');
    expect(castSpell(make({ ...slots, ...check }), sp({ c: true }), 1).concCheck).toBeNull();
    expect(castSpell(make({ ...slots, ...check }), sp(), 1).concCheck).toBeUndefined();
  });
  it('incapacitating conditions end Concentration; other toggles keep it', () => {
    const c = toggleCondition(make({ conc: hm }), 'Stunned');
    expect(c.conds.Stunned).toBe(true);
    expect(c.conc).toBeNull();
    expect(toggleCondition(make({ conds: { Stunned: true }, conc: hm }), 'Stunned').conc).toEqual(hm);
    expect(toggleCondition(make(check), 'Incapacitated').concCheck).toBeNull();
    expect(toggleCondition(make(check), 'Prone').concCheck).toBe(check.concCheck);
  });
  it('Exhaustion 6 ends Concentration (PHB p.363, p.366)', () => {
    const c = make({ ...check, exh: 5 });
    expect(setExhaustion(c, 6)).toMatchObject({ exh: 6, conc: null, concCheck: null });
    expect(setExhaustion(c, 4)).toEqual({ exh: 4 });
    expect(setExhaustion(c, 9).exh).toBe(6);
    expect(setExhaustion(c, -1).exh).toBe(0);
  });
  describe('editing and removing the concentrated spell', () => {
    const bless = sp({ c: true });
    const other: Spell = { ...bless, id: 's2', name: 'Shield', c: false };
    const fc = (id: string) => ({ id: 'fc' + id, name: 'Free', count: 1, max: 1, recharge: 'long' as const, from: 'spell:' + id, srcKind: 'spell' as const, casts: id });
    const conc = make({ spells: [bless, other], conc: { id: 's1', name: 'Bless' }, concCheck: 'CON save DC 10', res: [fc('s1'), fc('s2')] });
    it('removing it ends Concentration and drops its free cast; removing another keeps it', () => {
      const c = removeSpell(conc, 's1');
      expect(c.spells.map((x) => x.id)).toEqual(['s2']);
      expect(c).toMatchObject({ conc: null, concCheck: null });
      expect(c.res.map((r) => r.id)).toEqual(['fcs2']);
      const k = removeSpell(conc, 's2');
      expect(k.conc).toEqual({ id: 's1', name: 'Bless' });
      expect(k.res.map((r) => r.id)).toEqual(['fcs1']);
    });
    it('renaming renames it, unticking ends it, other edits keep it', () => {
      expect(concAfterEdit(conc, { ...bless, name: 'Bless (upcast)' })).toEqual({ conc: { id: 's1', name: 'Bless (upcast)' }, concCheck: null });
      expect(concAfterEdit(conc, { ...bless, c: false })).toEqual({ conc: null, concCheck: null });
      expect(concAfterEdit(conc, { ...other, name: 'Shield+' })).toEqual({});
      expect(concAfterEdit(conc, bless)).toEqual({});
    });
    it('a save whose Concentration points at a missing spell loads without it', () => {
      expect(migrate({ ...conc, conc: { id: 'gone', name: 'Old' } }).conc).toBeNull();
      expect(migrate(conc).conc).toEqual({ id: 's1', name: 'Bless' });
      expect(migrate({ ...conc, spells: [{ id: 's1' }, other] }).conc).toBeNull();
    });
  });
});

describe('damage', () => {
  it('takes damage from temp HP first and ignores an amount of 0', () => {
    const c = applyDamage(make({ hp: 20, temp: 4, amount: 6 }));
    expect(c).toMatchObject({ temp: 0, hp: 18 });
    expect(c.hpUndo?.text).toContain('4 absorbed by temp HP');
    const zero = make({ amount: 0 });
    expect(applyDamage(zero)).toBe(zero);
  });
  it('drops to 0, becomes Unconscious and ends Concentration, keeping the notice', () => {
    const c = applyDamage(make({ hp: 5, temp: 0, amount: 8, conc: hm }));
    expect(c.hp).toBe(0);
    expect(c.conds.Unconscious).toBe(true);
    expect(c.conc).toBeNull();
    expect(c.concCheck).toMatch(/ended \(dropped to 0 HP\)/);
  });
  it('at 0 HP marks a failure; a Stable character starts counting from zero (PHB p.29)', () => {
    expect(applyDamage(make({ hp: 0, df: 1, amount: 3 })).df).toBe(2);
    expect(applyDamage(make({ hp: 0, ds: 2, amount: 2 })).ds).toBe(2);
    const c = applyDamage(make({ hp: 0, ds: 3, df: 2, amount: 3 }));
    expect(c).toMatchObject({ ds: 0, df: 1 });
    expect(isDead(c)).toBe(false);
    expect(c.hpUndo?.text).toContain('No longer Stable');
  });
  it('kills outright on massive damage, including at 0 HP', () => {
    expect(applyDamage(make({ hp: 10, maxHp: 44, amount: 54 })).df).toBe(3);
    expect(applyDamage(make({ hp: 0, maxHp: 44, amount: 44 })).df).toBe(3);
    expect(applyDamage(make({ hp: 0, maxHp: 44, amount: 43 })).df).toBe(1);
  });
  it('asks for a concentration save at half the damage, minimum DC 10', () => {
    expect(applyDamage(make({ hp: 30, amount: 8, conc: hm })).concCheck).toContain('DC 10');
    expect(applyDamage(make({ hp: 30, amount: 24, conc: hm })).concCheck).toContain('DC 12');
  });
});

describe('death', () => {
  it('is dead with three failed death saves at 0 HP, or at Exhaustion 6', () => {
    expect(isDead(make({ hp: 0, df: 3 }))).toBe(true);
    expect(isDead(make({ hp: 0, df: 2 }))).toBe(false);
    expect(isDead(make({ hp: 1, df: 3 }))).toBe(false);
    expect(isDead(make({ hp: 10, exh: 6 }))).toBe(true);
    expect(isDead(make({ hp: 10, exh: 5 }))).toBe(false);
  });
});

describe('healing, temp HP and undo', () => {
  it('heals up to max; from 0 clears death saves and Unconscious, leaving Prone', () => {
    expect(applyHeal(make({ hp: 40, amount: 10 })).hp).toBe(44);
    const c = applyHeal(make({ hp: 0, ds: 2, df: 1, amount: 3, conds: { Unconscious: true } }));
    expect(c).toMatchObject({ hp: 3, ds: 0, df: 0 });
    expect(c.conds).toMatchObject({ Unconscious: false, Prone: true });
  });
  it('does not heal a dead character', () => {
    for (const dead of [make({ hp: 0, df: 3, amount: 5 }), make({ hp: 10, exh: 6, amount: 5 })]) expect(applyHeal(dead)).toBe(dead);
  });
  it('does not stack temp HP: the new set replaces the old, Undo keeps the old; 0 is ignored', () => {
    const lower = applySetTemp(make({ temp: 8, amount: 5 }));
    expect(lower.temp).toBe(5);
    expect(lower.hpUndo?.text).toContain('Undo to keep 8');
    expect(undoHp(lower).temp).toBe(8);
    expect(applySetTemp(make({ temp: 3, amount: 5 })).temp).toBe(5);
    const zero = make({ temp: 0, amount: 0 });
    expect(applySetTemp(zero)).toBe(zero);
  });
  it('sets current HP directly: kept between 0 and max, undoable, leaving 0 resets death saves', () => {
    const c = setHp(make({ hp: 20, conc: hm }), 99);
    expect(c).toMatchObject({ hp: 44, concCheck: null });
    expect(undoHp(c).hp).toBe(20);
    expect(setHp(make({ hp: 20 }), -5).hp).toBe(0);
    const same = make({ hp: 20 });
    expect(setHp(same, 20)).toBe(same);
    expect(setHp(make({ hp: 0, ds: 2, df: 1 }), 5)).toMatchObject({ hp: 5, ds: 0, df: 0 });
  });
  it('undoes the last HP change; the undo row clears only while it is still the one shown', () => {
    const undone = undoHp(applyDamage(make({ hp: 20, amount: 7 })));
    expect(undone.hp).toBe(20);
    expect(undone.hpUndo).toBeNull();
    const c = applyDamage(make({ hp: 20, amount: 7, conc: hm }));
    const cleared = clearHpUndo(c, c.hpUndo);
    expect(cleared.hpUndo).toBeNull();
    expect(cleared.concCheck).toBe(c.concCheck);
    const newer = applyHeal(c);
    expect(clearHpUndo(newer, c.hpUndo).hpUndo).toBe(newer.hpUndo);
  });
  describe('undoing a Hit Die heal', () => {
    const start = make({ hp: 10, maxHp: 40, hdUsed: 1, level: 5 });
    it('gives the die back; other HP actions leave Hit Dice alone', () => {
      const undone = undoHp(healHitDie({ ...spendHitDie(start), amount: 6 }));
      expect(undone).toMatchObject({ hp: 10, hdUsed: 1 });
      expect(undoHp(applyHeal({ ...start, amount: 5 })).hdUsed).toBe(1);
      expect(undoHp(applyDamage({ ...start, amount: 5 })).hdUsed).toBe(1);
      expect('hdUsed' in applyHeal({ ...start, amount: 5 }).hpUndo!.prev).toBe(false);
    });
    it('spending another die drops the old undo, so only one die is ever refunded', () => {
      const again = spendHitDie(healHitDie({ ...spendHitDie(start), amount: 6 }));
      expect(again.hpUndo).toBeNull();
      expect(undoHp(again).hdUsed).toBe(3);
    });
    it('a refused heal (dead) sets no undo', () => {
      expect(healHitDie(make({ hp: 10, exh: 6, amount: 4 })).hpUndo).toBeNull();
    });
  });
});

describe('rests and Hit Dice', () => {
  it('long rest restores HP, slots, hit dice, resources and one exhaustion level', () => {
    const c = longRest(make({ hp: 3, temp: 5, hdUsed: 3, exh: 2, slotUsed: [0, 4, 2, 0, 0, 0, 0, 0, 0, 0] }));
    expect(c).toMatchObject({ hp: 44, temp: 0, hdUsed: 0, exh: 1 });
    expect(c.slotUsed.every((n) => n === 0)).toBe(true);
    expect(c.res.find((r) => r.id === 'favored')?.count).toBe(3);
    expect(c.restMsg?.body).toContain('Refilled: Favored Enemy');
  });
  it('long rest restores a reduced HP maximum and reduced ability scores, not raised ones', () => {
    const c = longRest(make({ hp: 30, maxHp: 38, origHp: 44, origOn: true, abilAdj: { str: -2, con: 2 } }));
    expect(c).toMatchObject({ maxHp: 44, hp: 44, abilAdj: { str: 0, con: 2 } });
    expect(c.restMsg?.body).toContain('HP maximum back to 44');
    expect(c.restMsg?.body).toContain('reduced ability scores restored');
    expect(longRest(make({ maxHp: 49, origHp: 44, origOn: true })).maxHp).toBe(49);
  });
  it('short rest refills only short-rest resources; long rest refills both', () => {
    const base = make();
    base.res = [...base.res, { id: 'x', name: 'Second Wind', count: 0, max: 2, recharge: 'short' }];
    const c = shortRest(base);
    expect(c.res.find((r) => r.id === 'x')?.count).toBe(2);
    expect(c.res.find((r) => r.id === 'favored')?.count).toBe(2);
    expect(longRest(base).res.find((r) => r.id === 'x')?.count).toBe(2);
  });
  it('neither rest starts at 0 HP or at Exhaustion 6', () => {
    for (const rest of [longRest, shortRest]) {
      const c = rest(make({ hp: 0, hdUsed: 3, conds: { Unconscious: true } }));
      expect(c).toMatchObject({ hp: 0, hdUsed: 3 });
      expect(c.restMsg?.body).toContain('at least 1 HP');
    }
    const l = longRest(make({ hp: 10, exh: 6 }));
    expect(l).toMatchObject({ exh: 6, hp: 10 });
    expect(l.restMsg?.body).toMatch(/dead/);
    const s = shortRest(make({ hp: 10, exh: 6, res: [{ id: 'r', name: 'Second Wind', count: 0, max: 1, recharge: 'short' }] }));
    expect(s.res[0].count).toBe(0);
    expect(s.restMsg?.body).toMatch(/dead/);
  });
  it('spends a hit die, unless none are left, at 0 HP or at Exhaustion 6', () => {
    expect(spendHitDie(make({ hdUsed: 1 }))).toMatchObject({ hdUsed: 2, amount: 0 });
    for (const c of [make({ level: 2, hdUsed: 2 }), make({ hp: 0, hdUsed: 1 }), make({ hp: 10, exh: 6, hdUsed: 0 })]) expect(spendHitDie(c)).toBe(c);
  });
  it('heals at least 1 per hit die', () => {
    expect(healHitDie(make({ hp: 20, amount: 0 })).hp).toBe(21);
    expect(healHitDie(make({ hp: 20, amount: 7 })).hp).toBe(27);
  });
});

describe('loading saves and backups', () => {
  it('gives old saves the HP and AC pills, not the sample picks', () => {
    const { pills: _, ...old } = sampleCharacter();
    expect(migrate(old).pills).toEqual(['hp', 'ac', '']);
  });
  it('keeps saved pills and repairs damaged ones', () => {
    expect(migrate(sampleCharacter()).pills).toEqual(['hp', 'ac', 'res:favored']);
    expect(migrate({ ...sampleCharacter(), pills: ['x', 'hp', 'hp', 'ac'] }).pills).toEqual(['', 'hp', '']);
    expect(migrate({ ...sampleCharacter(), pills: [3, 'res:a'] }).pills).toEqual(['', 'res:a', '']);
    expect(migrate({ ...sampleCharacter(), pills: 'hp' }).pills).toEqual(['hp', 'ac', '']);
  });
  it('loads the druid sample unchanged, with its derived numbers', () => {
    const c = druidSample(); // Seren: Druid 12 (PB 4), WIS 20, CON 16 (PHB p.80)
    expect(migrate(c)).toEqual(c);
    expect([spellSaveDC(c), spellAttack(c), saveMod(c, 'wis'), passiveScore(c, 'perception')]).toEqual([17, 9, 9, 19]);
    expect(c.maxHp).toBe(8 + 11 * 5 + 12 * 3); // fixed Hit Points (PHB p.42)
    expect(c.slotMax).toEqual([0, 4, 3, 3, 3, 2, 1, 0, 0, 0]);
    expect(preparedCount(c)).toBe(c.prepMax);
  });
  it('fills missing fields from the sample and marks old levelled spells prepared', () => {
    const c = migrate({ ch: { name: 'Bob' }, spells: [{ id: 's', name: 'Bless', lvl: 1 }] });
    expect(c.ch.name).toBe('Bob');
    expect(c.ch.species).toBe('');
    expect(c.spells[0].prep).toBe(true);
    expect(c.attacks).toEqual(sampleCharacter().attacks);
    expect(migrate({ ...sampleCharacter(), saveProf: {}, skillProf: { arcana: 1 } })).toMatchObject({ saveProf: {}, skillProf: { arcana: 1 } });
  });
  it('replaces values of the wrong type so the sheet can render', () => {
    expect(migrate(null)).toEqual(sampleCharacter());
    expect(migrate('x')).toEqual(sampleCharacter());
    const c = migrate({
      ...sampleCharacter(), spells: 'x', conds: null, abil: { str: '12', dex: 14 }, tab: 'nope', castAb: 'str',
      attacks: [{ id: 'a', name: 'Club', hit: {} }, { name: 'Sling', hit: '+4' }, 7],
      def: { res: ['Fire', 3], vul: 'x' }, defenses: undefined, slotMax: [0, 4], slotUsed: [0, 'x'],
      conc: { name: 'Bless' }, hpUndo: { prev: 1 }, restMsg: { title: 1 }
    });
    expect(c.spells.map((x) => x.id)).toEqual(sampleCharacter().spells.map((x) => x.id));
    expect(c.conds).toEqual({});
    expect(c.abil).toMatchObject({ str: 10, dex: 14 });
    expect(c).toMatchObject({ tab: 'actions', castAb: 'none', conc: null, hpUndo: null, restMsg: null });
    expect(c.attacks.map((a) => a.name)).toEqual(['Sling']);
    expect(c.attacks[0].id).toBeTruthy();
    expect(c.defenses.map((d) => [d.kind, d.name])).toEqual([['res', 'Fire']]);
    // Resources moved out of the tabs into the left column.
    expect(migrate({ ...sampleCharacter(), tab: 'resources' }).tab).toBe('actions');
    expect(c.slotMax).toEqual([0, 4, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(c.slotUsed).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(migrate({ ...sampleCharacter(), castAb: 'toString' }).castAb).toBe('none'); // only an inherited key
  });
  it('clamps values that size lists of buttons, and keeps exactly three attunement slots', () => {
    const c = migrate({ ...sampleCharacter(), level: 1e9, slotMax: [0, 1e9], slotUsed: [0, 50], exh: 99, ds: -1, df: 7, hdUsed: 1e9, attuneIds: [] });
    expect(c).toMatchObject({ level: 20, exh: 6, ds: 0, df: 3, hdUsed: 20 });
    expect(c.slotMax[1]).toBe(9);
    expect(c.slotUsed[1]).toBe(9);
    expect(c.attuneIds).toEqual(['', '', '']);
    expect(migrate({ attuneIds: ['a', 'b', 'c', 'd'] }).attuneIds).toEqual(['', '', '']); // ids of missing items drop
  });
  it('keeps a sense source kind from the list; any other value becomes other', () => {
    const c = migrate({ ...sampleCharacter(), senses: [
      { id: 'x', name: 'Darkvision', range: '60 ft', srcKind: 'race' },
      { id: 'y', name: 'Blindsight', range: '10 ft', srcKind: 'item', srcName: 'Goggles', desc: 'See without light' },
      { id: 'z', name: 'Tremorsense', range: '5 ft' }] });
    expect(c.senses.map((s) => s.srcKind)).toEqual(['other', 'item', undefined]);
    expect(c.senses[1]).toMatchObject({ srcName: 'Goggles', desc: 'See without light' });
  });
  it('turns the old Heroic Inspiration flag into a count with no maximum (house rule)', () => {
    const vals = [true, false, 3, 2.7, -4, 'x', null, undefined];
    expect(vals.map((insp) => migrate({ ...sampleCharacter(), insp }).insp)).toEqual([1, 0, 3, 2, 0, 0, 0, 0]);
  });
  it('renames a spell\'s old source text to srcName, keeping one already set', () => {
    const c = migrate({ ...sampleCharacter(), spells: [{ id: 'a', name: 'Bless', lvl: 1, time: 'Action', range: '30 ft', source: 'Ranger' },
      { id: 'b', name: 'Aid', lvl: 2, time: 'Action', range: '30 ft', source: 'Old', srcName: 'Cleric' },
      { id: 'c', name: 'Light', lvl: 0, time: 'Action', range: 'Touch', source: '' }] });
    expect(c.spells[0]).toMatchObject({ srcName: 'Ranger' });
    expect(c.spells[1]).toMatchObject({ srcName: 'Cleric' });
    expect(c.spells.map((x) => 'source' in x)).toEqual([false, false, false]);
    expect(c.spells[2].srcName).toBeUndefined();
    expect(migrate(oldIlyra()).spells.find((x) => x.id === 'sp4')?.srcName).toBe('Ranger · Favored Enemy');
  });
  it('keeps a spell\'s own casting ability and catalog id only when well formed', () => {
    const c = migrate({ ...sampleCharacter(), spells: [{ id: 'a', name: 'Light', lvl: 0, time: 'Action', range: 'Touch', castAb: 'cha', cid: 'spell/light' },
      { id: 'b', name: 'Light', lvl: 0, time: 'Action', range: 'Touch', castAb: 'luck', cid: 3 }] });
    expect(c.spells[0]).toMatchObject({ castAb: 'cha', cid: 'spell/light' });
    expect([c.spells[1].castAb, c.spells[1].cid]).toEqual([undefined, undefined]);
  });
  it('turns the old refill flag into a recharge', () => {
    const c = migrate({ res: [{ id: 'a', name: 'Ki', count: 1, refill: true }, { id: 'b', name: 'Rage', count: 1, refill: true, recharge: 'short' }, { id: 'c', name: 'Gold', count: 1 }] });
    expect(c.res.map((r) => r.recharge)).toEqual(['long', 'short', 'none']);
  });
});

describe('hpRingStops', () => {
  it('splits HP and temp over max + temp', () => expect(hpRingStops(make({ hp: 31, maxHp: 44, temp: 0 }))).toEqual({ hp: 70.5, temp: 0 }));
  it('fills fully at max', () => expect(hpRingStops(make({ hp: 44, maxHp: 44, temp: 0 }))).toEqual({ hp: 100, temp: 0 }));
  it('shares the ring with temp', () => expect(hpRingStops(make({ hp: 44, maxHp: 44, temp: 11 }))).toEqual({ hp: 80, temp: 20 }));
  it('handles temp above max', () => expect(hpRingStops(make({ hp: 0, maxHp: 10, temp: 30 }))).toEqual({ hp: 0, temp: 75 }));
  it('handles max 0', () => expect(hpRingStops(make({ hp: 0, maxHp: 0, temp: 0 }))).toEqual({ hp: 0, temp: 0 }));
  it('never passes 100 after rounding', () => {
    const s = hpRingStops(make({ hp: 1, maxHp: 1, temp: 1999 }));
    expect(s.hp + s.temp).toBeLessThanOrEqual(100);
  });
});

describe('top bar pills', () => {
  const s = sampleCharacter(); // Ilyra: WIS 14, DEX 18, level 5, Perception proficient, hdUsed 1
  it('resolves each stat', () => {
    expect(pillView(s, 'hp')).toMatchObject({ label: 'HP', value: '31', max: '44', target: { sec: 'sec-hp' } });
    expect(pillView(s, 'ac')).toMatchObject({ value: '16', target: { sec: 'sec-vitals' } });
    expect(pillView(s, 'dc')).toMatchObject({ label: 'DC', value: '13', target: { tab: 'spells' } });
    expect(pillView(s, 'atk')!.value).toBe('+5');
    expect(pillView(s, 'speed')!.value).toBe('35');
    expect(pillView(s, 'pp')).toMatchObject({ value: '15', target: { sec: 'sec-senses' } });
    expect(pillView(s, 'init')!.value).toBe('+4');
    expect(pillView(s, 'hd')).toMatchObject({ value: '4', max: '5' });
    expect(pillView(s, 'insp')).toMatchObject({ value: '1', target: { sec: 'sec-resources' } });
  });
  it('resolves a resource, with and without a maximum', () => {
    expect(pillView(s, resPill('favored'))).toMatchObject({ label: 'Favored Enemy', value: '2', max: '3', target: { sec: 'sec-resources' } });
    expect(pillView({ ...s, res: [{ id: 'x', name: 'Rope', count: 1 }] }, resPill('x'))!.max).toBeUndefined();
  });
  it('shows a dash for spell numbers on a non-caster', () => {
    expect(pillView(blankCharacter(), 'dc')!.value).toBe('—');
    expect(pillView(blankCharacter(), 'atk')!.value).toBe('—');
  });
  it('treats an empty slot, an unknown key and a deleted resource as nothing', () => {
    expect(pillView(s, '')).toBeNull();
    expect(pillView(s, 'nope')).toBeNull();
    expect(pillView(s, resPill('gone'))).toBeNull();
  });
  it('sets, moves and clears a slot', () => {
    expect(setPill(['hp', 'ac', ''], 2, 'dc')).toEqual(['hp', 'ac', 'dc']);
    expect(setPill(['hp', 'ac', 'dc'], 0, 'dc')).toEqual(['dc', 'ac', '']);
    expect(setPill(['hp', 'ac', 'dc'], 1, '')).toEqual(['hp', '', 'dc']);
  });
  it('gives the samples and a blank character their picks', () => {
    expect(sampleCharacter().pills).toEqual(['hp', 'ac', 'res:favored']);
    expect(druidSample().pills).toEqual(['hp', 'ac', 'res:wild']);
    expect(blankCharacter().pills).toEqual(['hp', 'ac', '']);
  });
});

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
  it('sample characters compute their printed AC', () => {
    expect(armorClass(sampleCharacter()).total).toBe(16);
    expect(armorClass(druidSample()).total).toBe(14);
    expect(armorClass(blankCharacter()).total).toBe(10);
  });
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
    expect(castSpell(c, shieldSp, 1).acOn).toEqual(['sh']);
    const again = { ...c, acOn: ['sh'] };
    expect({ ...again, ...castSpell(again, shieldSp, 1) }.acOn).toEqual(['sh']);
    expect(castSpell(c, faith, 1)).not.toHaveProperty('acOn');
    expect(castSpell(c, sp(), 1)).not.toHaveProperty('acOn');
  });
  it('a free cast turns the effect on; restoring it does not turn it off', () => {
    const free = (id: string) => ({ id: 'f' + id, name: 'Free', count: 1, max: 1, recharge: 'long' as const, casts: id });
    const c = make({ ...all, acOn: [], res: [free('sh'), free('sf')] });
    const used = castFree(c, shieldSp, 'fsh');
    expect(used.acOn).toEqual(['sh']);
    expect(used.res!.find((r) => r.id === 'fsh')!.count).toBe(0);
    const back = castFree({ ...c, ...used }, shieldSp, 'fsh');
    expect(back).not.toHaveProperty('acOn');
    expect(back.res!.find((r) => r.id === 'fsh')!.count).toBe(1);
    expect(castFree(c, faith, 'fsf').conc).toEqual({ id: 'sf', name: 'Shield of Faith' });
    const on = { ...c, acOn: ['sh'] }; // already on from a slot cast
    expect({ ...on, ...castFree(on, shieldSp, 'fsh') }.acOn).toEqual(['sh']);
  });
  it('toggle, edit, removal and Long Rest switch AC spells off', () => {
    const c = make({ ...all, acOn: ['sh', 'bk'] });
    expect(toggleAcSpell(c, 'sh').acOn).toEqual(['bk']);
    expect(toggleAcSpell(c, 'ma').acOn).toEqual(['sh', 'bk', 'ma']);
    expect(acAfterEdit(c, { id: 'sh', c: true, acFx: 'bonus' }).acOn).toEqual(['bk']);
    expect(acAfterEdit(c, { id: 'sh', c: false, acFx: undefined }).acOn).toEqual(['bk']);
    expect(acAfterEdit(c, { id: 'sh', c: false, acFx: 'bonus' })).toEqual({});
    expect(acAfterEdit(c, { id: 'ma', c: true, acFx: 'base' })).toEqual({}); // not on: nothing to remove
    expect(removeSpell(c, 'sh').acOn).toEqual(['bk']);
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
  });
});

describe('AC migration', () => {
  const old = (p: Record<string, unknown>) => ({ ...blankCharacter(), ...p }) as Record<string, unknown>;
  it('detects armor and AC spells by name on saves with a typed ac, without switching spells on', () => {
    const c = migrate(old({ ac: 16, abil: sampleCharacter().abil, inv: [{ id: 'i', name: 'Studded Leather Armor', qty: 1, eq: true }],
      spells: [{ id: 's', name: 'Shield', lvl: 1, time: 'Reaction', range: 'Self', source: 'Wizard' }] }));
    expect(c.inv[0]).toMatchObject({ armor: 'light', acBase: 12 });
    expect(c.spells[0]).toMatchObject({ acFx: 'bonus', acVal: 5 });
    expect(c.acOn).toEqual([]);
    expect(c.acMods).toEqual([]);
    expect(armorClass(c).total).toBe(16);
  });
  it('keeps the old number with an adjustment bonus when the parts disagree', () => {
    const c = migrate(old({ ac: 13, inv: [{ id: 'p', name: 'Leather Pouch', qty: 1, eq: true }] }));
    expect(c.inv[0].armor).toBeUndefined();
    expect(c.acMods).toEqual([{ id: expect.any(String), name: 'Adjustment (from old AC)', val: 3 }]);
    expect(armorClass(c).total).toBe(13);
  });
  it('adds no adjustment when the old number already matches', () => {
    expect(migrate(old({ ac: 10 })).acMods).toEqual([]);
  });
  it('never re-detects on saves already in the new shape', () => {
    const { ac: _, ...fresh } = old({ inv: [{ id: 'i', name: 'Shield', qty: 1, eq: true }] });
    expect(migrate(fresh).inv[0].armor).toBeUndefined();
  });
  it('drops damaged or stale AC state', () => {
    const c = migrate(old({
      spells: [{ id: 'sh', name: 'Shield', lvl: 1, time: 'Reaction', range: 'Self', source: 'W', acFx: 'bonus', acVal: 5 },
        { id: 'sf', name: 'Shield of Faith', lvl: 1, time: 'Bonus Action', range: '60 ft', source: 'C', c: true, acFx: 'bonus', acVal: 2 },
        { id: 'bl', name: 'Bless', lvl: 1, time: 'Action', range: '30 ft', source: 'C' }],
      acOn: ['sh', 'sf', 'bl', 'gone', 7], acUnarm: 'wizard', acMods: [{ id: 'm', name: 'Ok', val: 1 }, { id: 'x', name: 'Bad', val: 'two' }]
    }));
    expect(c.acOn).toEqual(['sh']);
    expect(c.acUnarm).toBe('none');
    expect(c.acMods.map((m) => m.name)).toEqual(['Ok']);
  });
  it('drops damaged AC fields on items and spells', () => {
    const c = migrate(old({
      inv: [{ id: 'a', name: 'A', qty: 1, eq: true, armor: 'light', acBase: '12' },
        { id: 'b', name: 'B', qty: 1, eq: true, armor: 'robe', acBase: 11 },
        { id: 'c', name: 'C', qty: 1, eq: true, armor: 'heavy', acBase: 16, acBonus: '1' },
        { id: 'd', name: 'D', qty: 1, eq: false, acBonus: '1' }],
      spells: [{ id: 'x', name: 'X', lvl: 1, time: 'Action', range: 'Self', source: 'W', acFx: 'bonus', acVal: 'x' },
        { id: 'y', name: 'Y', lvl: 1, time: 'Action', range: 'Self', source: 'W', acFx: 'wall', acVal: 3 }]
    }));
    expect(c.inv.map((i) => [i.armor, i.acBase, i.acBonus])).toEqual([
      [undefined, undefined, undefined], [undefined, undefined, undefined], ['heavy', 16, undefined], [undefined, undefined, undefined]
    ]);
    expect(c.spells.map((s) => [s.acFx, s.acVal])).toEqual([[undefined, undefined], [undefined, undefined]]);
    expect(Number.isFinite(armorClass(c).total)).toBe(true);
  });
});

describe('saves keep working', () => {
  it('migrate leaves both samples unchanged', () => {
    expect(migrate(sampleCharacter())).toEqual(sampleCharacter());
    expect(migrate(druidSample())).toEqual(druidSample());
  });
  it('fills every new field from the blank character, not the sample, when a save lacks it or holds the wrong type', () => {
    for (const k of NEW_FIELDS) {
      const raw = { ...sampleCharacter() } as Record<string, unknown>;
      delete raw[k];
      // A save without profs also has its Training features split (Training migration); leave none to split here.
      if (k === 'profs') raw.feats = sampleCharacter().feats.filter((f) => f.g !== 'training');
      expect(migrate(raw)[k]).toEqual(blankCharacter()[k]);
      expect(migrate({ ...sampleCharacter(), [k]: 7 })[k]).toEqual(blankCharacter()[k]); // no new field is a number
    }
  });
});

describe('spell sort order', () => {
  const list = [
    sp({ id: 'a', name: 'Zap', time: '1 hour' }), sp({ id: 'b', name: 'Aid', time: 'Reaction, which you take when hit' }),
    sp({ id: 'c', name: 'Mend', time: 'bonus action', prep: true }), sp({ id: 'd', name: 'Bolt', time: 'Action or Ritual' }),
    sp({ id: 'e', name: 'Odd', time: 'Special' }), sp({ id: 'f', name: 'Rest', time: '10 minutes' })
  ];
  const ids = (s: 'az' | 'prep' | 'time') => sortSpells(make({ spellSort: s }), list).map((x) => x.id);
  it('sorts A–Z, prepared first, or by casting time with unknown times last', () => {
    expect(ids('az')).toEqual(['b', 'd', 'c', 'e', 'f', 'a']);
    expect(ids('prep')).toEqual(['c', 'b', 'd', 'e', 'f', 'a']);
    expect(ids('time')).toEqual(['d', 'c', 'b', 'f', 'a', 'e']);
  });
  it('falls back to A–Z for an unknown saved sort', () => {
    expect(migrate({ ...sampleCharacter(), spellSort: 'zz' }).spellSort).toBe('az');
  });
});

describe('defenses', () => {
  const { defenses: _, ...noDefenses } = sampleCharacter();
  const old = { ...noDefenses, def: { res: ['Fire', 'Charmed', 'Exhaustion', 'Mud'], vul: ['Poisoned'], imm: ['Poison', 'Frightened'] }, saveNotes: 'Advantage vs traps' };
  const pairs = (c: Character) => c.defenses.map((d) => [d.kind, d.name]);
  it('moves save notes and conditions under Resistances to Advantage on saves (PHB p.28)', () => {
    const c = migrate(old);
    expect(pairs(c)).toEqual([['res', 'Fire'], ['res', 'Mud'], ['vul', 'Poisoned'], ['imm', 'Poison'], ['imm', 'Frightened'],
      ['adv', 'Advantage vs traps'], ['adv', 'vs Charmed'], ['adv', 'vs Exhaustion']]);
    expect(c).not.toHaveProperty('saveNotes');
    expect(c).not.toHaveProperty('def');
    expect(migrate(c)).toEqual(c);
  });
  it('adds nothing for blank save notes and never duplicates an entry', () => {
    expect(migrate({ ...old, def: { res: [], vul: [], imm: [] }, saveNotes: '  ' }).defenses).toEqual([]);
    expect(pairs(migrate({ ...old, def: { res: ['Charmed'], vul: [], imm: [], adv: ['vs Charmed'] }, saveNotes: '' }))).toEqual([['adv', 'vs Charmed']]);
  });
  it('turns an old save\'s defense lists into entries, and only once', () => {
    const c = migrate({ ...oldIlyra(), def: { res: ['Poisoned'], vul: [], imm: [], adv: [] }, saveNotes: 'vs magic' });
    expect(pairs(c)).toEqual([['adv', 'vs magic'], ['adv', 'vs Poisoned']]);
    expect(pairs(migrate(oldIlyra()))).toEqual([['adv', 'vs Charmed']]);
    expect(pairs(migrate({ ...sampleCharacter(), def: { res: ['Fire'], vul: [], imm: [], adv: [] } }))).toEqual(pairs(sampleCharacter()));
  });
  it('drops a defense of an unknown kind and reads an unknown source kind as Other', () => {
    const c = migrate({ ...sampleCharacter(), defenses: [{ id: 'a', kind: 'weak', name: 'Fire' }, { id: 'b', kind: 'res', name: 'Cold', srcKind: 'x' }] });
    expect(c.defenses).toEqual([{ id: 'b', kind: 'res', name: 'Cold', srcKind: 'other' }]);
  });
  it('shows a defense once per name with every source, active ones only', () => {
    const cloak: Item = { id: 'ck', name: 'Cloak', qty: 1, eq: true };
    const c = make({ inv: [cloak], defenses: [
      { id: 'a', kind: 'res', name: 'Cold', from: 'feature:f12' }, { id: 'b', kind: 'res', name: 'cold', from: 'item:ck', needEq: true },
      { id: 'c', kind: 'res', name: 'Fire' }] });
    expect(mergedDefenses(c, 'res')).toEqual([
      { key: 'cold', name: 'Cold', ids: ['a', 'b'], sources: ['Species · Fey Ancestry', 'Item · Cloak'] },
      { key: 'fire', name: 'Fire', ids: ['c'], sources: [] }]);
    const off = { ...c, inv: [{ ...cloak, eq: false }] };
    expect(mergedDefenses(off, 'res')[0]).toMatchObject({ ids: ['a'], sources: ['Species · Fey Ancestry'] });
    expect(removeRef(c, { kind: 'defense', id: 'c' }).defenses.map((d) => d.id)).toEqual(['a', 'b']);
  });
});

describe('senses shown once per name', () => {
  const goggles: Item = { id: 'g', name: 'Goggles', qty: 1, eq: true };
  it('keeps the longest range and lists both sources', () => {
    const c = make({ inv: [goggles], senses: [{ id: 'a', name: 'Darkvision', range: '60 ft', from: 'feature:f11' }, { id: 'b', name: 'Darkvision', range: '120 ft', from: 'item:g' }] });
    expect(mergedSenses(c)).toEqual([{ key: 'darkvision', name: 'Darkvision', range: '120 ft', ids: ['a', 'b'], sources: ['Species · Darkvision', 'Item · Goggles'] }]);
  });
  it('shows both ranges when one has no number', () => {
    const c = make({ senses: [{ id: 'a', name: 'Darkvision', range: '60 ft' }, { id: 'b', name: 'Darkvision', range: 'see invisible' }] });
    expect(mergedSenses(c)[0].range).toBe('60 ft / see invisible');
  });
});

describe('carrying capacity', () => {
  const str = (s: number) => ({ abil: { ...sampleCharacter().abil, str: s } });
  it('carries STR × 15 lb at Small/Medium, ×7.5 Tiny, ×30 Large, ×60 Huge, ×120 Gargantuan; drag/lift/push is twice that (PHB p.363)', () => {
    expect(carryCapacity(make())).toEqual({ carry: 180, push: 360, size: 'medium' }); // Ilyra STR 12
    expect(carryCapacity(make({ size: 'tiny' }))).toEqual({ carry: 90, push: 180, size: 'tiny' });
    expect(carryCapacity(make({ size: 'huge', ...str(10) }))).toEqual({ carry: 600, push: 1200, size: 'huge' });
  });
  it('counts one size larger with the carry toggle, never past Gargantuan (Powerful Build, PHB p.192)', () => {
    expect(carryCapacity(make({ size: 'small', carryUp: true })).size).toBe('medium');
    expect(carryCapacity(make({ carryUp: true }))).toEqual({ carry: 360, push: 720, size: 'large' });
    expect(carryCapacity(make({ size: 'gargantuan', carryUp: true })).carry).toBe(1440);
  });
  it('uses the effective Strength score and never changes Speed', () => {
    expect(carryCapacity(make({ abilAdj: { str: -2 } })).carry).toBe(150);
    const heavy = make({ inv: [it_({ wt: 500 })] });
    expect(carriedWeight(heavy)).toBeGreaterThan(carryCapacity(heavy).carry);
    expect(speedNow(heavy)).toBe(35);
  });
  it('adds item weight × quantity and 50 coins to the pound (PHB p.213)', () => {
    const c = make({ inv: [it_({ wt: 2, qty: 3 }), it_({ id: 'b', wt: 0.25, qty: 4 }), it_({ id: 'c' })], coins: { cp: 0, sp: 0, ep: 0, gp: 100, pp: 25 } });
    expect(carriedWeight(c)).toBe(9.5);
  });
  it('reads typed weights with a decimal point or comma', () => {
    expect(['2', '0,5', ' 1.25 ', '', 'abc', '-1'].map(parseWeight)).toEqual([2, 0.5, 1.25, undefined, undefined, undefined]);
  });
  it('drops damaged weights and sizes on load', () => {
    const c = migrate({ ...sampleCharacter(), size: 'colossal', carryUp: 'yes', inv: [{ id: 'a', name: 'Rope', qty: 1, eq: false, wt: 'x' }, { id: 'b', name: 'Pot', qty: 1, eq: false, wt: -3 }] });
    expect(c).toMatchObject({ size: 'medium', carryUp: false });
    expect(c.inv.map((i) => i.wt)).toEqual([undefined, undefined]);
  });
});

describe('attunement and resources moving to Inventory', () => {
  it('turns inventory resources into items, charged ones with their charges, and empties their pills', () => {
    const c = migrate({ inv: [], attune: ['', '', ''], pills: ['hp', 'res:r1', 'res:r2'], res: [
      { id: 'r1', name: 'Arrows', note: 'Tap −', count: 20, inv: true },
      { id: 'r2', name: 'Wand', count: 3, max: 7, recharge: 'none', inv: true },
      { id: 'r3', name: 'Herbs', count: 1, refill: true, inv: true },
      { id: 'r4', name: 'Ki', count: 2, max: 2, recharge: 'short' }] });
    expect(c.inv).toEqual([{ id: expect.any(String), name: 'Arrows', qty: 20, eq: false, desc: 'Tap −' },
      { id: expect.any(String), name: 'Wand', qty: 1, eq: false, count: 3, max: 7, recharge: 'none' },
      { id: expect.any(String), name: 'Herbs', qty: 1, eq: false, count: 1, recharge: 'long' }]);
    expect(c.res.map((r) => [r.id, r.recharge])).toEqual([['r4', 'short']]);
    expect(c.pills).toEqual(['hp', '', '']);
    expect(c.attuneIds).toEqual(['', '', '']);
  });
  it('still converts very old saves without the inv flag, and only on saves from before this change', () => {
    const old = migrate({ inv: [], res: [{ id: 'arrows', name: 'Arrows', count: 5 }, { id: 'n1', name: 'Rations', count: 3 }] });
    expect(old.inv.map((i) => i.name)).toEqual(['Arrows']);
    expect(old.res.map((r) => r.id)).toEqual(['n1']);
    const now = migrate({ attuneIds: ['', '', ''], res: [{ id: 'arrows', name: 'Arrows', count: 5 }] });
    expect(now.res.map((r) => r.id)).toEqual(['arrows']);
  });
  it('links attunement slot names to items: matches, duplicates, unknown text, converted resources', () => {
    const a = migrate({ attune: [' cloak of elvenkind ', 'Ring', 'Ring'], res: [], inv: [
      { id: 'i1', name: 'Cloak of Elvenkind', qty: 1, eq: false }, { id: 'i2', name: 'Ring', qty: 1, eq: true }, { id: 'i3', name: 'Ring', qty: 1, eq: true }] });
    expect(a.attuneIds).toEqual(['i1', 'i2', 'i3']);
    expect(a.inv[0].eq).toBe(false); // a matched item keeps its eq flag
    const b = migrate({ attune: ['Pearl of Power', 'Shield', 'Ring'], inv: [{ id: 'i2', name: 'Ring', qty: 1, eq: true }],
      res: [{ id: 'p', name: 'Pearl of Power', count: 1, inv: true }] });
    expect(b.attuneIds[2]).toBe('i2');
    expect(b.inv.find((i) => i.id === b.attuneIds[0])).toMatchObject({ name: 'Pearl of Power', eq: true });
    expect(b.inv.find((i) => i.id === b.attuneIds[1])).toEqual({ id: b.attuneIds[1], name: 'Shield', qty: 1, eq: true }); // no detectArmor
    const d = migrate({ attune: ['Ring', 'Ring', '  '], res: [], inv: [{ id: 'i2', name: 'Ring', qty: 1, eq: true }] });
    expect(d.attuneIds[0]).toBe('i2');
    expect(d.inv.find((i) => i.id === d.attuneIds[1])).toMatchObject({ name: 'Ring', eq: true });
    expect(d.attuneIds[2]).toBe('');
    expect(migrate({ attune: ['Cartographer\'s Tools'], res: [], inv: [{ id: 't', name: 'Cartographer’s Tools', qty: 1, eq: true }] }).attuneIds[0]).toBe('t');
    const e = migrate({ attune: ['-', 'None', '—'], res: [], inv: [] });
    expect(e.attuneIds).toEqual(['', '', '']); // placeholder text never becomes an item
    expect(e.inv).toEqual([]);
    // A charged item tracked as a resource becomes the attuned item, with its charges.
    const w = migrate({ attune: ['Wand of Magic Missiles'], inv: [],
      res: [{ id: 'w', name: 'Wand of Magic Missiles', count: 7, max: 7, recharge: 'none', inv: true }] });
    expect(w.res).toEqual([]);
    expect(w.inv).toEqual([{ id: w.attuneIds[0], name: 'Wand of Magic Missiles', qty: 1, eq: true, count: 7, max: 7, recharge: 'none' }]);
  });
  it('turns damaged resource fields into safe item values', () => {
    const c = migrate({ inv: [], res: [{ id: 'r', name: 'Rope', note: 5, count: 'x', inv: true }, { id: 's', name: 'Bolts', count: 4.6, inv: true }] });
    expect(c.inv).toEqual([{ id: expect.any(String), name: 'Rope', qty: 1, eq: false }, { id: expect.any(String), name: 'Bolts', qty: 4, eq: false }]);
  });
  it('is idempotent on a converted old save', () => {
    const once = migrate({ attune: ['Pearl', 'Lamp', ''], res: [{ id: 'p', name: 'Pearl', count: 1, inv: true }], inv: [] });
    expect(migrate(once)).toEqual(once);
  });
  it('drops missing, repeated and damaged attunement ids', () => {
    const inv = [{ id: 'i2', name: 'Ring', qty: 1, eq: true }];
    expect(migrate({ attuneIds: ['i2', 'gone', 'i2'], inv }).attuneIds).toEqual(['i2', '', '']);
    expect(migrate({ attuneIds: [3, 'i2'], inv }).attuneIds).toEqual(['', 'i2', '']);
  });
  it('removing an item clears its attunement slot; unequipping keeps it attuned', () => {
    const s = sampleCharacter();
    const cloak = s.attuneIds[0];
    expect(removeItem(s, cloak).attuneIds).toEqual(['', '', '']);
    expect(removeItem(s, cloak).inv.some((i) => i.id === cloak)).toBe(false);
    expect(migrate({ ...s, inv: s.inv.map((i) => (i.id === cloak ? { ...i, eq: false } : i)) }).attuneIds[0]).toBe(cloak);
  });
});

// Numbers the samples showed before plan 3 (frozen). Every later change must keep them; the rebuilt samples too.
describe('sample numbers', () => {
  // Resources: the maxima of the ones the sample had then; resources added since (free casts) are checked elsewhere.
  const numbers = (c: Character, ids: string[] = c.res.map((r) => r.id)) => ({
    eff: ABILITIES.map(([k]) => effScore(c, k)), save: ABILITIES.map(([k]) => saveMod(c, k)),
    skills: Object.fromEntries(SKILLS.map(([k, , ab]) => [k, skillMod(c, k, ab)])),
    speed: speedNow(c), ac: armorClass(c).total, init: initiative(c), maxHp: maxHpOf(c), pp: passiveScore(c, 'perception'),
    res: Object.fromEntries(ids.map((id) => [id, c.res.some((r) => r.id === id) ? maxOf(c, c.res.find((r) => r.id === id)!) : 'missing']))
  });
  const ILYRA = { eff: [12, 18, 14, 10, 14, 8], save: [4, 7, 2, 0, 2, -1], skills: { athletics: 1, acrobatics: 4, sleight: 4, stealth: 7, arcana: 0, history: 0, investigation: 0, nature: 3, religion: 0, animal: 5, insight: 5, medicine: 2, perception: 5, survival: 8, deception: -1, intimidation: -1, performance: -1, persuasion: -1 }, speed: 35, ac: 16, init: 4, maxHp: 44, pp: 15, res: { favored: 3 } };
  const SEREN = { eff: [8, 13, 16, 13, 20, 10], save: [-1, 1, 3, 5, 9, 0], skills: { athletics: -1, acrobatics: 1, sleight: 1, stealth: 1, arcana: 5, history: 5, investigation: 1, nature: 1, religion: 1, animal: 5, insight: 5, medicine: 9, perception: 9, survival: 5, deception: 0, intimidation: 0, performance: 0, persuasion: 0 }, speed: 25, ac: 14, init: 1, maxHp: 99, pp: 19, res: { wild: 3, bolt: 5, omen: 5, resurge: 1, hands: 1, reveal: 1 } };
  it('Ilyra, and an old save of her', () => {
    expect(numbers(sampleCharacter(), Object.keys(ILYRA.res))).toEqual(ILYRA);
    expect(numbers(migrate(oldIlyra()), Object.keys(ILYRA.res))).toEqual(ILYRA);
  });
  it('Seren, and an old save of her', () => {
    // The one change the rebuild makes (approved by the owner): Primal Order · Magician now counts, adding her WIS
    // modifier (+5) to Arcana and Nature checks (PHB p.80). Today's sheet could only hold it in the feature's text.
    expect(numbers(druidSample(), Object.keys(SEREN.res))).toEqual({ ...SEREN, skills: { ...SEREN.skills, arcana: 10, nature: 6 } });
    expect(numbers(migrate(oldSeren()), Object.keys(SEREN.res))).toEqual(SEREN);
  });
});

describe('ability score grants', () => {
  const g = (id: string, ab: string, val: string, cap: 20 | 25 | 30 = 20, p: Partial<Grant> = {}): Grant =>
    ({ id, kind: 'abil', name: 'Grant ' + id, ab, val, cap, from: 'feature:f10', ...p });
  const withAbil = (dex: number, grants: Grant[], p: Partial<Character> = {}) => make({ abil: { ...make().abil, dex }, abilAdj: {}, grants, ...p });
  it('adds grants up to their cap of 20 (PHB p.38) and marks the one the cap cuts', () => {
    const c = withAbil(19, [g('a', 'dex', '1'), g('b', 'dex', '1')]);
    expect(effScore(c, 'dex')).toBe(20);
    expect(abilityParts(c, 'dex').find((p) => p.label === 'Grant b')).toMatchObject({ value: 0, note: 'capped at 20' });
  });
  it('never lowers a score above the cap', () => {
    expect(effScore(withAbil(21, [g('a', 'dex', '2')]), 'dex')).toBe(21);
  });
  it('applies cap-20 grants before higher caps, whatever the list order', () => {
    expect(effScore(withAbil(20, [g('a', 'dex', '1'), g('b', 'dex', '1', 30)]), 'dex')).toBe(21);
    expect(effScore(withAbil(20, [g('b', 'dex', '1', 30), g('a', 'dex', '1')]), 'dex')).toBe(21);
  });
  it('a set score raises to the highest set, then the adjustment applies', () => {
    const set = (id: string, val: string): Grant => ({ id, kind: 'abilSet', name: 'Set ' + id, ab: 'dex', val, from: 'feature:f10' });
    expect(effScore(withAbil(18, [set('a', '19'), set('b', '23')]), 'dex')).toBe(23);
    expect(effScore(withAbil(18, [set('a', '19'), set('b', '23')], { abilAdj: { dex: -2 } }), 'dex')).toBe(21);
  });
  it('a counted grant adds nothing and shows as counted', () => {
    const c = withAbil(18, [g('a', 'dex', '2', 20, { counted: true })]);
    expect(effScore(c, 'dex')).toBe(18);
    expect(abilityParts(c, 'dex').find((p) => p.label === 'Grant a')).toMatchObject({ note: 'counted' });
  });
  it('an inactive grant adds nothing', () => {
    const c = withAbil(14, [g('a', 'dex', '2', 20, { from: 'item:i2', needEq: true })], { inv: [{ id: 'i2', name: 'Gloves', qty: 1, eq: false }] });
    expect(effScore(c, 'dex')).toBe(14);
    expect(effScore({ ...c, inv: [{ ...c.inv[0], eq: true }] }, 'dex')).toBe(16);
  });
  it('Primal Champion raises to a cap of 25 (PHB p.53)', () => {
    expect(effScore(withAbil(20, [g('a', 'dex', '4', 25)]), 'dex')).toBe(24);
  });
  it('breaks a score into its base, grants and adjustment', () => {
    const c = withAbil(15, [g('a', 'dex', '2')], { abilAdj: { dex: -1 } });
    expect(abilityParts(c, 'dex').map((p) => [p.label, p.value])).toEqual([['Score', 15], ['Grant a', 2], ['Adjustment', -1]]);
  });
});

describe('proficiencies', () => {
  const pg = (id: string, cat: Grant['cat'], target?: string, p: Partial<Grant> = {}): Grant =>
    ({ id, kind: 'prof', name: 'Prof ' + id, cat, ...(target ? { target } : {}), from: 'feature:f4', ...p });
  it('takes the higher of the hand level and the grants, and names the grant that raised it', () => {
    const c = make({ skillProf: { stealth: 1, survival: 2 }, grants: [pg('a', 'expertise', 'stealth'), pg('b', 'skill', 'survival')] });
    expect(skillLevel(c, 'stealth')).toEqual({ level: 2, hand: 1, by: 'Class · Deft Explorer' });
    expect(skillLevel(c, 'survival')).toEqual({ level: 2, hand: 2 });
    expect(skillLevel({ ...c, grants: [] }, 'stealth')).toEqual({ level: 1, hand: 1 });
    expect(skillMod(c, 'stealth', 'dex')).toBe(4 + 6);
  });
  it('adds half Proficiency Bonus, rounded down, to skills without proficiency (PHB p.60), not to Initiative', () => {
    const bard = make({ level: 5, skillProf: { arcana: 1 }, grants: [pg('j', 'half')] });
    expect(skillMod(bard, 'history', 'int')).toBe(0 + 1);
    expect(skillMod(bard, 'arcana', 'int')).toBe(0 + 3);
    expect(initiative(bard)).toBe(initiative(make({ level: 5 })));
  });
  it('adds check bonuses to a skill or to every skill of an ability', () => {
    const cb = (target: string): Grant => ({ id: 'c' + target, kind: 'checkBonus', name: 'Magician', target, val: 'wis>=1', from: 'feature:f4' });
    const low = make({ abil: { ...make().abil, wis: 8 }, skillProf: {} });
    expect(skillMod({ ...low, grants: [cb('arcana')] }, 'arcana', 'int')).toBe(1);
    expect(skillMod({ ...low, grants: [cb('arcana')] }, 'history', 'int')).toBe(0);
    const intAll = { ...low, grants: [cb('int')] };
    expect(['arcana', 'history', 'nature'].map((k) => skillMod(intAll, k, 'int'))).toEqual([1, 1, 1]);
    expect(initiative({ ...low, grants: [cb('dex')] })).toBe(initiative(low) + 1); // Initiative is a Dexterity check (PHB p.23)
  });
  it('adds save bonuses and save proficiency grants', () => {
    const aura: Grant = { id: 'au', kind: 'saveBonus', name: 'Aura', ab: 'all', val: 'cha>=1', from: 'feature:f4' };
    const c = make({ grants: [aura] }); // CHA 8: at least +1
    expect(ABILITIES.map(([k]) => saveMod(c, k) - saveMod(make(), k))).toEqual([1, 1, 1, 1, 1, 1]);
    const s = make({ grants: [pg('s', 'save', 'con')] });
    expect(saveProficient(s, 'con')).toEqual({ on: true, by: 'Class · Deft Explorer' });
    expect(saveProficient(s, 'str')).toEqual({ on: true });
    expect(saveMod(s, 'con')).toBe(2 + 3);
  });
  it('lists hand and granted proficiencies once per name', () => {
    const c = make({ profs: [{ id: 'p1', cat: 'tool', name: 'Thieves’ Tools' }], grants: [pg('t', 'tool', "thieves' tools"), pg('l', 'language', 'Elvish')] });
    expect(profList(c)).toEqual([{ cat: 'tool', name: 'Thieves’ Tools', id: 'p1', by: 'Class · Deft Explorer' }, { cat: 'language', name: 'Elvish', by: 'Class · Deft Explorer' }]);
    expect(hasProf(c, 'language', 'elvish')).toBe(true);
    expect(hasProf(c, 'weapon', 'club')).toBe(false);
  });
});

describe('Training migration', () => {
  const names = (c: Character) => c.profs.map((p) => p.name);
  it('turns Ilyra\'s old Training features into proficiencies', () => {
    const c = migrate(oldIlyra());
    expect(names(c)).toEqual(['Light armor', 'Medium armor', 'Shields', 'Simple weapons', 'Martial weapons', 'Cartographer’s Tools', 'Common', 'Elvish', 'Sylvan', 'Draconic']);
    expect(c.profs.map((p) => p.cat)).toEqual(['armor', 'armor', 'armor', 'weapon', 'weapon', 'tool', 'language', 'language', 'language', 'language']);
    expect(c.feats.some((f) => f.g === 'training')).toBe(false);
    expect(hasProf(c, 'weapon', 'martial weapons')).toBe(true);
    expect(migrate(c)).toEqual(c);
  });
  it('converts all of Seren\'s, Druidic included', () => {
    const c = migrate(oldSeren());
    expect(names(c)).toEqual(['Light armor', 'Shields', 'Simple weapons', 'Herbalism Kit', 'Calligrapher’s Supplies', 'Common', 'Druidic', 'Elvish', 'Dwarvish']);
    expect(c.feats.some((f) => f.g === 'training')).toBe(false);
  });
  it('matches only full names under another heading, and keeps what it can\'t match', () => {
    const { feats, profs } = splitTraining([{ id: 'x', g: 'training', name: 'Proficiencies', desc: 'Light, Thieves’ Tools' },
      { id: 'y', g: 'training', name: 'Tools', desc: 'Ox cart, Smith’s Tools' }, { id: 'z', g: 'class', name: 'Rage', desc: 'Angry' }]);
    expect(profs.map((p) => [p.cat, p.name])).toEqual([['tool', 'Thieves’ Tools'], ['tool', 'Smith’s Tools']]);
    expect(feats.map((f) => [f.id, f.desc])).toEqual([['x', 'Light'], ['y', 'Ox cart'], ['z', 'Angry']]);
  });
  it('runs only on saves without proficiencies', () => {
    const raw = { ...oldIlyra(), profs: [], feats: [{ id: 't', g: 'training', name: 'Tools', desc: 'Thieves\' Tools' }] };
    expect(migrate(raw).feats.filter((f) => f.g === 'training')).toEqual([{ id: 't', g: 'training', name: 'Tools', desc: 'Thieves\' Tools' }]);
    expect(migrate(raw).profs).toEqual([]);
  });
  it('drops a proficiency with an unknown category', () => {
    expect(migrate({ ...sampleCharacter(), profs: [{ id: 'a', cat: 'vehicle', name: 'Boat' }, { id: 'b', cat: 'tool', name: 'Lute' }] }).profs).toEqual([{ id: 'b', cat: 'tool', name: 'Lute' }]);
  });
});

describe('speed, initiative, size and HP per level', () => {
  const tough: Grant = { id: 't', kind: 'hpLvl', name: 'Tough', val: '2', from: 'feature:f10' };
  const t5 = (p: Partial<Character> = {}) => make({ level: 5, maxHp: 44, origHp: 44, hp: 44, grants: [tough], ...p });
  it('adds HP per level on top of the typed maximum (Tough, PHB p.202)', () => {
    expect(maxHpOf(t5())).toBe(54);
    expect(applyHeal(t5({ hp: 50, amount: 10 })).hp).toBe(54);
    expect(setHp(t5({ hp: 20 }), 60).hp).toBe(54);
    expect(maxHpOf(t5({ grants: [{ ...tough, counted: true }] }))).toBe(44);
    expect(pillView(t5(), 'hp')!.max).toBe('54');
  });
  it('keeps the typed maximum typed and clamps HP to the effective one', () => {
    expect(setMaxHp(t5({ hp: 50 }), 40)).toEqual({ maxHp: 40, hp: 50 });
    expect(setMaxHp(make({ hp: 50, maxHp: 54 }), 40)).toEqual({ maxHp: 40, hp: 40 });
  });
  it('a Long Rest restores the typed original, and HP to it plus the grant', () => {
    const c = longRest(t5({ hp: 20, maxHp: 40, origOn: true }));
    expect(c).toMatchObject({ maxHp: 44, hp: 54 });
    expect(maxHpOf({ ...t5({ maxHp: 40, origOn: true }), maxHp: 44 })).toBe(54); // the original the HP panel shows
  });
  it('massive damage compares with the effective maximum (PHB p.29)', () => {
    expect(applyDamage(t5({ hp: 10, amount: 64 })).df).toBe(3);
    expect(applyDamage(t5({ hp: 10, amount: 63 })).df).toBe(0);
    expect(applyDamage(t5({ hp: 10, amount: 54, grants: [] })).df).toBe(3);
    expect(applyDamage(t5({ hp: 0, amount: 53 })).df).toBe(1);
  });
  it('adds walking speed grants and takes the best of a typed or granted speed', () => {
    const elf: Grant = { id: 'w', kind: 'speed', name: 'Fleet of Foot', mode: 'walk', val: '5', from: 'feature:f15' };
    const c = make({ speedBase: 30, grants: [elf] });
    expect(walkSpeed(c)).toBe(35);
    expect(speedNow(c)).toBe(35);
    expect(walkSpeed(make({ speedBase: 30, grants: [{ ...elf, counted: true }] }))).toBe(30);
    const climb: Grant = { id: 'c', kind: 'speed', name: 'Climber', mode: 'climb', val: 'walk', from: 'feature:f15' };
    expect(modeSpeed(make({ speedBase: 30, grants: [elf, climb] }), 'climb')).toEqual({ base: 35, hover: false, by: 'Species · Elven Lineage' });
    expect(modeSpeed(make({ speedBase: 30, speeds: { climb: 40, swim: 0, fly: 0, burrow: 0 }, grants: [climb] }), 'climb')).toEqual({ base: 40, hover: false });
    const fly: Grant = { id: 'f', kind: 'speed', name: 'Wings', mode: 'fly', val: '30', hover: true, from: 'feature:f15' };
    expect(modeSpeed(make({ grants: [fly] }), 'fly')).toMatchObject({ base: 30, hover: true });
  });
  it('adds Initiative grants (Alert adds PB, PHB p.200)', () => {
    const alert: Grant = { id: 'a', kind: 'init', name: 'Alert', val: 'pb', from: 'feature:f10' };
    expect(initiative(make({ level: 5, grants: [alert] }))).toBe(initiative(make({ level: 5 })) + 3);
    expect(initiative(make({ level: 5, grants: [{ ...alert, counted: true }] }))).toBe(initiative(make({ level: 5 })));
  });
  it('size and carrying size grants (Powerful Build, PHB p.192; a grant never lowers a hand size)', () => {
    const pb: Grant = { id: 'p', kind: 'carryUp', name: 'Powerful Build', from: 'feature:f15' };
    expect(carryCapacity(make({ grants: [pb] }))).toEqual(carryCapacity(make({ carryUp: true })));
    expect(carryUpOf(make({ grants: [pb] }))).toBe(true);
    const large: Grant = { id: 'l', kind: 'size', name: 'Large Form', size: 'large', from: 'feature:f15' };
    expect(sizeOf(make({ grants: [large] }))).toBe('large');
    expect(sizeOf(make({ size: 'large', grants: [{ ...large, size: 'medium' }] }))).toBe('large');
    expect(carryCapacity(make({ grants: [large] })).size).toBe('large');
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
  it('removing the item removes its grants', () => {
    expect(removeItem(make({ inv: [ringItem], grants: [ringAc] }), 'r').grants).toEqual([]);
  });
});

describe('AC bonus migration', () => {
  const old = (p: Record<string, unknown>) => ({ ...blankCharacter(), ...p }) as Record<string, unknown>;
  it('turns a bonus on an item that isn\'t armor into a grant that needs it equipped, once', () => {
    const c = migrate(old({ inv: [{ id: 'r', name: 'Ring', qty: 1, eq: true, acBonus: 1 }, { id: 'm', name: '+1 Chain Mail', qty: 1, eq: true, armor: 'heavy', acBase: 16, acBonus: 1 }] }));
    expect(c.inv.map((i) => i.acBonus)).toEqual([undefined, 1]);
    expect(c.grants).toEqual([{ id: expect.any(String), kind: 'ac', name: '+1 AC', acMode: 'bonus', val: '1', from: 'item:r', srcKind: 'item', needEq: true }]);
    expect(armorClass(c).total).toBe(18);
    expect(migrate(c)).toEqual(c);
  });
  it('drops a zero bonus and keeps a broken one on the item, uncounted', () => {
    const c = migrate(old({ inv: [{ id: 'a', name: 'A', qty: 1, eq: true, acBonus: 0 }, { id: 'b', name: 'B', qty: 1, eq: true, acBonus: 0.5 }] }));
    expect(c.inv.map((i) => i.acBonus)).toEqual([undefined, 0.5]);
    expect(c.grants).toEqual([]);
    expect(armorClass(c).total).toBe(10);
  });
  it('keeps the AC total of an old save with both a typed ac and an item bonus', () => {
    const c = migrate(old({ ac: 13, inv: [{ id: 'r', name: 'Ring', qty: 1, eq: true, acBonus: 1 }] }));
    expect(armorClass(c).total).toBe(13);
    expect(c.acMods).toEqual([{ id: expect.any(String), name: 'Adjustment (from old AC)', val: 2 }]);
  });
});

describe('resources', () => {
  const seren = druidSample(); // WIS 20 (+5), level 12
  it('reads a maximum: a number of at least 1, a formula, or none', () => {
    expect(maxOf(seren, { max: 3 })).toBe(3);
    expect(maxOf(seren, {})).toBeNull();
    expect(maxOf(seren, { max: 0 })).toBeNull();
    expect(maxOf(make({ abil: { ...make().abil, wis: 8 } }), { maxV: 'wis' })).toBe(0);
    expect(maxOf(seren, { maxV: 'wis>=1' })).toBe(5);
    expect(maxOf(make({ level: 1 }), { maxV: '2:2,6:3' })).toBe(0);
  });
  it('turns the form\'s maximum into fields: Number needs 1 or more, a 0 is the Formula 0', () => {
    expect(maxFields('none', '')).toEqual({});
    expect(maxFields('number', '3')).toEqual({ max: 3 });
    expect(maxFields('number', '0')).toBeNull();
    expect(maxFields('number', '2.5')).toBeNull();
    expect(maxFields('formula', '0')).toEqual({ maxV: '0' });
    expect(maxFields('formula', 'wis>=1')).toEqual({ maxV: 'wis>=1' });
    expect(maxFields('formula', '1d4')).toBeNull();
    expect(maxFields('formula', 'lots')).toBeNull();
    expect(maxOf(seren, maxFields('formula', '0')!)).toBe(0);
  });
  it('shows a computed maximum on a pill, none without one, and 0 when it computes to 0', () => {
    const c = make({ level: 1, res: [{ id: 'a', name: 'A', count: 0, maxV: 'pb' }, { id: 'b', name: 'B', count: 1 }, { id: 'z', name: 'Z', count: 0, maxV: '2:2' }] });
    expect(pillView(c, resPill('a'))!.max).toBe('2');
    expect(pillView(c, resPill('b'))!.max).toBeUndefined();
    expect(pillView(c, resPill('z'))!.max).toBe('0');
  });
  it('groups resources by type, source kind or Other, kinds first and custom names A–Z', () => {
    const c = make({ res: [{ id: 'a', name: 'A', count: 0, typeName: 'Zeal' }, { id: 'b', name: 'B', count: 0, srcKind: 'class' },
      { id: 'c', name: 'C', count: 0 }, { id: 'd', name: 'D', count: 0, typeName: 'Arcane' }, { id: 'e', name: 'E', count: 0, srcKind: 'species' }] });
    expect(resourceGroups(c).map((g) => [g.title, g.list.map((r) => r.id)])).toEqual([
      ['Species', ['e']], ['Class', ['b']], ['Other', ['c']], ['Arcane', ['d']], ['Zeal', ['a']]]);
  });
  it('clamps counts to their maximum, and HP to max HP, in one place', () => {
    const c = make({ level: 1, hp: 60, res: [{ id: 'w', name: 'W', count: 2, maxV: '2:2,6:3' }, { id: 'x', name: 'X', count: 9 }] });
    const n = normalize(c);
    expect(n.res.map((r) => r.count)).toEqual([0, 9]);
    expect(n.hp).toBe(44);
    const fine = make();
    expect(normalize(fine)).toBe(fine);
  });
  it('checks resource fields on load', () => {
    const c = migrate({ ...sampleCharacter(), res: [
      { id: 'a', name: 'A', count: 1, max: 0, recharge: 'long' }, { id: 'b', name: 'B', count: 1, recharge: 'weekly' },
      { id: 'c', name: 'C', count: 1, max: 2, recharge: 'dawn', regain: '1', regainOn: 'short' },
      { id: 'd', name: 'D', count: 1, max: 2, recharge: 'long', regain: '1', regainOn: 'short', typeName: 'Ki', note: 3 },
      { id: 'e', name: 'E', count: 1, maxV: '1d4' }, { id: 'f', name: 'F', count: 1, maxV: 'wis>=1' },
      { id: 'g', name: 'G', count: 1, from: 'feature:gone', srcKind: 'class', srcName: 'Monk' }, { id: 'h', name: 'H', count: 'x', refill: true }] });
    expect(c.res).toEqual([
      { id: 'a', name: 'A', count: 1, recharge: 'long' }, { id: 'b', name: 'B', count: 1, recharge: 'none' },
      { id: 'c', name: 'C', count: 1, max: 2, recharge: 'dawn' },
      { id: 'd', name: 'D', count: 1, max: 2, recharge: 'long', regain: '1', regainOn: 'short', typeName: 'Ki' },
      { id: 'e', name: 'E', count: 1, recharge: 'none' }, { id: 'f', name: 'F', count: 1, maxV: 'wis>=1', recharge: 'none' },
      { id: 'g', name: 'G', count: 1, srcKind: 'class', srcName: 'Monk', recharge: 'none' }, { id: 'h', name: 'H', count: 0, recharge: 'long' }]);
    expect(migrate(c)).toEqual(c);
  });
});

describe('rests, Dawn and item charges', () => {
  const wild = { id: 'wild', name: 'Wild Shape', count: 1, max: 3, recharge: 'long' as const, regain: '1', regainOn: 'short' as const };
  const wand: Item = { id: 'w', name: 'Wand of Magic Missiles', qty: 1, eq: false, count: 2, max: 7, recharge: 'dawn', regain: '1d6+1', regainOn: 'dawn' };
  it('a Short Rest regains part of a Long Rest counter; a Long Rest refills it', () => {
    const s = shortRest(make({ res: [wild] }));
    expect(s.res[0].count).toBe(2);
    expect(s.restMsg?.body).toContain('Wild Shape +1');
    expect(longRest(make({ res: [wild] })).res[0].count).toBe(3);
  });
  it('a Dawn counter waits for Dawn; the Long Rest summary points to it', () => {
    const dawnRes = { id: 'd', name: 'Lucky', count: 0, max: 3, recharge: 'dawn' as const };
    const l = longRest(make({ res: [dawnRes] }));
    expect(l.res[0].count).toBe(0);
    expect(l.restMsg?.body).toContain('Dawn: Lucky regain at dawn (menu → Dawn)');
    expect(dawn(make({ res: [dawnRes] })).res[0].count).toBe(3);
  });
  it('asks for the roll of a die regain and adds it, up to the maximum', () => {
    const c = make({ inv: [wand], res: [] });
    expect(restRolls(c, 'dawn')).toEqual([{ key: 'item:w', name: 'Wand of Magic Missiles', dice: '1d6+1' }]);
    expect(restRolls(c, 'short')).toEqual([]);
    expect(dawn(c, { 'item:w': 5 }).inv[0].count).toBe(7);
    const d = dawn(c, { 'item:w': 4 });
    expect(d.inv[0].count).toBe(6);
    expect(d.restMsg?.body).toContain('Wand of Magic Missiles +4');
  });
  it('item charges refill on rests by their recharge, like resources', () => {
    const torch: Item = { id: 't', name: 'Lantern', qty: 1, eq: true, count: 0, max: 2, recharge: 'short' };
    const ring: Item = { id: 'r', name: 'Ring', qty: 1, eq: true, count: 0, max: 1, recharge: 'long' };
    const s = shortRest(make({ inv: [torch, ring] }));
    expect(s.inv.map((i) => i.count)).toEqual([2, 0]);
    expect(longRest(make({ inv: [torch, ring] })).inv.map((i) => i.count)).toEqual([2, 1]);
  });
  it('clamps item charges to their maximum', () => {
    const c = make({ inv: [{ ...wand, count: 7 }] });
    expect(applyPatch(c, { inv: [{ ...wand, count: 7, max: 5 }] }).inv[0].count).toBe(5);
  });
  it('moves a charged resource onto an item, once', () => {
    const raw = { ...sampleCharacter(), pills: ['hp', 'res:wand', ''], res: [{ id: 'wand', name: 'Wand', count: 3, max: 7, recharge: 'long', inv: true, note: 'x' },
      { id: 'rope', name: 'Rope', count: 3, inv: true }] };
    const c = migrate(raw);
    expect(c.inv.slice(-2)).toEqual([{ id: expect.any(String), name: 'Wand', qty: 1, eq: false, count: 3, max: 7, recharge: 'long', desc: 'x' },
      { id: expect.any(String), name: 'Rope', qty: 3, eq: false }]);
    expect(c.res).toEqual([]);
    expect(c.pills).toEqual(['hp', '', '']);
    expect(migrate(c)).toEqual(c);
  });
  it('checks item charge fields on load', () => {
    const c = migrate({ ...sampleCharacter(), inv: [{ id: 'a', name: 'A', qty: 1, eq: false, count: 2, max: 0, recharge: 'weekly', regain: '1', regainOn: 'dawn' },
      { id: 'b', name: 'B', qty: 1, eq: false, max: 3 }] });
    expect(c.inv).toEqual([{ id: 'a', name: 'A', qty: 1, eq: false, count: 2, recharge: 'none' }, { id: 'b', name: 'B', qty: 1, eq: false }]);
  });
});

describe('free casts as resources and spell overrides', () => {
  describe('the spell form’s own free cast', () => {
    // Magic Missile with a free cast a feat granted for it (Magic Initiate's), and Shield with an old save's free cast.
    const base = (): Character => ({
      ...blankCharacter(),
      feats: [{ id: 'f1', g: 'feat', name: 'Magic Initiate (Wizard)', desc: '' }],
      spells: [{ id: 's1', name: 'Magic Missile', lvl: 1, time: 'Action', range: '120 feet', from: 'feature:f1', always: true },
        { id: 's2', name: 'Shield', lvl: 1, time: 'Reaction', range: 'Self', prep: true }],
      res: [{ id: 'r1', name: 'Magic Missile (free cast)', count: 1, max: 1, recharge: 'long', casts: 's1', from: 'feature:f1', srcKind: 'feat' },
        { id: 'r2', name: 'Shield', note: 'Free cast', count: 1, max: 1, recharge: 'long', casts: 's2', from: 'spell:s2', srcKind: 'spell' }]
    });
    it('is never a free cast a feat granted, so turning it off leaves that one', () => {
      const c = base();
      expect(ownFreeCasts(c, 's1')).toEqual([]);
      expect(setOwnFreeCast(c, 's1', false).res.map((r) => r.id)).toEqual(['r1', 'r2']);
      const on = setOwnFreeCast(c, 's1', true, 'Magic Missile');
      expect(on.res.map((r) => [r.name, r.from])).toEqual([['Magic Missile (free cast)', 'feature:f1'], ['Shield', 'spell:s2'], ['Magic Missile (free cast)', 'spell:s1']]);
      expect(setOwnFreeCast(on, 's1', false).res.map((r) => r.id)).toEqual(['r1', 'r2']);
    });
    it('follows a rename when it carries the name the form gave it, and keeps any other name', () => {
      const on = setOwnFreeCast(base(), 's1', true);
      const renamed = { ...on, spells: on.spells.map((x) => (x.id === 's1' ? { ...x, name: 'Arcane Darts' } : x)) };
      expect(ownFreeCasts(setOwnFreeCast(renamed, 's1', true, 'Magic Missile'), 's1').map((r) => r.name)).toEqual(['Arcane Darts (free cast)']);
      const shield = { ...base(), spells: base().spells.map((x) => (x.id === 's2' ? { ...x, name: 'Shield Spell' } : x)) };
      expect(ownFreeCasts(setOwnFreeCast(shield, 's2', true, 'Shield'), 's2').map((r) => r.name)).toEqual(['Shield']);
      expect(setOwnFreeCast(base(), 's2', true, 'Shield').res).toHaveLength(2);
    });
  });
  it('turns an old save\'s free casts into resources that cast the spell, once', () => {
    const c = migrate(oldSeren());
    const fc = freeCastsOf(c, 'ds12');
    expect(fc).toEqual([{ id: expect.any(String), name: 'Shield', note: 'Free cast', count: 0, max: 1, recharge: 'long', from: 'spell:ds12', srcKind: 'spell', casts: 'ds12' }]);
    expect(c.spells.some((x) => 'free' in x)).toBe(false);
    expect(c).not.toHaveProperty('free');
    expect(migrate(c)).toEqual(c);
    const i = migrate(oldIlyra());
    expect(['sp8', 'sp9', 'sp12'].map((id) => freeCastsOf(i, id).map((r) => r.count))).toEqual([[1], [1], [1]]);
  });
  it('drops a cast link to a spell that is gone', () => {
    const c = migrate({ ...sampleCharacter(), res: [{ id: 'x', name: 'X', count: 1, max: 1, recharge: 'long', casts: 'gone' }] });
    expect(c.res[0].casts).toBeUndefined();
  });
  it('a free cast uses one and casts; at 0 a tap gives one back without touching effects', () => {
    const c = druidSample();
    const sh = c.spells.find((x) => x.id === 'ds12')!;
    const withFree = { ...c, acOn: [], res: [...c.res, { id: 'fs', name: 'Shield', count: 1, max: 1, recharge: 'long' as const, casts: 'ds12' }] };
    const used = { ...withFree, ...castFree(withFree, sh, 'fs') };
    expect(used.res.find((r) => r.id === 'fs')!.count).toBe(0);
    expect(used.acOn).toEqual(['ds12']);
    const back = { ...used, ...castFree(used, sh, 'fs') };
    expect(back.res.find((r) => r.id === 'fs')!.count).toBe(1);
    expect(back.acOn).toEqual(['ds12']);
  });
  it('a free cast of a Concentration spell starts Concentration', () => {
    const c = make({ conc: null, res: [{ id: 'favored', name: 'Favored Enemy', count: 2, max: 3, recharge: 'long', casts: 'sp4' }] });
    const hmSp = c.spells.find((x) => x.id === 'sp4')!;
    const r = castFree(c, hmSp, 'favored');
    expect(r.res![0].count).toBe(1);
    expect(r.conc).toEqual({ id: 'sp4', name: 'Hunter’s Mark' });
  });
  it('a multi-use free cast never gives a use back above 0', () => {
    const c = druidSample();
    const gb = c.spells.find((x) => x.id === 'ds11')!;
    const star = { ...c, res: c.res.map((r) => (r.id === 'bolt' ? { ...r, count: 5, casts: 'ds11' } : r)) };
    const one = { ...star, ...castFree(star, gb, 'bolt') };
    const two = { ...one, ...castFree(one, gb, 'bolt') };
    expect([one, two].map((x) => x.res.find((r) => r.id === 'bolt')!.count)).toEqual([4, 3]);
    const zero = { ...star, res: star.res.map((r) => (r.id === 'bolt' ? { ...r, count: 0 } : r)) };
    expect(castFree(zero, gb, 'bolt').res!.find((r) => r.id === 'bolt')!.count).toBe(1);
  });
  it('a Long Rest refills free casts like any resource', () => {
    const c = make({ res: [{ id: 'fc', name: 'Goodberry', note: 'Free cast', count: 0, max: 1, recharge: 'long', casts: 'sp8' }] });
    const l = longRest(c);
    expect(l.res[0].count).toBe(1);
    expect(l.restMsg?.body).toContain('Refilled: Goodberry +1');
    expect(l.restMsg?.body).not.toContain('free casts');
  });
  it('removing a spell removes its own free cast and empties a pill naming it', () => {
    const c = make({ pills: ['hp', 'res:fc', ''], res: [{ id: 'fc', name: 'Goodberry', count: 1, max: 1, recharge: 'long', from: 'spell:sp8', casts: 'sp8' }],
      effectsOn: ['spell:sp8'] });
    const r = removeSpell(c, 'sp8');
    expect(r.res).toEqual([]);
    expect(r.pills).toEqual(['hp', '', '']);
    expect(r.effectsOn).toEqual([]);
    const both = make({ res: [{ id: 'a', name: 'A', count: 1, from: 'spell:sp4', casts: 'sp4' }, { id: 'b', name: 'B', count: 1, from: 'feature:f2', casts: 'sp4' }] });
    expect(freeCastsOf(both, 'sp4').map((r) => r.id)).toEqual(['a', 'b']);
  });
  it('Shillelagh\'s override is on while switched on, and a Long Rest switches it off', () => {
    const g: Grant = { id: 'g1', kind: 'atkAbil', name: 'Shillelagh', ab: 'cast', weapons: 'club,quarterstaff', amode: 'melee', die: '1:1d8,5:1d10,11:1d12,17:2d6', when: 'active', from: 'spell:ds3' };
    const c = { ...druidSample(), grants: [g] };
    expect(activeGrants(c, 'atkAbil')).toEqual([]);
    const on = { ...c, ...toggleEffect(c, 'spell:ds3') };
    expect(activeGrants(on, 'atkAbil')).toEqual([g]);
    expect(activeGrants(longRest(on), 'atkAbil')).toEqual([]);
  });
  it('a spell with its own casting ability has its own save DC and attack (PHB p.41)', () => {
    const c = druidSample(); // CHA 10, WIS 20, PB 4
    const light = { ...c.spells.find((x) => x.id === 'ds7')!, castAb: 'cha' as const };
    expect(spellSaveDcFor(c, light)).toBe(12);
    expect(spellAttackFor(c, light)).toBe(4);
    expect(spellSaveDcFor(c, c.spells[0])).toBe(17);
    expect(spellSaveDcFor(make({ castAb: 'none' }), make().spells[0])).toBeNull();
  });
});

describe('adding grants', () => {
  const custom = (c: Character, id = 'fx'): Character => ({ ...c, feats: [...c.feats, { id, g: 'other', name: 'Custom Gift', desc: '' }] });
  const spec = (p: Partial<GrantSpec> & Pick<GrantSpec, 'kind'>): Omit<GrantSpec, 'opt'> => ({ id: 'g-' + p.kind, name: 'G ' + p.kind, ...p } as Omit<GrantSpec, 'opt'>);
  const LISTS = ['senses', 'defenses', 'res', 'spells', 'grants'] as const;
  it('puts each grant in its list with the source set, and removing the source takes them back', () => {
    const c = custom(make());
    const n = addGrants(c, 'feature:fx', [
      { spec: spec({ kind: 'sense', name: 'Tremorsense 30 ft', range: '30' }) },
      { spec: spec({ kind: 'defense', def: 'res', target: 'Cold' }) },
      { spec: spec({ kind: 'resource', name: 'Gift', max: '2', recharge: 'long' }) },
      { spec: spec({ kind: 'spell', name: 'Bless', spell: 'spell/bless' }), spell: { name: 'Bless', lvl: 1, time: 'Action', range: '30 ft' } },
      { spec: spec({ kind: 'abil', ab: 'wis', val: '1', cap: 20 }) },
      { spec: spec({ kind: 'action', econ: 'bonus', res: 'g-resource' }) }
    ]);
    expect(n.senses.at(-1)).toMatchObject({ name: 'Tremorsense', range: '30 ft', from: 'feature:fx', srcKind: 'other' });
    expect(n.defenses.at(-1)).toMatchObject({ kind: 'res', name: 'Cold', from: 'feature:fx' });
    const gift = n.res.at(-1)!;
    expect(gift).toMatchObject({ name: 'Gift', max: 2, count: 2, recharge: 'long', from: 'feature:fx' });
    expect(n.spells.at(-1)).toMatchObject({ name: 'Bless', lvl: 1, from: 'feature:fx', prep: false });
    const added = n.grants.slice(c.grants.length);
    expect(added.map((g) => [g.kind, g.from])).toEqual([['abil', 'feature:fx'], ['action', 'feature:fx']]);
    expect(added[1].res).toBe(gift.id);
    expect(effScore(n, 'wis')).toBe(15);
    const back = removeFeature(n, 'fx');
    for (const k of LISTS) expect(back[k]).toEqual(c[k]);
  });
  it('a sense grant needs a range', () => {
    expect(grantErrors({ id: 'g', kind: 'sense', name: 'Blindsight' }, 'feature')).toHaveLength(1);
  });
  it('links an entry the character already has instead of adding a second (Resourceful)', () => {
    const c = custom(make({ res: [{ id: 'hi', name: 'Heroic Inspiration', count: 1, max: 1, recharge: 'long' }] }), 'rs');
    expect(findUnlinked(c, 'resource', 'heroic inspiration')).toBe('hi');
    const linked = addGrants(c, 'feature:rs', [{ spec: spec({ kind: 'resource', name: 'Heroic Inspiration', max: '1', recharge: 'long' }), link: 'hi' }]);
    expect(linked.res).toEqual([{ id: 'hi', name: 'Heroic Inspiration', count: 1, max: 1, recharge: 'long', from: 'feature:rs', srcKind: 'other', linked: true }]);
    expect(addGrants(c, 'feature:rs', [{ spec: spec({ kind: 'resource', name: 'Heroic Inspiration', max: '1', recharge: 'long' }) }]).res).toHaveLength(2);
    const sum = removalSummary(linked, { kind: 'feature', id: 'rs' });
    expect(sum.keep).toEqual(['Heroic Inspiration stays (it was on the sheet before Custom Gift)']);
    const back = removeFeature(linked, 'rs');
    expect(back.res).toEqual([{ id: 'hi', name: 'Heroic Inspiration', count: 1, max: 1, recharge: 'long' }]);
    const made = addGrants(c, 'feature:rs', [{ spec: spec({ kind: 'resource', name: 'Heroic Inspiration', max: '1', recharge: 'long' }) }]);
    expect(removeFeature(made, 'rs').res).toEqual(c.res);
  });
  it('a linked spell keeps its resources and its Concentration when the source goes', () => {
    const c = custom(make({ conc: { id: 'sp4', name: 'Hunter’s Mark' }, res: [{ id: 'mine', name: 'Mine', count: 1, from: 'spell:sp4' }] }), 'fe');
    const n = addGrants(c, 'feature:fe', [{ spec: spec({ kind: 'spell', name: 'Hunter’s Mark', spell: 'spell/hunters-mark', always: true }), link: 'sp4' }]);
    expect(n.spells.find((x) => x.id === 'sp4')).toMatchObject({ from: 'feature:fe', linked: true });
    const r = removeFeature(n, 'fe');
    expect(r.spells.find((x) => x.id === 'sp4')!.from).toBeUndefined();
    expect(r.res.map((x) => x.id)).toEqual(['mine']);
    expect(r.conc).toEqual({ id: 'sp4', name: 'Hunter’s Mark' });
  });
  it('a spell granted from a level gates the spell and its free cast, not the spell level', () => {
    const c = custom(make({ level: 2, spells: [], res: [] }), 'el');
    const n = addGrants(c, 'feature:el', [
      { spec: spec({ kind: 'spell', id: 'ls', name: 'Longstrider', spell: 'spell/longstrider', lvl: 3, always: true }), spell: { name: 'Longstrider', lvl: 1, time: 'Action', range: 'Touch' } },
      { spec: spec({ kind: 'resource', name: 'Longstrider', max: '1', recharge: 'long', casts: 'ls' }) }]);
    expect(n.spells[0]).toMatchObject({ lvl: 1, minLvl: 3, always: true });
    expect(n.res[0]).toMatchObject({ minLvl: 3, casts: n.spells[0].id });
    expect([isActive(n, n.spells[0]), isActive(n, n.res[0])]).toEqual([false, false]);
  });
  it('a granted spell without always is unprepared, and stays so on load', () => {
    const n = addGrants(custom(make()), 'feature:fx', [{ spec: spec({ kind: 'spell', name: 'Bless', spell: 'spell/bless' }), spell: { name: 'Bless', lvl: 1, time: 'Action', range: '30 ft' } }]);
    expect(migrate(n).spells.at(-1)!.prep).toBe(false);
  });
  it('a maximum of 0 is a formula; a whole number is a number', () => {
    const add = (max: string) => addGrants(custom(make({ res: [] })), 'feature:fx', [{ spec: spec({ kind: 'resource', name: 'R', max, recharge: 'long' }) }]).res[0];
    expect(add('0')).toMatchObject({ maxV: '0', count: 0 });
    expect(add('0').max).toBeUndefined();
    expect(add('3')).toMatchObject({ max: 3, count: 3 });
  });
  it('resolves a free cast to the spell of the batch, a linked spell or an existing one', () => {
    const c = custom(make({ res: [] }), 'fe');
    const hmSpec = { spec: spec({ kind: 'spell', id: 'hm', name: 'Hunter’s Mark', spell: 'spell/hunters-mark', always: true }), spell: { name: 'Hunter’s Mark', lvl: 1, time: 'Bonus Action', range: '90 ft' } };
    const fav = { spec: spec({ kind: 'resource', id: 'fav', name: 'Favored Enemy', max: '1:2,5:3', recharge: 'long', casts: 'spell/hunters-mark' }) };
    const a = addGrants(c, 'feature:fe', [hmSpec, fav]);
    expect(a.res[0].casts).toBe(a.spells.at(-1)!.id);
    const b = addGrants(c, 'feature:fe', [{ ...hmSpec, link: 'sp4' }, fav]);
    expect(b.res[0].casts).toBe('sp4');
    const d = addGrants(c, 'feature:fe', [{ spec: spec({ kind: 'resource', name: 'X', max: '1', recharge: 'long', casts: 'spell/nothing' }) }]);
    expect(d.res[0].casts).toBeUndefined();
    const e = addGrants(c, 'feature:fe', [{ spec: spec({ kind: 'resource', name: 'X', max: '1', recharge: 'long', casts: 'sp5' }) }]);
    expect(e.res[0].casts).toBe('sp5');
  });
  it('a second copy of a spell is still possible', () => {
    const c = custom(make());
    expect(findUnlinked(c, 'spell', 'cure wounds')).toBe('sp5');
    expect(findUnlinked(c, 'spell', 'guidance')).toBeNull(); // Magic Initiate's: already linked
    const n = addGrants(c, 'feature:fx', [{ spec: spec({ kind: 'spell', name: 'Cure Wounds', spell: 'spell/cure-wounds' }), spell: { name: 'Cure Wounds', lvl: 1, time: 'Action', range: 'Touch' } }]);
    expect(n.spells.filter((x) => x.name === 'Cure Wounds')).toHaveLength(2);
  });
});

describe('removal cascade', () => {
  // Ilyra: Guide (f20) → Magic Initiate (f9) → Guidance, Produce Flame, Goodberry and Goodberry's free cast.
  it('removes everything whose chain leads to the source, and ends Concentration on it', () => {
    const c = make({ conc: { id: 'sp2', name: 'Guidance' } });
    const r = removeFeature(c, 'f20');
    expect(r.feats.some((f) => f.id === 'f20' || f.id === 'f9')).toBe(false);
    expect(r.spells.some((x) => ['sp2', 'sp3', 'sp8'].includes(x.id))).toBe(false);
    expect(r.res.some((x) => x.id === 'fc8')).toBe(false);
    expect(r.grants.some((g) => g.from === 'feature:f20')).toBe(false);
    expect(r.conc).toBeNull();
    expect(removalSummary(c, { kind: 'feature', id: 'f20' }).goes).toEqual(['Magic Initiate (Druid)', 'Stealth', 'Survival', 'Cartographer’s Tools', 'Guidance', 'Produce Flame', 'Goodberry', 'Goodberry']);
  });
  it('removing a spell keeps a feature’s resource that casts it, without casts', () => {
    const c = make({ res: [{ id: 'favored', name: 'Favored Enemy', count: 2, max: 3, recharge: 'long', from: 'feature:f2', casts: 'sp4' }] });
    expect(removeSpell(c, 'sp4').res).toEqual([{ id: 'favored', name: 'Favored Enemy', count: 2, max: 3, recharge: 'long', from: 'feature:f2' }]);
  });
  it('removing a resource clears an action grant that spends it, and empties its pills', () => {
    const c = make({ grants: [{ id: 'a', kind: 'action', name: 'Wild Shape', econ: 'bonus', res: 'favored', from: 'feature:f2' }] });
    const r = removeResource(c, 'favored');
    expect(r.grants[0].res).toBeUndefined();
    expect(r.pills).toEqual(['hp', 'ac', '']);
    expect(migrate({ ...c, res: [] }).grants[0].res).toBeUndefined();
  });
  it('never hangs on a loop', () => {
    const c = make({ feats: [{ id: 'A', g: 'other', name: 'A', desc: '', from: 'feature:B' }, { id: 'B', g: 'other', name: 'B', desc: '', from: 'feature:A' },
      { id: 'S', g: 'other', name: 'S', desc: '', from: 'feature:S' }] });
    expect(removalChain(c, { kind: 'feature', id: 'A' })).toEqual([{ kind: 'feature', id: 'A' }, { kind: 'feature', id: 'B' }]);
    expect(removalChain(c, { kind: 'feature', id: 'S' })).toEqual([{ kind: 'feature', id: 'S' }]);
    expect(removeFeature(c, 'A').feats.map((f) => f.id)).toEqual(['S']);
  });
  it('lists the numbers a counted grant stays in', () => {
    const c = make({ grants: [{ id: 'g', kind: 'abil', name: 'DEX +2', ab: 'dex', val: '2', cap: 20, counted: true, from: 'feature:f10' },
      { id: 'h', kind: 'ac', name: 'Defense', acMode: 'bonus', val: '1', counted: true, from: 'feature:f10' }] });
    const keep = removalSummary(c, { kind: 'feature', id: 'f10' }).keep;
    expect(keep[0]).toBe('DEX 18 still includes +2 from Ability Score Improvement; lower it by hand');
    expect(keep[1]).toMatch(/^AC 16 still includes \+1 from Ability Score Improvement/);
  });
  it('removing an item empties its slot and removes its grants', () => {
    const s = make({ grants: [{ id: 'g', kind: 'ac', name: '+1 AC', acMode: 'bonus', val: '1', from: 'item:i9', needEq: true }] });
    const r = removeItem(s, 'i9');
    expect(r.attuneIds).toEqual(['', '', '']);
    expect(r.grants).toEqual([]);
  });
});

describe('grantChips', () => {
  it('lists what a feature gives, with labels and where each lives', () => {
    const s = make();
    const c = { ...s, spells: s.spells.map((x) => (x.id === 'sp4' ? { ...x, from: 'feature:f2' } : x)),
      res: s.res.map((r) => (r.id === 'favored' ? { ...r, max: undefined, maxV: '1:2,5:3,9:4,13:5,17:6', from: 'feature:f2', casts: 'sp4' } : r)) };
    const chips = grantChips(c, 'feature:f2');
    expect(chips.map((x) => x.label)).toEqual(['Hunter’s Mark', '3 × Favored Enemy / Long Rest']);
    expect(chips.map((x) => x.target)).toEqual([{ tab: 'spells' }, { sec: 'sec-resources' }]);
    expect(chips.every((x) => x.active)).toBe(true);
  });
  it('labels every grant kind and marks counted and inactive ones', () => {
    const g = (p: Partial<Grant> & Pick<Grant, 'kind'>): Grant => ({ id: 'g' + p.kind, name: 'N ' + p.kind, from: 'item:i9', ...p } as Grant);
    const c = make({ senses: [{ id: 's', name: 'Darkvision', range: '60 ft', from: 'item:i9' }],
      defenses: [{ id: 'd', kind: 'res', name: 'Cold', from: 'item:i9' }, { id: 'e', kind: 'adv', name: 'vs Charmed', from: 'item:i9' }],
      grants: [g({ kind: 'abil', ab: 'wis', val: '1', cap: 20 }), g({ kind: 'prof', cat: 'skill', target: 'stealth' }),
        g({ kind: 'prof', name: 'Weapon Mastery: 2 kinds of weapons', cat: 'mastery', val: '2' }), g({ kind: 'speed', mode: 'walk', val: '5', counted: true }),
        g({ kind: 'speed', id: 'gc', mode: 'climb', val: 'walk' }), g({ kind: 'ac', acMode: 'bonus', val: '1', needEq: true }), g({ kind: 'init', val: '3' }),
        g({ kind: 'hpLvl', val: '2' }), g({ kind: 'xdmg', dice: '1d8', on: 'hit' })] });
    expect(grantChips(c, 'item:i9').map((x) => x.label)).toEqual(['Darkvision 60 ft', 'Resistance · Cold', 'Advantage · vs Charmed', '+1 WIS', 'Stealth',
      'Weapon Mastery: 2 kinds of weapons', 'Speed +5 ft (counted)', 'Climb = Speed', '+1 AC', 'Initiative +3', '+2 HP per level', 'N xdmg']);
    const off = { ...c, inv: c.inv.map((i) => (i.id === 'i9' ? { ...i, eq: false } : i)) };
    expect(grantChips(off, 'item:i9').find((x) => x.label === '+1 AC')).toMatchObject({ active: false, why: 'not equipped' });
  });
});

describe('background migration', () => {
  it('turns the old Background text into a background feature, once', () => {
    const c = migrate({ ...blankCharacter(), ch: { ...blankCharacter().ch, bg: 'Sage' }, feats: [] });
    expect(c.feats).toEqual([{ id: expect.any(String), g: 'background', name: 'Sage', desc: '' }]);
    expect(c.ch).not.toHaveProperty('bg');
    expect(migrate(c)).toEqual(c);
    expect(migrate({ ...blankCharacter(), ch: { ...blankCharacter().ch, bg: '  ' }, feats: [] }).feats).toEqual([]);
    const has = migrate({ ...blankCharacter(), ch: { ...blankCharacter().ch, bg: 'Sage' }, feats: [{ id: 'b', g: 'background', name: 'Sage', desc: 'x' }] });
    expect(has.feats).toHaveLength(1);
  });
  it('keeps the samples\' backgrounds as features', () => {
    expect(sampleCharacter().feats.find((f) => f.g === 'background')).toMatchObject({ id: 'f20', name: 'Guide' });
    expect(druidSample().feats.find((f) => f.g === 'background')).toMatchObject({ id: 'f26', name: 'Sage' });
    expect(migrate(oldIlyra()).feats.filter((f) => f.g === 'background').map((f) => f.name)).toEqual(['Guide']);
  });
});

describe('rebuilt samples', () => {
  it('link their entries to the features that give them', () => {
    const i = sampleCharacter();
    expect(grantChips(i, 'feature:f2').map((x) => x.label)).toEqual(['Hunter’s Mark', '3 × Favored Enemy / Long Rest']);
    expect(i.feats.find((f) => f.id === 'f9')).toMatchObject({ from: 'feature:f20', cid: 'feat/magic-initiate' });
    expect(i.feats.some((f) => f.g === 'training')).toBe(false);
    expect(freeCastsOf(i, 'sp9')[0]).toMatchObject({ from: 'feature:f15', minLvl: 3 });
    expect(i.spells.find((x) => x.id === 'sp12')).toMatchObject({ lvl: 2, minLvl: 5, from: 'feature:f15' });
    expect(removalSummary(i, { kind: 'feature', id: 'f10' }).keep).toEqual(['DEX 18 still includes +2 from Ability Score Improvement; lower it by hand']);
    const s = druidSample();
    expect(s.res.find((r) => r.id === 'wild')).toMatchObject({ maxV: '2:2,6:3,17:4', regain: '1', regainOn: 'short', from: 'feature:f4' });
    expect(maxOf(s, s.res.find((r) => r.id === 'wild')!)).toBe(3);
    expect(s.feats.find((f) => f.id === 'f26')).toMatchObject({ g: 'background', name: 'Sage', cid: 'background/sage' });
    expect(hasProf(s, 'language', 'Druidic')).toBe(true);
    expect(s.profs.some((p) => p.name === 'Druidic')).toBe(false);
    expect(s.spells.find((x) => x.id === 'ds7')).toMatchObject({ castAb: 'cha', from: 'feature:f19' });
    expect(s.grants.find((g) => g.kind === 'atkAbil')).toMatchObject({ from: 'spell:ds3', when: 'active' });
  });
  it('load unchanged', () => {
    expect(migrate(sampleCharacter())).toEqual(sampleCharacter());
    expect(migrate(druidSample())).toEqual(druidSample());
  });
  it('the blank character holds none of their entries', () => {
    const b = blankCharacter();
    expect([b.grants, b.defenses, b.profs, b.effectsOn]).toEqual([[], [], [], []]);
  });
});

describe('addGrants with a catalog spell (plan 4)', () => {
  const sp: Omit<Spell, 'id'> = { name: 'Goodberry', lvl: 1, time: 'Action', range: 'Self', prep: true, cid: 'spell/goodberry' };
  const c = { ...blankCharacter(), feats: [{ id: 'f1', g: 'feat' as const, name: 'Magic Initiate (Druid)', desc: '' }] };
  it('an always-prepared spell keeps no prep flag', () => {
    const out = addGrants(c, 'feature:f1', [{ spec: { id: 'g2', kind: 'spell', name: 'Level 1 spell', spell: 'spell/goodberry', always: true }, spell: sp }]);
    expect(out.spells[0].always).toBe(true);
    expect('prep' in out.spells[0]).toBe(false);
  });
  it('a granted spell without always is unprepared', () => {
    const out = addGrants(c, 'feature:f1', [{ spec: { id: 'g1', kind: 'spell', name: 'Cantrips', spell: 'spell/goodberry' }, spell: sp }]);
    expect(out.spells[0].prep).toBe(false);
  });
});

describe('class and subclass ids (plan 4)', () => {
  it('an old save without them loads with empty ids', () => {
    const c = migrate(oldIlyra());
    expect([c.ch.clsId, c.ch.subId]).toEqual(['', '']);
    expect(blankCharacter().ch).toMatchObject({ clsId: '', subId: '' });
    expect(sampleCharacter().ch).toMatchObject({ clsId: 'class/ranger', subId: 'subclass/ranger/hunter' });
    expect(druidSample().ch).toMatchObject({ clsId: 'class/druid', subId: '' });
  });
});

describe('rebuilt samples (plan 4)', () => {
  const ilyra = sampleCharacter(), seren = druidSample();
  it('give the SRD weapons and armor their catalog fields', () => {
    const inv = (c: Character, name: string) => c.inv.find((i) => i.name === name)!;
    expect(inv(ilyra, 'Longbow')).toMatchObject({ cat: 'weapon', wcat: 'martial', wrange: 'ranged', dmg: '1d8', dtype: 'Piercing', props: 'ammunition,heavy,two-handed', ammo: '150/600;arrow', mastery: 'slow', cid: 'item/longbow' });
    expect(inv(ilyra, 'Shortsword')).toMatchObject({ wcat: 'martial', dmg: '1d6', props: 'finesse,light', mastery: 'vex' });
    expect(inv(ilyra, 'Studded Leather Armor')).toMatchObject({ cat: 'armor', armor: 'light', acBase: 12 });
    expect(inv(seren, 'Quarterstaff')).toMatchObject({ wcat: 'simple', dmg: '1d6', vers: '1d8', mastery: 'topple' });
    expect(inv(seren, 'Sickle')).toMatchObject({ wcat: 'simple', dmg: '1d4', mastery: 'nick' });
    expect(inv(seren, 'Leather Armor')).toMatchObject({ cat: 'armor', armor: 'light', acBase: 11 });
    expect(inv(seren, 'Shield')).toMatchObject({ cat: 'shield', armor: 'shield', acBase: 2 });
  });
  it('give the SRD spells their structured fields, never an SRD description', () => {
    const fireBolt = seren.spells.find((x) => x.name === 'Fire Bolt')!;
    expect(fireBolt).toMatchObject({ cid: 'spell/fire-bolt', school: 'Evocation', atk: 'ranged', fx: 'damage', dmg: '1d10', dtype: 'Fire', scale: 'cantrip' });
    expect(ilyra.spells.find((x) => x.name === 'Cure Wounds')).toMatchObject({ fx: 'healing', dmg: '2d8', scale: '2d8/slot' });
    for (const c of [ilyra, seren]) for (const sp of c.spells.filter((x) => x.cid)) expect([sp.name, typeof sp.school]).toEqual([sp.name, 'string']);
    for (const c of [ilyra, seren]) for (const sp of c.spells) expect(sp.higher).toBeUndefined();
    expect(ilyra.spells.find((x) => x.name === 'Hail of Thorns')!.cid).toBeUndefined();
    expect(seren.spells.find((x) => x.name === 'Thorn Whip')!.cid).toBeUndefined();
  });
});

describe('manual actions (plan 5)', () => {
  const raw = (attacks: unknown[]) => ({ ...JSON.parse(JSON.stringify(sampleCharacter())), attacks });
  it('keeps typed attacks with their numbers, a valid timing and section', () => {
    const bow = { id: 'b', name: 'Longbow', hit: '+9', dmg: '1d8 +4 Piercing', info: '150/600 ft', mastery: 'Slow' };
    const out = migrate(raw([bow, { ...bow, id: 'x', econ: 'sometimes', group: 'x' }, { ...bow, id: 'y', econ: 'bonus', group: 'weapon' }]));
    expect(out.attacks[0]).toEqual(bow);
    expect(out.attacks[1]).toEqual({ ...bow, id: 'x' });
    expect(out.attacks[2]).toEqual({ ...bow, id: 'y', econ: 'bonus', group: 'weapon' });
    expect(migrate(JSON.parse(JSON.stringify(out))).attacks).toEqual(out.attacks);
  });
});

describe('containers on load (plan 6)', () => {
  const bagOf = (p: Partial<Item> = {}): Item => ({ id: 'bag', name: 'Bag of Holding', qty: 1, eq: false, wt: 5, xdim: true, cap: 500, cat: 'magic', ...p });
  const save = (inv: unknown[], p: Partial<Character> = {}) =>
    JSON.parse(JSON.stringify({ ...blankCharacter(), inv, ...p })) as Record<string, unknown>;
  const inOf = (c: Character, id: string) => c.inv.find((i) => i.id === id)!.in;

  it('clears an in that names a missing item, a non-container, itself, or is set on a container', () => {
    const c = migrate(save([
      bagOf(), bagOf({ id: 'bag2', in: 'bag' }),
      { id: 'a', name: 'A', qty: 1, eq: false, in: 'gone' }, { id: 'b', name: 'B', qty: 1, eq: false, in: 'a' },
      { id: 'self', name: 'S', qty: 1, eq: false, in: 'self' }, { id: 'ok', name: 'Ok', qty: 1, eq: false, wt: 3, in: 'bag' }
    ]));
    expect(c.inv.map((i) => i.id)).toEqual(['bag', 'bag2', 'a', 'b', 'self', 'ok']);
    expect(['bag2', 'a', 'b', 'self'].map((id) => inOf(c, id))).toEqual([undefined, undefined, undefined, undefined]);
    expect(inOf(c, 'ok')).toBe('bag');
    expect(carriedWeight(c)).toBe(10);
  });

  it('unequips an item inside and drops it from hands', () => {
    const sw: Item = { id: 'sw', name: 'Shortsword', qty: 1, eq: true, cat: 'weapon', wcat: 'martial', wrange: 'melee', dmg: '1d6', props: 'finesse,light', in: 'bag' };
    const c = migrate(save([bagOf(), sw], { hands: ['sw'] }));
    expect(c.inv[1]).toMatchObject({ eq: false, in: 'bag' });
    expect(c.hands).toEqual([]);
  });

  it('keeps a bag with coins, and drops bad coin and in values from the item, keeping it', () => {
    const c = migrate(save([
      bagOf({ gp: 100, sp: 3 }), bagOf({ id: 'neg', gp: -3 }), bagOf({ id: 'half', gp: 2.5 }),
      { id: 'n', name: 'N', qty: 1, eq: false, wt: 1, in: 5 }, { id: 't', name: 'T', qty: 1, eq: false, wt: 1, in: true }, { id: 'e', name: 'E', qty: 1, eq: false, wt: 1, in: '' }
    ]));
    expect(c.inv.map((i) => i.id)).toEqual(['bag', 'neg', 'half', 'n', 't', 'e']);
    expect(c.inv[0]).toMatchObject({ gp: 100, sp: 3 });
    expect('gp' in c.inv[1] || 'gp' in c.inv[2]).toBe(false);
    expect(c.inv.slice(3).every((i) => !('in' in i))).toBe(true);
    expect(carriedWeight(c)).toBe(15 + 3);
    expect(inventoryGroups(c)[0].items.map((i) => i.id)).toEqual(['bag', 'neg', 'half', 'n', 't', 'e']);
  });

  it('moves coins on an item that is not a container to the purse', () => {
    const c = migrate(save([{ id: 'r', name: 'Rope', qty: 1, eq: false, gp: 7 }]));
    expect('gp' in c.inv[0]).toBe(false);
    expect(c.coins.gp).toBe(7);
  });
});

describe('items inside a container never count as equipped (plan 6)', () => {
  const bag: Item = { id: 'bag', name: 'Bag of Holding', qty: 1, eq: false, xdim: true, cap: 500, wt: 5 };
  it('armorClass ignores armor, a Shield and a Ring of Protection inside the bag', () => {
    const inside = [
      bag,
      it_({ id: 'mail', name: 'Chain Mail', armor: 'heavy', acBase: 16, in: 'bag' }),
      it_({ id: 'sh', name: 'Shield', armor: 'shield', acBase: 2, in: 'bag' }),
      it_({ id: 'ring', name: 'Ring of Protection', attune: true, in: 'bag' })
    ];
    const ring: Grant = { id: 'g', kind: 'ac', name: 'Ring of Protection', acMode: 'bonus', val: '1', from: 'item:ring', needEq: true, needAtt: true };
    const c = ac({ abil: { ...sampleCharacter().abil, dex: 10 }, inv: inside, grants: [ring], attuneIds: ['ring', '', ''] });
    expect(c.total).toBe(10);
  });

  it('a resource granted by an item inside is inactive and keeps its count', () => {
    const c = make({ inv: [bag, it_({ id: 'wand', name: 'Wand', in: 'bag' })], res: [{ id: 'r', name: 'Wand charges', count: 3, max: 7, recharge: 'dawn', from: 'item:wand', srcKind: 'item', needEq: true }] });
    expect(isActive(c, c.res[0])).toBe(false);
    expect(normalize(c).res[0].count).toBe(3);
  });
});
