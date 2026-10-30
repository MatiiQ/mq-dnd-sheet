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
