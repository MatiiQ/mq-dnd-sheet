import { describe, expect, it } from 'vitest';
import { blankCharacter, druidSample } from './defaults';
import { MULTICLASS_SLOTS, casterLevel, pactFor, slotsFor, pactLeft, spellForRow, saveDc, castFree, freeCastsOf, ownFreeCasts, setOwnFreeCast, spellAttackFor, spellSaveDcFor, removeRef, modeSpeed, castSpell, concAfterEdit, preparedCount, setExhaustion, sortSpells, spellAttack, spellAttackParts, spellDcParts, spellSaveDC, toggleCondition } from './logic';
import { migrate } from './migrate';
import { addFromCatalog } from './catalog/copy';
import { mergeCatalog } from './catalog/merge';
import srdEntries from './data/srd/index';
import { effectCanTargetOther } from './links';
import type { Character, Grant, Item, Spell } from './types';
import { withClass, withClasses, make, sp, hm } from './test-fixtures';

describe('spells', () => {
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
        const c = removeRef(conc, { kind: 'spell', id: 's1' });
        expect(c.spells.map((x) => x.id)).toEqual(['s2']);
        expect(c).toMatchObject({ conc: null, concCheck: null });
        expect(c.res.map((r) => r.id)).toEqual(['fcs2']);
        const k = removeRef(conc, { kind: 'spell', id: 's2' });
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
    it('removing a spell removes its own free cast and empties a pill naming it', () => {
      const c = make({ pills: ['hp', 'res:fc', ''], res: [{ id: 'fc', name: 'Goodberry', count: 1, max: 1, recharge: 'long', from: 'spell:sp8', casts: 'sp8' }],
        effectsOn: ['spell:sp8'] });
      const r = removeRef(c, { kind: 'spell', id: 'sp8' });
      expect(r.res).toEqual([]);
      expect(r.pills).toEqual(['hp', '', '']);
      expect(r.effectsOn).toEqual([]);
      const both = make({ res: [{ id: 'a', name: 'A', count: 1, from: 'spell:sp4', casts: 'sp4' }, { id: 'b', name: 'B', count: 1, from: 'feature:f2', casts: 'sp4' }] });
      expect(freeCastsOf(both, 'sp4').map((r) => r.id)).toEqual(['a', 'b']);
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
  describe('spell attack and save DC bonus grants', () => {
    // Wand of the War Mage: a bonus to spell attack rolls by its rarity; Robe of the Archmagi: spell save DC and spell
    // attack bonus each increase by 2 (SRD 5.2.1 magic items).
    const wand: Item = { id: 'w1', name: 'Wand of the War Mage +2', qty: 1, eq: true, magic: 2 };
    const robe: Item = { id: 'r1', name: 'Robe of the Archmagi', qty: 1, eq: true };
    const atk: Grant = { id: 'ga', kind: 'spellAtk', name: 'Spell attack', val: 'magic', needEq: true, needAtt: true, from: 'item:w1' };
    const rAtk: Grant = { id: 'gr1', kind: 'spellAtk', name: 'Spell attack +2', val: '2', needEq: true, needAtt: true, from: 'item:r1' };
    const rDc: Grant = { id: 'gr2', kind: 'spellDc', name: 'Spell save DC +2', val: '2', needEq: true, needAtt: true, from: 'item:r1' };
    const base = { ...blankCharacter(), castAb: 'int' as const, inv: [wand, robe] };
    const bolt: Spell = { id: 's1', name: 'Fire Bolt', lvl: 0, time: 'Action', range: '120 ft' };
    it('adds an equipped, attuned wand’s magic to the spell attack only', () => {
      const c = { ...base, grants: [atk], attuneIds: ['w1'] };
      expect(spellAttackFor(c, bolt)! - spellAttackFor(base, bolt)!).toBe(2);
      expect(spellAttack(c)! - spellAttack(base)!).toBe(2);
      expect(spellSaveDcFor(c, bolt)).toBe(spellSaveDcFor(base, bolt));
      expect(spellAttackFor({ ...c, attuneIds: [] }, bolt)).toBe(spellAttackFor(base, bolt));
      expect(spellAttackParts(c)).toContainEqual({ label: 'Wand of the War Mage +2', value: 2 });
      expect(spellDcParts(c)!.some((p) => p.label === 'Wand of the War Mage +2')).toBe(false);
      expect(spellAttackParts(c)!.reduce((t, p) => t + p.value, 0)).toBe(spellAttack(c));
    });
    it('raises the spell attack by a catalog Wand of the War Mage +2 once equipped and attuned', () => {
      const cat = mergeCatalog(srdEntries, null);
      const c0 = addFromCatalog(base, cat, cat.byId.get('item/wand-of-the-war-mage-1-2-or-3')!, { picks: {}, counted: {}, links: {}, item: { bonus: 2 } });
      const w = c0.inv.at(-1)!;
      expect(spellAttack(c0)).toBe(spellAttack(base));
      const on = { ...c0, inv: c0.inv.map((x) => (x.id === w.id ? { ...x, eq: true } : x)), attuneIds: [w.id] };
      expect(spellAttack(on)! - spellAttack(base)!).toBe(2);
    });
    it('adds an attuned Robe’s +2 to both, each in its own breakdown', () => {
      const c = { ...base, grants: [rAtk, rDc], attuneIds: ['r1'] };
      expect(spellSaveDC(c)! - spellSaveDC(base)!).toBe(2);
      expect(spellSaveDcFor(c, bolt)! - spellSaveDcFor(base, bolt)!).toBe(2);
      expect(spellAttack(c)! - spellAttack(base)!).toBe(2);
      expect(spellDcParts(c)!.filter((p) => p.label === 'Robe of the Archmagi')).toEqual([{ label: 'Robe of the Archmagi', value: 2 }]);
      expect(spellDcParts(c)!.reduce((t, p) => t + p.value, 0)).toBe(spellSaveDC(c));
    });
  });
  describe('saveDc (a feature row\'s save DC)', () => {
    const c = withClass({ ...blankCharacter(), abil: { ...blankCharacter().abil, wis: 16, str: 12, dex: 18 } }, { lvl: 5 });
    it('adds the Value and the ability, the best of a list, or none without dcAb', () => {
      expect(saveDc(c, { dc: '8+pb', dcAb: 'wis', from: 'feature:x' })).toBe(14);
      expect(saveDc(c, { dc: '8+pb', dcAb: 'str,dex', from: 'feature:x' })).toBe(15);
      expect(saveDc(c, { dc: '8+pb', from: 'feature:x' })).toBe(11);
    });
  });
  describe('spell save DC effects', () => {
    it('Innate Sorcery raises the spell save DC by one while on (PHB p.140)', () => {
      const cat = mergeCatalog(srdEntries, null);
      const c0 = withClass({ ...blankCharacter(), castAb: 'cha' as const }, { lvl: 3 });
      const c = addFromCatalog(c0, cat, cat.byId.get('feature/sorcerer/innate-sorcery')!, { picks: {}, counted: {}, links: {} });
      expect(spellSaveDC(c)).toBe(spellSaveDC(c0));
      expect(spellSaveDC({ ...c, effectsOn: [c.grants.find((g) => g.kind === 'spellDc')!.from] })).toBe(spellSaveDC(c0)! + 1);
    });
  });
  describe('a Touch spell on another creature', () => {
    const fly = (extra = {}) => ({ id: 's', name: 'Fly', lvl: 3, time: 'Action', range: 'Touch', c: true, ...extra }) as unknown as Spell;
    const flying = (sp: Spell) => ({ ...blankCharacter(), spells: [sp], conc: { id: 's', name: 'Fly' },
      grants: [{ id: 'g', kind: 'speed', name: 'Fly', mode: 'fly', val: '60', when: 'active', from: 'spell:s' }] }) as unknown as Character;
    it('counts a Touch Concentration spell’s speed only when cast on you', () => {
      expect(modeSpeed(flying(fly()), 'fly').base).toBe(60);
      expect(modeSpeed(flying(fly({ acOther: true })), 'fly').base).toBe(0);
      expect(modeSpeed({ ...flying(fly()), conc: null }, 'fly').base).toBe(0);
    });
    it('ignores acOther on a spell that no longer offers the switch', () => {
      expect(modeSpeed(flying(fly({ acOther: true, range: 'Self' })), 'fly').base).toBe(60);
      expect(modeSpeed({ ...flying(fly({ acOther: true, c: false })), effectsOn: ['spell:s'] }, 'fly').base).toBe(60);
    });
    it('offers the target switch only on a non-Self Concentration spell with an active effect', () => {
      const c = flying(fly());
      expect(effectCanTargetOther(c, c.spells[0])).toBe(true);
      expect(effectCanTargetOther(c, { ...c.spells[0], range: '90 feet' })).toBe(true);
      expect(effectCanTargetOther(c, { ...c.spells[0], range: 'Self' })).toBe(false);
      expect(effectCanTargetOther(c, { ...c.spells[0], c: false })).toBe(false);
      const xdmg = { ...c, grants: [{ ...c.grants[0], kind: 'xdmg', dice: '1d6', on: 'hits' }] } as unknown as Character;
      expect(effectCanTargetOther(xdmg, c.spells[0])).toBe(false);
      const warded = { ...c, grants: [], defenses: [{ id: 'd', kind: 'res', name: 'Fire', when: 'active', from: 'spell:s' }] } as unknown as Character;
      expect(effectCanTargetOther(warded, c.spells[0])).toBe(true);
      expect(modeSpeed({ ...warded, grants: c.grants, spells: [{ ...c.spells[0], acOther: true }] }, 'fly').base).toBe(0);
    });
  });
});

describe('the Pact Magic pool (PHB p.45, p.154)', () => {
  const sp = { id: 's', name: 'Hex', lvl: 1, time: 'Bonus Action', range: '90 feet' } as Spell;
  const w = (p: Partial<Character> = {}) => ({ ...blankCharacter(), hp: 8, pactMax: 2, pactLvl: 3, pactUsed: 0, spells: [sp], ...p });
  it('casts any spell with a pact slot at the pact level', () => {
    expect(castSpell(w(), sp, 3, 'pact')).toMatchObject({ pactUsed: 1 });
    expect(castSpell(w({ pactLvl: 2 }), sp, 3, 'pact')).toEqual({});
    expect(castSpell(w({ pactUsed: 2 }), sp, 3, 'pact')).toEqual({});
    expect(pactLeft(w({ pactUsed: 1 }))).toBe(1);
  });
});

describe('prepared spells per class (PHB p.45)', () => {
  const sp = (id: string, p: Partial<Spell> = {}): Spell => ({ id, name: id, lvl: 1, time: 'Action', range: '60 feet', prep: true, ...p });
  it('counts a classless prepared spell against the first casting row', () => {
    const c = withClasses({ ...blankCharacter(), spells: [sp('a')] }, [{ name: 'Fighter', lvl: 1 }, { name: 'Wizard', lvl: 3, castAb: 'int', prep: 5 }]);
    expect(preparedCount(c, c.classes[1])).toBe(1);
    expect(preparedCount(c, c.classes[0])).toBe(0);
    expect(preparedCount(c)).toBe(1);
  });
  it('counts a spell tied to a row for that row only', () => {
    const c = withClasses({ ...blankCharacter(), spells: [sp('a'), sp('b', { cls: 'c2' }), sp('c', { cls: 'c2', prep: false })] },
      [{ name: 'Ranger', castAb: 'wis', prep: 5 }, { name: 'Sorcerer', castAb: 'cha', prep: 6 }]);
    expect([preparedCount(c, c.classes[0]), preparedCount(c, c.classes[1])]).toEqual([1, 1]);
  });
  it('ties a spell to a row with its casting ability', () => {
    const row = { id: 'c2', name: 'Sorcerer', clsId: '', sub: '', subId: '', lvl: 1, hd: 6 as const, prep: 6, castAb: 'cha' as const };
    expect(spellForRow(sp('a'), row)).toMatchObject({ cls: 'c2', castAb: 'cha' });
    expect(spellForRow(sp('a'), { ...row, castAb: undefined })).not.toHaveProperty('castAb');
  });
});

describe('spell slots from classes (PHB p.45)', () => {
  const srd = mergeCatalog(srdEntries, null);
  const row = (cls: string, lvl: number) => ({ clsId: 'class/' + cls, name: cls, lvl });
  const of = (...rows: { clsId: string; name: string; lvl: number }[]) => withClasses(blankCharacter(), rows);
  const pad = (...n: number[]) => [0, ...n, ...Array(9 - n.length).fill(0)];
  it('one Spellcasting class uses its own table', () => {
    expect(slotsFor(of(row('ranger', 5), row('rogue', 2)), srd)).toEqual(pad(4, 2));
    expect(casterLevel(of(row('ranger', 5), row('rogue', 2)), srd).casters).toBe(1);
  });
  it('two or more use the multiclass table, rounding half casters up per class', () => {
    expect(casterLevel(of(row('ranger', 1), row('paladin', 1)), srd)).toEqual({ level: 2, casters: 2 });
    expect(slotsFor(of(row('ranger', 1), row('paladin', 1)), srd)).toEqual([0, ...MULTICLASS_SLOTS[1]]);
    expect(casterLevel(of(row('wizard', 3), row('cleric', 2)), srd).level).toBe(5);
    expect(slotsFor(of(row('wizard', 3), row('cleric', 2)), srd)).toEqual(pad(4, 3, 2));
  });
  it('a Pact Magic class keeps its own pool and adds nothing to the caster level', () => {
    const c = of(row('warlock', 3), row('sorcerer', 2));
    expect(slotsFor(c, srd)).toEqual(pad(3));
    expect(pactFor(c, srd)).toEqual({ max: 2, lvl: 2 });
    expect(pactFor(of(row('wizard', 3)), srd)).toEqual({ max: 0, lvl: 0 });
  });
  const ek = (fighter: number, extra: { clsId: string; name: string; lvl: number }[] = []): Character => ({
    ...of(row('fighter', fighter), ...extra),
    feats: [{ id: 'ek', g: 'sub', name: 'Spellcasting', desc: '', cid: 'feature/fighter/eldritch-knight/spellcasting' }],
    grants: [{ id: 'gc', kind: 'casting', name: 'Spellcasting', ab: 'int', list: 'wizard', s1: '3:2,4:3,7:4', s2: '7:2', from: 'feature:ek', minLvl: 3 }]
  });
  it('a casting grant alone reads its own slot values at its class level', () => {
    expect(slotsFor(ek(7), srd)).toEqual(pad(4, 2));
  });
  it('a casting grant counts a third, rounded down, with another caster', () => {
    expect(casterLevel(ek(9, [row('wizard', 1)]), srd)).toEqual({ level: 4, casters: 2 });
  });
  it('an inactive casting grant does not make two casters', () => {
    const c = ek(2, [row('wizard', 3)]);
    expect(casterLevel(c, srd).casters).toBe(1);
    expect(slotsFor(c, srd)).toEqual(pad(4, 2));
  });
});

describe('an item spell’s own numbers', () => {
  it('uses its own save DC and attack bonus, even with no spellcasting ability', () => {
    const c = { ...blankCharacter(), castAb: 'none' as const };
    const s = { id: 's', name: 'Fireball', lvl: 3, time: 'Action', range: '150 feet', dc: 15, atkB: 7 };
    expect(spellSaveDcFor(c, s)).toBe(15);
    expect(spellAttackFor(c, s)).toBe(7);
  });
});
