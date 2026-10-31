// The base copy rule for a magic weapon or armor, shared by the SRD builder (a fixed base, copyBase) and the add flow (a
// base the player chooses, plan 7). Node runs this file from the builder, so it imports types only.
import type { ItemEntry } from './schema.ts';

export const WEAPON_FIELDS = ['wcat', 'wrange', 'dmg', 'dtype', 'props', 'thrown', 'vers', 'ammo', 'mastery'] as const;
export const ARMOR_FIELDS = ['armor', 'acBase', 'strReq', 'stealthDis'] as const;

// The magic item with its base's weapon or armor fields, and the base's weight when it has none; its own fields win, and
// `base` becomes the base's id. A removal written as a value (Mithral Armor's strReq 0, stealthDis false) is dropped from
// the result. Only a mundane weapon, armor or Shield is a base: anything else throws.
export function withBase(e: ItemEntry, b: ItemEntry): ItemEntry {
  if (b.cat !== 'weapon' && b.cat !== 'armor' && b.cat !== 'shield') throw new Error(`${e.id}: base ${b.id} is no weapon, armor or Shield`);
  const from: Record<string, unknown> = {};
  for (const k of b.cat === 'weapon' ? WEAPON_FIELDS : ARMOR_FIELDS) if (b[k] !== undefined) from[k] = b[k];
  if (e.wt === undefined && b.wt !== undefined) from.wt = b.wt;
  const out: Record<string, unknown> = { ...from, ...e, base: b.id };
  if (out.strReq === 0) delete out.strReq;
  if (out.stealthDis === false) delete out.stealthDis;
  return out as unknown as ItemEntry;
}
