import { describe, expect, it } from 'vitest';
import { sampleCharacter } from './defaults';
import {
  applyDamage, applyHeal, applySetTemp, castSpell, clearHpUndo, fmt, hdSpent, healHitDie, hitDieRoll, hpColor, initiative, isDead, longRest, migrate, passiveScore, preparedCount, saveMod, setMaxHp, shortRest, skillMod, slotsLeft,
  speedNow, spellAttack, spellSaveDC, spellUsable, spendHitDie, toggleCondition, undoHp
} from './logic';
import type { Character, Spell } from './types';

const make = (p: Partial<Character> = {}): Character => ({ ...sampleCharacter(), ...p });

describe('derived numbers', () => {
  it('formats modifiers with a real minus sign', () => {
    expect(fmt(3)).toBe('+3');
    expect(fmt(0)).toBe('+0');
    expect(fmt(-1)).toBe('−1');
  });
  it('adds proficiency and expertise to skills', () => {
    const c = make(); // level 5: +3, WIS 14: +2
    expect(skillMod(c, 'perception', 'wis')).toBe(5);
    expect(skillMod(c, 'survival', 'wis')).toBe(8);
    expect(skillMod(c, 'medicine', 'wis')).toBe(2);
  });
  it('adds proficiency to proficient saves only', () => {
    const c = make(); // Ilyra: Ranger 5 (PB 3), STR 12 proficient, CON 14 not
    expect(saveMod(c, 'str')).toBe(4);
    expect(saveMod(c, 'con')).toBe(2);
    expect(saveMod(make({ abilAdj: { con: 2 } }), 'con')).toBe(3);
  });
  it('derives spell save DC and attack from the casting ability', () => {
    const c = make(); // WIS 14, PB 3
    expect(spellSaveDC(c)).toBe(13);
    expect(spellAttack(c)).toBe(5);
    expect(spellSaveDC(make({ castAb: 'none' }))).toBeNull();
    expect(spellAttack(make({ castAb: 'none' }))).toBeNull();
  });
  it('counts slots left, never below 0', () => {
    const c = make({ slotMax: [0, 4, 2, 0, 0, 0, 0, 0, 0, 0], slotUsed: [0, 1, 3, 0, 0, 0, 0, 0, 0, 0] });
    expect(slotsLeft(c, 1)).toBe(3);
    expect(slotsLeft(c, 2)).toBe(0);
    expect(slotsLeft(c, 5)).toBe(0);
  });
  it('counts spent Hit Dice, never more than the level', () => {
    expect(hdSpent(make({ level: 5, hdUsed: 2 }))).toBe(2);
    expect(hdSpent(make({ level: 3, hdUsed: 5 }))).toBe(3);
  });
  it('adds extra initiative bonuses to the Dex modifier', () => {
    expect(initiative(make())).toBe(4); // DEX 18
    expect(initiative(make({ initMisc: 2, abilAdj: { dex: -4 } }))).toBe(4); // DEX 14 +2
  });
  it('adds 10 to the skill bonus for passive scores', () => {
    const c = make(); // WIS 14, PB 3, INT 10
    expect(passiveScore(c, 'perception')).toBe(15);
    expect(passiveScore(c, 'insight')).toBe(15);
    expect(passiveScore(c, 'investigation')).toBe(10);
  });
  it('builds the Hit Die roll text', () => {
    expect(hitDieRoll(make())).toBe('1d10 +2'); // Ranger d10, CON 14
  });
  it('is dead at 0 HP with three failed death saves only', () => {
    expect(isDead(make({ hp: 0, df: 3 }))).toBe(true);
    expect(isDead(make({ hp: 0, df: 2 }))).toBe(false);
    expect(isDead(make({ hp: 1, df: 3 }))).toBe(false);
  });
  it('lets prepared and always-prepared spells be cast, or any spell when tracking is off', () => {
    const sp = (p: Partial<Spell>): Spell => ({ id: 's', name: 'Bless', lvl: 1, time: 'Action', range: '30 ft', source: 'Cleric', ...p });
    expect(spellUsable(make(), sp({ prep: true }))).toBe(true);
    expect(spellUsable(make(), sp({ always: true }))).toBe(true);
    expect(spellUsable(make(), sp({}))).toBe(false);
    expect(spellUsable(make({ usePrep: false }), sp({}))).toBe(true);
  });
  it('counts prepared levelled spells, leaving out always-prepared ones and cantrips', () => {
    expect(preparedCount(make())).toBe(5);
  });
  describe('casting a spell', () => {
    const slots = { slotMax: [0, 4, 2, 0, 0, 0, 0, 0, 0, 0], slotUsed: [0, 1, 2, 0, 0, 0, 0, 0, 0, 0], conc: null };
    const sp = (p: Partial<Spell>): Spell => ({ id: 's1', name: 'Bless', lvl: 1, time: 'Action', range: '30 ft', source: 'Cleric', ...p });
    it('uses one slot of that level', () => {
      expect(castSpell(make(slots), sp({}), 1).slotUsed).toEqual([0, 2, 2, 0, 0, 0, 0, 0, 0, 0]);
    });
    it('does nothing with no slots left', () => {
      expect(castSpell(make(slots), sp({}), 2)).toEqual({});
    });
    it('starts Concentration only for a Concentration spell', () => {
      expect(castSpell(make(slots), sp({ c: true }), 1).conc).toEqual({ id: 's1', name: 'Bless' });
      expect(castSpell(make(slots), sp({}), 1)).not.toHaveProperty('conc');
    });
  });
  it('sets max HP to at least 1 and keeps HP at or under it', () => {
    expect(setMaxHp(make({ hp: 40, maxHp: 44 }), 30)).toEqual({ maxHp: 30, hp: 30 });
    expect(setMaxHp(make({ hp: 10, maxHp: 44 }), 30)).toEqual({ maxHp: 30, hp: 10 });
    expect(setMaxHp(make({ hp: 5 }), 0)).toEqual({ maxHp: 1, hp: 1 });
    expect(setMaxHp(make({ hp: 44, maxHp: 44 }), 45)).toEqual({ maxHp: 45, hp: 44 });
  });
});

describe('HP colour', () => {
  const at = (hp: number, maxHp: number) => hpColor(make({ hp, maxHp }));
  it('is green from 65% of max', () => {
    expect(at(44, 44)).toBe('var(--hp-high)');
    expect(at(29, 44)).toBe('var(--hp-high)');
    expect(at(13, 20)).toBe('var(--hp-high)');
  });
  it('is yellow from 30% up to 65%', () => {
    expect(at(28, 44)).toBe('var(--hp-mid)');
    expect(at(14, 44)).toBe('var(--hp-mid)');
    expect(at(6, 20)).toBe('var(--hp-mid)');
  });
  it('is red below 30%, including 0', () => {
    expect(at(13, 44)).toBe('var(--hp-low)');
    expect(at(5, 20)).toBe('var(--hp-low)');
    expect(at(0, 44)).toBe('var(--hp-low)');
  });
  it('ignores temp HP', () => {
    expect(hpColor(make({ hp: 13, maxHp: 44, temp: 20 }))).toBe('var(--hp-low)');
  });
});

describe('damage', () => {
  it('takes damage from temp HP first', () => {
    const c = applyDamage(make({ hp: 20, temp: 4, amount: 6 }));
    expect(c.temp).toBe(0);
    expect(c.hp).toBe(18);
    expect(c.hpUndo?.text).toContain('4 absorbed by temp HP');
  });
  it('drops to 0 and becomes Unconscious', () => {
    const c = applyDamage(make({ hp: 5, amount: 9 }));
    expect(c.hp).toBe(0);
    expect(c.conds.Unconscious).toBe(true);
  });
  it('marks a death save failure when hit at 0 HP', () => {
    const c = applyDamage(make({ hp: 0, df: 1, amount: 3 }));
    expect(c.df).toBe(2);
  });
  it('kills outright on massive damage', () => {
    const c = applyDamage(make({ hp: 10, maxHp: 44, amount: 54 }));
    expect(c.df).toBe(3);
  });
  it('kills at 0 HP when the damage equals max HP', () => {
    expect(applyDamage(make({ hp: 0, maxHp: 44, amount: 44 })).df).toBe(3);
    expect(applyDamage(make({ hp: 0, maxHp: 44, amount: 43 })).df).toBe(1);
  });
  it('ends Stable when hit at 0 HP', () => {
    const c = applyDamage(make({ hp: 0, ds: 3, amount: 2 }));
    expect(c).toMatchObject({ ds: 0, df: 1 });
    expect(c.hpUndo?.text).toContain('No longer Stable');
  });
  it('keeps death save successes when not Stable', () => {
    expect(applyDamage(make({ hp: 0, ds: 2, amount: 2 })).ds).toBe(2);
  });
  it('asks for a concentration save at half the damage, minimum DC 10', () => {
    const conc = { id: 'sp4', name: 'Hunter’s Mark' };
    expect(applyDamage(make({ hp: 30, amount: 8, conc })).concCheck).toContain('DC 10');
    expect(applyDamage(make({ hp: 30, amount: 24, conc })).concCheck).toContain('DC 12');
  });
  it('ends concentration at 0 HP', () => {
    const c = applyDamage(make({ hp: 3, amount: 5, conc: { id: 'sp4', name: 'Hunter’s Mark' } }));
    expect(c.conc).toBeNull();
  });
  it('ignores an amount of 0', () => {
    const c = make({ amount: 0 });
    expect(applyDamage(c)).toBe(c);
  });
});

describe('healing and temp HP', () => {
  it('heals up to max', () => {
    expect(applyHeal(make({ hp: 40, amount: 10 })).hp).toBe(44);
  });
  it('clears death saves and Unconscious when healed from 0, leaving the character Prone', () => {
    const c = applyHeal(make({ hp: 0, ds: 2, df: 1, amount: 3, conds: { Unconscious: true } }));
    expect(c).toMatchObject({ hp: 3, ds: 0, df: 0 });
    expect(c.conds).toMatchObject({ Unconscious: false, Prone: true });
  });
  it('does not heal a dead character', () => {
    const dead = make({ hp: 0, df: 3, amount: 5 });
    expect(applyHeal(dead)).toBe(dead);
  });
  it('ignores Set Temp with an amount of 0', () => {
    const c = make({ temp: 0, amount: 0 });
    expect(applySetTemp(c)).toBe(c);
  });
  it('does not stack temp HP: the new set replaces the old, Undo keeps the old', () => {
    const lower = applySetTemp(make({ temp: 8, amount: 5 }));
    expect(lower.temp).toBe(5);
    expect(lower.hpUndo?.text).toContain('Undo to keep 8');
    expect(undoHp(lower).temp).toBe(8);
    expect(applySetTemp(make({ temp: 3, amount: 5 })).temp).toBe(5);
  });
  it('undoes the last HP change', () => {
    const before = make({ hp: 20, amount: 7 });
    const c = undoHp(applyDamage(before));
    expect(c.hp).toBe(20);
    expect(c.hpUndo).toBeNull();
  });
  it('clears the undo row only while it is still the one shown', () => {
    const c = applyDamage(make({ hp: 20, amount: 7, conc: { id: 'sp4', name: 'Hunter’s Mark' } }));
    const cleared = clearHpUndo(c, c.hpUndo);
    expect(cleared.hpUndo).toBeNull();
    expect(cleared.concCheck).toBe(c.concCheck);
    const newer = applyHeal(c);
    expect(clearHpUndo(newer, c.hpUndo).hpUndo).toBe(newer.hpUndo);
  });
});

describe('rests', () => {
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
  it('short rest refills only short-rest resources', () => {
    const base = make();
    base.res = [...base.res, { id: 'x', name: 'Second Wind', count: 0, max: 2, recharge: 'short' }];
    const c = shortRest(base);
    expect(c.res.find((r) => r.id === 'x')?.count).toBe(2);
    expect(c.res.find((r) => r.id === 'favored')?.count).toBe(2);
  });
  it('long rest also refills short-rest resources', () => {
    const base = make();
    base.res = [...base.res, { id: 'x', name: 'Second Wind', count: 0, max: 2, recharge: 'short' }];
    expect(longRest(base).res.find((r) => r.id === 'x')?.count).toBe(2);
  });
  it('neither rest starts at 0 HP', () => {
    for (const rest of [longRest, shortRest]) {
      const c = rest(make({ hp: 0, hdUsed: 3, conds: { Unconscious: true } }));
      expect(c).toMatchObject({ hp: 0, hdUsed: 3 });
      expect(c.restMsg?.body).toContain('at least 1 HP');
    }
  });
  it('spends a hit die', () => {
    expect(spendHitDie(make({ hdUsed: 1 }))).toMatchObject({ hdUsed: 2, amount: 0 });
    const spent = make({ level: 2, hdUsed: 2 });
    expect(spendHitDie(spent)).toBe(spent);
  });
  it('cannot spend a hit die at 0 HP', () => {
    const down = make({ hp: 0, hdUsed: 1 });
    expect(spendHitDie(down)).toBe(down);
  });
  it('heals at least 1 per hit die', () => {
    expect(healHitDie(make({ hp: 20, amount: 0 })).hp).toBe(21);
    expect(healHitDie(make({ hp: 20, amount: 7 })).hp).toBe(27);
  });
});

describe('conditions and speed', () => {
  it('incapacitating conditions end concentration', () => {
    const c = toggleCondition(make({ conc: { id: 'sp4', name: 'Hunter’s Mark' } }), 'Stunned');
    expect(c.conds.Stunned).toBe(true);
    expect(c.conc).toBeNull();
  });
  it('ending a condition keeps concentration', () => {
    const conc = { id: 'sp4', name: 'Hunter’s Mark' };
    expect(toggleCondition(make({ conds: { Stunned: true }, conc }), 'Stunned').conc).toEqual(conc);
  });
  it('exhaustion lowers speed and grappled sets it to 0', () => {
    expect(speedNow(make({ exh: 2 }))).toBe(25);
    expect(speedNow(make({ conds: { Grappled: true } }))).toBe(0);
  });
});

describe('loading saves and backups', () => {
  it('fills missing fields from the sample and marks old levelled spells prepared', () => {
    const c = migrate({ ch: { name: 'Bob' }, spells: [{ id: 's', name: 'Bless', lvl: 1 }] });
    expect(c.ch.name).toBe('Bob');
    expect(c.ch.species).toBe('');
    expect(c.spells[0].prep).toBe(true);
    expect(c.attacks).toEqual(sampleCharacter().attacks);
  });
  it('keeps partial records as saved', () => {
    expect(migrate({ ...sampleCharacter(), saveProf: {}, skillProf: { arcana: 1 } })).toMatchObject({ saveProf: {}, skillProf: { arcana: 1 } });
  });
  it('replaces values of the wrong type so the sheet can render', () => {
    const c = migrate({
      ...sampleCharacter(), spells: 'x', conds: null, abil: { str: '12', dex: 14 }, tab: 'nope', castAb: 'str',
      attacks: [{ id: 'a', name: 'Club', hit: {} }, { name: 'Sling', hit: '+4' }, 7],
      def: { res: ['Fire', 3], vul: 'x' }, attune: ['Ring', null], slotUsed: [0, 'x'],
      conc: { name: 'Bless' }, hpUndo: { prev: 1 }, restMsg: { title: 1 }
    });
    expect(c.spells.map((x) => x.id)).toEqual(sampleCharacter().spells.map((x) => x.id));
    expect(c.conds).toEqual({});
    expect(c.abil).toMatchObject({ str: 10, dex: 14 });
    expect(c).toMatchObject({ tab: 'actions', castAb: 'none', conc: null, hpUndo: null, restMsg: null });
    expect(c.attacks.map((a) => a.name)).toEqual(['Sling']);
    expect(c.attacks[0].id).toBeTruthy();
    expect(c.def).toEqual({ res: ['Fire'], vul: [], imm: [] });
    expect(c.attune).toEqual(['Ring']);
    expect(c.slotUsed).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it('pads short slot arrays to 10 levels', () => {
    const c = migrate({ ...sampleCharacter(), slotMax: [0, 4], slotUsed: [0, 'x'] });
    expect(c.slotMax).toEqual([0, 4, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(c.slotUsed).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it('returns the sample for data that is not an object', () => {
    expect(migrate(null)).toEqual(sampleCharacter());
    expect(migrate('x')).toEqual(sampleCharacter());
  });
  it('lists the old sample consumables in Inventory', () => {
    const c = migrate({ res: [{ id: 'arrows', name: 'Arrows', count: 5 }, { id: 'n1', name: 'Rations', count: 3 }] });
    expect(c.res.map((r) => !!r.inv)).toEqual([true, false]);
  });
});
