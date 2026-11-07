import { describe, expect, it } from 'vitest';
import { blankCharacter } from './defaults';
import { castSpell, toggleEffect, conHpPart, maxHpRaw, regainTo, regainLabel, damageHitDie, setTempHitDie, addGrants, dawn, refillFor, restRolls, normalize, maxHpOf, applyDamage, applyHeal, applySetTemp, clearHpUndo, hdSpent, healHitDie, hitDieRoll, isDead, longRest, pillView, setHp, setMaxHp, shortRest, spendHitDie, undoHp } from './logic';
import { migrate } from './migrate';
import { mergeCatalog } from './catalog/merge';
import srdEntries from './data/srd/index';
import { applyPatch } from './storage';
import type { FeatureEntry, GrantSpec } from './catalog/schema';
import type { Character, Grant, Item, Spell } from './types';
import { withClass, withClasses, make, hm, gr } from './test-fixtures';

describe('max HP, current HP and spent Hit Dice stay in range', () => {
  it('keeps max HP at least 1, HP at or under it, and spent Hit Dice at most the level', () => {
    expect(setMaxHp(make({ hp: 40, maxHp: 44 }), 30)).toEqual({ maxHp: 30, hp: 30 });
    expect(setMaxHp(make({ hp: 10, maxHp: 44 }), 30)).toEqual({ maxHp: 30, hp: 10 });
    expect(setMaxHp(make({ hp: 5 }), 0)).toEqual({ maxHp: 1, hp: 1 });
    expect(setMaxHp(make({ hp: 44, maxHp: 44 }), 45)).toEqual({ maxHp: 45, hp: 44 });
    expect(hdSpent(withClass(make({ hdUsed: { 10: 2 } }), { lvl: 5 }), 10)).toBe(2);
    expect(hdSpent(withClass(make({ hdUsed: { 10: 5 } }), { lvl: 3 }), 10)).toBe(3);
  });
});

describe('hit points', () => {
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
    it('asks for a concentration save at half the damage, DC 10 to 30', () => {
      expect(applyDamage(make({ hp: 30, amount: 8, conc: hm })).concCheck).toContain('DC 10');
      expect(applyDamage(make({ hp: 30, amount: 24, conc: hm })).concCheck).toContain('DC 12');
      expect(applyDamage({ ...blankCharacter(), temp: 100, amount: 100, conc: { id: 's', name: 'Bless' } }).concCheck).toContain('DC 30');
    });
    it('takes Exhaustion off the Concentration roll (PHB p.366)', () => {
      const c: Character = { ...blankCharacter(), hp: 8, exh: 2, saveProf: { con: true }, conc: { id: 's', name: 'Bless' }, spells: [], amount: 2 };
      expect(applyDamage(c).concCheck).toContain('roll d20 −2');
    });
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
    it('does not stack temp HP: the new set replaces the old, Undo keeps the old; 0 clears it', () => {
      const lower = applySetTemp(make({ temp: 8, amount: 5 }));
      expect(lower.temp).toBe(5);
      expect(lower.hpUndo?.text).toContain('Undo to keep 8');
      expect(undoHp(lower).temp).toBe(8);
      expect(applySetTemp(make({ temp: 3, amount: 5 })).temp).toBe(5);
      const zero = make({ temp: 0, amount: 0 });
      expect(applySetTemp(zero)).toBe(zero);
      const cleared = applySetTemp({ ...blankCharacter(), temp: 7, amount: 0 });
      expect(cleared.temp).toBe(0);
      expect(cleared.hpUndo?.text).toBe('Temp HP cleared (was 7).');
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
    it('Undo leaves a condition changed by hand after the damage', () => {
      const hit = applyDamage(make({ hp: 5, amount: 9 }));
      const proned = { ...hit, conds: { ...hit.conds, Prone: true } };
      expect(undoHp(proned)).toMatchObject({ hp: 5, conds: { Prone: true, Unconscious: true } });
      expect(undoHp(hit).conds.Unconscious).toBeFalsy();
    });
    describe('undoing a Hit Die heal', () => {
      const start = withClass(make({ hp: 10, maxHp: 40, hdUsed: { 10: 1 } }), { lvl: 5 });
      it('gives the die back; other HP actions leave Hit Dice alone', () => {
        const undone = undoHp(healHitDie({ ...spendHitDie(start, 10), amount: 6 }));
        expect(undone).toMatchObject({ hp: 10, hdUsed: { 10: 1 } });
        expect(undoHp(applyHeal({ ...start, amount: 5 })).hdUsed).toEqual({ 10: 1 });
        expect(undoHp(applyDamage({ ...start, amount: 5 })).hdUsed).toEqual({ 10: 1 });
        expect('hdUsed' in applyHeal({ ...start, amount: 5 }).hpUndo!.prev).toBe(false);
      });
      it('spending another die drops the old undo, so only one die is ever refunded', () => {
        const again = spendHitDie(healHitDie({ ...spendHitDie(start, 10), amount: 6 }), 10);
        expect(again.hpUndo).toBeNull();
        expect(undoHp(again).hdUsed).toEqual({ 10: 3 });
      });
      it('a refused heal (dead) sets no undo', () => {
        expect(healHitDie(make({ hp: 10, exh: 6, amount: 4 })).hpUndo).toBeNull();
      });
      it('also gives the die back when the spent die is undone by damage or Set Temp', () => {
        const c: Character = withClass({ ...blankCharacter(), maxHp: 30, hp: 20, temp: 6 }, { lvl: 3 });
        const hit = damageHitDie({ ...spendHitDie({ ...c, temp: 0 }, 8), amount: 5 });
        expect(hit.hp).toBe(15);
        expect(undoHp(hit)).toMatchObject({ hdUsed: { 8: 0 }, hp: 20 });
        const cleared = setTempHitDie(spendHitDie(c, 8));
        expect(cleared.temp).toBe(0);
        expect(undoHp(cleared)).toMatchObject({ hdUsed: { 8: 0 }, temp: 6 });
      });
    });
  });
  describe('maximum HP grants', () => {
    const tough: Grant = { id: 't', kind: 'hpLvl', name: 'Tough', val: '2', from: 'feature:f10' };
    const t5 = (p: Partial<Character> = {}) => withClass(make({ maxHp: 44, origHp: 44, hp: 44, grants: [tough], ...p }), { lvl: 5 });
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
    it('adds a flat Hit Point bonus once, not per level (Boon of Fortitude, PHB p.210)', () => {
      const c = withClass(make({ maxHp: 100, origHp: 100, hp: 100, grants: [gr({ kind: 'hpFlat', val: '40' })] }), { lvl: 19 });
      expect(maxHpOf(c)).toBe(140);
      expect(maxHpOf({ ...c, grants: [{ ...c.grants[0], counted: true }] })).toBe(100);
    });
  });
});

describe('rests', () => {
  it('long rest restores HP, slots, hit dice, resources and one exhaustion level', () => {
    const c = longRest(make({ hp: 3, temp: 5, hdUsed: { 10: 3 }, exh: 2, slotUsed: [0, 4, 2, 0, 0, 0, 0, 0, 0, 0] }));
    expect(c).toMatchObject({ hp: 44, temp: 0, hdUsed: {}, exh: 1 });
    expect(c.slotUsed.every((n) => n === 0)).toBe(true);
    expect(c.res.find((r) => r.id === 'favored')?.count).toBe(3);
    expect(c.restMsg?.body).toContain('Refilled: Favored Enemy');
  });
  it('long rest restores a reduced HP maximum and reduced ability scores, not raised ones', () => {
    const c = longRest(make({ hp: 30, maxHp: 38, origHp: 44, origOn: true, abilAdj: { str: -2, con: 2 } }));
    // The kept CON +2 raises the modifier by 1, so the maximum is 44 + 5 levels (PHB p.42).
    expect(c).toMatchObject({ maxHp: 44, hp: 49, abilAdj: { str: 0, con: 2 } });
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
      const c = rest(make({ hp: 0, hdUsed: { 10: 3 }, conds: { Unconscious: true } }));
      expect(c).toMatchObject({ hp: 0, hdUsed: { 10: 3 } });
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
    expect(spendHitDie(make({ hdUsed: { 10: 1 } }), 10)).toMatchObject({ hdUsed: { 10: 2 }, amount: 0 });
    for (const c of [withClass(make({ hdUsed: { 10: 2 } }), { lvl: 2 }), make({ hp: 0, hdUsed: { 10: 1 } }), make({ hp: 10, exh: 6, hdUsed: {} })]) expect(spendHitDie(c, 10)).toBe(c);
  });
  it('heals at least 1 per hit die', () => {
    expect(healHitDie(make({ hp: 20, amount: 0 })).hp).toBe(21);
    expect(healHitDie(make({ hp: 20, amount: 7 })).hp).toBe(27);
  });
  it('a Short Rest refills the pact pool only; a Long Rest both (PHB p.154)', () => {
    const used = [0, 2, 0, 0, 0, 0, 0, 0, 0, 0];
    const pact = { pactMax: 2, pactLvl: 3, pactUsed: 2 };
    const on = shortRest(make({ ...pact, slotUsed: used, hp: 5 }));
    expect(on.pactUsed).toBe(0);
    expect(on.slotUsed).toEqual(used);
    expect(on.restMsg!.body).toContain('Spell slots restored');
    const bare = { slotUsed: used, hp: 5, res: [], inv: [] };
    expect(shortRest(make({ ...bare, ...pact })).restMsg!.body).not.toContain('No resources recharge');
    expect(shortRest(make(bare)).restMsg!.body).toContain('No resources recharge');
    expect(shortRest(make({ slotUsed: used, hp: 5 })).restMsg!.body).not.toContain('Spell slots restored');
    expect(shortRest(make({ ...pact, slotUsed: used, hp: 0 })).pactUsed).toBe(2);
    expect(longRest(make({ ...pact, slotUsed: used, hp: 5 }))).toMatchObject({ pactUsed: 0, slotUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
  });
  describe('Concentration and refused rests', () => {
    const sp = { id: 's', name: 'Bless', lvl: 1, time: 'Action', range: '30 ft', c: true } as Spell;
    it('refills a Long Rest counter to the restored maximum', () => {
      const b = blankCharacter();
      const c: Character = { ...b, hp: 5, maxHp: 10, abil: { ...b.abil, wis: 14 }, abilAdj: { wis: -4 }, res: [{ id: 'r', name: 'R', count: 0, maxV: 'wis', recharge: 'long' }] };
      expect(longRest(c).res[0].count).toBe(2);
    });
    it('ends Concentration on a Long Rest and says so', () => {
      const after = longRest(make({ spells: [sp], conc: { id: 's', name: 'Bless' }, acOn: [], hp: 5 }));
      expect(after.conc).toBeNull();
      expect(after.restMsg!.body).toContain('Bless ended');
    });
    it('keeps Concentration when the rest is refused at 0 HP', () => {
      expect(longRest(make({ spells: [sp], conc: { id: 's', name: 'Bless' }, hp: 0 })).conc).not.toBeNull();
    });
    it('asks for no rolls when the rest would be refused, but still for Dawn', () => {
      const inv = [{ id: 'w', name: 'Wand', qty: 1, eq: false, count: 0, max: 7, recharge: 'dawn' as const, regain: '1d6+1', regainOn: 'dawn' as const }];
      const res = [{ id: 'r', name: 'R', count: 0, max: 4, recharge: 'long' as const, regain: '1d4', regainOn: 'short' as const }];
      expect(restRolls(make({ hp: 0, res, inv }), 'short')).toEqual([]);
      expect(restRolls(make({ hp: 0, res, inv }), 'dawn')).toHaveLength(1);
      expect(restRolls(make({ hp: 5, res, inv }), 'short')).toHaveLength(1);
    });
  });
  describe('counters, Dawn and item charges', () => {
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
    it('adds a dex regain without asking for a roll', () => {
      const b = blankCharacter(); // no grants, so the score is exactly what the test sets
      const c: Character = { ...b, hp: 5, maxHp: 10, abil: { ...b.abil, dex: 16 }, res: [{ id: 'r', name: 'R', count: 0, max: 9, recharge: 'long', regain: 'dex', regainOn: 'short' }] };
      expect(restRolls(c, 'short')).toEqual([]);
      expect(refillFor(c, 'short').res[0].count).toBe(3);
    });
    it('shows a rolled regain with its modifier and level step', () => {
      const b = blankCharacter();
      const c = (regain: string, level = 5): Character => (withClass({ ...b, hp: 5, maxHp: 10, abil: { ...b.abil, dex: 16 }, res: [{ id: 'r', name: 'R', count: 0, max: 9, recharge: 'long', regain, regainOn: 'short' }] }, { lvl: level }));
      expect(restRolls(c('1d4+dex'), 'short')[0].dice).toBe('1d4+3');
      expect(restRolls(c('1:1d4,5:1d6'), 'short')[0].dice).toBe('1d6');
      expect(restRolls(c('5:1d6', 1), 'short')).toEqual([]); // below the table's first level it regains nothing
    });
  });
  describe('a level-based regain (Bardic Inspiration)', () => {
    const cat = mergeCatalog(srdEntries, null);
    const bard = (level: number): Character => {
      const entry = cat.byId.get('feature/bard/bardic-inspiration') as FeatureEntry;
      const spec = entry.grants!.find((g) => g.id === 'g1') as GrantSpec;
      const base: Character = withClass({ ...blankCharacter(), hp: 8, abil: { ...blankCharacter().abil, cha: 16 }, feats: [{ id: 'f', g: 'class', name: 'Bardic Inspiration', desc: '' }] }, { lvl: level });
      const c = addGrants(base, 'feature:f', [{ spec }]);
      return { ...c, res: c.res.map((r) => ({ ...r, count: 0 })) };
    };
    it('refills Bardic Inspiration on a Short Rest from level 5 (PHB p.61)', () => {
      expect(shortRest(bard(4)).res[0].count).toBe(0);
      expect(shortRest(bard(5)).res[0].count).toBe(3);
      const back = migrate(JSON.parse(JSON.stringify(bard(5))));
      expect(shortRest(back).res[0].count).toBe(3);
    });
    it('words a level-based regain', () => {
      const r = { regain: '1:0,5:20', regainOn: 'short' as const, recharge: 'long' as const, max: 3 };
      expect(regainLabel(withClass({ ...blankCharacter()}, { lvl: 4 }), r)).toBe('');
      expect(regainLabel(withClass({ ...blankCharacter()}, { lvl: 5 }), r)).toBe('all');
      expect(regainLabel(blankCharacter(), { ...r, regain: '1' })).toBe('1');
      expect(regainLabel(blankCharacter(), { ...r, regain: '1d6+1' })).toBe('1d6+1');
    });
  });
  describe('regainTo', () => {
    const c = (count: number, max?: number) => ({ ...blankCharacter(), res: [{ id: 'r', name: 'R', count, ...(max ? { max } : {}), recharge: 'long' as const }] });
    it('raises the count to the amount, never lowers it, stops at the maximum; all means the maximum', () => {
      expect(regainTo(c(0, 4), 'r', 2).res[0].count).toBe(2);
      expect(regainTo(c(3, 4), 'r', 2).res[0].count).toBe(3);
      expect(regainTo(c(0, 1), 'r', 4).res[0].count).toBe(1);
      expect(regainTo(c(0, 4), 'r', 'all').res[0].count).toBe(4);
    });
    it('changes nothing on a counter with no maximum, or one the sheet lacks', () => {
      expect(regainTo(c(1), 'r', 'all').res[0].count).toBe(1);
      expect(regainTo(c(1, 4), 'gone', 'all').res[0].count).toBe(1);
    });
  });
});

describe('HP and Constitution', () => {
  const lv5 = (con: number, p: Partial<Character> = {}) =>
    withClass({ ...blankCharacter(), maxHp: 40, origHp: 40, hp: 40, conBase: 0, abil: { ...blankCharacter().abil, con }, ...p }, { lvl: 5 });
  it('HP follows a CON change (PHB p.42)', () => {
    expect(maxHpOf(lv5(14))).toBe(50);
    expect(maxHpOf(lv5(16))).toBe(55);
    expect(maxHpOf(lv5(12))).toBe(45);
    expect(conHpPart(lv5(14))).toBe(10);
  });
  it('a migrated character keeps its maximum', () => expect(maxHpOf(lv5(14, { conBase: 2 }))).toBe(40));
  it('typing a max HP stores it without the CON part', () => {
    const p = setMaxHp(lv5(14), 60);
    expect(p.maxHp).toBe(50);
    expect(maxHpOf({ ...lv5(14), ...p })).toBe(60);
  });
  it('a CON drop clamps current HP through normalize', () => {
    const c = lv5(14, { hp: 50 });
    expect(normalize({ ...c, abil: { ...c.abil, con: 12 } }).hp).toBe(45);
  });
  it('an equipped item with a CON abil grant changes max HP', () => {
    const item = { id: 'belt', name: 'Belt', qty: 1, eq: true };
    const g: Grant = { id: 'gb', kind: 'abil', name: 'CON +2', ab: 'con', val: '2', cap: 20, needEq: true, from: 'item:belt' };
    const on = lv5(14, { inv: [item], grants: [g] });
    expect(maxHpOf(on)).toBe(55);
    expect(maxHpOf({ ...on, inv: [{ ...item, eq: false }] })).toBe(50);
  });
  it('maxHpOf is never below 1', () => {
    const c = withClass({ ...blankCharacter(), maxHp: 0, hp: 1, conBase: 0, abil: { ...blankCharacter().abil, con: 8 } }, { lvl: 1 });
    expect(maxHpOf(c)).toBe(1);
    expect(normalize(c).hp).toBe(1);
    const m = migrate({ ...blankCharacter(), maxHp: -5 });
    expect(m.maxHp).toBe(-5);
    expect(maxHpRaw(m)).toBe(-5); // the raw value is not floored
    expect(maxHpOf(m)).toBe(1);
  });
});

describe('Hit Dice pools (PHB p.45)', () => {
  // Ranger 5 (d10) / Rogue 2 (d8).
  const two = (p: Partial<Character> = {}) => withClasses({ ...blankCharacter(), maxHp: 60, hp: 30, hdUsed: {}, ...p },
    [{ clsId: 'class/ranger', lvl: 5, hd: 10 }, { clsId: 'class/rogue', lvl: 2, hd: 8 }]);
  it('spends a die of the size asked for', () => {
    const c = spendHitDie(two(), 8);
    expect(c).toMatchObject({ hdUsed: { 8: 1 }, hdLast: 8, amount: 0 });
    const full = two({ hdUsed: { 8: 2 } });
    expect(spendHitDie(full, 8)).toBe(full);
    expect(hitDieRoll(two(), 8)).toBe('1d8 +0');
  });
  it('undo after a heal, damage or temp HP refunds only that pool', () => {
    const spent = { ...spendHitDie(two({ hdUsed: { 10: 1 } }), 8), amount: 5 };
    for (const f of [healHitDie, damageHitDie, setTempHitDie]) {
      const after = f(spent);
      expect(after.hdLast).toBeUndefined();
      expect(undoHp(after).hdUsed).toEqual({ 10: 1, 8: 0 });
    }
  });
  it('a rest clears the waiting die', () => {
    const spent = spendHitDie(two(), 8);
    expect(shortRest(spent).hdLast).toBeUndefined();
    expect(longRest(spent).hdLast).toBeUndefined();
    expect(longRest(spent).hdUsed).toEqual({});
  });
  it('the pill shows the total left over the total level', () => {
    expect(pillView(spendHitDie(two(), 8), 'hd')).toMatchObject({ value: '6', max: '7' });
  });
});

describe('an effect that raises the HP maximum', () => {
  const aid: Spell = { id: 'a', name: 'Aid', lvl: 2, time: 'Action', range: '30 feet' };
  const aidG: Grant = { id: 'g', kind: 'hpFlat', name: 'Aid', val: '@2:5,3:10,4:15,5:20,6:25,7:30,8:35,9:40', when: 'active', from: 'spell:a' };
  const base = (hp: number): Character => ({ ...blankCharacter(), maxHp: 20, origHp: 20, hp, conBase: 0, spells: [aid], grants: [aidG],
    slotMax: [0, 4, 3, 0, 0, 0, 0, 0, 0, 0], slotUsed: Array(10).fill(0) });
  const cast = (hp: number) => applyPatch(base(hp), (p) => castSpell(p, aid, 2));
  it('raises current HP by the same amount when cast (Aid, PHB p.239)', () => {
    expect([cast(20).hp, maxHpOf(cast(20))]).toEqual([25, 25]);
    expect([cast(10).hp, maxHpOf(cast(10))]).toEqual([15, 25]);
  });
  it('lowers only the maximum when switched off', () => {
    const off = applyPatch(cast(20), (p) => toggleEffect(p, 'spell:a'));
    expect([off.hp, maxHpOf(off)]).toEqual([20, 20]);
  });
  it('raises current HP when switched on by hand', () => {
    expect(applyPatch(base(20), (p) => toggleEffect(p, 'spell:a')).hp).toBe(25);
  });
  it('leaves current HP alone for an effect that raises Constitution', () => {
    const c: Character = { ...base(20), grants: [{ id: 'k', kind: 'abil', name: 'CON +2', ab: 'con', val: '2', when: 'active', from: 'spell:a' }] };
    expect(applyPatch(c, (p) => toggleEffect(p, 'spell:a')).hp).toBe(20);
  });
  it('ends with a Long Rest: cast state gone, maximum and HP back', () => {
    const rested = normalize(longRest(cast(20)));
    expect('castFx' in rested).toBe(false);
    expect(rested.effectsOn).toEqual([]);
    expect([rested.hp, maxHpOf(rested)]).toEqual([20, 20]);
  });
});
