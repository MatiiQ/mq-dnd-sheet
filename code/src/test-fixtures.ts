import { blankCharacter } from './defaults';
import type { Character, ClassRow, Grant, Item } from './types';

// One class row (the character's first, changed by `row`) and a matching base record: how a test sets the level.
export function withClass(c: Character, row: Partial<ClassRow> = {}): Character {
  const r: ClassRow = { ...(c.classes[0] ?? { id: 'c1', name: '', clsId: '', sub: '', subId: '', lvl: 1, hd: 8, prep: 0 }), ...row };
  return { ...c, classes: [r], levels: [{ base: true, n: r.lvl, cls: r.id, added: [], picks: {}, set: [] }] };
}

// Weapons as plan 4's itemFromEntry builds them from the catalog (PHB pp.213–215), for the hands and actions tests.
type W = Partial<Item> & { id: string };
const weapon = (base: Omit<Item, 'id' | 'qty' | 'eq'>) => (p: W): Item => ({ qty: 1, eq: true, cat: 'weapon', ...base, ...p });
export const dagger = weapon({ name: 'Dagger', cid: 'item/dagger', wcat: 'simple', wrange: 'melee', dmg: '1d4', dtype: 'Piercing', props: 'finesse,light,thrown', thrown: '20/60', mastery: 'nick' });
export const longbow = weapon({ name: 'Longbow', cid: 'item/longbow', wcat: 'martial', wrange: 'ranged', dmg: '1d8', dtype: 'Piercing', props: 'ammunition,heavy,two-handed', ammo: '150/600;arrow', mastery: 'slow' });
export const shortbow = weapon({ name: 'Shortbow', cid: 'item/shortbow', wcat: 'simple', wrange: 'ranged', dmg: '1d6', dtype: 'Piercing', props: 'ammunition,two-handed', ammo: '80/320;arrow', mastery: 'vex' });
export const shortsword = weapon({ name: 'Shortsword', cid: 'item/shortsword', wcat: 'martial', wrange: 'melee', dmg: '1d6', dtype: 'Piercing', props: 'finesse,light', mastery: 'vex' });
export const longsword = weapon({ name: 'Longsword', cid: 'item/longsword', wcat: 'martial', wrange: 'melee', dmg: '1d8', dtype: 'Slashing', props: 'versatile', vers: '1d10', mastery: 'sap' });
export const quarterstaff = weapon({ name: 'Quarterstaff', cid: 'item/quarterstaff', wcat: 'simple', wrange: 'melee', dmg: '1d6', dtype: 'Bludgeoning', props: 'versatile', vers: '1d8', mastery: 'topple' });
export const handaxe = weapon({ name: 'Handaxe', cid: 'item/handaxe', wcat: 'simple', wrange: 'melee', dmg: '1d6', dtype: 'Slashing', props: 'light,thrown', thrown: '20/60', mastery: 'vex' });
export const spear = weapon({ name: 'Spear', cid: 'item/spear', wcat: 'simple', wrange: 'melee', dmg: '1d6', dtype: 'Piercing', props: 'thrown,versatile', thrown: '20/60', vers: '1d8', mastery: 'sap' });
export const dart = weapon({ name: 'Dart', cid: 'item/dart', wcat: 'simple', wrange: 'ranged', dmg: '1d4', dtype: 'Piercing', props: 'finesse,thrown', thrown: '20/60', mastery: 'vex' });
export const rapier = weapon({ name: 'Rapier', cid: 'item/rapier', wcat: 'martial', wrange: 'melee', dmg: '1d8', dtype: 'Piercing', props: 'finesse', mastery: 'vex' });
export const handCrossbow = weapon({ name: 'Hand Crossbow', cid: 'item/hand-crossbow', wcat: 'martial', wrange: 'ranged', dmg: '1d6', dtype: 'Piercing', props: 'ammunition,light,loading', ammo: '30/120;bolt', mastery: 'vex' });
export const shield = (p: W): Item => ({ name: 'Shield', qty: 1, eq: true, cat: 'shield', armor: 'shield', acBase: 2, cid: 'item/shield', ...p });

// A synthetic Paladin for the aura tests: Aura of Protection (from level 6, ends while Incapacitated, 10 ft, 30 ft from
// 18) with its save bonus riding on it, Aura of Courage's Frightened immunity riding on it too, and a Holy Avenger-like
// item whose aura needs it equipped, attuned and in hand.
export const AOP = 'feature/paladin/aura-of-protection';
export function paladin(level: number, p: Partial<Character> = {}): Character {
  return {
    ...withClass(blankCharacter(), { lvl: level }), abil: { ...blankCharacter().abil, cha: 16 },
    feats: [
      { id: 'p', g: 'class', name: 'Aura of Protection', desc: '', cid: AOP, minLvl: 6 },
      { id: 'cour', g: 'class', name: 'Aura of Courage', desc: '', cid: 'feature/paladin/aura-of-courage', minLvl: 10 }
    ],
    grants: [
      { id: 'g2', kind: 'aura', name: 'Aura of Protection', range: '6:10,18:30', incap: true, note: 'allies add your save bonus', from: 'feature:p' },
      { id: 'g1', kind: 'saveBonus', name: 'Aura of Protection', ab: 'all', val: 'cha>=1', needAura: AOP, from: 'feature:p' }
    ],
    defenses: [{ id: 'd', kind: 'imm', name: 'Frightened', needAura: AOP, from: 'feature:cour' }],
    ...p
  };
}
export const holyAvenger = (p: Partial<Item> = {}): Item => ({ id: 'ha', name: 'Holy Sword', qty: 1, eq: true, cat: 'weapon', wcat: 'martial', wrange: 'melee', dmg: '1d8', dtype: 'Slashing', attune: true, ...p });
export const haAura: Grant = { id: 'ga', kind: 'aura', name: 'Holy Sword', range: '1:10,17:30', needEq: true, needAtt: true, needHand: true, from: 'item:ha' };
