import type { Item } from './types';

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
