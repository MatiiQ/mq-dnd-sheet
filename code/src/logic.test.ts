import { describe, expect, it } from 'vitest';
import { newId } from './logic';
import { blankCharacter, druidSample, sampleCharacter } from './defaults';
import { ABILITIES, charLevel, hasHistory, setBaseRows, valueCtx, profBonus, regainLabel, speedOf, grantChips, restRolls, maxFields, maxOf, normalize, resourceGroups, mergedDefenses, mergedSenses, removeRef, abilityParts, carryUpOf, maxHpOf, modeSpeed, sizeOf, walkSpeed, effScore, hasProf, profList, saveProficient, skillLevel, carriedWeight, carryCapacity, fmt, hitDieRoll, hpColor, hpRingStops, initiative, initiativeAdv, parseWeight, passiveScore, passiveParts, passiveNotes, pillView, resPill, setPill, preparedCount, saveMod, skillMod, slotsLeft, num, speedNow, spellAttack, spellAttackParts, spellDcParts, spellSaveDC, spellUsable } from './logic';
import { migrate } from './migrate';
import { extraDamage } from './actions';
import { inactiveReason } from './links';
import type { Character, ClassRow, Feature, Grant, Item } from './types';
import { withClass, withClasses, make, sp, it_, gr } from './test-fixtures';

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

describe('doubled Speed', () => {
  const w2 = (p: Partial<Grant> = {}) => gr({ kind: 'speed', mode: 'walk', val: 'walk2', ...p });
  it('doubles the walking Speed after the flat walk grants (Haste, PHB p.284)', () => {
    expect(walkSpeed(make({ speedBase: 30, grants: [gr({ id: 'a', kind: 'speed', mode: 'walk', val: '10' }), w2()] }))).toBe(80);
  });
  it('doubles once for several doubling grants', () => {
    expect(walkSpeed(make({ speedBase: 30, grants: [w2({ id: 'a' }), w2({ id: 'b' })] }))).toBe(60);
  });
  it('doubles before the Exhaustion cut', () => {
    expect(speedNow(make({ speedBase: 30, exh: 1, grants: [w2()] }))).toBe(55);
  });
  it('ignores a doubling grant whose source is off', () => {
    expect(walkSpeed(make({ speedBase: 30, effectsOn: [], grants: [w2({ when: 'active' })] }))).toBe(30);
  });
  it('is 0 while Grappled', () => {
    expect(speedNow(make({ speedBase: 30, conds: { Grappled: true }, grants: [w2()] }))).toBe(0);
  });
  it('leaves other speeds on the undoubled walk', () => {
    const c = make({ speedBase: 30, grants: [w2(), gr({ id: 'f', kind: 'speed', mode: 'fly', val: 'walk' }), gr({ id: 's', kind: 'speed', mode: 'swim', val: 'walk2' })] });
    expect(modeSpeed(c, 'fly').base).toBe(30);
    expect(modeSpeed(c, 'swim').base).toBe(60);
  });
  it('reads the doubling in its chip', () => {
    const c = make({ speedBase: 30, grants: [w2({ from: 'feature:f10' })] });
    expect(grantChips(c, 'feature:f10').map((x) => x.label)).toContain('Speed × 2');
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

describe('an empty class list (the creator before level 1)', () => {
  it('reads level 1 and does not throw', () => {
    const c = { ...blankCharacter(), classes: [], levels: [] };
    expect(charLevel(c)).toBe(1);
    expect(profBonus(charLevel(c))).toBe(2);
    expect(() => maxHpOf(c)).not.toThrow();
    expect(() => normalize(c)).not.toThrow();
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

describe('newId', () => {
  it('newId is unique within one millisecond', () => {
    expect(new Set(Array.from({ length: 1000 }, newId)).size).toBe(1000);
  });
});

describe('Advantage on Initiative', () => {
  const adv = (p: Partial<Grant> = {}) => gr({ kind: 'checkAdv', target: 'init', adv: 'adv', ...p });
  it('reads a checkAdv grant on Initiative', () => {
    expect(initiativeAdv(make({ grants: [adv()] }))).toMatchObject({ adv: true, dis: false });
  });
  it('adds Poisoned as Disadvantage (PHB p.372)', () => {
    expect(initiativeAdv(make({ grants: [adv()], conds: { Poisoned: true } }))).toMatchObject({ adv: true, dis: true });
  });
  it('gives Invisible Advantage (PHB p.370)', () => {
    const r = initiativeAdv(make({ grants: [], conds: { Invisible: true } }));
    expect(r).toMatchObject({ adv: true, dis: false });
    expect(r.by).toContain('Invisible');
  });
  it('gives Incapacitated and the conditions that include it Disadvantage (PHB p.369)', () => {
    for (const n of ['Incapacitated', 'Stunned']) {
      const r = initiativeAdv(make({ grants: [], conds: { [n]: true } }));
      expect(r).toMatchObject({ adv: false, dis: true });
      expect(r.by).toContain(n);
    }
    expect(initiativeAdv(make({ grants: [], conds: { Invisible: true, Incapacitated: true } }))).toMatchObject({ adv: true, dis: true });
  });
  it('reads Dexterity and all-check grants, not other skills', () => {
    expect(initiativeAdv(make({ grants: [adv({ target: 'dex' })] })).adv).toBe(true);
    expect(initiativeAdv(make({ grants: [adv({ target: 'stealth' })] }))).toMatchObject({ adv: false, dis: false });
  });
  it('skips an unequipped item’s grant', () => {
    const shield: Item = { id: 'sh', name: 'Sentinel Shield', qty: 1, eq: false };
    expect(initiativeAdv(make({ inv: [shield], grants: [adv({ from: 'item:sh', needEq: true })] })).adv).toBe(false);
  });
  it('names Initiative in the chip', () => {
    expect(grantChips(make({ grants: [adv()] }), 'feature:f10').map((x) => x.label)).toContain('Advantage on Initiative');
  });
});
