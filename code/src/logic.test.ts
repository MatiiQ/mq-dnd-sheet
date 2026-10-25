import { describe, expect, it } from 'vitest';
import { blankCharacter, druidSample, sampleCharacter } from './defaults';
import {
  applyDamage, applyHeal, applySetTemp, acAfterEdit, armorClass, castSpell, detectAcSpell, detectArmor, clearHpUndo, concAfterEdit, fmt, hdSpent, healHitDie, hitDieRoll, hpColor, hpRingStops, initiative, isDead, longRest, migrate, passiveScore, pillView, resPill, setPill, preparedCount, removeSpell, saveMod, setHp, setMaxHp, shortRest, skillMod, slotsLeft,
  setExhaustion, speedNow, spellAttack, spellSaveDC, spellUsable, spendHitDie, toggleAcSpell, toggleCondition, toggleFreeCast, undoHp
} from './logic';
import type { Character, Item, Spell } from './types';

const make = (p: Partial<Character> = {}): Character => ({ ...sampleCharacter(), ...p });
const sp = (p: Partial<Spell> = {}): Spell => ({ id: 's1', name: 'Bless', lvl: 1, time: 'Action', range: '30 ft', source: 'Cleric', ...p });
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
    const conc = make({ spells: [bless, other], conc: { id: 's1', name: 'Bless' }, concCheck: 'CON save DC 10', free: { s1: true, s2: true } });
    it('removing it ends Concentration and drops its free cast; removing another keeps it', () => {
      const c = removeSpell(conc, 's1');
      expect(c.spells.map((x) => x.id)).toEqual(['s2']);
      expect(c).toMatchObject({ conc: null, concCheck: null });
      expect(c.free).toEqual({ s2: true });
      const k = removeSpell(conc, 's2');
      expect(k.conc).toEqual({ id: 's1', name: 'Bless' });
      expect(k.free).toEqual({ s1: true });
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
      def: { res: ['Fire', 3], vul: 'x' }, attune: ['Ring', null], slotMax: [0, 4], slotUsed: [0, 'x'],
      conc: { name: 'Bless' }, hpUndo: { prev: 1 }, restMsg: { title: 1 }
    });
    expect(c.spells.map((x) => x.id)).toEqual(sampleCharacter().spells.map((x) => x.id));
    expect(c.conds).toEqual({});
    expect(c.abil).toMatchObject({ str: 10, dex: 14 });
    expect(c).toMatchObject({ tab: 'actions', castAb: 'none', conc: null, hpUndo: null, restMsg: null });
    expect(c.attacks.map((a) => a.name)).toEqual(['Sling']);
    expect(c.attacks[0].id).toBeTruthy();
    expect(c.def).toEqual({ res: ['Fire'], vul: [], imm: [] });
    expect(c.attune).toEqual(['Ring', '', '']);
    // Resources moved out of the tabs into the left column.
    expect(migrate({ ...sampleCharacter(), tab: 'resources' }).tab).toBe('actions');
    expect(c.slotMax).toEqual([0, 4, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(c.slotUsed).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(migrate({ ...sampleCharacter(), castAb: 'toString' }).castAb).toBe('none'); // only an inherited key
  });
  it('clamps values that size lists of buttons, and keeps exactly three attunement slots', () => {
    const c = migrate({ ...sampleCharacter(), level: 1e9, slotMax: [0, 1e9], slotUsed: [0, 50], exh: 99, ds: -1, df: 7, hdUsed: 1e9, attune: [] });
    expect(c).toMatchObject({ level: 20, exh: 6, ds: 0, df: 3, hdUsed: 20 });
    expect(c.slotMax[1]).toBe(9);
    expect(c.slotUsed[1]).toBe(9);
    expect(c.attune).toEqual(['', '', '']);
    expect(migrate({ attune: ['a', 'b', 'c', 'd'] }).attune).toEqual(['a', 'b', 'c']);
  });
  it('turns the old refill flag into a recharge and lists old sample consumables in Inventory', () => {
    const c = migrate({ res: [{ id: 'a', name: 'Ki', count: 1, refill: true }, { id: 'b', name: 'Rage', count: 1, refill: true, recharge: 'short' }, { id: 'c', name: 'Gold', count: 1 }] });
    expect(c.res.map((r) => r.recharge)).toEqual(['long', 'short', 'none']);
    const inv = migrate({ res: [{ id: 'arrows', name: 'Arrows', count: 5 }, { id: 'n1', name: 'Rations', count: 3 }] });
    expect(inv.res.map((r) => !!r.inv)).toEqual([true, false]);
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
    expect(pillView(s, 'insp')).toMatchObject({ value: 'On', target: 'insp' });
  });
  it('resolves a resource, with and without a maximum', () => {
    expect(pillView(s, resPill('favored'))).toMatchObject({ label: 'Favored Enemy', value: '2', max: '3', target: { sec: 'sec-resources' } });
    expect(pillView(s, resPill('arrows'))!.max).toBeUndefined();
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
      it_({ id: 'c', name: 'Cloak of Protection', acBonus: 1 }),
      it_({ id: 'r', name: 'Ring of Protection', acBonus: 1, eq: false })
    ] });
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
    const c = make({ ...all, acOn: [], free: {} });
    const used = toggleFreeCast(c, { ...shieldSp, free: true });
    expect(used).toMatchObject({ free: { sh: true }, acOn: ['sh'] });
    expect(toggleFreeCast({ ...c, ...used }, shieldSp)).not.toHaveProperty('acOn');
    expect(toggleFreeCast(c, { ...faith, free: true }).conc).toEqual({ id: 'sf', name: 'Shield of Faith' });
    const on = { ...c, acOn: ['sh'] }; // already on from a slot cast
    expect({ ...on, ...toggleFreeCast(on, { ...shieldSp, free: true }) }.acOn).toEqual(['sh']);
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
        { id: 'd', name: 'D', qty: 1, eq: false, acBonus: 1 }],
      spells: [{ id: 'x', name: 'X', lvl: 1, time: 'Action', range: 'Self', source: 'W', acFx: 'bonus', acVal: 'x' },
        { id: 'y', name: 'Y', lvl: 1, time: 'Action', range: 'Self', source: 'W', acFx: 'wall', acVal: 3 }]
    }));
    expect(c.inv.map((i) => [i.armor, i.acBase, i.acBonus])).toEqual([
      [undefined, undefined, undefined], [undefined, undefined, undefined], ['heavy', 16, undefined], [undefined, undefined, 1]
    ]);
    expect(c.spells.map((s) => [s.acFx, s.acVal])).toEqual([[undefined, undefined], [undefined, undefined]]);
    expect(Number.isFinite(armorClass(c).total)).toBe(true);
  });
});
