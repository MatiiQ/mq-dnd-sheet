// Spot checks of the class grants against reference/classes/*.md (PHB 2024). PHB-only subclasses are checked in
// code/scripts/local/classes-phb.test.ts (gitignored).
import { describe, expect, it } from 'vitest';
import srdEntries from '../data/srd/index';
import type { ChoiceSpec, FeatureEntry, GrantSpec, Spec } from './schema';

const byId = new Map(srdEntries.map((e) => [e.id, e]));
const specs = (id: string): Spec[] => { const e = byId.get(id); if (!e) throw new Error(`${id} missing`); return 'grants' in e && e.grants ? e.grants : []; };
const grants = (id: string) => specs(id).filter((s): s is GrantSpec => s.kind !== 'choice');
const choices = (id: string) => specs(id).filter((s): s is ChoiceSpec => s.kind === 'choice');
const all = (id: string) => specs(id).flatMap((s) => (s.kind === 'choice' ? s.options ?? [] : [s]));
// Every level at which the subclass gains features has at least one grant or choice, apart from the levels listed.
const subLevels = (cls: string, sub: string, textOnly: number[] = []) => {
  const feats = srdEntries.filter((e): e is FeatureEntry => e.kind === 'feature' && e.cls === cls && e.sub === sub);
  const levels = [...new Set(feats.map((f) => f.lvl))];
  return levels.filter((l) => !textOnly.includes(l) && !feats.some((f) => f.lvl === l && specs(f.id).length));
};
const F = (cls: string, f: string) => `feature/${cls}/${f}`;

describe('Barbarian (PHB p.51–54)', () => {
  it('Rage: uses by table, one back on a Short Rest, resistances while active', () => {
    const [res, act] = grants(F('barbarian', 'rage'));
    expect(res).toMatchObject({ kind: 'resource', max: '1:2,3:3,6:4,12:5,17:6', recharge: 'long', regain: '1', regainOn: 'short' });
    expect(act).toMatchObject({ kind: 'action', econ: 'bonus', res: res.id, dice: '1:2,9:3,16:4' });
    expect(grants(F('barbarian', 'rage')).filter((g) => g.def === 'res' && g.when === 'active').map((g) => g.target)).toEqual(['Bludgeoning', 'Piercing', 'Slashing']);
  });
  it('Brutal Strike die, Primal Knowledge skill choice, Primal Champion to 25', () => {
    expect(grants(F('barbarian', 'brutal-strike'))).toMatchObject([{ kind: 'xdmg', dice: '9:1d10,17:2d10' }]);
    expect(choices(F('barbarian', 'primal-knowledge'))[0]).toMatchObject({ pick: 1, pool: 'skill:animal|athletics|intimidation|nature|perception|survival' });
    expect(grants(F('barbarian', 'primal-champion'))).toMatchObject([{ kind: 'abil', ab: 'str', val: '4', cap: 25 }, { kind: 'abil', ab: 'con', val: '4', cap: 25 }]);
  });
  it('Path of the Berserker has a grant at every level', () => expect(subLevels('barbarian', 'path-of-the-berserker')).toEqual([]));
});

describe('Bard (PHB p.59–67)', () => {
  it('Bardic Inspiration: CHA uses, die by level', () => {
    const [res, act] = grants(F('bard', 'bardic-inspiration'));
    expect(res).toMatchObject({ kind: 'resource', max: 'cha>=1', recharge: 'long' });
    expect(act).toMatchObject({ kind: 'action', econ: 'bonus', res: res.id, dice: '1:1d6,5:1d8,10:1d10,15:1d12' });
  });
  it('Expertise: two skills at 2 and again at 9; Jack of All Trades', () => {
    expect(byId.get(F('bard', 'expertise'))).toMatchObject({ lvl: 2, again: '9' });
    expect(choices(F('bard', 'expertise'))[0]).toMatchObject({ pick: 2, pool: 'skill:proficient' });
    expect(grants(F('bard', 'jack-of-all-trades'))).toMatchObject([{ kind: 'prof', cat: 'half' }]);
  });
  it('College of Lore has a grant at every level', () => expect(subLevels('bard', 'college-of-lore')).toEqual([]));
});

describe('Cleric (PHB p.69–74)', () => {
  it('Channel Divinity: uses by table, one back on a Short Rest; Divine Spark die', () => {
    const [res] = grants(F('cleric', 'channel-divinity'));
    expect(res).toMatchObject({ kind: 'resource', max: '2:2,6:3,18:4', recharge: 'long', regain: '1', regainOn: 'short' });
    expect(grants(F('cleric', 'channel-divinity'))).toContainEqual(expect.objectContaining({ name: 'Divine Spark', dice: '1:1d8,7:2d8,13:3d8,18:4d8', res: res.id }));
  });
  it('Divine Order: Protector or Thaumaturge; Blessed Strikes: Divine Strike or Potent Spellcasting', () => {
    expect([...new Set(choices(F('cleric', 'divine-order'))[0].options!.map((o) => o.opt))]).toEqual(['Protector', 'Thaumaturge']);
    expect(all(F('cleric', 'blessed-strikes'))).toMatchObject([{ kind: 'xdmg', dice: '7:1d8,14:2d8', perTurn: true }, { kind: 'dmgBonus', val: 'wis', cantrip: true }]);
  });
  it('Life Domain: domain spells by Cleric level', () => {
    expect(grants(F('cleric', 'life-domain/life-domain-spells')).map((g) => [g.spell, g.lvl ?? 3])).toEqual([
      ['spell/aid', 3], ['spell/bless', 3], ['spell/cure-wounds', 3], ['spell/lesser-restoration', 3], ['spell/mass-healing-word', 5], ['spell/revivify', 5],
      ['spell/aura-of-life', 7], ['spell/death-ward', 7], ['spell/greater-restoration', 9], ['spell/mass-cure-wounds', 9]]);
  });
  // Blessed Healer (6) and Supreme Healing (17) change healing rolls, which no grant kind describes.
  it('Life Domain has a grant at every other level', () => expect(subLevels('cleric', 'life-domain', [6, 17])).toEqual([]));
});

describe('Druid 13–20 and Circle of the Land (PHB p.81–86)', () => {
  it('Primal Strike grows to 2d8 at 15; Archdruid', () => {
    expect(all(F('druid', 'elemental-fury')).find((g) => g.kind === 'xdmg')).toMatchObject({ dice: '7:1d8,15:2d8' });
    expect(grants(F('druid', 'archdruid')).length).toBeGreaterThan(0);
  });
  it('Circle of the Land: a land type picks its spells; Land’s Aid die', () => {
    const opts = choices(F('druid', 'circle-of-the-land/circle-of-the-land-spells'))[0].options!;
    expect([...new Set(opts.map((o) => o.opt))]).toEqual(['Arid', 'Polar', 'Temperate', 'Tropical']);
    expect(opts.filter((o) => o.opt === 'Arid').map((o) => [o.spell, o.lvl ?? 3])).toEqual([['spell/blur', 3], ['spell/burning-hands', 3], ['spell/fire-bolt', 3],
      ['spell/fireball', 5], ['spell/blight', 7], ['spell/wall-of-stone', 9]]);
    expect(grants(F('druid', 'circle-of-the-land/lands-aid'))).toMatchObject([{ kind: 'action', econ: 'action', dice: '3:2d6,10:3d6,14:4d6' }]);
  });
  it('Circle of the Land has a grant at every level', () => expect(subLevels('druid', 'circle-of-the-land')).toEqual([]));
});

describe('Fighter (PHB p.91–96)', () => {
  it('Second Wind: uses by table, one back on a Short Rest, 1d10 + level', () => {
    const [res, act] = grants(F('fighter', 'second-wind'));
    expect(res).toMatchObject({ max: '1:2,4:3,10:4', recharge: 'long', regain: '1', regainOn: 'short' });
    expect(act).toMatchObject({ econ: 'bonus', res: res.id, dice: '1d10+lvl' });
  });
  it('Action Surge, Indomitable, Weapon Mastery and attacks per Attack action', () => {
    expect(grants(F('fighter', 'action-surge'))[0]).toMatchObject({ max: '2:1,17:2', recharge: 'short' });
    expect(grants(F('fighter', 'indomitable'))[0]).toMatchObject({ max: '9:1,13:2,17:3', recharge: 'long' });
    expect(grants(F('fighter', 'weapon-mastery'))[0]).toMatchObject({ cat: 'mastery', val: '1:3,4:4,10:5,16:6' });
    expect(['extra-attack', 'two-extra-attacks', 'three-extra-attacks'].map((f) => grants(F('fighter', f))[0].val)).toEqual(['2', '3', '4']);
    expect(choices(F('fighter', 'fighting-style'))[0].pool).toBe('feat:cat=style');
  });
  it('Champion: critical range 19, then 18; a grant at every level', () => {
    expect(grants(F('fighter', 'champion/improved-critical'))).toMatchObject([{ kind: 'crit', val: '19' }]);
    expect(grants(F('fighter', 'champion/superior-critical'))).toMatchObject([{ kind: 'crit', val: '18' }]);
    expect(subLevels('fighter', 'champion')).toEqual([]);
  });
});

describe('Monk (PHB p.101–107)', () => {
  it('Martial Arts die, Focus Points, Unarmored Movement and Defense', () => {
    expect(grants(F('monk', 'martial-arts'))).toContainEqual(expect.objectContaining({ kind: 'unarmed', die: '1:1d6,5:1d8,11:1d10,17:1d12', abs: 'str,dex', when: 'noArmorNoShield' }));
    expect(grants(F('monk', 'monks-focus'))[0]).toMatchObject({ kind: 'resource', max: 'lvl', recharge: 'short' });
    expect(grants(F('monk', 'unarmored-movement'))).toMatchObject([{ kind: 'speed', mode: 'walk', val: '2:10,6:15,10:20,14:25,18:30', when: 'noArmorNoShield' }]);
    expect(grants(F('monk', 'unarmored-defense'))).toMatchObject([{ kind: 'ac', acMode: 'unarmored', ab: 'wis', shieldOk: false, when: 'noArmorNoShield' }]);
  });
  it('Disciplined Survivor: every save; Body and Mind to 25', () => {
    expect(grants(F('monk', 'disciplined-survivor')).filter((g) => g.cat === 'save').map((g) => g.target)).toEqual(['str', 'dex', 'con', 'int', 'wis', 'cha']);
    expect(grants(F('monk', 'body-and-mind'))).toMatchObject([{ ab: 'dex', val: '4', cap: 25 }, { ab: 'wis', val: '4', cap: 25 }]);
  });
  it('Warrior of the Open Hand has a grant at every level', () => expect(subLevels('monk', 'warrior-of-the-open-hand')).toEqual([]));
});
