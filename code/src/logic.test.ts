import { describe, expect, it } from 'vitest';
import { sampleCharacter } from './defaults';
import {
  applyDamage, applyHeal, applySetTemp, clearHpUndo, conSave, fmt, hpColor, longRest, shortRest, skillMod,
  speedNow, spendHitDie, toggleCondition, undoHp
} from './logic';
import type { Character } from './types';

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
  it('uses temporary ability changes', () => {
    expect(conSave(make({ abilAdj: { con: 2 } }))).toBe(3);
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
  it('clears death saves and Unconscious when healed from 0', () => {
    const c = applyHeal(make({ hp: 0, ds: 2, df: 1, amount: 3, conds: { Unconscious: true } }));
    expect(c).toMatchObject({ hp: 3, ds: 0, df: 0 });
    expect(c.conds.Unconscious).toBe(false);
  });
  it('does not stack temp HP', () => {
    expect(applySetTemp(make({ temp: 8, amount: 5 })).temp).toBe(8);
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
  it('short rest refills only short-rest resources', () => {
    const base = make();
    base.res = [...base.res, { id: 'x', name: 'Second Wind', count: 0, max: 2, recharge: 'short' }];
    const c = shortRest(base);
    expect(c.res.find((r) => r.id === 'x')?.count).toBe(2);
    expect(c.res.find((r) => r.id === 'favored')?.count).toBe(2);
  });
  it('spends a hit die', () => {
    expect(spendHitDie(make({ hdUsed: 1 }))).toMatchObject({ hdUsed: 2, amount: 0 });
    const spent = make({ level: 2, hdUsed: 2 });
    expect(spendHitDie(spent)).toBe(spent);
  });
});

describe('conditions and speed', () => {
  it('incapacitating conditions end concentration', () => {
    const c = toggleCondition(make({ conc: { id: 'sp4', name: 'Hunter’s Mark' } }), 'Stunned');
    expect(c.conds.Stunned).toBe(true);
    expect(c.conc).toBeNull();
  });
  it('exhaustion lowers speed and grappled sets it to 0', () => {
    expect(speedNow(make({ exh: 2 }))).toBe(25);
    expect(speedNow(make({ conds: { Grappled: true } }))).toBe(0);
  });
});
