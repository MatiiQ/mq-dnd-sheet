// D&D 2024 rules used by the sheet. Pure functions: each takes a character and returns the next one.
import { blankCharacter, sampleCharacter } from './defaults';
import { grantErrors } from './catalog/schema';
import { isValue, valueAt, type ValueCtx } from './catalog/value';
import { PROF_NAMES, type ProfCat } from './catalog/names';
import { activeGrants, dropLinkOnly, fixLinks, hasActiveEffect, isActive, srcKindOfLink, linkOf, parseLink, sourceLabel, sourceOf, SRC_KINDS } from './links';
import type { AcEffect, Ability, ArmorKind, CastAbility, Character, Concentration, Counter, DefenseKind, Feature, Grant, HpSnapshot, Item, Prof, Linked, Recharge, Resource, Size, Spell, SpeedKind, SpellSort, Tab, Unarmored, When } from './types';

export const ABILITIES: [Ability, string][] = [
  ['str', 'Strength'], ['dex', 'Dexterity'], ['con', 'Constitution'],
  ['int', 'Intelligence'], ['wis', 'Wisdom'], ['cha', 'Charisma']
];

export const SKILLS: [string, string, Ability][] = [
  ['athletics', 'Athletics', 'str'],
  ['acrobatics', 'Acrobatics', 'dex'], ['sleight', 'Sleight of Hand', 'dex'], ['stealth', 'Stealth', 'dex'],
  ['arcana', 'Arcana', 'int'], ['history', 'History', 'int'], ['investigation', 'Investigation', 'int'], ['nature', 'Nature', 'int'], ['religion', 'Religion', 'int'],
  ['animal', 'Animal Handling', 'wis'], ['insight', 'Insight', 'wis'], ['medicine', 'Medicine', 'wis'], ['perception', 'Perception', 'wis'], ['survival', 'Survival', 'wis'],
  ['deception', 'Deception', 'cha'], ['intimidation', 'Intimidation', 'cha'], ['performance', 'Performance', 'cha'], ['persuasion', 'Persuasion', 'cha']
];

// The 12 actions anyone can take (PHB p.360).
export const COMBAT_ACTIONS = ['Attack', 'Dash', 'Disengage', 'Dodge', 'Help', 'Hide', 'Influence', 'Magic', 'Ready', 'Search', 'Study', 'Utilize'];

export const TABS: [Tab, string][] = [['actions', 'Actions'], ['spells', 'Spells'], ['inventory', 'Inventory'], ['features', 'Features & Traits'], ['notes', 'Notes']];

export { SRC_KINDS };

export const CAST_NAMES: Record<CastAbility, string> = { none: 'None', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };

export const CONDITION_RULES: Record<string, string> = {
  Blinded: 'You can’t see and fail checks that need sight. Attacks against you have Advantage; your attacks have Disadvantage.',
  Charmed: 'You can’t attack the charmer or target it with damaging abilities or magical effects. The charmer has Advantage on social checks against you.',
  Deafened: 'You can’t hear and fail checks that need hearing.',
  Frightened: 'Disadvantage on ability checks and attack rolls while the source is in sight. You can’t willingly move closer to it.',
  Grappled: 'Speed 0 and can’t increase. Disadvantage on attacks against anyone but the grappler. The grappler can drag you.',
  Incapacitated: 'No actions, Bonus Actions or Reactions. Concentration breaks. You can’t speak. Disadvantage on Initiative.',
  Invisible: 'Advantage on Initiative. Attacks against you have Disadvantage; your attacks have Advantage (unless the target can see you).',
  Paralyzed: 'Incapacitated, Speed 0. Auto-fail STR and DEX saves. Attacks against you have Advantage; hits within 5 ft are critical hits.',
  Petrified: 'Turned to stone: Incapacitated, Speed 0. Auto-fail STR and DEX saves. Attacks against you have Advantage. Resistance to all damage; immune to Poisoned.',
  Poisoned: 'Disadvantage on attack rolls and ability checks.',
  Prone: 'Crawl or spend half your Speed to stand (you can’t stand at Speed 0). Disadvantage on your attacks. Attacks against you have Advantage within 5 ft, Disadvantage beyond.',
  Restrained: 'Speed 0. Attacks against you have Advantage; your attacks have Disadvantage. Disadvantage on DEX saves.',
  Stunned: 'Incapacitated. Auto-fail STR and DEX saves. Attacks against you have Advantage.',
  Unconscious: 'Incapacitated and Prone; you drop what you hold. Speed 0. Auto-fail STR and DEX saves. Attacks against you have Advantage; hits within 5 ft are critical hits.'
};
export const CONDITIONS = Object.keys(CONDITION_RULES);
export const DAMAGE_TYPES = ['Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Lightning', 'Necrotic', 'Piercing', 'Poison', 'Psychic', 'Radiant', 'Slashing', 'Thunder'];
// Conditions a defense can name: the list above plus Exhaustion, which the sheet tracks as a level.
export const CONDITION_OPTIONS = [...CONDITIONS.slice(0, 3), 'Exhaustion', ...CONDITIONS.slice(3)];
const INCAPACITATING = ['Incapacitated', 'Paralyzed', 'Petrified', 'Stunned', 'Unconscious'];
const ZERO_SPEED = ['Grappled', 'Restrained', 'Paralyzed', 'Petrified', 'Unconscious'];

export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const fmt = (m: number) => (m >= 0 ? '+' + m : '−' + Math.abs(m));
export const mod = (score: number) => Math.floor((score - 10) / 2);
export const profBonus = (level: number) => 2 + Math.floor((level - 1) / 4);
// Context for grant values: level, Proficiency Bonus and ability modifiers.
export const valueCtx = (c: Character): ValueCtx => ({ level: c.level, pb: profBonus(c.level), mod: (a) => abilityMod(c, a) });
const numIn = (ctx: ValueCtx, v: string | undefined) => { const n = v === undefined ? 0 : valueAt(v, ctx); return typeof n === 'number' ? n : 0; };
// A grant value as a number now; dice or no value count as 0.
export const num = (c: Character, v: string | undefined) => numIn(valueCtx(c), v);
// Ability grant values are constants: read with modifiers of 0, so a score never depends on itself.
const constCtx = (c: Character): ValueCtx => ({ level: c.level, pb: profBonus(c.level), mod: () => 0 });

// A score and the parts it is made of. Fixed order (spec): the typed base; each active grant capped at 20 adds, never
// past the cap and never lowering (no increase can raise a score above 20, PHB p.38); then cap-25 grants (Primal
// Champion, PHB p.53) and cap-30 grants the same way; a set score raises to the highest set value; the temporary
// adjustment last; 1–30. Counted grants are already in the typed base and add nothing.
export function abilityParts(c: Character, k: Ability): AcPart[] {
  const ctx = constCtx(c);
  let s = c.abil[k];
  const parts: AcPart[] = [{ label: 'Score', value: s }];
  const mine = activeGrants(c, 'abil', true).filter((g) => g.ab === k);
  parts.push(...mine.filter((g) => g.counted).map((g) => ({ label: g.name, value: numIn(ctx, g.val), note: 'counted' })));
  for (const cap of [20, 25, 30]) {
    for (const g of mine.filter((x) => !x.counted && x.cap === cap)) {
      const next = Math.max(s, Math.min(cap, s + numIn(ctx, g.val)));
      parts.push({ label: g.name, value: next - s, ...(next - s < numIn(ctx, g.val) ? { note: 'capped at ' + cap } : {}) });
      s = next;
    }
  }
  const sets = activeGrants(c, 'abilSet').filter((g) => g.ab === k);
  const top = sets.reduce<Grant | null>((b, g) => (!b || numIn(ctx, g.val) > numIn(ctx, b.val) ? g : b), null);
  if (top && numIn(ctx, top.val) > s) { parts.push({ label: top.name, value: numIn(ctx, top.val) - s, note: 'sets ' + numIn(ctx, top.val) }); s = numIn(ctx, top.val); }
  if (c.abilAdj[k]) parts.push({ label: 'Adjustment', value: c.abilAdj[k]! });
  return parts;
}
export const effScore = (c: Character, k: Ability) =>
  clamp(abilityParts(c, k).reduce((t, p) => t + (p.note === 'counted' ? 0 : p.value), 0), 1, 30);
export const abilityMod = (c: Character, k: Ability) => mod(effScore(c, k));
// Skill proficiency level (0 none, 1 proficient, 2 Expertise): the higher of the hand value and the active grants.
// `by` names the grant's source when a grant raises it above the hand value.
export function skillLevel(c: Character, key: string): { level: number; hand: number; by?: string } {
  const hand = c.skillProf[key] || 0;
  let level = hand, by: string | undefined;
  for (const g of activeGrants(c, 'prof', true)) {
    const lv = g.target !== key ? 0 : g.cat === 'skill' ? 1 : g.cat === 'expertise' ? 2 : 0;
    if (lv > level) { level = lv; by = sourceLabel(c, g); }
  }
  return by ? { level, hand, by } : { level, hand };
}
// Check bonus grants for a skill, or for every check of its ability (Magician: WIS modifier on Arcana and Nature).
const checkBonus = (c: Character, targets: string[]) =>
  activeGrants(c, 'checkBonus').filter((g) => targets.includes(g.target ?? '')).reduce((t, g) => t + num(c, g.val), 0);
// Skill check: ability modifier + PB × level. Jack of All Trades adds half PB, rounded down, to a check with a skill
// you aren't proficient in (PHB p.60).
export function skillMod(c: Character, key: string, ab: Ability): number {
  const pb = profBonus(c.level), lv = skillLevel(c, key).level;
  const half = lv === 0 && activeGrants(c, 'prof', true).some((g) => g.cat === 'half') ? Math.floor(pb / 2) : 0;
  return abilityMod(c, ab) + pb * lv + half + checkBonus(c, [key, ab]);
}
// Passive Perception = 10 + the Perception check bonus (PHB p.372). The sheet uses the same formula for Investigation and Insight, which the rules don't define.
export const passiveScore = (c: Character, key: string) => 10 + skillMod(c, key, SKILLS.find(([k]) => k === key)![2]);
// Saving throw: d20 + ability modifier, + Proficiency Bonus if proficient (PHB p.11).
export function saveProficient(c: Character, k: Ability): { on: boolean; by?: string } {
  if (c.saveProf[k]) return { on: true };
  const g = activeGrants(c, 'prof', true).find((x) => x.cat === 'save' && x.target === k);
  return g ? { on: true, by: sourceLabel(c, g) } : { on: false };
}
// Plus save bonus grants for this ability or for all saves (Aura of Protection).
export const saveMod = (c: Character, k: Ability) => abilityMod(c, k) + (saveProficient(c, k).on ? profBonus(c.level) : 0) +
  activeGrants(c, 'saveBonus').filter((g) => g.ab === k || g.ab === 'all').reduce((t, g) => t + num(c, g.val), 0);
// Spell save DC = 8 + spellcasting ability modifier + PB; spell attack = modifier + PB (PHB p.41). null without a spellcasting ability.
export const spellSaveDC = (c: Character) => (c.castAb === 'none' ? null : 8 + abilityMod(c, c.castAb) + profBonus(c.level));
export const spellAttack = (c: Character) => (c.castAb === 'none' ? null : abilityMod(c, c.castAb) + profBonus(c.level));
// The same two numbers as parts, for the breakdown under each badge (PHB p.41). Their sums equal the values above.
export function spellAttackParts(c: Character): AcPart[] | null {
  if (c.castAb === 'none') return null;
  return [{ label: CAST_NAMES[c.castAb] + ' modifier', value: abilityMod(c, c.castAb) }, { label: 'Proficiency Bonus', value: profBonus(c.level) }];
}
export const spellDcParts = (c: Character): AcPart[] | null => {
  const parts = spellAttackParts(c);
  return parts && [{ label: 'Base', value: 8 }, ...parts];
};
// Initiative is a Dexterity check (PHB p.23), so Dexterity check bonus grants add; initMisc holds extra bonuses from
// features or items. No half PB: Jack of All Trades needs a skill check you aren't proficient in (PHB p.60), and
// Initiative uses no skill (the 2014 rule applied it to Initiative; the 2024 one doesn't).
export const initiative = (c: Character) => abilityMod(c, 'dex') + c.initMisc + checkBonus(c, ['dex']) +
  activeGrants(c, 'init').reduce((t, g) => t + num(c, g.val), 0);

// Armor table: name, category, base AC; a Shield adds 2. One suit of armor and one Shield at a time (PHB p.219).
export const ARMORS: [string, ArmorKind, number][] = [
  ['Padded Armor', 'light', 11], ['Leather Armor', 'light', 11], ['Studded Leather Armor', 'light', 12],
  ['Hide Armor', 'medium', 12], ['Chain Shirt', 'medium', 13], ['Scale Mail', 'medium', 14], ['Breastplate', 'medium', 14], ['Half Plate Armor', 'medium', 15],
  ['Ring Mail', 'heavy', 14], ['Chain Mail', 'heavy', 16], ['Splint Armor', 'heavy', 17], ['Plate Armor', 'heavy', 18],
  ['Shield', 'shield', 2]
];
// Unarmored base AC features, 10 + DEX + an ability, only without armor: Barbarian (PHB p.51), Monk (p.101),
// Draconic Sorcerer (p.148), College of Dance (p.64). Monk and Dance also lose it with a Shield.
export const UNARMORED: Record<Unarmored, [label: string, ability: Ability | null, shieldOk: boolean]> = {
  none: ['10 + DEX', null, true],
  barbarian: ['Unarmored Defense (Barbarian)', 'con', true],
  monk: ['Unarmored Defense (Monk)', 'wis', false],
  draconic: ['Draconic Resilience', 'cha', true],
  dance: ['Unarmored Defense (Dance)', 'cha', false]
};

// Whole-name match against the table, ignoring case, a trailing "Armor" and a leading "+N" (read as a bonus).
// "Leather Pouch" or "Shield Badge" don't match. A trade item named just "Hide" does; accepted, since this only
// runs when adding an item or migrating an old save.
const armorKey = (n: string) => n.toLowerCase().trim().replace(/ armor$/, '');
export function detectArmor(name: string): Pick<Item, 'armor' | 'acBase' | 'acBonus'> | null {
  const plus = name.trim().match(/^\+(\d+)\s+(.*)$/);
  const key = armorKey(plus ? plus[2] : name);
  const a = ARMORS.find(([n]) => armorKey(n) === key);
  return a ? { armor: a[1], acBase: a[2], ...(plus ? { acBonus: Number(plus[1]) } : {}) } : null;
}

// AC spells by name: Shield +5 and Shield of Faith +2 (PHB p.316), Mage Armor base 13 + DEX (p.293), Barkskin AC at least 17 (p.245).
export const AC_EFFECTS: AcEffect[] = ['bonus', 'base', 'floor'];
export const AC_SPELLS: Record<string, [AcEffect, number]> = {
  shield: ['bonus', 5], 'shield of faith': ['bonus', 2], 'mage armor': ['base', 13], barkskin: ['floor', 17]
};
export function detectAcSpell(name: string): Pick<Spell, 'acFx' | 'acVal'> | null {
  const fx = AC_SPELLS[name.trim().toLowerCase()];
  return fx ? { acFx: fx[0], acVal: fx[1] } : null;
}

export interface AcPart { label: string; value: number; note?: string; active?: boolean }
// A Concentration spell's AC effect is on exactly while concentrating on it; any other is on while in acOn.
export const acSpellActive = (c: Character, sp: Spell) => !!sp.acFx && (sp.c ? c.conc?.id === sp.id : c.acOn.includes(sp.id));
const partsSum = (parts: AcPart[]) => parts.reduce((t, p) => t + p.value, 0);

// Armor Class and the parts it is made of. Base AC is 10 + DEX; armor, spells and features give other base
// calculations, and only one applies (PHB p.12, p.361). The sheet picks the highest legal one.
// Light armor adds DEX, medium at most +2, heavy none (PHB p.219). Parts worth 0 are left out.
export function armorClass(c: Character): { total: number; parts: AcPart[] } {
  const dex = abilityMod(c, 'dex');
  const dexPart = (cap: number): AcPart => (dex > cap ? { label: 'Dexterity', value: cap, note: 'max +' + cap } : { label: 'Dexterity', value: dex });
  const armorParts = (it: Item): AcPart[] => [
    { label: it.name, value: (it.acBase || 0) + (it.acBonus || 0), note: it.armor + ' armor' },
    ...(it.armor === 'heavy' ? [] : [dexPart(it.armor === 'medium' ? 2 : Infinity)])
  ];
  const shields = c.inv.filter((i) => i.eq && i.armor === 'shield');
  const shield = shields.reduce<Item | null>((b, i) => (!b || (i.acBase || 0) + (i.acBonus || 0) > (b.acBase || 0) + (b.acBonus || 0) ? i : b), null);
  const worn = c.inv.filter((i) => i.eq && i.armor && i.armor !== 'shield');
  const spells = c.spells.filter((sp) => acSpellActive(c, sp));
  const spellPart = (sp: Spell): AcPart => ({ label: sp.name, value: sp.acVal || 0, note: 'spell', active: true });
  const unarmored: AcPart = { label: 'Unarmored', value: 10 };
  const candidates: AcPart[][] = worn.map(armorParts);
  if (!worn.length) {
    const [note, ab, shieldOk] = UNARMORED[c.acUnarm];
    if (ab && (shieldOk || !shield)) {
      candidates.push([unarmored, dexPart(Infinity), { label: ABILITIES.find(([k]) => k === ab)![1], value: abilityMod(c, ab), note }]);
    }
    // Unarmored base grants work like UNARMORED: 10 + DEX + an ability, lost with a Shield unless shieldOk.
    for (const g of activeGrants(c, 'ac').filter((x) => x.acMode === 'unarmored' && x.ab && (x.shieldOk !== false || !shield))) {
      candidates.push([unarmored, dexPart(Infinity), { label: ABILITIES.find(([k]) => k === g.ab)?.[1] ?? g.ab!, value: abilityMod(c, g.ab as Ability), note: g.name }]);
    }
    // Mage Armor sets a base AC on a creature not wearing armor (PHB p.293).
    for (const sp of spells.filter((x) => x.acFx === 'base')) candidates.push([spellPart(sp), dexPart(Infinity)]);
    candidates.push([unarmored, dexPart(Infinity)]);
  }
  // Highest sum wins; on a tie the earlier candidate stays.
  const base = candidates.reduce((b, p) => (partsSum(p) > partsSum(b) ? p : b));
  const parts: AcPart[] = [
    ...base,
    ...(shield ? [{ label: shield.name, value: (shield.acBase || 0) + (shield.acBonus || 0), note: 'shield' }] : []),
    // AC bonus grants (Ring of Protection, Defense): they follow equip, attunement and armor conditions through
    // activeGrants. acBonus counts only on armor and Shields, inside their own part above.
    ...activeGrants(c, 'ac').filter((g) => g.acMode === 'bonus').map((g) => ({ label: g.name, value: num(c, g.val), ...(sourceLabel(c, g) ? { note: sourceLabel(c, g) } : {}) })),
    ...spells.filter((sp) => sp.acFx === 'bonus').map(spellPart),
    ...c.acMods.map((m) => ({ label: m.name, value: m.val, note: 'custom' }))
  ].filter((p) => p.value !== 0);
  // Barkskin: AC can't be lower than its value, so it comes last and adds only what is missing (PHB p.245).
  const floor = Math.max(0, ...spells.filter((sp) => sp.acFx === 'floor').map((sp) => sp.acVal || 0));
  const fl = spells.find((sp) => sp.acFx === 'floor' && sp.acVal === floor);
  const below = floor - partsSum(parts);
  if (fl && below > 0) parts.push({ label: fl.name, value: below, note: 'AC at least ' + floor, active: true });
  return { total: partsSum(parts), parts };
}
// A levelled spell can be cast when it is prepared or always prepared; always-prepared spells don't count
// toward the prepared limit (PHB p.235). With tracking off (classes that know their spells), every spell can be cast.
export const spellUsable = (c: Character, sp: Spell) => !c.usePrep || !!sp.always || !!sp.prep;
// Sort orders for the spell list. Casting time matches the start of the free-text time; anything else goes last.
export const SPELL_SORTS: [SpellSort, string][] = [['az', 'A–Z'], ['prep', 'Prepared first'], ['time', 'Casting time']];
function castRank(time: string): number {
  const t = time.trim().toLowerCase();
  if (/^action/.test(t)) return 0;
  if (/^bonus action/.test(t)) return 1;
  if (/^reaction/.test(t)) return 2;
  const m = t.match(/^(\d+)\s*(minute|hour)s?/);
  return m ? 3 + Number(m[1]) * (m[2] === 'hour' ? 60 : 1) : Infinity;
}
export function sortSpells(c: Character, list: Spell[]): Spell[] {
  const key = (sp: Spell) => (c.spellSort === 'prep' ? (spellUsable(c, sp) ? 0 : 1) : c.spellSort === 'time' ? castRank(sp.time) : 0);
  return [...list].sort((a, b) => key(a) - key(b) || a.name.localeCompare(b.name));
}
export const preparedCount = (c: Character) => c.spells.filter((x) => (x.lvl || 0) > 0 && !x.always && x.prep).length;
export const slotsLeft = (c: Character, level: number) => Math.max(0, c.slotMax[level] - c.slotUsed[level]);
export const setSlotUsed = (c: Character, l: number, n: number) => { const u = c.slotUsed.slice(); u[l] = n; return { slotUsed: u }; };

// Starting or ending Concentration makes the old CON save notice out of date, so it goes too.
export const setConc = (conc: Concentration | null) => ({ conc, concCheck: null });

// Casting a non-Concentration AC spell switches its AC effect on (once). A Concentration one is on through c.conc.
const acOnCast = (c: Character, sp: Spell): Partial<Character> =>
  (sp.acFx && !sp.c && !c.acOn.includes(sp.id) ? { acOn: [...c.acOn, sp.id] } : {});

// Casting a non-Concentration spell whose grants need it switched on switches it on (once). A Concentration spell's
// effect is on through c.conc.
const effectOnCast = (c: Character, sp: Spell): Partial<Character> => {
  const link = linkOf('spell', sp.id);
  return !sp.c && !c.effectsOn.includes(link) && hasActiveEffect(c, link) ? { effectsOn: [...c.effectsOn, link] } : {};
};

// Casting with a slot uses one slot of that level. A Concentration spell starts Concentration, which ends any other (PHB p.363).
export function castSpell(c: Character, sp: Spell, level: number): Partial<Character> {
  if (!slotsLeft(c, level)) return {};
  return { ...setSlotUsed(c, level, c.slotUsed[level] + 1), ...(sp.c ? setConc({ id: sp.id, name: sp.name }) : {}), ...acOnCast(c, sp), ...effectOnCast(c, sp) };
}

// Switches a source's effect on or off (Rage, Starry Form, Shillelagh), without casting or using anything.
export const toggleEffect = (c: Character, link: string): Partial<Character> =>
  ({ effectsOn: c.effectsOn.includes(link) ? c.effectsOn.filter((x) => x !== link) : [...c.effectsOn, link] });

// After editing a spell: one that is now Concentration leaves effectsOn (its effect follows c.conc from now on).
export function effectsAfterEdit(c: Character, sp: Pick<Spell, 'id' | 'c'>): Partial<Character> {
  const link = linkOf('spell', sp.id);
  return sp.c && c.effectsOn.includes(link) ? { effectsOn: c.effectsOn.filter((x) => x !== link) } : {};
}

// Using a free cast works like casting; tapping it again restores the cast but leaves the effects alone.
export function toggleFreeCast(c: Character, sp: Spell): Partial<Character> {
  const used = !c.free[sp.id];
  return { free: { ...c.free, [sp.id]: used }, ...(used && sp.c ? setConc({ id: sp.id, name: sp.name }) : {}), ...(used ? { ...acOnCast(c, sp), ...effectOnCast(c, sp) } : {}) };
}

// Switches a non-Concentration spell's AC effect on or off, without casting it.
export const toggleAcSpell = (c: Character, id: string): Partial<Character> =>
  ({ acOn: c.acOn.includes(id) ? c.acOn.filter((x) => x !== id) : [...c.acOn, id] });

// After editing a spell: one that is now Concentration, or has no AC effect, leaves the list of active AC spells.
export function acAfterEdit(c: Character, sp: Pick<Spell, 'id' | 'c' | 'acFx'>): Partial<Character> {
  return c.acOn.includes(sp.id) && (sp.c || !sp.acFx) ? { acOn: c.acOn.filter((x) => x !== sp.id) } : {};
}

// Removing a spell ends Concentration on it, switches its AC effect off and drops its free cast.
export function removeSpell(c: Character, id: string): Character {
  const { [id]: _, ...free } = c.free;
  return {
    ...c, spells: c.spells.filter((x) => x.id !== id), free, acOn: c.acOn.filter((x) => x !== id),
    ...(c.conc?.id === id ? setConc(null) : {})
  };
}

// After editing the concentrated spell: unticking Concentration ends it, and a new name shows in the chip.
export function concAfterEdit(c: Character, sp: Pick<Spell, 'id' | 'name' | 'c'>): Partial<Character> {
  if (c.conc?.id !== sp.id) return {};
  if (!sp.c) return setConc(null);
  return sp.name !== c.conc.name ? setConc({ id: sp.id, name: sp.name }) : {};
}

// Carrying capacity: Strength score × a multiplier for the size; Drag/Lift/Push is twice that (PHB p.362–363, Carrying
// Capacity table; Small and Medium share a row). Powerful Build counts one size larger (PHB p.192); Gargantuan is the
// last row. Going over only matters while dragging, lifting or pushing (Speed at most 5 ft), so Speed never changes here.
export const SIZES: [Size, string][] = [['tiny', 'Tiny'], ['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['huge', 'Huge'], ['gargantuan', 'Gargantuan']];
export const CARRY_MULT: Record<Size, number> = { tiny: 7.5, small: 15, medium: 15, large: 30, huge: 60, gargantuan: 120 };
// Size: the larger of the hand size and every active size grant, so a grant never lowers a size set by hand (a
// Goliath in Large Form, PHB p.192, set to Large by hand stays Large).
const sizeRank = (s: Size) => SIZES.findIndex(([k]) => k === s);
export const sizeOf = (c: Character): Size =>
  activeGrants(c, 'size').reduce<Size>((s, g) => (g.size && sizeRank(g.size) > sizeRank(s) ? g.size : s), c.size);
export const carryUpOf = (c: Character) => c.carryUp || activeGrants(c, 'carryUp').length > 0;
export function carryCapacity(c: Character): { carry: number; push: number; size: Size } {
  const own = sizeOf(c), i = sizeRank(own);
  const size = carryUpOf(c) ? SIZES[Math.min(i + 1, SIZES.length - 1)][0] : own;
  const carry = effScore(c, 'str') * CARRY_MULT[size];
  return { carry, push: carry * 2, size };
}
// Items count weight × quantity; fifty coins weigh a pound (PHB p.213).
export function carriedWeight(c: Character): number {
  const coins = Object.values(c.coins).reduce((t, n) => t + n, 0);
  return c.inv.reduce((t, i) => t + (i.wt || 0) * i.qty, 0) + coins / 50;
}
// A typed weight in lb. A Polish keyboard types a decimal comma, so "0,5" is 0.5. Anything else is no weight.
export function parseWeight(s: string): number | undefined {
  const t = s.trim();
  return /^(\d+([.,]\d*)?|[.,]\d+)$/.test(t) ? Number(t.replace(',', '.')) : undefined;
}

export const zeroSpeedBy = (c: Character) => CONDITIONS.filter((n) => c.conds[n] && ZERO_SPEED.includes(n));
export const speedOf = (c: Character, base: number) => (zeroSpeedBy(c).length ? 0 : Math.max(0, base - 5 * c.exh));
// Walking Speed before Exhaustion and conditions: the typed base plus walking speed grants (Wood Elf +5 ft).
export const walkSpeed = (c: Character) => c.speedBase + activeGrants(c, 'speed').filter((g) => g.mode === 'walk').reduce((t, g) => t + num(c, g.val), 0);
// Another speed: the typed one or the best grant, whichever is higher ('walk' means equal to the walking Speed).
export function modeSpeed(c: Character, k: SpeedKind): { base: number; hover: boolean; by?: string } {
  const typed = c.speeds[k] || 0;
  let base = typed, by: string | undefined;
  const mine = activeGrants(c, 'speed').filter((g) => g.mode === k);
  for (const g of mine) {
    const v = g.val === 'walk' ? walkSpeed(c) : num(c, g.val);
    if (v > base) { base = v; by = sourceLabel(c, g) ?? g.name; }
  }
  const hover = mine.some((g) => g.hover);
  return by ? { base, hover, by } : { base, hover };
}
export const speedNow = (c: Character) => speedOf(c, walkSpeed(c));
// The HP maximum every reader uses: the typed maxHp plus HP-per-level grants × level (Tough, PHB p.202). maxHp and
// origHp stay typed (base) values, so a Long Rest restoring origHp never counts a grant twice.
export const maxHpOf = (c: Character) => c.maxHp + activeGrants(c, 'hpLvl').reduce((t, g) => t + num(c, g.val) * c.level, 0);
// Current HP against max, temp HP ignored: green from 65%, yellow from 30%, red below.
export const hpColor = (c: Character) =>
  (c.hp * 100 >= maxHpOf(c) * 65 ? 'var(--hp-high)' : c.hp * 100 >= maxHpOf(c) * 30 ? 'var(--hp-mid)' : 'var(--hp-low)');

// Display geometry for the HP ring, not a rule: HP and temp HP as percentages of max + temp.
// The cumulative stop is rounded, not each segment, so the two never add up past 100.
export function hpRingStops(c: Character): { hp: number; temp: number } {
  const total = Math.max(1, maxHpOf(c) + c.temp);
  const r = (x: number) => Math.round(x * 10) / 10;
  const hp = r((c.hp / total) * 100);
  return { hp, temp: r(r(((c.hp + c.temp) / total) * 100) - hp) };
}

export function toggleCondition(c: Character, name: string): Character {
  const conds = { ...c.conds, [name]: !c.conds[name] };
  const endsConc = conds[name] && INCAPACITATING.includes(name) && c.conc;
  return { ...c, conds, ...(endsConc ? setConc(null) : {}) };
}

// Exhaustion runs from 0 to 6. Level 6 is death (PHB p.366), and death ends Concentration (PHB p.363).
export function setExhaustion(c: Character, n: number): Partial<Character> {
  const exh = clamp(n, 0, 6);
  return { exh, ...(exh >= 6 && c.conc ? setConc(null) : {}) };
}

const snapshot = (c: Character): HpSnapshot => ({ hp: c.hp, temp: c.temp, ds: c.ds, df: c.df, conds: c.conds, conc: c.conc });

export function applyDamage(c: Character): Character {
  if (!c.amount) return c;
  const absorbed = Math.min(c.temp, c.amount);
  const amt = c.amount - absorbed;
  const next: Character = { ...c, temp: c.temp - absorbed, hp: Math.max(0, c.hp - amt), concCheck: null };
  let text = 'Took ' + c.amount + ' damage' + (absorbed ? ' (' + absorbed + ' absorbed by temp HP)' : '') + '.';
  // Damage at 0 HP (PHB p.29): one failure, or death if it equals or exceeds max HP. A Stable character starts rolling again.
  // Becoming Stable resets both counts (PHB p.29). Simplification: the app keeps ds at 3 to mark Stable, so it can't
  // reset them at that moment; it ignores the old failures when the next damage comes in, and shows them until then.
  if (amt > 0 && c.hp === 0 && amt >= maxHpOf(c)) {
    next.df = 3;
    text += ' Damage at 0 HP equals or exceeds max HP, so the character dies instantly.';
  } else if (amt > 0 && c.hp === 0) {
    next.df = Math.min(3, (c.ds >= 3 ? 0 : c.df) + 1);
    text += ' Damage at 0 HP: 1 death save failure marked (mark one more if it was a critical hit).';
    if (c.ds >= 3) {
      next.ds = 0;
      text += ' No longer Stable: roll death saves again.';
    }
  } else if (amt > 0 && amt - c.hp >= maxHpOf(c)) {
    next.df = 3;
    text += ' Massive damage: the leftover damage equals or exceeds max HP, so the character dies instantly.';
  }
  if (c.conc) {
    const dc = clamp(Math.floor(c.amount / 2), 10, 30);
    next.concCheck = 'Concentration on ' + c.conc.name + ': CON save DC ' + dc + ' · roll d20 ' + fmt(saveMod(c, 'con')) + '. If you fail, tap the blue chip in the top bar to end it.';
    if (next.hp === 0) {
      next.conc = null;
      next.concCheck = 'Concentration on ' + c.conc.name + ' ended (dropped to 0 HP).';
    }
  }
  if (next.hp === 0 && c.hp > 0) {
    next.conds = { ...c.conds, Unconscious: true };
    text += ' Dropped to 0 HP: Unconscious.';
  }
  next.hpUndo = { prev: snapshot(c), text };
  return next;
}

// Three failed death saves (PHB p.29) or Exhaustion level 6 (PHB p.366).
export const isDead = (c: Character) => (c.hp === 0 && c.df >= 3) || c.exh >= 6;

export function applyHeal(c: Character): Character {
  // Healing can't bring back a dead character; clear the failures first (e.g. after Revivify).
  if (!c.amount || isDead(c)) return c;
  const hp = Math.min(maxHpOf(c), c.hp + c.amount);
  const next: Character = { ...c, hp, hpUndo: { prev: snapshot(c), text: 'Healed ' + (hp - c.hp) + ' HP.' } };
  if (c.hp === 0 && hp > 0) {
    next.ds = 0;
    next.df = 0;
    // Unconscious ends when you regain HP, but you stay Prone (PHB p.377).
    if (c.conds.Unconscious) {
      next.conds = { ...c.conds, Unconscious: false, Prone: true };
      next.hpUndo!.text += ' No longer Unconscious, still Prone.';
    }
  }
  return next;
}

// Temp HP don't stack: the new set replaces the old one, and Undo keeps the old one instead (PHB p.29).
export function applySetTemp(c: Character): Character {
  if (!c.amount) return c;
  const text = 'Temp HP set to ' + c.amount + (c.temp && c.temp !== c.amount
    ? ' (replaced ' + c.temp + '; temp HP don’t stack, tap Undo to keep ' + c.temp + ').'
    : '.');
  return { ...c, temp: c.amount, hpUndo: { prev: snapshot(c), text } };
}

// Typing a new current HP is a correction, not damage or healing: no concentration check, no conditions change.
// Leaving 0 HP still resets the death saves, as regaining any HP does (PHB p.29). Kept between 0 and max HP.
export function setHp(c: Character, n: number): Character {
  const hp = clamp(n, 0, maxHpOf(c));
  if (hp === c.hp) return c;
  return { ...c, hp, ...(c.hp === 0 ? { ds: 0, df: 0 } : {}), hpUndo: { prev: snapshot(c), text: 'HP set to ' + hp + ' (was ' + c.hp + ').' } };
}

export function undoHp(c: Character): Character {
  if (!c.hpUndo) return c;
  return { ...c, ...c.hpUndo.prev, hpUndo: null, concCheck: null };
}

// Hides the undo row, unless a newer HP action has replaced it since `shown`.
export function clearHpUndo(c: Character, shown: Character['hpUndo']): Character {
  return c.hpUndo === shown ? { ...c, hpUndo: null } : c;
}

// A patch for a new typed HP maximum: at least 1, and current HP never above the effective maximum it gives.
export function setMaxHp(c: Character, maxHp: number): Pick<Character, 'maxHp' | 'hp'> {
  const m = Math.max(1, maxHp);
  return { maxHp: m, hp: Math.min(c.hp, maxHpOf({ ...c, maxHp: m })) };
}

// A character has one Hit Die per level (PHB p.41–42).
export const hdSpent = (c: Character) => Math.min(c.hdUsed, c.level);

// Hit Dice are spent during a Short Rest, which needs at least 1 HP (PHB p.373).
export function spendHitDie(c: Character): Character {
  const used = hdSpent(c);
  if (used >= c.level || c.hp === 0 || isDead(c)) return c;
  // Spending a die starts a new HP action, so the old undo (which may refund an earlier die) no longer applies.
  return { ...c, hdUsed: used + 1, amount: 0, hpUndo: null };
}

// Spending a Hit Die: roll it and add the Con modifier (PHB p.373).
export const hitDieRoll = (c: Character) => '1d' + c.hdDie + ' ' + fmt(abilityMod(c, 'con'));

// Each spent Hit Die restores at least 1 HP, even with a negative Con modifier (PHB p.373).
// Undoing a Hit Die heal also gives the die back, so the roll can be entered again.
export function healHitDie(c: Character): Character {
  const next = applyHeal({ ...c, amount: Math.max(1, c.amount) });
  if (!next.hpUndo || next.hpUndo === c.hpUndo) return next;
  return { ...next, hpUndo: { ...next.hpUndo, prev: { ...next.hpUndo.prev, hdUsed: Math.max(0, c.hdUsed - 1) } } };
}

export const rechargeOf = (r: Partial<Counter>) => r.recharge || 'none';

// A counter's maximum now: a formula (maxV, never below 0), else a fixed max of at least 1, else none (null). It
// ignores whether the counter's source is active, so an inactive resource keeps its count (spec).
export function maxOf(c: Character, x: Partial<Counter>): number | null {
  if (x.maxV !== undefined) return Math.max(0, num(c, x.maxV));
  return x.max && x.max >= 1 ? x.max : null;
}
// The resource form's Maximum: None, a Number (whole, 1 or more) or a Formula (a Value without dice; '0' is a real
// maximum of 0). null = refused.
export function maxFields(kind: 'none' | 'number' | 'formula', text: string): Pick<Counter, 'max' | 'maxV'> | null {
  const t = text.trim();
  if (kind === 'none') return {};
  if (kind === 'number') return /^\d+$/.test(t) && Number(t) >= 1 ? { max: Number(t) } : null;
  return isValue(t) && !/d/.test(t) ? { maxV: t } : null;
}

// The single clamp, run by update() and migrate() after every change: resource counts at most their maximum, HP at
// most max HP. Uses lost while a maximum is lower are not given back when it rises (spec). Returns c when nothing moves.
export function normalize(c: Character): Character {
  let changed = false;
  const res = c.res.map((r) => {
    const m = maxOf(c, r);
    if (m === null || r.count <= m) return r;
    changed = true;
    return { ...r, count: m };
  });
  const inv = c.inv.map((i) => {
    const m = i.count === undefined ? null : maxOf(c, i);
    if (m === null || i.count! <= m) return i;
    changed = true;
    return { ...i, count: m };
  });
  const top = maxHpOf(c);
  if (c.hp > top) changed = true;
  return changed ? { ...c, res, inv, hp: Math.min(c.hp, top) } : c;
}

// Resource groups: a custom type name, else the source kind, else Other. Source kinds in SRC_KINDS order, then custom
// names A–Z.
export function resourceGroups(c: Character): { title: string; list: Resource[] }[] {
  const title = (r: Resource) => r.typeName || SRC_KINDS.find(([k]) => k === (r.srcKind ?? (r.from ? srcKindOfLink(c, r.from) : null)))?.[1] || 'Other';
  const kinds = SRC_KINDS.map(([, l]) => l);
  const titles = [...new Set(c.res.map(title))].sort((a, b) => {
    const i = kinds.indexOf(a), j = kinds.indexOf(b);
    return i >= 0 && j >= 0 ? i - j : i >= 0 ? -1 : j >= 0 ? 1 : a.localeCompare(b);
  });
  return titles.map((t) => ({ title: t, list: c.res.filter((r) => title(r) === t) }));
}

export type RestEvent = 'short' | 'long' | 'dawn';
export interface RollAsk { key: string; name: string; dice: string }
type Counted = { id: string; name: string } & Partial<Counter>;
const counterKey = (kind: 'res' | 'item', id: string) => kind + ':' + id;
// What a counter regains on this event: 'all', a number or die (its regain), or nothing. Short Rest: Short Rest counters
// in full, Long Rest counters by their Short Rest regain. Long Rest: Short and Long Rest counters in full. Dawn: Dawn
// counters by their dawn regain, else in full.
function regainFor(x: Partial<Counter>, e: RestEvent): 'all' | string | null {
  const rc = rechargeOf(x);
  if (e === 'long') return rc === 'long' || rc === 'short' ? 'all' : null;
  if (e === 'short') return rc === 'short' ? 'all' : rc === 'long' && x.regainOn === 'short' && x.regain ? x.regain : null;
  return rc !== 'dawn' ? null : x.regainOn === 'dawn' && x.regain ? x.regain : 'all';
}
const counters = (c: Character): ['res' | 'item', Counted][] =>
  [...c.res.map((r) => ['res', r] as ['res', Counted]), ...c.inv.filter((i) => i.count !== undefined).map((i) => ['item', i] as ['item', Counted])];
// The counters whose regain for this event is a die roll, below their maximum: the app asks for each roll first.
export function restRolls(c: Character, e: RestEvent): RollAsk[] {
  return counters(c).flatMap(([kind, x]) => {
    const g = regainFor(x, e), m = maxOf(c, x);
    return g && g !== 'all' && /d/.test(g) && m !== null && (x.count ?? 0) < m ? [{ key: counterKey(kind, x.id), name: x.name, dice: g }] : [];
  });
}
// Refills resources and item charges for an event, up to their maximum; a counter with no maximum is never refilled.
// rolls: the rolled totals of die regains, by restRolls key. names: 'Wild Shape +1' for each that went up.
export function refillFor(c: Character, e: RestEvent, rolls: Record<string, number> = {}): { res: Resource[]; inv: Item[]; names: string[] } {
  const names: string[] = [];
  const fill = <T extends Counted>(kind: 'res' | 'item', x: T): T => {
    const g = regainFor(x, e), m = maxOf(c, x), n = x.count ?? 0;
    if (!g || m === null) return x;
    const add = g === 'all' ? m : /d/.test(g) ? rolls[counterKey(kind, x.id)] ?? 0 : num(c, g);
    const next = Math.max(n, Math.min(m, n + add));
    if (next > n) names.push(x.name + ' +' + (next - n));
    return next === n ? x : { ...x, count: next };
  };
  const res = c.res.map((r) => fill('res', r));
  const inv = c.inv.map((i) => (i.count === undefined ? i : fill('item', i)));
  return { res, inv, names };
}

// Dawn: counters that recharge at dawn (magic items, some features). Not a rest, so it needs no HP.
export function dawn(c: Character, rolls?: Record<string, number>): Character {
  const { res, inv, names } = refillFor(c, 'dawn', rolls);
  return { ...c, res, inv, restMsg: { title: 'Dawn', body: names.length ? 'Regained: ' + names.join(', ') + '.' : 'Nothing regains at dawn.' } };
}

// Either rest needs at least 1 HP to start (PHB p.370, p.373), and a dead character can't rest.
const restBlocked = (c: Character, title: string): Character | null =>
  isDead(c) ? { ...c, restMsg: { title, body: 'The character is dead.' } }
    : c.hp === 0 ? { ...c, restMsg: { title, body: 'A rest can only start with at least 1 HP. Heal first.' } }
      : null;

// A Long Rest also returns a reduced HP maximum and reduced ability scores to normal (PHB p.370).
// Raised values (from items or spells) are left alone.
export function longRest(c: Character): Character {
  const blocked = restBlocked(c, 'No Long Rest');
  if (blocked) return blocked;
  const { res, inv, names: refilled } = refillFor(c, 'long');
  const dawnNames = counters(c).filter(([, x]) => rechargeOf(x) === 'dawn').map(([, x]) => x.name);
  const maxHp = c.origOn && c.maxHp < c.origHp ? c.origHp : c.maxHp;
  const abilAdj = Object.fromEntries(Object.entries(c.abilAdj).map(([k, v]) => [k, Math.max(0, v || 0)]));
  // Shield lasts a round, Mage Armor 8 hours, Barkskin 1 hour (PHB p.316, p.293, p.245): none outlasts a Long Rest.
  const ended = c.acOn.map((id) => c.spells.find((x) => x.id === id)?.name).filter((n): n is string => !!n);
  const restored = [
    maxHp > c.maxHp ? ', HP maximum back to ' + maxHp : '',
    Object.values(c.abilAdj).some((v) => (v || 0) < 0) ? ', reduced ability scores restored' : ''
  ].join('');
  return {
    ...c, maxHp, abilAdj, hp: maxHpOf({ ...c, maxHp, abilAdj }), temp: 0, slotUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], hdUsed: 0, ds: 0, df: 0, free: {}, acOn: [], effectsOn: [],
    hpUndo: null, concCheck: null, res, inv, exh: Math.max(0, c.exh - 1),
    restMsg: {
      title: 'Long Rest complete',
      body: 'HP set to max, temp HP cleared, all spell slots, Hit Dice and free casts restored' + restored +
        (c.exh ? ', Exhaustion −1' : '') + (refilled.length ? '. Refilled: ' + refilled.join(', ') : '') +
        (ended.length ? '. ' + ended.join(', ') + ' ended' : '') + '.' +
        (dawnNames.length ? ' Dawn: ' + dawnNames.join(', ') + ' regain at dawn (menu → Dawn).' : '')
    }
  };
}

export function shortRest(c: Character, rolls?: Record<string, number>): Character {
  const blocked = restBlocked(c, 'No Short Rest');
  if (blocked) return blocked;
  const { res, inv, names: refilled } = refillFor(c, 'short', rolls);
  const left = c.level - hdSpent(c);
  return {
    ...c, res, inv,
    restMsg: {
      title: 'Short Rest',
      body: (refilled.length ? 'Refilled: ' + refilled.join(', ') + '. ' : 'No resources recharge on a Short Rest. ') +
        'Spend Hit Dice below: roll ' + hitDieRoll(c) + ' each (minimum 1), then Heal (' + left + ' left).'
    }
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const sameType = (def: unknown, v: unknown) => (Array.isArray(def) ? Array.isArray(v) : isObj(def) ? isObj(v) : typeof v === typeof def);
const strings = (v: unknown[]) => v.filter((x): x is string => typeof x === 'string');
// Spell slot counts for levels 0–9; anything missing or damaged counts as 0.
const slots = (v: unknown[]) => Array.from({ length: 10 }, (_, i) => (typeof v[i] === 'number' ? (v[i] as number) : 0));
// Records with fixed keys: a missing or damaged key falls back to the blank character's value.
const FIXED_RECORDS = ['ch', 'abil', 'speeds', 'coins', 'notes'] as const;
// Lists of entries: each needs a name and holds only plain values.
const ENTRY_LISTS = ['senses', 'res', 'attacks', 'riders', 'inv', 'spells', 'feats', 'acMods', 'grants', 'profs', 'defenses'] as const;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const isEntry = (x: unknown): x is Record<string, unknown> =>
  isObj(x) && typeof x.name === 'string' && Object.values(x).every((v) => v === null || typeof v !== 'object');
// Top-level fields added after the first release. A save without one gets the blank character's value, never
// the sample's (roadmap, "Saves keep working"). Each later field adds its key here.
const WHENS: When[] = ['armor', 'noHeavy', 'noArmor', 'noShield', 'noArmorNoShield', 'active'];
// The link fields of an entry, checked on load: an unknown source kind reads as Other, any other bad value goes, and
// the fields that need a link go from an entry without one. Never touches `lvl` (a spell's level).
function cleanLinked<T extends Linked>(x: T): T {
  const { from, srcKind, srcName, when, minLvl, needEq, needAtt, ...rest } = x as Linked & Record<string, unknown>;
  const out = {
    ...rest,
    ...(typeof from === 'string' ? { from } : {}),
    ...(srcKind == null ? {} : { srcKind: SRC_KINDS.some(([k]) => k === srcKind) ? srcKind : 'other' }),
    ...(typeof srcName === 'string' ? { srcName } : {}),
    ...(WHENS.includes(when as When) ? { when } : {}),
    ...(Number.isInteger(minLvl) && minLvl! >= 1 && minLvl! <= 20 ? { minLvl } : {}),
    ...(typeof needEq === 'boolean' ? { needEq } : {}),
    ...(typeof needAtt === 'boolean' ? { needAtt } : {})
  } as unknown as T;
  return out.from === undefined ? dropLinkOnly(out) : out;
}
const RECHARGES: Recharge[] = ['none', 'short', 'long', 'dawn'];
// Counter fields of an item on load (resources: cleanResource). A recharge it didn't have stays unset.
function cleanCounter({ count, max, maxV, recharge, regain, regainOn }: Partial<Record<keyof Counter, unknown>>): Partial<Counter> {
  const rc = recharge === undefined ? undefined : RECHARGES.includes(recharge as Recharge) ? (recharge as Recharge) : 'none';
  const pair = typeof regain === 'string' && isValue(regain) && ((regainOn === 'short' && rc === 'long') || (regainOn === 'dawn' && rc === 'dawn'));
  return {
    count: count as number, ...(finite(max) && max >= 1 ? { max } : {}), ...(typeof maxV === 'string' && isValue(maxV) && !/d/.test(maxV) ? { maxV } : {}),
    ...(rc ? { recharge: rc } : {}), ...(pair ? { regain, regainOn: regainOn as Counter['regainOn'] } : {})
  };
}
// Resource fields on load: a fixed max of at least 1, a formula without dice, a known recharge, a regain only with the
// recharge it goes with (on a Short Rest for Long Rest, at dawn for Dawn), text fields as strings.
function cleanResource(r: Resource): Resource {
  const { count, max, maxV, recharge, regain, regainOn, typeName, note, casts, inv: _inv, ...rest } = r as Resource & Record<string, unknown>;
  const rc = RECHARGES.includes(recharge as Recharge) ? (recharge as Recharge) : 'none';
  const pair = typeof regain === 'string' && isValue(regain) && ((regainOn === 'short' && rc === 'long') || (regainOn === 'dawn' && rc === 'dawn'));
  return cleanLinked({
    ...rest, count: finite(count) ? count : 0,
    ...(finite(max) && max >= 1 ? { max } : {}),
    ...(typeof maxV === 'string' && isValue(maxV) && !/d/.test(maxV) ? { maxV } : {}),
    recharge: rc, ...(pair ? { regain, regainOn } : {}),
    ...(typeof typeName === 'string' ? { typeName } : {}), ...(typeof note === 'string' ? { note } : {}), ...(typeof casts === 'string' ? { casts } : {})
  } as Resource);
}
const cleanCid = <T extends { cid?: string }>(x: T): T => { const { cid, ...rest } = x; return (typeof cid === 'string' ? { ...rest, cid } : rest) as T; };

export const NEW_FIELDS: readonly (keyof Character)[] = ['spellSort', 'size', 'carryUp', 'attuneIds', 'grants', 'effectsOn', 'profs', 'defenses'];
// Resources the Inventory tab echoed before `inv` existed.
const OLD_INVENTORY_RESOURCES = ['arrows', 'potions'];

// Builds a full character from a save or a backup. Missing fields come from the sample character, as before;
// values of the wrong type fall back too, so damaged data can't crash the sheet on every launch.
export function migrate(data: unknown): Character {
  const def = sampleCharacter(), blank = blankCharacter();
  if (!isObj(data)) return def;
  const d = { ...def } as Record<string, unknown>;
  for (const [k, dv] of Object.entries(def)) {
    if (data[k] !== undefined && (dv === null || sameType(dv, data[k]))) d[k] = data[k];
  }
  for (const k of NEW_FIELDS) if (!sameType(blank[k], data[k])) d[k] = blank[k];
  for (const k of FIXED_RECORDS) {
    const v = d[k] as Record<string, unknown>, base = blank[k] as Record<string, unknown>;
    d[k] = Object.fromEntries(Object.entries(base).map(([kk, bv]) => [kk, sameType(bv, v[kk]) ? v[kk] : bv]));
  }
  for (const k of ENTRY_LISTS) {
    d[k] = (d[k] as unknown[]).filter(isEntry).map((x) => (typeof x.id === 'string' ? x : { ...x, id: newId() }));
  }
  const c = d as unknown as Character;
  c.senses = c.senses.map(({ desc, ...se }) => cleanLinked({ ...se, ...(typeof desc === 'string' ? { desc } : {}) }));
  // Spells named their source in a `source` text before links; it becomes srcName unless one is set.
  c.spells = c.spells.map((x) => {
    const { source, castAb, ...sp } = x as Spell & { source?: unknown };
    const named = typeof source === 'string' && source.trim() && sp.srcName === undefined ? { srcName: source } : {};
    return cleanCid(cleanLinked({ ...sp, ...named, ...(ABILITIES.some(([k]) => k === castAb) ? { castAb } : {}) }));
  });
  c.feats = c.feats.map((x) => cleanCid(cleanLinked(x)));
  c.attacks = c.attacks.map(cleanLinked);
  c.profs = c.profs.filter((p) => PROF_CATS.includes(p.cat));
  // Saves from before proficiencies were data: their Training features become proficiencies, once.
  if (data.profs === undefined) ({ feats: c.feats, profs: c.profs } = splitTraining(c.feats));
  // Grants: a link that doesn't parse goes first, so grantErrors knows the source kind; then the grant must be valid.
  c.grants = c.grants.filter((g) => parseLink(g.from) && !grantErrors(g, parseLink(g.from)!.kind).length).map(cleanLinked);
  c.inv = c.inv.map(cleanCid);
  // Saves from before defenses were entries kept string lists in `def` (no longer a field, so read from the raw save).
  if (data.defenses === undefined) {
    const raw = isObj(data.def) ? data.def : {};
    const def = Object.fromEntries(DEFENSE_KINDS.map((k) => [k, Array.isArray(raw[k]) ? strings(raw[k] as unknown[]) : []])) as Record<DefenseKind, string[]>;
    // Resistance and Vulnerability apply to damage types only; Immunity to damage types and conditions (PHB p.28).
    // Older saves could list a condition under Resistances, meaning Advantage on saves against it, and had a free-text
    // save note. Both move to Advantage on saves. The note is no longer a field either.
    const addAdv = (t: string) => { if (!def.adv.includes(t)) def.adv.push(t); };
    if (typeof data.saveNotes === 'string' && data.saveNotes.trim()) addAdv(data.saveNotes.trim());
    def.res.filter((n) => CONDITION_OPTIONS.includes(n)).forEach((n) => addAdv('vs ' + n));
    def.res = def.res.filter((n) => !CONDITION_OPTIONS.includes(n));
    c.defenses = DEFENSE_KINDS.flatMap((kind) => def[kind].map((name) => ({ id: newId(), kind, name })));
  }
  c.defenses = c.defenses.filter((d) => DEFENSE_KINDS.includes(d.kind)).map(cleanLinked);
  c.slotMax = slots(c.slotMax);
  c.slotUsed = slots(c.slotUsed);
  // These values size lists of buttons, so an out-of-range number could freeze the sheet. Limits match the UI.
  c.level = clamp(c.level, 1, 20);
  c.slotMax = c.slotMax.map((n) => clamp(n, 0, 9));
  c.slotUsed = c.slotUsed.map((n, i) => clamp(n, 0, c.slotMax[i]));
  c.exh = clamp(c.exh, 0, 6);
  c.ds = clamp(c.ds, 0, 3);
  c.df = clamp(c.df, 0, 3);
  c.hdUsed = clamp(c.hdUsed, 0, c.level);
  if (!TABS.some(([t]) => t === c.tab)) c.tab = def.tab;
  if (!Object.hasOwn(CAST_NAMES, c.castAb)) c.castAb = 'none';
  if (c.spellFilter !== 'prepared') c.spellFilter = 'all';
  if (!SPELL_SORTS.some(([k]) => k === c.spellSort)) c.spellSort = 'az';
  if (!SIZES.some(([k]) => k === c.size)) c.size = 'medium';
  // Nullable fields: keep only well-formed values. The undo row lasts seconds, so it never survives a reload.
  const conc = c.conc as unknown;
  c.conc = isObj(conc) && typeof conc.id === 'string' && typeof conc.name === 'string' ? c.conc : null;
  // Older versions kept Concentration on a spell after removing it. Checked after the entry filter above.
  if (c.conc && !c.spells.some((x) => x.id === c.conc!.id)) c.conc = null;
  c.hpUndo = null;
  // Inspiration is a counter, 0 or more. This deliberately departs from the rules, where a character has at most one
  // Heroic Inspiration (PHB p.13, p.368): the book says it doesn't stack, the sheet counts it with no maximum (house rule).
  // Older saves had an on/off flag; the type changed, so read the raw save.
  const insp = data.insp;
  c.insp = typeof insp === 'boolean' ? Number(insp) : finite(insp) ? Math.max(0, Math.floor(insp)) : 0;
  if (typeof c.concCheck !== 'string') c.concCheck = null;
  const msg = c.restMsg as unknown;
  c.restMsg = isObj(msg) && typeof msg.title === 'string' && typeof msg.body === 'string' ? c.restMsg : null;
  // Older saves had no prepared flags: treat their levelled spells as prepared.
  c.spells = c.spells.map((x) => (x.prep === undefined && x.always === undefined ? { ...x, prep: true } : x));
  // AC fields: a damaged one would show NaN or join strings, so it goes, with its partner field.
  c.acMods = c.acMods.filter((m) => finite(m.val));
  if (!Object.hasOwn(UNARMORED, c.acUnarm)) c.acUnarm = 'none';
  c.inv = c.inv.map(({ armor, acBase, acBonus, wt, desc, count, max, maxV, recharge, regain, regainOn, ...i }) => ({
    ...i,
    // Charges: only with a count; the other fields as on resources.
    ...(finite(count) ? cleanCounter({ count, max, maxV, recharge, regain, regainOn }) : {}),
    ...(['light', 'medium', 'heavy', 'shield'].includes(armor as string) && finite(acBase) ? { armor, acBase } : {}),
    ...(finite(acBonus) ? { acBonus } : {}),
    ...(finite(wt) && wt >= 0 ? { wt } : {}),
    ...(typeof desc === 'string' ? { desc } : {})
  }));
  c.spells = c.spells.map(({ acFx, acVal, ...x }) => ({ ...x, ...(AC_EFFECTS.includes(acFx as AcEffect) && finite(acVal) ? { acFx, acVal } : {}) }));
  c.acOn = strings(c.acOn).filter((id) => c.spells.some((x) => x.id === id && x.acFx && !x.c));
  // An AC bonus on an item that isn't armor becomes an AC bonus grant that needs the item equipped, as it counted before;
  // only armor and Shields keep acBonus. A whole non-zero number converts; 0 goes; anything else stays on the item,
  // uncounted, for the player to fix. Runs before the old-ac step, whose total must already include the grant.
  c.inv = c.inv.map((i) => {
    if (i.armor || i.acBonus === undefined) return i;
    const { acBonus: v, ...rest } = i;
    if (!Number.isInteger(v) || v === 0) return v === 0 ? rest : i;
    c.grants = [...c.grants, { id: newId(), kind: 'ac', name: fmt(v) + ' AC', acMode: 'bonus', val: String(v), from: linkOf('item', i.id), srcKind: 'item', needEq: true }];
    return rest;
  });
  // Old saves had a typed `ac`. Fill armor and AC spells from their names (switching none on), then add the
  // difference as a custom bonus so the number doesn't move. New saves have no `ac`, so this runs once.
  if (typeof data.ac === 'number') {
    c.inv = c.inv.map((i) => (i.armor ? i : { ...i, ...detectArmor(i.name) }));
    c.spells = c.spells.map((x) => (x.acFx ? x : { ...x, ...detectAcSpell(x.name) }));
    const total = armorClass(c).total;
    if (total !== data.ac) c.acMods = [...c.acMods, { id: newId(), name: 'Adjustment (from old AC)', val: data.ac - total }];
  }
  // Saves from before attunement by item id have no attuneIds. The one-time steps below run only on those, so they
  // never change entries the player adds later (roadmap, "Saves keep working").
  const oldSave = data.attuneIds === undefined;
  // The legacy "Also list in Inventory" flag is no longer a Resource field: read it untyped.
  const invOf = (r: Resource) => (r as Resource & { inv?: unknown }).inv;
  if (oldSave) c.res = c.res.map((r) => (invOf(r) === undefined && OLD_INVENTORY_RESOURCES.includes(r.id) ? { ...r, inv: true } as Resource : r));
  // Older saves had a `refill` flag that meant a Long Rest recharge. Resource no longer declares it: read it untyped.
  c.res = c.res.map((r) => {
    const { refill, ...x } = r as Resource & { refill?: unknown };
    return { ...x, recharge: x.recharge || (refill ? 'long' : 'none') };
  });
  const converted: string[] = [];
  if (oldSave) {
    // Resources also listed in the Inventory become items. One with a maximum or a recharge moves below, with charges.
    const added: string[] = [];
    c.res = c.res.filter((r) => {
      if (!invOf(r) || r.max || rechargeOf(r) !== 'none') return true;
      const note = typeof r.note === 'string' ? r.note.trim() : '';
      const item: Item = { id: newId(), name: r.name, qty: finite(r.count) ? Math.max(0, Math.floor(r.count)) : 1, eq: false, ...(note ? { desc: note } : {}) };
      c.inv = [...c.inv, item];
      added.push(item.id);
      converted.push(r.id);
      return false;
    });
    // Attunement slots held names. A name links the first item with that name not already in a slot; other text
    // becomes a new equipped item, so nothing is lost. Never run detectArmor here: a slot reading "Shield" would move AC.
    // A matched item keeps its eq flag, except a just-converted resource, which is equipped like a new item.
    const oldAttune: unknown[] = Array.isArray(data.attune) ? data.attune : [];
    const linked: string[] = [];
    c.attuneIds = [0, 1, 2].map((i) => {
      const v = oldAttune[i];
      if (typeof v !== 'string' || !/[\p{L}\p{N}]/u.test(v) || normName(v) === 'none') return '';
      const match = c.inv.find((it) => normName(it.name) === normName(v) && !linked.includes(it.id));
      const id = match ? match.id : newId();
      if (!match) c.inv = [...c.inv, { id, name: v.trim(), qty: 1, eq: true }];
      else if (added.includes(id)) c.inv = c.inv.map((it) => (it.id === id ? { ...it, eq: true } : it));
      linked.push(id);
      return id;
    });
  }
  // Resources still listed in the Inventory (with a maximum or a recharge) move onto items with charges. An item of the
  // same name without charges (such as one an attunement slot made above) takes them; otherwise a new item. Runs after
  // the steps above, so it never converts a resource the player adds later (there is no flag to set any more).
  c.res = c.res.filter((r) => {
    if (!invOf(r)) return true;
    const note = typeof r.note === 'string' ? r.note.trim() : '';
    const charged = (finite(r.max) && r.max >= 1) || rechargeOf(r) !== 'none';
    const n = finite(r.count) ? Math.max(0, Math.floor(r.count)) : charged ? 0 : 1;
    const same = charged ? c.inv.find((it) => it.count === undefined && normName(it.name) === normName(r.name)) : undefined;
    const fields: Partial<Item> = charged ? { count: n, ...(finite(r.max) && r.max >= 1 ? { max: r.max } : {}), recharge: rechargeOf(r) } : {};
    if (same) c.inv = c.inv.map((it) => (it === same ? { ...it, ...fields, ...(note && !it.desc ? { desc: note } : {}) } : it));
    else c.inv = [...c.inv, { id: newId(), name: r.name, qty: charged ? 1 : n, eq: false, ...fields, ...(note ? { desc: note } : {}) }];
    converted.push(r.id);
    return false;
  });
  c.res = c.res.map(cleanResource);
  // Three slots, each an existing item id or ''. Checked slot by slot, so a bad slot never shifts the ones after it.
  const ids: unknown[] = c.attuneIds;
  c.attuneIds = [];
  for (let i = 0; i < 3; i++) {
    const x = ids[i];
    c.attuneIds.push(typeof x === 'string' && c.inv.some((it) => it.id === x) && !c.attuneIds.includes(x) ? x : '');
  }
  // From the raw save, not the sample-merged copy: old saves get today's bar (HP and AC), not the sample's picks.
  // Pills don't show items, so a pill of a resource that became an item empties.
  c.pills = sanitizePills(data.pills).map((k) => (converted.some((id) => k === resPill(id)) ? '' : k));
  // Effects switched on: links to something there, once each. A Concentration spell's effect follows c.conc instead.
  c.effectsOn = strings(c.effectsOn).filter((l, i, all) => all.indexOf(l) === i && sourceOf(c, l) && !(parseLink(l)!.kind === 'spell' && (sourceOf(c, l) as Spell).c));
  const fixed = fixLinks(c);
  // A grant exists only through its source: one whose link fixLinks cleared goes.
  return normalize({ ...fixed, grants: fixed.grants.filter((g) => g.from) });
}

const DEFENSE_KINDS: DefenseKind[] = ['res', 'vul', 'imm', 'adv'];

// Active entries with the same name (normName) show once, listing every source.
function merged<T extends Linked & { id: string; name: string }>(c: Character, list: T[]): { key: string; first: T; all: T[] }[] {
  const out: { key: string; first: T; all: T[] }[] = [];
  for (const x of list.filter((e) => isActive(c, e))) {
    const key = normName(x.name), row = out.find((r) => r.key === key);
    if (row) row.all.push(x); else out.push({ key, first: x, all: [x] });
  }
  return out;
}
const sourcesOf = (c: Character, all: Linked[]) => [...new Set(all.map((x) => sourceLabel(c, x)).filter((s): s is string => !!s))];
// One row per sense name. Ranges compare by their leading number and the longest wins; when any range has no number,
// the distinct ranges show together rather than guess (spec).
export function mergedSenses(c: Character): { key: string; name: string; range: string; ids: string[]; sources: string[] }[] {
  return merged(c, c.senses).map(({ key, first, all }) => {
    const n = (r: string) => r.match(/^\s*(\d+)/)?.[1];
    const range = all.every((x) => n(x.range) !== undefined)
      ? all.reduce((b, x) => (Number(n(x.range)) > Number(n(b.range)) ? x : b)).range
      : [...new Set(all.map((x) => x.range))].join(' / ');
    return { key, name: first.name, range, ids: all.map((x) => x.id), sources: sourcesOf(c, all) };
  });
}
export const mergedDefenses = (c: Character, kind: DefenseKind): { key: string; name: string; ids: string[]; sources: string[] }[] =>
  merged(c, c.defenses.filter((d) => d.kind === kind)).map(({ key, first, all }) => ({ key, name: first.name, ids: all.map((x) => x.id), sources: sourcesOf(c, all) }));
// Removes one defense (until removeRef handles every kind).
export const removeDefense = (c: Character, id: string): Character => ({ ...c, defenses: c.defenses.filter((d) => d.id !== id) });

const PROF_CATS: ProfCat[] = ['armor', 'weapon', 'tool', 'language'];
// Armor, weapon, tool and language proficiencies: the hand ones (with id), then the granted ones (with their source),
// once per name within a category.
export function profList(c: Character): { cat: ProfCat; name: string; id?: string; by?: string }[] {
  const out: { cat: ProfCat; name: string; id?: string; by?: string }[] = c.profs.map((p) => ({ cat: p.cat, name: p.name, id: p.id }));
  for (const g of activeGrants(c, 'prof', true)) {
    if (!PROF_CATS.includes(g.cat as ProfCat)) continue;
    const name = g.target ?? g.name, by = sourceLabel(c, g);
    const same = out.find((p) => p.cat === g.cat && normName(p.name) === normName(name));
    if (same) same.by ??= by;
    else out.push({ cat: g.cat as ProfCat, name, ...(by ? { by } : {}) });
  }
  return out;
}
export const hasProf = (c: Character, cat: ProfCat, name: string) => profList(c).some((p) => p.cat === cat && normName(p.name) === normName(name));

// Older saves kept proficiencies as Training features ("Armor: Light, Medium, Shields"). Each comma part that names a
// proficiency becomes one; the rest stays in the feature, and a feature with nothing left goes. Under an Armor,
// Weapons, Tools or Languages heading a short form matches too ("Light"); under any other heading only full names do.
const TRAINING_CATS: Record<string, ProfCat> = { armor: 'armor', weapons: 'weapon', tools: 'tool', languages: 'language' };
export function splitTraining(feats: Feature[]): { feats: Feature[]; profs: Prof[] } {
  const profs: Prof[] = [];
  const out = feats.flatMap((f) => {
    if (f.g !== 'training') return [f];
    const cat = TRAINING_CATS[normName(f.name)];
    const left = f.desc.split(',').map((x) => x.trim()).filter(Boolean).filter((part) => {
      const n = normName(part);
      const hit = PROF_NAMES.find((p) => (cat ? p.cat === cat && (normName(p.name) === n || (p.short && normName(p.short) === n)) : normName(p.name) === n));
      if (hit) profs.push({ id: newId(), cat: hit.cat, name: hit.name });
      return !hit;
    });
    return left.length ? [{ ...f, desc: left.join(', ') }] : [];
  });
  return { feats: out, profs };
}

// Names match after trimming, ignoring case and treating ’ and ' as the same character.
export const normName = (s: string) => s.trim().toLowerCase().replace(/’/g, "'");

// The item form's "AC bonus while equipped": the item's single AC bonus grant is written, updated or (at 0) removed.
export function itemAcGrants(c: Character, itemId: string, v: number, needAtt: boolean): Grant[] {
  const from = linkOf('item', itemId);
  const old = c.grants.find((g) => g.from === from && g.kind === 'ac' && g.acMode === 'bonus');
  if (!v) return old ? c.grants.filter((g) => g !== old) : c.grants;
  const g: Grant = { id: old?.id ?? newId(), kind: 'ac', name: fmt(v) + ' AC', acMode: 'bonus', val: String(v), from, srcKind: 'item', needEq: true, ...(needAtt ? { needAtt } : {}) };
  return old ? c.grants.map((x) => (x === old ? g : x)) : [...c.grants, g];
}

// The one way to remove an item: its attunement slot empties with it, and its grants go.
export function removeItem(c: Character, id: string): Character {
  const link = linkOf('item', id);
  return { ...c, inv: c.inv.filter((i) => i.id !== id), attuneIds: c.attuneIds.map((x) => (x === id ? '' : x)), grants: c.grants.filter((g) => g.from !== link) };
}

// Top bar pills. [key, picker name, short label], in picker order.
export type PillStat = 'hp' | 'ac' | 'dc' | 'speed' | 'pp' | 'init' | 'atk' | 'hd' | 'insp';
export const PILL_STATS: [PillStat, string, string][] = [
  ['hp', 'HP', 'HP'], ['ac', 'AC', 'AC'], ['dc', 'Spell save DC', 'DC'], ['speed', 'Speed', 'Speed'], ['pp', 'Passive Perception', 'Perc'],
  ['init', 'Initiative', 'Init'], ['atk', 'Spell attack', 'Atk'], ['hd', 'Hit Dice left', 'HD'], ['insp', 'Inspiration', 'Insp']
];
export const resPill = (id: string) => 'res:' + id;
export type PillTarget = { sec: 'sec-hp' | 'sec-vitals' | 'sec-senses' | 'sec-resources' } | { tab: Tab };
export interface PillView { key: string; label: string; value: string; max?: string; target: PillTarget }

// What a slot shows. Null for an empty slot, an unknown key, or a resource that was deleted.
export function pillView(c: Character, key: string): PillView | null {
  if (key.startsWith('res:')) {
    const r = c.res.find((x) => resPill(x.id) === key);
    const m = r && maxOf(c, r);
    return r ? { key, label: r.name, value: String(r.count), max: m === null ? undefined : String(m), target: { sec: 'sec-resources' } } : null;
  }
  const stat = PILL_STATS.find(([k]) => k === key);
  if (!stat) return null;
  const label = stat[2], atk = spellAttack(c);
  switch (stat[0]) {
    case 'hp': return { key, label, value: String(c.hp), max: String(maxHpOf(c)), target: { sec: 'sec-hp' } };
    case 'ac': return { key, label, value: String(armorClass(c).total), target: { sec: 'sec-vitals' } };
    case 'dc': return { key, label, value: String(spellSaveDC(c) ?? '—'), target: { tab: 'spells' } };
    case 'speed': return { key, label, value: String(speedNow(c)), target: { sec: 'sec-vitals' } };
    case 'pp': return { key, label, value: String(passiveScore(c, 'perception')), target: { sec: 'sec-senses' } };
    case 'init': return { key, label, value: fmt(initiative(c)), target: { sec: 'sec-vitals' } };
    case 'atk': return { key, label, value: atk === null ? '—' : fmt(atk), target: { tab: 'spells' } };
    case 'hd': return { key, label, value: String(c.level - hdSpent(c)), max: String(c.level), target: { sec: 'sec-hp' } };
    case 'insp': return { key, label, value: String(c.insp), target: { sec: 'sec-resources' } };
  }
}

// Puts `key` in `slot` ('' empties it). A key fills one slot at a time, so it leaves any other slot.
export function setPill(pills: string[], slot: number, key: string): string[] {
  return [0, 1, 2].map((i) => (i === slot ? key : pills[i] === key ? '' : pills[i] ?? ''));
}

// Always 3 slots. Keeps stat keys and resource keys, drops anything else and repeats.
export function sanitizePills(v: unknown): string[] {
  if (!Array.isArray(v)) return ['hp', 'ac', ''];
  const out: string[] = [];
  for (let i = 0; i < 3; i++) {
    const x = v[i];
    const ok = typeof x === 'string' && (PILL_STATS.some(([k]) => k === x) || x.startsWith('res:')) && !out.includes(x);
    out.push(ok ? x : '');
  }
  return out;
}

export const newId = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
