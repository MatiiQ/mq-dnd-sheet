import { describe, expect, it } from 'vitest';
import { blankCharacter } from './defaults';
import {
  addCreature, assumeForm, copyName, damageCreature, dismiss, druidLevel, duplicateCreature, endForm, fixCreatures, formAc,
  healCreature, isMoon, linkedCreatures, recall, sendAway, showCompanions, summon, summonCopies
} from './creatures';
import { SEC_NAMES, sectionLinks } from './components/TopBar';
import { longRest, normalize, removalSummary, removeRef, setConc, toggleCondition } from './logic';
import { withClasses } from './test-fixtures';
import type { Character, Creature, Spell } from './types';

const pet = (p: Partial<Creature> = {}): Creature => ({
  id: 'k1', name: 'Wolf', kind: 'pet', on: true, ac: 13, hp: 11, maxHp: 11, temp: 0, speed: '40 ft', init: '+2', note: '', atk: [], conds: {}, ...p
});
const form = (p: Partial<Creature> = {}): Creature => pet({ id: 'f1', name: 'Bear', kind: 'form', on: false, ac: 11, hp: 0, maxHp: 34, formTemp: 'wildshape', ...p });
const spell = (p: Partial<Spell> = {}): Spell => ({ id: 'ss', name: 'Summon Beast', lvl: 2, time: 'Action', range: '90 feet', c: true, makes: 'pet', ...p });
const poly = spell({ id: 'pm', name: 'Polymorph', lvl: 4, makes: 'form' });
const ch = (p: Partial<Character> = {}): Character => ({ ...blankCharacter(), hp: 20, maxHp: 20, ...p });
const druid = (lvl: number, moon = false, extra: Parameters<typeof withClasses>[1] = []) =>
  withClasses(ch(), [{ name: 'Druid', clsId: 'class/druid', lvl, sub: moon ? 'Circle of the Moon' : '', subId: moon ? 'subclass/druid/circle-of-the-moon' : '' }, ...extra]);
const k = (c: Character, id = 'k1') => c.creatures!.find((x) => x.id === id)!;

describe('damage and healing', () => {
  it('takes Temporary HP first, and dismisses at 0 HP', () => {
    const c = ch({ creatures: [pet({ temp: 3 })] });
    expect(k(damageCreature(c, 'k1', 5))).toMatchObject({ temp: 0, hp: 9, on: true });
    expect(k(damageCreature(c, 'k1', 20))).toMatchObject({ hp: 0, on: false });
  });
  it('heals up to the maximum', () => {
    expect(k(healCreature(ch({ creatures: [pet({ hp: 4 })] }), 'k1', 50)).hp).toBe(11);
  });
  it('does nothing on a dismissed or away card', () => {
    const off = ch({ creatures: [pet({ on: false, hp: 5 })] });
    expect(damageCreature(off, 'k1', 3)).toBe(off);
    expect(healCreature(off, 'k1', 3)).toBe(off);
    const away = ch({ creatures: [pet({ pocket: true, away: true, hp: 5 })] });
    expect(damageCreature(away, 'k1', 3)).toBe(away);
  });
});

describe('summoning', () => {
  it('refills HP, clears Temporary HP and conditions, sets the level', () => {
    const c = ch({ creatures: [pet({ on: false, hp: 0, temp: 2, conds: { Prone: true }, away: true, pocket: true })] });
    expect(k(summon(c, ['k1'], 3))).toMatchObject({ on: true, hp: 11, temp: 0, conds: {}, lvl: 3, away: false });
  });
  it('summonCopies adds summoned copies with new ids and numbered names', () => {
    const c = summonCopies(ch({ creatures: [pet({ name: 'Skeleton', on: false, hp: 2, atk: [{ id: 'a', name: 'Bite', hit: '+4', dmg: '1d6' }] })] }), 'k1', 2, 4);
    expect(c.creatures!.map((x) => x.name)).toEqual(['Skeleton', 'Skeleton 2', 'Skeleton 3']);
    const [, a, b] = c.creatures!;
    expect([a.on, a.hp, a.lvl, b.on]).toEqual([true, 11, 4, true]);
    expect(new Set(c.creatures!.map((x) => x.id)).size).toBe(3);
    expect(a.atk[0].id).not.toBe('a');
  });
  it('duplicate gives new ids, a numbered name, and is added off', () => {
    const c = duplicateCreature(ch({ creatures: [pet({ atk: [{ id: 'a', name: 'Bite', hit: '+4', dmg: '1d6' }] })] }), 'k1');
    const copy = c.creatures![1];
    expect(copy).toMatchObject({ name: 'Wolf 2', on: false });
    expect(copy.id).not.toBe('k1');
    expect(copy.atk[0].id).not.toBe('a');
  });
  it('copyName numbers from 2, renumbers a numbered name and skips names taken (R48)', () => {
    const c = ch({ creatures: [pet({ name: 'Skeleton' }), pet({ id: 'k2', name: 'Skeleton 2' }), pet({ id: 'k3', name: 'Zombie' })] });
    expect(copyName(c, 'Skeleton')).toBe('Skeleton 3');
    expect(copyName(c, 'Skeleton 2')).toBe('Skeleton 3');
    expect(copyName(c, 'Zombie')).toBe('Zombie 2');
  });
  it('linkedCreatures lists the pets of a link in order', () => {
    const c = ch({ spells: [spell()], creatures: [pet({ from: 'spell:ss' }), pet({ id: 'k2' }), pet({ id: 'k3', from: 'spell:ss' })] });
    expect(linkedCreatures(c, 'spell:ss').map((x) => x.id)).toEqual(['k1', 'k3']);
  });
});

describe('adding', () => {
  it('adds a form off, and a pet as the draft says', () => {
    const c = addCreature(addCreature(ch(), { ...form(), on: true }), { ...pet(), on: false });
    expect(c.creatures!.map((x) => x.on)).toEqual([false, false]);
    expect(addCreature(ch(), pet()).creatures![0].on).toBe(true);
  });
  it('writes the source’s name on a linked card (R22)', () => {
    const c = addCreature(ch({ spells: [spell()], conc: { id: 'ss', name: 'Summon Beast' } }), pet({ from: 'spell:ss', ends: 'conc' }));
    expect(c.creatures![0]).toMatchObject({ srcName: 'Summon Beast', srcKind: 'spell', on: true });
  });
  it('a pet with maxHp ≥ 1 stays on through normalize() (R47)', () => {
    const c = normalize(summon(ch({ creatures: [pet({ on: false, hp: 0 })] }), ['k1']));
    expect(k(c).on).toBe(true);
  });
});

describe('pocket dimension', () => {
  const c = ch({ creatures: [pet({ pocket: true, hp: 5, temp: 1, conds: { Prone: true } })] });
  it('sendAway keeps HP and conditions; recall brings it back', () => {
    const away = sendAway(c, 'k1');
    expect(k(away)).toMatchObject({ away: true, hp: 5, temp: 1, conds: { Prone: true } });
    expect(k(recall(away, 'k1')).away).toBe(false);
  });
  it('clears away on dismiss, at 0 HP and on a card without pocket', () => {
    const away = sendAway(c, 'k1');
    expect(k(dismiss(away, 'k1')).away).toBeFalsy();
    expect(k(fixCreatures({ ...away, creatures: [{ ...k(away), hp: 0 }] })).away).toBeFalsy();
    expect(k(fixCreatures(ch({ creatures: [pet({ away: true })] }))).away).toBeFalsy();
    expect(sendAway(ch({ creatures: [pet()] }), 'k1').creatures![0].away).toBeFalsy();
  });
});

describe('fixCreatures (normalize)', () => {
  it('returns the same object when nothing changes', () => {
    const c = ch({ creatures: [pet()] });
    expect(fixCreatures(c)).toBe(c);
    const none = ch();
    expect(fixCreatures(none)).toBe(none);
  });
  it('drops an empty list and clamps the numbers', () => {
    expect('creatures' in fixCreatures(ch({ creatures: [] }))).toBe(false);
    expect(k(fixCreatures(ch({ creatures: [pet({ hp: 50 })] }))).hp).toBe(11);
  });
  it('dismisses a pet when Concentration on its spell ends', () => {
    const c = ch({ spells: [spell()], conc: { id: 'ss', name: 'Summon Beast' }, creatures: [pet({ from: 'spell:ss', ends: 'conc' })] });
    expect(k(normalize(c)).on).toBe(true);
    expect(k(normalize({ ...c, ...setConc(null) })).on).toBe(false);
  });
  it('keeps one form on, and ends it when Incapacitated or dead (R4)', () => {
    const two = ch({ creatures: [form({ on: true }), form({ id: 'f2', on: true })] });
    expect(fixCreatures(two).creatures!.map((x) => x.on)).toEqual([true, false]);
    const on = ch({ creatures: [form({ on: true })] });
    expect(k(normalize(toggleCondition(on, 'Unconscious')), 'f1').on).toBe(false);
    expect(k(normalize({ ...on, hp: 0, df: 3 }), 'f1').on).toBe(false);
  });
  it('a dangling from is dropped and the card switched off, keeping srcName and srcKind (R22, R39)', () => {
    const c = fixCreatures(ch({ creatures: [pet({ from: 'spell:gone', srcKind: 'spell', srcName: 'Summon Beast' })] }));
    expect(k(c)).toMatchObject({ on: false, srcKind: 'spell', srcName: 'Summon Beast' });
    expect(k(c).from).toBeUndefined();
  });
});

describe('forms', () => {
  it('assumeForm gives the Druid level as Temporary HP, × 3 for a Moon druid read from the subclass', () => {
    const f = { creatures: [form()] };
    expect(assumeForm({ ...druid(5), ...f }, 'f1').temp).toBe(5);
    expect(assumeForm({ ...druid(5, true), ...f }, 'f1').temp).toBe(15);
    expect(k(assumeForm({ ...druid(5), ...f }, 'f1'), 'f1').on).toBe(true);
  });
  it('uses the Druid class level in a multiclass, and gives 0 with no Druid row (R30)', () => {
    expect(assumeForm({ ...druid(3, false, [{ name: 'Fighter', clsId: 'class/fighter', lvl: 4 }]), creatures: [form()] }, 'f1').temp).toBe(3);
    expect(druidLevel(withClasses(ch(), [{ name: 'Fighter', clsId: 'class/fighter', lvl: 4 }]))).toBe(0);
    expect(assumeForm({ ...withClasses(ch(), [{ name: 'Fighter', lvl: 4 }]), creatures: [form()] }, 'f1').temp).toBe(0);
  });
  it('a hand-typed Moon row without subId isn’t Moon (R30)', () => {
    expect(isMoon(withClasses(ch(), [{ name: 'Druid', clsId: 'class/druid', sub: 'Circle of the Moon', lvl: 3 }]))).toBe(false);
  });
  it('keeps the higher Temporary HP (PHB p.29)', () => {
    expect(assumeForm({ ...druid(5), temp: 8, creatures: [form()] }, 'f1').temp).toBe(8);
  });
  it('an hp form gives its maxHp, only while its spell is the Concentration (R2)', () => {
    const c = ch({ spells: [poly], creatures: [form({ formTemp: 'hp', maxHp: 34, ends: 'conc', from: 'spell:pm' })] });
    expect(assumeForm(c, 'f1')).toBe(c);
    const cast = { ...c, conc: { id: 'pm', name: 'Polymorph' } };
    expect(assumeForm(cast, 'f1').temp).toBe(34);
  });
  it('switches between two Shapechange forms while Shapechange is the Concentration (R24)', () => {
    const sc = spell({ id: 'sc', name: 'Shapechange', lvl: 9, makes: 'form' });
    const f = (id: string, maxHp: number) => form({ id, formTemp: 'hp', maxHp, ends: 'conc', from: 'spell:sc' });
    const c = ch({ spells: [sc], conc: { id: 'sc', name: 'Shapechange' }, creatures: [f('a', 30), f('b', 50)] });
    const one = normalize(assumeForm(c, 'a'));
    const two = normalize(assumeForm(one, 'b'));
    expect(two.creatures!.map((x) => x.on)).toEqual([false, true]);
    expect(two.temp).toBe(50);
  });
  it('is refused while Incapacitated', () => {
    const c = { ...druid(5), conds: { Stunned: true }, creatures: [form()] };
    expect(assumeForm(c, 'f1')).toBe(c);
  });
  it('one form on: assuming one ends the other; endForm leaves Temporary HP', () => {
    const c = assumeForm({ ...druid(4), creatures: [form({ on: true }), form({ id: 'f2' })] }, 'f2');
    expect(c.creatures!.map((x) => x.on)).toEqual([false, true]);
    const ended = endForm(c, 'f2');
    expect(k(ended, 'f2').on).toBe(false);
    expect(ended.temp).toBe(c.temp);
  });
  it('formAc: 13 + WIS for a Moon druid when higher (PHB p.86)', () => {
    const moon = { ...druid(3, true), abil: { ...blankCharacter().abil, wis: 16 } };
    expect(formAc(moon, form({ ac: 11 }))).toBe(16);
    expect(formAc(moon, form({ ac: 17 }))).toBe(17);
    expect(formAc({ ...druid(3), abil: moon.abil }, form({ ac: 11 }))).toBe(11);
    expect(formAc(moon, form({ ac: 11, formTemp: 'hp' }))).toBe(11);
  });
  describe('Polymorph at 0 Temporary HP (PHB p.306, R3)', () => {
    const base = ch({ spells: [poly, spell()], temp: 0, conc: { id: 'pm', name: 'Polymorph' }, effectsOn: [], castFx: { 'spell:pm': { lvl: 4 } },
      creatures: [form({ formTemp: 'hp', ends: 'conc', from: 'spell:pm', on: true })] });
    it('ends the form and Concentration on Polymorph, with a notice, and clears its castFx', () => {
      const c = normalize(base);
      expect(k(c, 'f1').on).toBe(false);
      expect(c.conc).toBeNull();
      expect(c.concCheck).toBe('Concentration on Polymorph ended (no Temporary HP left).');
      expect(c.castFx).toBeUndefined();
    });
    it('leaves another spell’s Concentration alone', () => {
      const c = normalize({ ...base, conc: { id: 'ss', name: 'Summon Beast' }, creatures: [form({ formTemp: 'hp', on: true })] });
      expect(c.conc).toEqual({ id: 'ss', name: 'Summon Beast' });
      expect(k(c, 'f1').on).toBe(false);
    });
  });
});

describe('Long Rest', () => {
  it('ends ends: long pets and every form, and names them', () => {
    const c = longRest({ ...druid(4), creatures: [pet({ ends: 'long', name: 'Owl' }), pet({ id: 'k2', name: 'Steed' }), form({ on: true })] });
    expect(c.creatures!.map((x) => x.on)).toEqual([false, true, false]);
    expect(c.restMsg!.body).toContain('Owl');
    expect(c.restMsg!.body).toContain('Bear');
    expect(c.restMsg!.body).not.toContain('Steed');
  });
  it('names the Concentration pets the rest ends (R34)', () => {
    const c = longRest(ch({ spells: [spell()], conc: { id: 'ss', name: 'Summon Beast' }, creatures: [pet({ name: 'Bestial Spirit', from: 'spell:ss', ends: 'conc' })] }));
    expect(c.restMsg!.body).toContain('Bestial Spirit');
    expect(k(normalize(c)).on).toBe(false);
  });
});

describe('removal', () => {
  it('removeRef unlinks and switches off a card, keeping srcName; never deletes it (R31, R15)', () => {
    const c = ch({ spells: [spell()], creatures: [pet({ from: 'spell:ss', srcKind: 'spell', srcName: 'Summon Beast' })] });
    const out = removeRef(c, { kind: 'spell', id: 'ss' });
    expect(out.creatures).toHaveLength(1);
    expect(k(out)).toMatchObject({ on: false, srcName: 'Summon Beast', srcKind: 'spell' });
    expect(k(out).from).toBeUndefined();
  });
  it('unlinks cards of a spell the chain removes (R39)', () => {
    const c = ch({
      feats: [{ id: 'pc', g: 'class', name: 'Pact of the Chain', desc: '' }],
      spells: [spell({ id: 'ff', name: 'Find Familiar', c: false, from: 'feature:pc' })],
      creatures: [pet({ from: 'spell:ff', srcKind: 'spell', srcName: 'Find Familiar' })]
    });
    const out = removeRef(c, { kind: 'feature', id: 'pc' });
    expect(out.spells).toEqual([]);
    expect(k(out)).toMatchObject({ on: false, srcName: 'Find Familiar' });
    expect(k(out).from).toBeUndefined();
  });
  it('removalSummary lists linked cards in keep (R32)', () => {
    const c = ch({ spells: [spell()], creatures: [pet({ from: 'spell:ss', srcName: 'Summon Beast' })] });
    expect(removalSummary(c, { kind: 'spell', id: 'ss' }).keep).toContain('Wolf (companion, unlinked)');
  });
});

describe('visibility (showCompanions, sectionLinks)', () => {
  it('is hidden with no creature and no source; shown by a creature, a makes source, edit mode, or the open editor (R45)', () => {
    expect(showCompanions(ch(), false, null)).toBe(false);
    expect(showCompanions(ch({ creatures: [pet()] }), false, null)).toBe(true);
    expect(showCompanions(ch({ spells: [spell()] }), false, null)).toBe(true);
    expect(showCompanions(ch({ feats: [{ id: 'w', g: 'class', name: 'Wild Shape', desc: '', makes: 'form' }] }), false, null)).toBe(true);
    expect(showCompanions(ch(), true, null)).toBe(true);
    expect(showCompanions(ch(), false, { kind: 'creature', id: null })).toBe(true);
    expect(showCompanions(ch(), false, { kind: 'spell', id: null })).toBe(false);
  });
  it('sectionLinks drops Companions unless shown; the menu name stays (R40, R46)', () => {
    const ids = (c: Character, edit = false) => sectionLinks(c, edit, null).map(([id]) => id);
    expect(ids(ch())).not.toContain('sec-companions');
    expect(ids(ch({ creatures: [pet()] }))).toEqual(['sec-hp', 'sec-abilities', 'sec-senses', 'sec-defenses', 'sec-conditions', 'sec-resources', 'sec-companions']);
    expect(ids(ch(), true)).toContain('sec-companions');
    expect(SEC_NAMES['sec-companions']).toBe('Companions');
  });
});
