import { describe, expect, it } from 'vitest';
import { newId } from './logic';
import { blankCharacter, druidSample, sampleCharacter } from './defaults';
import {
  ABILITIES, charLevel, hasHistory, pactLeft, setBaseRows, spellForRow, valueCtx, conHpPart, maxHpRaw, profBonus, regainTo, saveDc, acCanTargetOther, acOnOther, toggleAcTarget, regainLabel, damageHitDie, setTempHitDie, castAbOf, removeChip, speedOf, armorSlowBy, stealthDisBy, acSpellIdle, untrainedArmor, grantChips, addGrants, findUnlinked, removalChain, removalSummary, castFree, freeCastsOf, ownFreeCasts, setOwnFreeCast, spellAttackFor, spellSaveDcFor, dawn, refillFor, restRolls, maxFields, maxOf, normalize, resourceGroups, mergedDefenses, mergedSenses, removeRef, abilityParts, carryUpOf, maxHpOf, modeSpeed, sizeOf, walkSpeed, effScore, hasProf, profList, saveProficient, skillLevel, applyDamage, applyHeal, applySetTemp, acAfterEdit, armorClass, carriedWeight, carryCapacity, castSpell, detectAcSpell, detectArmor, clearHpUndo, concAfterEdit, fmt, hdSpent, healHitDie, hitDieRoll, hpColor, hpRingStops, initiative, isDead, longRest, parseWeight, passiveScore, passiveParts, passiveNotes, activeAuras, pillView, resPill, setPill, preparedCount, saveMod, setHp, setMaxHp, shortRest, skillMod, slotsLeft, num, setExhaustion, sortSpells, speedNow, spellAttack, spellAttackParts, spellDcParts, spellSaveDC, spellUsable, spendHitDie, toggleAcSpell, toggleCondition, undoHp
} from './logic';
import { migrate } from './migrate';
import { AOP, haAura, holyAvenger, paladin, withClass, withClasses } from './test-fixtures';
import { validateEntry, type GrantSpec } from './catalog/schema';
import { addFromCatalog, type ItemAnswers } from './catalog/copy';
import { mergeCatalog } from './catalog/merge';
import srdEntries from './data/srd/index';
import { extraDamage } from './actions';
import { effectCanTargetOther, inactiveReason, isActive } from './links';
import { applyPatch } from './storage';
import type { FeatureEntry } from './catalog/schema';
import type { Character, ClassRow, Feature, Grant, Item, Spell } from './types';

const make = (p: Partial<Character> = {}): Character => ({ ...sampleCharacter(), ...p });
const sp = (p: Partial<Spell> = {}): Spell => ({ id: 's1', name: 'Bless', lvl: 1, time: 'Action', range: '30 ft', srcName: 'Cleric', ...p });
const hm = { id: 'sp4', name: 'Hunter’s Mark' };
const ac = (p: Partial<Character>) => armorClass(make({ inv: [], spells: [], acMods: [], acOn: [], acUnarm: 'none', conc: null, ...p }));
const it_ = (p: Partial<Item>): Item => ({ id: 'a', name: 'X', qty: 1, eq: true, ...p });
const gr = (p: Partial<Grant> & { kind: Grant['kind'] }): Grant => ({ id: 'g' + p.kind, name: p.kind, from: 'feature:f10', ...p } as Grant);

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
    expect(hitDieRoll(c, 10)).toBe('1d10 +2');
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
    expect(hdSpent(withClass(make({ hdUsed: { 10: 2 } }), { lvl: 5 }), 10)).toBe(2);
    expect(hdSpent(withClass(make({ hdUsed: { 10: 5 } }), { lvl: 3 }), 10)).toBe(3);
  });
  it('lowers speed for exhaustion and sets it to 0 when Grappled', () => {
    expect(speedNow(make({ exh: 2 }))).toBe(25);
    expect(speedNow(make({ conds: { Grappled: true } }))).toBe(0);
    expect(speedOf({ ...blankCharacter(), exh: 5 }, 20)).toBe(0); // never below 0
  });
  it('colours HP green from 65%, yellow from 30%, red below, ignoring temp HP', () => {
    const at = (hp: number, maxHp: number, temp = 0) => hpColor(make({ hp, maxHp, temp }));
    expect([at(44, 44), at(29, 44), at(13, 20)]).toEqual(Array(3).fill('var(--hp-high)'));
    expect([at(28, 44), at(14, 44), at(6, 20)]).toEqual(Array(3).fill('var(--hp-mid)'));
    expect([at(13, 44), at(5, 20), at(0, 44), at(13, 44, 20)]).toEqual(Array(4).fill('var(--hp-low)'));
  });
  it('splits the ring over max + temp, staying within 100', () => {
    const at = (hp: number, maxHp: number, temp: number) => hpRingStops(make({ hp, maxHp, temp }));
    expect(at(31, 44, 0)).toEqual({ hp: 70.5, temp: 0 });
    expect(at(44, 44, 0)).toEqual({ hp: 100, temp: 0 });
    expect(at(44, 44, 11)).toEqual({ hp: 80, temp: 20 });
    expect(at(0, 10, 30)).toEqual({ hp: 0, temp: 75 });
    expect(at(0, 0, 0)).toEqual({ hp: 0, temp: 0 });
    const s = at(1, 1, 1999);
    expect(s.hp + s.temp).toBeLessThanOrEqual(100);
  });
  it('newId is unique within one millisecond', () => {
    expect(new Set(Array.from({ length: 1000 }, newId)).size).toBe(1000);
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
  it('empties an Inspiration pill while off, keeping the slot', () => {
    const c = { ...blankCharacter(), inspOn: false, pills: ['insp', '', ''] };
    expect(pillView(c, 'insp')).toBeNull();
    expect(normalize(c).pills[0]).toBe('insp');
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
  it('a set score raises to the highest set, never lowers, then the adjustment applies', () => {
    const set = (id: string, val: string): Grant => ({ id, kind: 'abilSet', name: 'Set ' + id, ab: 'dex', val, from: 'feature:f10' });
    expect(effScore(withAbil(18, [set('a', '19'), set('b', '23')]), 'dex')).toBe(23);
    expect(effScore(withAbil(18, [set('a', '19'), set('b', '23')], { abilAdj: { dex: -2 } }), 'dex')).toBe(21);
    expect(effScore(withAbil(20, [set('a', '19')]), 'dex')).toBe(20); // never lowers a higher score
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
  it('names the grant source on each grant part, not on Score', () => {
    const c: Character = {
      ...blankCharacter(),
      feats: [{ id: 'f', g: 'feat' as const, name: 'Athlete', desc: '' }],
      inv: [{ id: 'i', name: 'Gauntlets', qty: 1, eq: true }],
      grants: [
        { id: 'g1', kind: 'abil' as const, name: 'Athlete', ab: 'str' as const, val: '1', cap: 20, from: 'feature:f' },
        { id: 'g2', kind: 'abilSet' as const, name: 'Gauntlets', ab: 'con' as const, val: '19', from: 'item:i' }
      ]
    };
    const str = abilityParts(c, 'str');
    expect(str[0]).not.toHaveProperty('from');
    expect(str[0]).not.toHaveProperty('src');
    expect(str[1]).toMatchObject({ from: 'feature:f', src: 'Feat · Athlete' });
    expect(abilityParts(c, 'con')[1]).toMatchObject({ from: 'item:i' });
  });
});

describe('proficiencies', () => {
  const pg = (id: string, cat: Grant['cat'], target?: string, p: Partial<Grant> = {}): Grant =>
    ({ id, kind: 'prof', name: 'Prof ' + id, cat, ...(target ? { target } : {}), from: 'feature:f4', ...p });
  it('takes the higher of the hand level and the grants, and names the grant that raised it', () => {
    const c = make({ skillProf: { stealth: 1, survival: 2 }, grants: [pg('a', 'expertise', 'stealth'), pg('b', 'skill', 'survival')] });
    expect(skillLevel(c, 'stealth')).toEqual({ level: 2, hand: 1, by: 'Class · Deft Explorer', from: 'feature:f4' });
    expect(skillLevel(c, 'survival')).toEqual({ level: 2, hand: 2 });
    expect(skillLevel({ ...c, grants: [] }, 'stealth')).toEqual({ level: 1, hand: 1 });
    expect(skillMod(c, 'stealth', 'dex')).toBe(4 + 6);
  });
  it('adds half Proficiency Bonus, rounded down, to skills without proficiency (PHB p.60), not to Initiative', () => {
    const bard = withClass(make({ skillProf: { arcana: 1 }, grants: [pg('j', 'half')] }), { lvl: 5 });
    expect(skillMod(bard, 'history', 'int')).toBe(0 + 1);
    expect(skillMod(bard, 'arcana', 'int')).toBe(0 + 3);
    expect(initiative(bard)).toBe(initiative(withClass(make(), { lvl: 5 })));
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
  it('gives Expertise instead when the skill is already proficient (Keen Mind, PHB p.205)', () => {
    const k = gr({ kind: 'prof', cat: 'skill', target: 'arcana', orExpert: true });
    expect(skillLevel(make({ grants: [k] }), 'arcana').level).toBe(1);
    expect(skillLevel(make({ grants: [k], skillProf: { arcana: 1 } }), 'arcana').level).toBe(2);
    expect(skillLevel(make({ grants: [k, gr({ kind: 'prof', cat: 'skill', target: 'arcana', id: 'other' })] }), 'arcana').level).toBe(2);
  });
  const stone: Item = { id: 'l', name: 'Luckstone', qty: 1, eq: true, attune: true };
  it('adds a check bonus for all to every check', () => {
    const off = { ...blankCharacter(), inv: [stone], attuneIds: ['l', '', ''] };
    const on: Character = { ...off, grants: [{ id: 'g', kind: 'checkBonus', name: 'Luck', target: 'all', val: '1', needAtt: true, from: 'item:l' }] };
    expect(skillMod(on, 'arcana', 'int')).toBe(skillMod(off, 'arcana', 'int') + 1);
    expect(initiative(on)).toBe(initiative(off) + 1);
    expect(passiveScore(on, 'perception')).toBe(passiveScore(off, 'perception') + 1);
  });
});

// Passive score = 10 + the check bonus, ±5 for Advantage/Disadvantage (PHB p.372); the two cancel (PHB p.360);
// Exhaustion −2 per level on D20 Tests (PHB p.366); Poisoned: Disadvantage on ability checks (PHB p.372); Frightened only
// while the source is in sight (PHB p.367), so a note.
describe('passive scores', () => {
  const feat = { id: 'f', g: 'feat' as const, name: 'X', desc: '' };
  const base = (p: Partial<Character> = {}): Character => ({ ...blankCharacter(), abil: { ...blankCharacter().abil, wis: 14, int: 12 }, feats: [feat], ...p });
  const adv = (p: Partial<Grant>): Grant => ({ id: 'a', kind: 'checkAdv', name: 'Keen', target: 'perception', adv: 'adv', from: 'feature:f', ...p });
  it('equals 10 + the skill modifier with nothing else', () => {
    const c = base();
    for (const [k, ab] of [['perception', 'wis'], ['investigation', 'int'], ['insight', 'wis']] as const) expect(passiveScore(c, k)).toBe(10 + skillMod(c, k, ab));
  });
  it('lists proficiency and a check bonus with their sources', () => {
    const c = base({ grants: [
      { id: 'p', kind: 'prof', name: 'Perception', cat: 'skill', target: 'perception', from: 'feature:f' },
      { id: 'b', kind: 'checkBonus', name: 'Lucky', target: 'perception', val: '1', from: 'feature:f' }
    ] });
    const parts = passiveParts(c, 'perception');
    expect(parts.find((p) => p.label === 'Proficiency')).toMatchObject({ value: 2, from: 'feature:f' });
    expect(parts.find((p) => p.label === 'Lucky')).toMatchObject({ value: 1, src: 'Feat · X' });
    expect(passiveScore(c, 'perception')).toBe(10 + 2 + 2 + 1);
  });
  it('takes 2 per Exhaustion level', () => {
    expect(passiveParts(base({ exh: 2 }), 'perception').find((p) => p.label === 'Exhaustion')?.value).toBe(-4);
  });
  it('takes 5 while Poisoned; Frightened only adds a note', () => {
    expect(passiveScore(base({ conds: { Poisoned: true } }), 'perception')).toBe(passiveScore(base(), 'perception') - 5);
    const fr = base({ conds: { Frightened: true } });
    expect(passiveScore(fr, 'perception')).toBe(passiveScore(base(), 'perception'));
    expect(passiveNotes(fr, 'perception')).toContain('−5 while the source of your fear is in sight (Frightened)');
  });
  it('adds 5 for an always Advantage, a note for a situational one', () => {
    expect(passiveScore(base({ grants: [adv({ always: true })] }), 'perception')).toBe(passiveScore(base(), 'perception') + 5);
    const sit = base({ grants: [adv({ note: 'relies on sight' })] });
    expect(passiveScore(sit, 'perception')).toBe(passiveScore(base(), 'perception'));
    expect(passiveNotes(sit, 'perception')).toEqual(['+5 when relies on sight (Feat · X)']);
  });
  it('cancels Advantage with Poisoned', () => {
    const parts = passiveParts(base({ grants: [adv({ always: true })], conds: { Poisoned: true } }), 'perception');
    expect(parts.some((p) => p.label === 'Advantage' || p.label === 'Disadvantage')).toBe(false);
  });
  it('gives a checkAdv chip pointing at Senses', () => {
    const chip = grantChips(base({ grants: [adv({ note: 'relies on sight' })] }), 'feature:f')[0];
    expect(chip.label).toMatch(/^Advantage on Perception checks/);
    const ab = grantChips(base({ grants: [adv({ target: 'wis', adv: 'dis' })] }), 'feature:f')[0];
    expect(ab.label).toBe('Disadvantage on Wisdom checks');
    expect(chip.target).toEqual({ sec: 'sec-senses' });
  });
});

describe('speed, initiative and size', () => {
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
    expect(initiative(withClass(make({ grants: [alert] }), { lvl: 5 }))).toBe(initiative(withClass(make(), { lvl: 5 })) + 3);
    expect(initiative(withClass(make({ grants: [{ ...alert, counted: true }] }), { lvl: 5 }))).toBe(initiative(withClass(make(), { lvl: 5 })));
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
  it('reads a speed of twice the walking Speed (Revelation in Flesh, PHB p.146)', () => {
    const c = make({ speedBase: 30, grants: [gr({ kind: 'speed', mode: 'swim', val: 'walk2' })] });
    expect(modeSpeed(c, 'swim').base).toBe(60);
  });
});

describe('senses and defenses', () => {
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
  it('adds a "+60 if you already have it" sense to the longest other range (Umbral Sight, PHB p.126)', () => {
    const se = (id: string, range: string, plus?: boolean) => ({ id, name: 'Darkvision', range, ...(plus ? { plus } : {}) });
    expect(mergedSenses(make({ senses: [se('a', '60 ft'), se('b', '60 ft', true)] }))[0].range).toBe('120 ft');
    expect(mergedSenses(make({ senses: [se('b', '60 ft', true)] }))[0].range).toBe('60 ft');
    expect(mergedSenses(make({ senses: [se('a', '120 ft'), se('b', '60 ft', true)] }))[0].range).toBe('180 ft');
    expect(mergedSenses(make({ senses: [se('b', '60 ft', true), se('c', '60 ft', true)] }))[0].range).toBe('120 ft');
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
      expect(modeSpeed(flying(fly({ acOther: true, range: '60 feet', acFx: 'bonus' })), 'fly').base).toBe(60);
    });
    it('offers the target switch only on a Touch Concentration spell with a speed or defense', () => {
      const c = flying(fly());
      expect(effectCanTargetOther(c, c.spells[0])).toBe(true);
      expect(effectCanTargetOther(c, { ...c.spells[0], range: '90 feet' })).toBe(false);
      expect(effectCanTargetOther(c, { ...c.spells[0], c: false })).toBe(false);
      const xdmg = { ...c, grants: [{ ...c.grants[0], kind: 'xdmg', dice: '1d6', on: 'hits' }] } as unknown as Character;
      expect(effectCanTargetOther(xdmg, c.spells[0])).toBe(false);
      const warded = { ...c, grants: [], defenses: [{ id: 'd', kind: 'res', name: 'Fire', when: 'active', from: 'spell:s' }] } as unknown as Character;
      expect(effectCanTargetOther(warded, c.spells[0])).toBe(true);
      expect(modeSpeed({ ...warded, grants: c.grants, spells: [{ ...c.spells[0], acOther: true }] }, 'fly').base).toBe(0);
    });
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

describe('resources', () => {
  const seren = druidSample(); // WIS 20 (+5), level 12
  it('reads a maximum: a number of at least 1, a formula, or none', () => {
    expect(maxOf(seren, { max: 3 })).toBe(3);
    expect(maxOf(seren, {})).toBeNull();
    expect(maxOf(seren, { max: 0 })).toBeNull();
    expect(maxOf(make({ abil: { ...make().abil, wis: 8 } }), { maxV: 'wis' })).toBe(0);
    expect(maxOf(seren, { maxV: 'wis>=1' })).toBe(5);
    expect(maxOf(withClass(make(), { lvl: 1 }), { maxV: '2:2,6:3' })).toBe(0);
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
    const c = withClass(make({ res: [{ id: 'a', name: 'A', count: 0, maxV: 'pb' }, { id: 'b', name: 'B', count: 1 }, { id: 'z', name: 'Z', count: 0, maxV: '2:2' }] }), { lvl: 1 });
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
    const c = withClass(make({ hp: 60, res: [{ id: 'w', name: 'W', count: 2, maxV: '2:2,6:3' }, { id: 'x', name: 'X', count: 9 }] }), { lvl: 1 });
    const n = normalize(c);
    expect(n.res.map((r) => r.count)).toEqual([0, 9]);
    expect(n.hp).toBe(44);
    const fine = make();
    expect(normalize(fine)).toBe(fine);
  });
  describe('a grant value that reads its item’s magic', () => {
    const wand: Item = { id: 'w1', name: 'Wand +2', qty: 1, eq: true, magic: 2 };
    const plainWand: Item = { id: 'w2', name: 'Wand', qty: 1, eq: true };
    const save = (from: string): Grant => ({ id: 'g' + from, kind: 'saveBonus', name: 'Magic save', ab: 'dex', val: 'magic', from });
    const c = { ...blankCharacter(), inv: [wand, plainWand], feats: [{ id: 'f1', g: 'feat' as const, name: 'Feat', desc: '' }] };
    it('is the item’s magic, 0 without one or from a feature', () => {
      const base = saveMod(c, 'dex');
      expect(saveMod({ ...c, grants: [save('item:w1')] }, 'dex') - base).toBe(2);
      expect(saveMod({ ...c, grants: [save('item:w2')] }, 'dex') - base).toBe(0);
      expect(saveMod({ ...c, grants: [save('feature:f1')] }, 'dex') - base).toBe(0);
      expect(num({ ...c, grants: [save('item:w1')] }, 'magic', save('item:w1'))).toBe(2);
    });
    it('shows the item’s value on its chip', () => {
      const chips = grantChips({ ...c, grants: [save('item:w1')] }, 'item:w1');
      expect(chips.map((x) => x.label).join(' ')).toContain('+2');
    });
    it('is never a counter’s maximum', () => {
      expect(maxFields('formula', 'magic')).toBeNull();
      expect(maxFields('formula', 'pb')).toEqual({ maxV: 'pb' });
      expect(migrate({ res: [{ id: 'r1', name: 'Zap', count: 0, maxV: 'magic', recharge: 'long' }] }).res[0].maxV).toBeUndefined();
    });
  });
  describe('dex in a formula', () => {
    it('accepts a dex formula as a maximum and keeps it on load', () => {
      expect(maxFields('formula', 'dex>=1')).toEqual({ maxV: 'dex>=1' });
      const c = migrate({ ...blankCharacter(), res: [{ id: 'r', name: 'R', count: 1, maxV: 'dex>=1', recharge: 'long' }] });
      expect(c.res[0].maxV).toBe('dex>=1');
    });
  });
});

describe('grants and links', () => {
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
      const back = removeRef(n, { kind: 'feature', id: 'fx' });
      for (const k of LISTS) expect(back[k]).toEqual(c[k]);
    });
    it('links an entry the character already has instead of adding a second (Resourceful)', () => {
      const c = custom(make({ res: [{ id: 'hi', name: 'Heroic Inspiration', count: 1, max: 1, recharge: 'long' }] }), 'rs');
      expect(findUnlinked(c, 'resource', 'heroic inspiration')).toBe('hi');
      const linked = addGrants(c, 'feature:rs', [{ spec: spec({ kind: 'resource', name: 'Heroic Inspiration', max: '1', recharge: 'long' }), link: 'hi' }]);
      expect(linked.res).toEqual([{ id: 'hi', name: 'Heroic Inspiration', count: 1, max: 1, recharge: 'long', from: 'feature:rs', srcKind: 'other', linked: true }]);
      expect(addGrants(c, 'feature:rs', [{ spec: spec({ kind: 'resource', name: 'Heroic Inspiration', max: '1', recharge: 'long' }) }]).res).toHaveLength(2);
      const sum = removalSummary(linked, { kind: 'feature', id: 'rs' });
      expect(sum.keep).toEqual(['Heroic Inspiration stays (it was on the sheet before Custom Gift)']);
      const back = removeRef(linked, { kind: 'feature', id: 'rs' });
      expect(back.res).toEqual([{ id: 'hi', name: 'Heroic Inspiration', count: 1, max: 1, recharge: 'long' }]);
      const made = addGrants(c, 'feature:rs', [{ spec: spec({ kind: 'resource', name: 'Heroic Inspiration', max: '1', recharge: 'long' }) }]);
      expect(removeRef(made, { kind: 'feature', id: 'rs' }).res).toEqual(c.res);
    });
    it('a linked spell keeps its resources and its Concentration when the source goes', () => {
      const c = custom(make({ conc: { id: 'sp4', name: 'Hunter’s Mark' }, res: [{ id: 'mine', name: 'Mine', count: 1, from: 'spell:sp4' }] }), 'fe');
      const n = addGrants(c, 'feature:fe', [{ spec: spec({ kind: 'spell', name: 'Hunter’s Mark', spell: 'spell/hunters-mark', always: true }), link: 'sp4' }]);
      expect(n.spells.find((x) => x.id === 'sp4')).toMatchObject({ from: 'feature:fe', linked: true });
      const r = removeRef(n, { kind: 'feature', id: 'fe' });
      expect(r.spells.find((x) => x.id === 'sp4')!.from).toBeUndefined();
      expect(r.res.map((x) => x.id)).toEqual(['mine']);
      expect(r.conc).toEqual({ id: 'sp4', name: 'Hunter’s Mark' });
    });
    it('a spell granted from a level gates the spell and its free cast, not the spell level', () => {
      const c = custom(withClass(make({ spells: [], res: [] }), { lvl: 2 }), 'el');
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
  describe('a catalog spell', () => {
    const sp: Omit<Spell, 'id'> = { name: 'Goodberry', lvl: 1, time: 'Action', range: 'Self', prep: true, cid: 'spell/goodberry' };
    const c = { ...blankCharacter(), feats: [{ id: 'f1', g: 'feat' as const, name: 'Magic Initiate (Druid)', desc: '' }] };
    it('an always-prepared spell keeps no prep flag', () => {
      const out = addGrants(c, 'feature:f1', [{ spec: { id: 'g2', kind: 'spell', name: 'Level 1 spell', spell: 'spell/goodberry', always: true }, spell: sp }]);
      expect(out.spells[0].always).toBe(true);
      expect('prep' in out.spells[0]).toBe(false);
    });
  });
  describe('a free cast finds its spell', () => {
    const cast = { id: 'g1', kind: 'resource' as const, name: 'Misty Step (free casts)', max: '1', recharge: 'long' as const, casts: 'spell/misty-step' };
    const misty = { id: 's1', cid: 'spell/misty-step', name: 'Misty Step', lvl: 2, time: 'Bonus Action', range: '30 ft', prep: true };
    it('links a sheet spell by its catalog id; a batch spell with the same id still wins', () => {
      expect(addGrants({ ...blankCharacter(), spells: [misty] }, 'feature:f1', [{ spec: cast }]).res[0].casts).toBe('s1');
      const out = addGrants({ ...blankCharacter(), spells: [misty] }, 'feature:f1', [{ spec: { id: 'g0', kind: 'spell', name: 'Misty Step', spell: 'spell/misty-step' } }, { spec: cast }]);
      expect(out.res[0].casts).toBe(out.spells[out.spells.length - 1].id);
      expect(out.res[0].casts).not.toBe('s1');
    });
  });
  describe('casting grants', () => {
    const feat = { id: 'f', g: 'class' as const, name: 'Spellcasting', desc: '' };
    const casting = { id: 'g', kind: 'casting' as const, name: 'Spellcasting', ab: 'int', list: 'wizard' };
    it('sets the casting ability from a casting grant', () => {
      const none = addGrants({ ...blankCharacter(), feats: [feat] }, 'feature:f', [{ spec: casting }]);
      expect(none.castAb).toBe('int');
      const wis = addGrants({ ...blankCharacter(), castAb: 'wis', feats: [feat] }, 'feature:f', [{ spec: casting }]);
      expect(wis.castAb).toBe('wis');
      expect(grantChips(none, 'feature:f')[0].label).toContain('set slots by hand');
    });
    it('says the casting ability stays when its grant is removed', () => {
      const none = addGrants({ ...blankCharacter(), feats: [feat] }, 'feature:f', [{ spec: casting }]);
      expect(removalSummary(none, { kind: 'feature', id: 'f' }).keep).toEqual(['Spellcasting ability stays Intelligence; change it in Edit details']);
    });
  });
  describe('links keep what they promise', () => {
    const feat = { id: 'f', g: 'class' as const, name: 'Domain', desc: '' };
    const bless: Spell = { id: 'b', name: 'Bless', lvl: 1, time: 'Action', range: '30 ft', prep: false };
    const base = (sp: Spell, p: Partial<Character> = {}): Character => ({ ...blankCharacter(), castAb: 'wis', usePrep: true, feats: [feat], spells: [sp], ...p });
    const link = (c: Character, spec: Partial<GrantSpec>) => addGrants(c, 'feature:f', [{ spec: { id: 'g', kind: 'spell', name: 'Bless', ...spec } as GrantSpec, link: c.spells[0].id }]);
    it('a linked always-prepared grant makes the spell always prepared (PHB p.235)', () => {
      const c = link(base(bless), { always: true });
      expect(c.spells[0].always).toBe(true);
      expect(spellUsable(c, c.spells[0])).toBe(true);
      const prepared = base({ ...bless, prep: true });
      expect(preparedCount(prepared)).toBe(1);
      expect(preparedCount(link(prepared, { always: true }))).toBe(0);
    });
    it('a linked grant sets the casting ability', () => {
      const light: Spell = { id: 'l', name: 'Light', lvl: 0, time: 'Action', range: 'Touch' };
      const c = link(base(light), { castAb: 'cha' });
      expect(castAbOf(c, c.spells[0])).toBe('cha');
    });
    it('removing the feature restores the spell', () => {
      const gone = (c: Character) => removeRef(c, { kind: 'feature', id: 'f' }).spells[0];
      const a = gone(link(base(bless), { always: true, castAb: 'cha' }));
      expect(a).toEqual(bless);
      const own = gone(link(base({ ...bless, castAb: 'int' }), { castAb: 'cha' }));
      expect(own.castAb).toBe('int');
      expect(own).not.toHaveProperty('linkCastAb');
      const already = gone(link(base({ ...bless, always: true }), { always: true }));
      expect(already.always).toBe(true);
    });
    it('the link fields survive save and reload', () => {
      const c = link(base(bless), { always: true, castAb: 'cha' });
      const back = migrate(JSON.parse(JSON.stringify(c)));
      expect(back.spells[0]).toMatchObject({ linkAlways: true, linkCastAb: 'none' });
      const bad = JSON.parse(JSON.stringify(c));
      bad.spells[0].linkCastAb = 'x';
      expect(migrate(bad).spells[0]).not.toHaveProperty('linkCastAb');
    });
    it('removing a linked chip drops only the link', () => {
      const ki = { id: 'k', name: 'Ki', count: 3, max: 5, recharge: 'long' as const };
      const c: Character = addGrants({ ...base(bless), res: [ki] }, 'feature:f', [{ spec: { id: 'g', kind: 'resource', name: 'Ki' } as GrantSpec, link: 'k' }]);
      const after = removeChip(c, { kind: 'res', id: 'k' });
      expect(after.res).toEqual([ki]);
      const sp = link(base(bless), { always: true });
      expect(removeChip(sp, { kind: 'spell', id: 'b' }).spells).toEqual([bless]);
    });
    it('removing an unlinked chip removes the entry', () => {
      const c: Character = { ...base(bless), senses: [{ id: 's', name: 'Darkvision', range: '60 ft', from: 'feature:f' }] };
      expect(removeChip(c, { kind: 'sense', id: 's' }).senses).toEqual([]);
    });
    it('words counted speeds by their own kind', () => {
      const c: Character = { ...base(bless), speedBase: 35, speeds: { climb: 30, swim: 0, fly: 60, burrow: 0 } };
      const keep = (g: Partial<Grant>) => removalSummary({ ...c, grants: [{ id: 'g', kind: 'speed', name: 'X', counted: true, from: 'feature:f', ...g } as Grant] }, { kind: 'feature', id: 'f' }).keep[0];
      expect(keep({ mode: 'walk', val: '5' })).toBe('Speed 35 ft still includes +5 ft from Domain; lower it by hand');
      expect(keep({ mode: 'climb', val: 'walk' })).toBe('Climb 30 ft still includes this grant');
      expect(keep({ mode: 'fly', val: '60' })).toBe('Fly 60 ft still includes this grant');
    });
  });
  describe('removal cascade', () => {
    // Ilyra: Guide (f20) → Magic Initiate (f9) → Guidance, Produce Flame, Goodberry and Goodberry's free cast.
    it('removes everything whose chain leads to the source, and ends Concentration on it', () => {
      const c = make({ conc: { id: 'sp2', name: 'Guidance' } });
      const r = removeRef(c, { kind: 'feature', id: 'f20' });
      expect(r.feats.some((f) => f.id === 'f20' || f.id === 'f9')).toBe(false);
      expect(r.spells.some((x) => ['sp2', 'sp3', 'sp8'].includes(x.id))).toBe(false);
      expect(r.res.some((x) => x.id === 'fc8')).toBe(false);
      expect(r.grants.some((g) => g.from === 'feature:f20')).toBe(false);
      expect(r.conc).toBeNull();
      expect(removalSummary(c, { kind: 'feature', id: 'f20' }).goes).toEqual(['Magic Initiate (Druid)', 'Stealth', 'Survival', 'Cartographer’s Tools', 'Guidance', 'Produce Flame', 'Goodberry', 'Goodberry']);
    });
    it('removing a spell keeps a feature’s resource that casts it, without casts', () => {
      const c = make({ res: [{ id: 'favored', name: 'Favored Enemy', count: 2, max: 3, recharge: 'long', from: 'feature:f2', casts: 'sp4' }] });
      expect(removeRef(c, { kind: 'spell', id: 'sp4' }).res).toEqual([{ id: 'favored', name: 'Favored Enemy', count: 2, max: 3, recharge: 'long', from: 'feature:f2' }]);
    });
    it('removing a resource clears an action grant that spends it, and empties its pills', () => {
      const c = make({ grants: [{ id: 'a', kind: 'action', name: 'Wild Shape', econ: 'bonus', res: 'favored', from: 'feature:f2' }] });
      const r = removeRef(c, { kind: 'res', id: 'favored' });
      expect(r.grants[0].res).toBeUndefined();
      expect(r.pills).toEqual(['hp', 'ac', '']);
      expect(migrate({ ...c, res: [] }).grants[0].res).toBeUndefined();
    });
    it('never hangs on a loop', () => {
      const c = make({ feats: [{ id: 'A', g: 'other', name: 'A', desc: '', from: 'feature:B' }, { id: 'B', g: 'other', name: 'B', desc: '', from: 'feature:A' },
        { id: 'S', g: 'other', name: 'S', desc: '', from: 'feature:S' }] });
      expect(removalChain(c, { kind: 'feature', id: 'A' })).toEqual([{ kind: 'feature', id: 'A' }, { kind: 'feature', id: 'B' }]);
      expect(removalChain(c, { kind: 'feature', id: 'S' })).toEqual([{ kind: 'feature', id: 'S' }]);
      expect(removeRef(c, { kind: 'feature', id: 'A' }).feats.map((f) => f.id)).toEqual(['S']);
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
      const r = removeRef(s, { kind: 'item', id: 'i9' });
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
});

describe('items', () => {
  describe('items inside a container never count as equipped', () => {
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
  describe('a quantity 0 item counts as gone', () => {
    const dex14 = { ...blankCharacter(), abil: { ...blankCharacter().abil, dex: 14 }, profs: [{ id: 'p', cat: 'armor' as const, name: 'Shields' }, { id: 'h', cat: 'armor' as const, name: 'Heavy armor' }] };
    it('adds no AC from armor or a Shield', () => {
      const inv: Item[] = [{ id: 'a', name: 'Plate Armor', qty: 0, eq: true, armor: 'heavy', acBase: 18 }, { id: 's', name: 'Shield', qty: 0, eq: true, armor: 'shield', acBase: 2 }];
      expect(armorClass({ ...dex14, inv }).total).toBe(12);
    });
    it('unloads ammunition that ran out', () => {
      const bow: Item = { id: 'b', name: 'Longbow', qty: 1, eq: true, cat: 'weapon', props: 'ammunition', ammo: '150/600;arrow', load: 'x' };
      const arrows: Item = { id: 'x', name: '+2 Arrows', qty: 3, eq: false, cat: 'ammo', cid: 'item/arrows' };
      expect(normalize({ ...dex14, inv: [bow, arrows] }).inv[0].load).toBe('x');
      expect(normalize({ ...dex14, inv: [bow, { ...arrows, qty: 0 }] }).inv[0].load).toBeUndefined();
    });
  });
  describe('a drunk potion', () => {
    const potion = (over = {}, grant = {}) => ({ ...blankCharacter(), speedBase: 30, effectsOn: ['item:p'],
      inv: [{ id: 'p', name: 'Potion of Climbing', qty: 0, eq: false, ...over }],
      grants: [{ id: 'g', kind: 'speed', name: 'Climb', mode: 'climb', val: 'walk', when: 'active', from: 'item:p', ...grant }] }) as unknown as Character;
    it('keeps a drunk potion’s switched-on effect at quantity 0', () => {
      expect(modeSpeed(potion(), 'climb').base).toBe(30);
      const off = { ...potion(), effectsOn: [] };
      expect(modeSpeed(off, 'climb').base).toBe(0);
      expect(inactiveReason(off, off.grants[0])).toBe('none left');
    });
    it('still turns off what a switch doesn’t cover at quantity 0', () => {
      const plain = potion({}, { when: undefined });
      expect(inactiveReason(plain, plain.grants[0])).toBe('none left');
      const worn = potion({}, { needEq: true });
      expect(inactiveReason(worn, worn.grants[0])).toBe('not equipped');
      const bagged = potion({ in: 'b' });
      expect(inactiveReason(bagged, bagged.grants[0])).toMatch(/^in /);
    });
    it('ends a drunk potion’s effect on a Long Rest', () => {
      expect(modeSpeed(longRest(potion()), 'climb').base).toBe(0);
    });
  });
});

// Aura of Protection: a 10-ft Emanation from level 6, inactive while Incapacitated; Aura Expansion makes it 30 ft at
// level 18; Aura of Courage works only while in it (PHB p.111). Holy Avenger: while you hold the drawn weapon, 10 ft,
// 30 ft with 17+ Paladin levels (SRD 5.2.1). Class levels are read as character level (a stated simplification).
describe('auras', () => {
  it('runs Protection from level 6 at 10 ft, 30 ft at 18', () => {
    expect(activeAuras(paladin(6))).toEqual([expect.objectContaining({ range: 10, why: null })]);
    expect(activeAuras(paladin(18))[0].range).toBe(30);
  });
  it('lists no aura below its level, Unconscious or not', () => {
    expect(activeAuras(paladin(5))).toEqual([]);
    const ko = paladin(5, { conds: { Unconscious: true } });
    expect(activeAuras(ko)).toEqual([]);
    expect(inactiveReason(ko, ko.grants[0])).toBe('from level 6');
  });
  it('stops a looping needAura without overflowing', () => {
    const c = paladin(6);
    const loop = { ...c, grants: c.grants.map((g) => (g.id === 'g2' ? { ...g, needAura: AOP } : g)) };
    expect(inactiveReason(loop, loop.grants[1])).toBe('aura not active');
  });
  it('labels the aura chip and points it at Conditions', () => {
    const chip = grantChips(paladin(6), 'feature:p').find((x) => x.ref.id === 'g2')!;
    expect(chip.label).toBe('10-ft aura');
    expect(chip.target).toEqual({ sec: 'sec-conditions' });
  });
  for (const cond of ['Incapacitated', 'Unconscious', 'Stunned']) {
    it('stops the aura and what rides on it while ' + cond, () => {
      const on = paladin(10), off = paladin(10, { conds: { [cond]: true } });
      expect(activeAuras(off)).toEqual([expect.objectContaining({ why: 'Incapacitated' })]);
      expect(saveMod(on, 'wis')).toBe(saveMod(off, 'wis') + 3);
      expect(mergedDefenses(on, 'imm').map((d) => d.name)).toContain('Frightened');
      expect(mergedDefenses(off, 'imm').map((d) => d.name)).not.toContain('Frightened');
    });
  }
  it('needs the Holy Avenger-like item in hand', () => {
    const c = (level: number, hands: string[]) => (withClass({ ...blankCharacter(), inv: [holyAvenger()], attuneIds: ['ha', '', ''], hands, grants: [haAura] }, { lvl: level }));
    expect(inactiveReason(c(16, []), haAura)).toBe('not in hand');
    expect(activeAuras(c(16, ['ha']))[0].range).toBe(10);
    expect(activeAuras(c(17, ['ha']))[0].range).toBe(30);
  });
  it('runs a spell aura only while concentrating', () => {
    const sg = { id: 'sg', name: 'Guardians', lvl: 3, time: 'Action', range: 'Self', c: true };
    const g: Grant = { id: 'gs', kind: 'aura', name: 'Guardians', range: '15', when: 'active', from: 'spell:sg' };
    const c = { ...blankCharacter(), spells: [sg], grants: [g] };
    expect(activeAuras(c)).toEqual([]);
    expect(activeAuras({ ...c, conc: { id: 'sg', name: 'Guardians' } })).toHaveLength(1);
  });
  it('keeps needAura and needHand through addGrants, checks them on load and in the catalog', () => {
    const c = { ...blankCharacter(), feats: [{ id: 'f', g: 'class' as const, name: 'F', desc: '' }], inv: [holyAvenger()] };
    const a = addGrants(c, 'feature:f', [{ spec: { id: 'x', kind: 'defense', name: 'Frightened', def: 'imm', target: 'Frightened', needAura: AOP } }]);
    expect(a.defenses[0].needAura).toBe(AOP);
    const b = addGrants(c, 'item:ha', [{ spec: { id: 'y', kind: 'aura', name: 'A', range: '10', needHand: true } }]);
    expect(b.grants[0].needHand).toBe(true);
    const m = migrate({ ...a, defenses: [{ ...a.defenses[0], needAura: 5, needHand: 'yes' }] });
    expect(m.defenses[0]).not.toHaveProperty('needAura');
    expect(m.defenses[0]).not.toHaveProperty('needHand');
    // Unlinked (source set to none), the entry no longer rides on the aura: nothing on the sheet shows that field.
    const { from: _f, ...hand } = a.defenses[0];
    expect(migrate({ ...a, defenses: [hand] }).defenses[0]).not.toHaveProperty('needAura');
    const feature = (g: object) => validateEntry({ id: 'feat/x', kind: 'feat', name: 'X', src: 'srd', desc: '', cat: 'general', grants: [{ id: 'a', kind: 'saveBonus', name: 'A', ab: 'all', val: '1', ...g }] });
    expect(feature({ needHand: true })).not.toEqual([]);
    expect(feature({ needAura: AOP })).toEqual([]);
  });
});

describe('an empty class list (the creator before level 1)', () => {
  it('reads level 1 and does not throw', () => {
    const c = { ...blankCharacter(), classes: [], levels: [] };
    expect(charLevel(c)).toBe(1);
    expect(profBonus(charLevel(c))).toBe(2);
    expect(() => maxHpOf(c)).not.toThrow();
    expect(() => normalize(c)).not.toThrow();
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
  it('maxHpRaw is not floored', () => {
    const c = withClass({ ...blankCharacter(), maxHp: -5, conBase: 0 }, { lvl: 1 });
    expect(maxHpRaw(c)).toBe(-5);
    expect(maxHpOf(c)).toBe(1);
  });
  it('maxHpOf is never below 1', () => {
    const c = withClass({ ...blankCharacter(), maxHp: 0, hp: 1, conBase: 0, abil: { ...blankCharacter().abil, con: 8 } }, { lvl: 1 });
    expect(maxHpOf(c)).toBe(1);
    expect(normalize(c).hp).toBe(1);
    const m = migrate({ ...blankCharacter(), maxHp: -5 });
    expect(m.maxHp).toBe(-5);
    expect(maxHpOf(m)).toBe(1);
  });
});

describe('class levels in formulas and gates', () => {
  const monk = (p: Partial<Character> = {}) => withClasses({ ...blankCharacter(), hp: 10, ...p }, [{ clsId: 'class/monk', lvl: 3 }, { clsId: 'class/fighter', lvl: 5 }]);
  const mf: Feature = { id: 'mf', g: 'class', name: 'Monk’s Focus', desc: '', cid: 'feature/monk/monks-focus' };
  it('reads a monk resource at the Monk level, and PB at the total level', () => {
    const c = monk({ feats: [mf], res: [{ id: 'ki', name: 'Focus', count: 0, maxV: 'lvl', recharge: 'long', regain: 'lvl', regainOn: 'short', from: 'feature:mf' }] });
    expect(maxOf(c, c.res[0])).toBe(3);
    expect(regainLabel(c, c.res[0])).toBe('all');
    expect(valueCtx(c, c.res[0]).pb).toBe(3);
    expect(valueCtx(c, c.res[0]).level).toBe(3);
    expect(valueCtx(c).level).toBe(8);
  });
  it('asks for rest dice at the class level', () => {
    const c = monk({ feats: [mf], res: [{ id: 'r', name: 'R', count: 0, max: 9, recharge: 'long', regain: '1:1d4,5:1d6', regainOn: 'short', from: 'feature:mf' }] });
    expect(restRolls(c, 'short')[0].dice).toBe('1d4');
  });
  it('reads a subclass feature’s resource at its class level', () => {
    const sub: Feature = { id: 'sf', g: 'sub', name: 'X', desc: '', cid: 'subclass/monk/x' };
    const c = monk({ feats: [sub], res: [{ id: 'r', name: 'R', count: 0, maxV: 'lvl', from: 'feature:sf' }] });
    expect(maxOf(c, c.res[0])).toBe(3);
  });
  it('gates minLvl on a class feature by the class level', () => {
    expect(inactiveReason(monk(), { ...mf, minLvl: 4 })).toBe('from level 4');
    expect(inactiveReason(monk(), { ...mf, minLvl: 3 })).toBeNull();
  });
  it('reads Sneak Attack at the Rogue level', () => {
    const c: Character = { ...withClasses(blankCharacter(), [{ clsId: 'class/rogue', lvl: 3 }, { clsId: 'class/fighter', lvl: 5 }]),
      feats: [{ id: 'sa', g: 'class', name: 'Sneak Attack', desc: '', cid: 'feature/rogue/sneak-attack' }],
      grants: [{ id: 'x', kind: 'xdmg', name: 'Sneak Attack', dice: '1:1d6,3:2d6,5:3d6', from: 'feature:sa' }] };
    expect(extraDamage(c)[0].dice).toBe('2d6');
  });
  it('multiplies Draconic Resilience by the Sorcerer level', () => {
    const base = withClasses({ ...blankCharacter(), maxHp: 20 }, [{ clsId: 'class/sorcerer', lvl: 3 }, { clsId: 'class/fighter', lvl: 2 }]);
    const c: Character = { ...base, feats: [{ id: 'dr', g: 'sub', name: 'Draconic Resilience', desc: '', cid: 'feature/sorcerer/draconic/draconic-resilience' }],
      grants: [{ id: 'h', kind: 'hpLvl', name: 'Draconic Resilience', val: '1', from: 'feature:dr' }] };
    expect(maxHpOf(c)).toBe(maxHpOf(base) + 3);
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

describe('the Pact Magic pool (PHB p.45, p.154)', () => {
  const sp = { id: 's', name: 'Hex', lvl: 1, time: 'Bonus Action', range: '90 feet' } as Spell;
  const w = (p: Partial<Character> = {}) => ({ ...blankCharacter(), hp: 8, pactMax: 2, pactLvl: 3, pactUsed: 0, spells: [sp], ...p });
  it('casts any spell with a pact slot at the pact level', () => {
    expect(castSpell(w(), sp, 3, 'pact')).toMatchObject({ pactUsed: 1 });
    expect(castSpell(w({ pactLvl: 2 }), sp, 3, 'pact')).toEqual({});
    expect(castSpell(w({ pactUsed: 2 }), sp, 3, 'pact')).toEqual({});
    expect(pactLeft(w({ pactUsed: 1 }))).toBe(1);
  });
  it('a Short Rest refills the pact pool and not the other slots; a Long Rest both', () => {
    const c = w({ pactUsed: 2, slotMax: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0], slotUsed: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect(shortRest(c)).toMatchObject({ pactUsed: 0, slotUsed: c.slotUsed });
    expect(longRest(c)).toMatchObject({ pactUsed: 0, slotUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
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

describe('class rows edited by hand', () => {
  const row = (id: string, lvl: number): ClassRow => ({ id, name: id, clsId: '', sub: '', subId: '', lvl, hd: 8, prep: 0 });
  it('rewrites the base records from the rows', () => {
    const c = setBaseRows(blankCharacter(), [row('A', 3), row('B', 2)]);
    expect(c.levels).toEqual([{ base: true, n: 3, cls: 'A', added: [], picks: {}, set: [] }, { base: true, n: 5, cls: 'B', added: [], picks: {}, set: [] }]);
    expect(hasHistory(c)).toBe(false);
    expect(hasHistory({ ...c, levels: [...c.levels, { n: 6, cls: 'B', added: [], picks: {}, set: [] }] })).toBe(true);
  });
  it('caps the total at 20 from the last row', () => {
    expect(setBaseRows(blankCharacter(), [row('A', 15), row('B', 7)]).classes.map((r) => r.lvl)).toEqual([15, 5]);
  });
  it('a removed row takes its grants and its spells’ ties with it', () => {
    const c0 = setBaseRows({ ...blankCharacter(),
      grants: [{ id: 'g', kind: 'prof', name: 'Stealth', cat: 'skill', target: 'stealth', from: 'class:B' }],
      spells: [{ id: 's', name: 'S', lvl: 1, time: 'Action', range: 'Self', cls: 'B' }] }, [row('A', 3), row('B', 2)]);
    const c = setBaseRows(c0, [row('A', 3)]);
    expect(c.grants).toEqual([]);
    expect(c.spells[0].cls).toBeUndefined();
    expect(c.levels).toEqual([{ base: true, n: 3, cls: 'A', added: [], picks: {}, set: [] }]);
  });
});
