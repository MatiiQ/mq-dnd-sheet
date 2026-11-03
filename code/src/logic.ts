// D&D 2024 rules used by the sheet. Pure functions: each takes a character and returns the next one.
import { blankCharacter } from './defaults';
import { grantErrors, isDtypes, ITEM_CATS, partErrors, type GrantSpec } from './catalog/schema';
import { hasDice, isValue, valueAt, type ValueCtx } from './catalog/value';
import { PROF_NAMES, type ProfCat } from './catalog/names';
import { canLoad, setHands } from './hands';
import { activeGrants, dropLinkOnly, fixLinks, GROUP_SRC, hasActiveEffect, inactiveReason, isActive, isEquipped, LINKED_LISTS, srcKindOfLink, type SourceKind, linkOf, parseLink, sourceLabel, sourceOf, SRC_KINDS } from './links';
import type { AcEffect, Ability, ArmorKind, CastAbility, Character, Coin, Concentration, Counter, DefenseKind, Feature, Grant, HpSnapshot, Item, Prof, Linked, Recharge, Resource, Size, Spell, SpeedKind, SpellSort, Tab, Unarmored, When } from './types';

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
// Conditions a defense can name: the list above plus Exhaustion, which the sheet tracks as a level.
export const CONDITION_OPTIONS = [...CONDITIONS.slice(0, 3), 'Exhaustion', ...CONDITIONS.slice(3)];
const INCAPACITATING = ['Incapacitated', 'Paralyzed', 'Petrified', 'Stunned', 'Unconscious'];
const ZERO_SPEED = ['Grappled', 'Restrained', 'Paralyzed', 'Petrified', 'Unconscious'];

export const abilityName = (a: Ability) => ABILITIES.find(([k]) => k === a)![1];
export const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// Slot levels as the Cast buttons name them.
export const ORDINAL = ['Cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
export const toggled = <T,>(list: T[], x: T): T[] => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const fmt = (m: number) => (m >= 0 ? '+' + m : '−' + Math.abs(m));
export const mod = (score: number) => Math.floor((score - 10) / 2);
export const profBonus = (level: number) => 2 + Math.floor((level - 1) / 4);
// Context for grant values: level, Proficiency Bonus and ability modifiers, and with a grant, the magic (+N) of the item
// it comes from (Wand of the War Mage's spell attack; 0 from no item or an item without magic, plan 7).
export const valueCtx = (c: Character, g?: { from?: string }): ValueCtx => {
  const p = parseLink(g?.from), magic = p?.kind === 'item' ? c.inv.find((i) => i.id === p.id)?.magic : undefined;
  return { level: c.level, pb: profBonus(c.level), mod: (a) => abilityMod(c, a), ...(magic ? { magic } : {}) };
};
const numIn = (ctx: ValueCtx, v: string | undefined) => { const n = v === undefined ? 0 : valueAt(v, ctx); return typeof n === 'number' ? n : 0; };
// A grant value as a number now; dice or no value count as 0. Pass the grant whenever v is its value (`magic`).
export const num = (c: Character, v: string | undefined, g?: { from?: string }) => numIn(valueCtx(c, g), v);
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
  const set = top ? numIn(ctx, top.val) : 0;
  if (top && set > s) { parts.push({ label: top.name, value: set - s, note: 'sets ' + set }); s = set; }
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
  activeGrants(c, 'checkBonus').filter((g) => targets.includes(g.target ?? '')).reduce((t, g) => t + num(c, g.val, g), 0);
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
  activeGrants(c, 'saveBonus').filter((g) => g.ab === k || g.ab === 'all').reduce((t, g) => t + num(c, g.val, g), 0);
// Spell save DC = 8 + spellcasting ability modifier + PB; spell attack = modifier + PB (PHB p.41). null without a spellcasting
// ability. Active spellDc and spellAtk grants add to their own number only (Wand of the War Mage: a bonus to spell attack
// rolls; Robe of the Archmagi: spell save DC and spell attack bonus each +2, SRD 5.2.1 magic items).
const castGrantParts = (c: Character, kind: 'spellAtk' | 'spellDc'): AcPart[] =>
  activeGrants(c, kind).map((g) => ({ label: sourceOf(c, g.from)?.name ?? g.name, value: num(c, g.val, g) })).filter((p) => p.value !== 0);
const castBase = (c: Character, ab: Ability): AcPart[] => [{ label: CAST_NAMES[ab as CastAbility] + ' modifier', value: abilityMod(c, ab) }, { label: 'Proficiency Bonus', value: profBonus(c.level) }];
export const partsTotal = (parts: AcPart[]): number => parts.reduce((t, p) => t + p.value, 0);
// The same for one spell, which may cast with its own ability (Light Bearer: Light with CHA).
export const castAbOf = (c: Character, sp: Spell): Ability | null => sp.castAb ?? (c.castAb === 'none' ? null : c.castAb);
const atkParts = (c: Character, ab: Ability): AcPart[] => [...castBase(c, ab), ...castGrantParts(c, 'spellAtk')];
const dcParts = (c: Character, ab: Ability): AcPart[] => [{ label: 'Base', value: 8 }, ...castBase(c, ab), ...castGrantParts(c, 'spellDc')];
export const spellSaveDcFor = (c: Character, sp: Spell) => { const ab = castAbOf(c, sp); return ab && partsTotal(dcParts(c, ab)); };
export const spellAttackFor = (c: Character, sp: Spell) => { const ab = castAbOf(c, sp); return ab && partsTotal(atkParts(c, ab)); };
// The same two numbers as parts, for the breakdown under each badge (PHB p.41): a shared base (modifier, PB), then each
// number's own grants, one part per grant labelled by its source. Their sums equal the values below.
export const spellAttackParts = (c: Character): AcPart[] | null => (c.castAb === 'none' ? null : atkParts(c, c.castAb));
export const spellDcParts = (c: Character): AcPart[] | null => (c.castAb === 'none' ? null : dcParts(c, c.castAb));
export const spellSaveDC = (c: Character) => { const p = spellDcParts(c); return p && partsTotal(p); };
export const spellAttack = (c: Character) => { const p = spellAttackParts(c); return p && partsTotal(p); };
// Initiative is a Dexterity check (PHB p.23), so Dexterity check bonus grants add; initMisc holds extra bonuses from
// features or items. No half PB: Jack of All Trades needs a skill check you aren't proficient in (PHB p.60), and
// Initiative uses no skill (the 2014 rule applied it to Initiative; the 2024 one doesn't).
export const initiative = (c: Character) => abilityMod(c, 'dex') + c.initMisc + checkBonus(c, ['dex']) +
  activeGrants(c, 'init').reduce((t, g) => t + num(c, g.val, g), 0);

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
  const key = name.trim().toLowerCase();
  if (!Object.hasOwn(AC_SPELLS, key)) return null;
  const fx = AC_SPELLS[key];
  return { acFx: fx[0], acVal: fx[1] };
}

export interface AcPart { label: string; value: number; note?: string; active?: boolean }
// A Concentration spell's AC effect is on exactly while concentrating on it; any other is on while in acOn.
export const acSpellActive = (c: Character, sp: Spell) => !!sp.acFx && (sp.c ? c.conc?.id === sp.id : c.acOn.includes(sp.id));

// Armor Class and the parts it is made of. Base AC is 10 + DEX; armor, spells and features give other base
// calculations, and only one applies (PHB p.12, p.361). The sheet picks the highest legal one.
// Light armor adds DEX, medium at most +2, heavy none (PHB p.219). Parts worth 0 are left out.
const armorValue = (i: Item) => (i.acBase || 0) + (i.acBonus || 0);
export function armorClass(c: Character): { total: number; parts: AcPart[] } {
  const dex = abilityMod(c, 'dex');
  const dexPart = (cap: number): AcPart => (dex > cap ? { label: 'Dexterity', value: cap, note: 'max +' + cap } : { label: 'Dexterity', value: dex });
  const armorParts = (it: Item): AcPart[] => [
    { label: it.name, value: armorValue(it), note: it.armor + ' armor' },
    ...(it.armor === 'heavy' ? [] : [dexPart(it.armor === 'medium' ? 2 : Infinity)])
  ];
  const shields = c.inv.filter((i) => isEquipped(i) && i.armor === 'shield');
  const shield = shields.reduce<Item | null>((b, i) => (!b || armorValue(i) > armorValue(b) ? i : b), null);
  const worn = c.inv.filter((i) => isEquipped(i) && i.armor && i.armor !== 'shield');
  const spells = c.spells.filter((sp) => acSpellActive(c, sp));
  const spellPart = (sp: Spell): AcPart => ({ label: sp.name, value: sp.acVal || 0, note: 'spell', active: true });
  const bare: AcPart[] = [{ label: 'Unarmored', value: 10 }, dexPart(Infinity)];
  const candidates: AcPart[][] = worn.map(armorParts);
  if (!worn.length) {
    const [note, ab, shieldOk] = UNARMORED[c.acUnarm];
    if (ab && (shieldOk || !shield)) {
      candidates.push([...bare, { label: abilityName(ab), value: abilityMod(c, ab), note }]);
    }
    // Unarmored base grants work like UNARMORED: 10 + DEX + an ability, lost with a Shield unless shieldOk.
    for (const g of activeGrants(c, 'ac').filter((x) => x.acMode === 'unarmored' && x.ab && (x.shieldOk !== false || !shield))) {
      candidates.push([...bare, { label: ABILITIES.find(([k]) => k === g.ab)?.[1] ?? g.ab!, value: abilityMod(c, g.ab as Ability), note: g.name }]);
    }
    // Mage Armor sets a base AC on a creature not wearing armor (PHB p.293).
    for (const sp of spells.filter((x) => x.acFx === 'base')) candidates.push([spellPart(sp), dexPart(Infinity)]);
    candidates.push(bare);
  }
  // Highest sum wins; on a tie the earlier candidate stays.
  const base = candidates.reduce((b, p) => (partsTotal(p) > partsTotal(b) ? p : b));
  const parts: AcPart[] = [
    ...base,
    ...(shield ? [{ label: shield.name, value: armorValue(shield), note: 'shield' }] : []),
    // AC bonus grants (Ring of Protection, Defense): they follow equip, attunement and armor conditions through
    // activeGrants. acBonus counts only on armor and Shields, inside their own part above.
    ...activeGrants(c, 'ac').filter((g) => g.acMode === 'bonus').map((g) => ({ label: g.name, value: num(c, g.val, g), ...(sourceLabel(c, g) ? { note: sourceLabel(c, g) } : {}) })),
    ...spells.filter((sp) => sp.acFx === 'bonus').map(spellPart),
    ...c.acMods.map((m) => ({ label: m.name, value: m.val, note: 'custom' }))
  ].filter((p) => p.value !== 0);
  // Barkskin: AC can't be lower than its value, so it comes last and adds only what is missing (PHB p.245).
  const floor = Math.max(0, ...spells.filter((sp) => sp.acFx === 'floor').map((sp) => sp.acVal || 0));
  const fl = spells.find((sp) => sp.acFx === 'floor' && sp.acVal === floor);
  const below = floor - partsTotal(parts);
  if (fl && below > 0) parts.push({ label: fl.name, value: below, note: 'AC at least ' + floor, active: true });
  return { total: partsTotal(parts), parts };
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

const castEffects = (c: Character, sp: Spell): Partial<Character> =>
  ({ ...(sp.c ? setConc({ id: sp.id, name: sp.name }) : {}), ...acOnCast(c, sp), ...effectOnCast(c, sp) });

// Casting with a slot uses one slot of that level. A Concentration spell starts Concentration, which ends any other (PHB p.363).
export function castSpell(c: Character, sp: Spell, level: number): Partial<Character> {
  if (!slotsLeft(c, level)) return {};
  return { ...setSlotUsed(c, level, c.slotUsed[level] + 1), ...castEffects(c, sp) };
}

// Switches a source's effect on or off (Rage, Starry Form, Shillelagh), without casting or using anything.
export const toggleEffect = (c: Character, link: string): Partial<Character> =>
  ({ effectsOn: toggled(c.effectsOn, link) });

// After editing a spell: one that is now Concentration leaves effectsOn (its effect follows c.conc from now on).
export function effectsAfterEdit(c: Character, sp: Pick<Spell, 'id' | 'c'>): Partial<Character> {
  const link = linkOf('spell', sp.id);
  return sp.c && c.effectsOn.includes(link) ? { effectsOn: c.effectsOn.filter((x) => x !== link) } : {};
}

// A free cast (a resource that casts the spell): with uses left it uses one and casts, like a slot; at 0 a tap gives
// one back and leaves the effects alone. Above 0 a tap never gives a use back (a multi-use resource is undone with
// its counter in Resources).
export function castFree(c: Character, sp: Spell, resId: string): Partial<Character> {
  const r = c.res.find((x) => x.id === resId);
  if (!r) return {};
  const res = c.res.map((x) => (x.id === resId ? { ...x, count: x.count > 0 ? x.count - 1 : 1 } : x));
  if (r.count <= 0) return { res };
  return { res, ...castEffects(c, sp) };
}
// The resources that cast this spell: its own free casts and a feature's (Favored Enemy's Hunter's Mark).
export const freeCastsOf = (c: Character, spellId: string) => c.res.filter((r) => r.casts === spellId);
// The free cast a spell gives itself ("Give it a free cast" in the spell form): a resource from the spell. A free cast
// a feat or feature grants for the spell (Magic Initiate's) is not one, and the form never changes it.
export const ownFreeCasts = (c: Character, spellId: string) => freeCastsOf(c, spellId).filter((r) => r.from === linkOf('spell', spellId));
// Switches the spell's own free cast (one cast a Long Rest, removed with the spell) on or off. oldName: the spell's
// name before an edit; a free cast named after it ('<old name> (free cast)', as this function names them) follows a
// rename. Any other name (one typed in Resources, an old save's) stays.
export function setOwnFreeCast(c: Character, spellId: string, on: boolean, oldName?: string): Character {
  const sp = c.spells.find((x) => x.id === spellId);
  if (!sp) return c;
  const has = ownFreeCasts(c, spellId), name = sp.name + ' (free cast)', old = oldName === undefined ? null : oldName + ' (free cast)';
  if (!on) return has.reduce((x, r) => removeResource(x, r.id), c);
  if (has.length) return { ...c, res: c.res.map((r) => (has.includes(r) && r.name === old ? { ...r, name } : r)) };
  return { ...c, res: [...c.res, { id: newId(), name, count: 1, max: 1, recharge: 'long', casts: spellId, from: linkOf('spell', spellId), srcKind: 'spell' }] };
}

// Switches a non-Concentration spell's AC effect on or off, without casting it.
export const toggleAcSpell = (c: Character, id: string): Partial<Character> =>
  ({ acOn: toggled(c.acOn, id) });

// After editing a spell: one that is now Concentration, or has no AC effect, leaves the list of active AC spells.
export function acAfterEdit(c: Character, sp: Pick<Spell, 'id' | 'c' | 'acFx'>): Partial<Character> {
  return c.acOn.includes(sp.id) && (sp.c || !sp.acFx) ? { acOn: c.acOn.filter((x) => x !== sp.id) } : {};
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
// Items count weight × quantity; fifty coins weigh a pound (PHB p.213). Items inside an extradimensional container and
// its coins don't count: only the container's own weight does (plan 6).
export function carriedWeight(c: Character): number {
  return c.inv.reduce((t, i) => t + (i.in ? 0 : (i.wt || 0) * i.qty), 0) + coinWeight(c.coins);
}

// Containers (plan 6). Only an extradimensional container (Bag of Holding, Handy Haversack, Portable Hole) holds items
// and coins; a plain one such as a Backpack is an ordinary item.
export const isContainer = (it: Item) => !!it.xdim;
export const COINS: Coin[] = ['cp', 'sp', 'ep', 'gp', 'pp'];
// Fifty coins weigh a pound (PHB p.213): a purse, or a container's own coins.
export const coinWeight = (x: Partial<Record<Coin, number>>) => COINS.reduce((t, k) => t + (x[k] || 0), 0) / 50;
export const withoutKeys = <T extends object>(x: T, keys: string[]): T => Object.fromEntries(Object.entries(x).filter(([k]) => !keys.includes(k))) as T;
// The container rules, run by migrate() and normalize() (the item form can switch a bag's kind at any time): an `in`
// naming a missing item, a non-container or the item itself, or set on a container, clears (so contents are one level
// deep); an item inside is not equipped; coins on an item that is not a container go to the purse. Returns c itself
// when nothing changes.
export function fixContainers(c: Character): Character {
  let changed = false;
  const coins = { ...c.coins };
  const inv = c.inv.map((i0) => {
    let it = i0;
    if ('in' in it) {
      const bag = it.in ? c.inv.find((x) => x.id === it.in) : undefined;
      if (!bag || !isContainer(bag) || bag.id === it.id || isContainer(it)) it = withoutKeys(it, ['in']);
    }
    if (it.in && it.eq) it = { ...it, eq: false };
    const held = isContainer(it) ? [] : COINS.filter((k) => k in it);
    if (held.length) {
      for (const k of held) coins[k] += typeof it[k] === 'number' ? it[k]! : 0;
      it = withoutKeys(it, held);
    }
    if (it !== i0) changed = true;
    return it;
  });
  return changed ? { ...c, inv, coins } : c;
}
// A typed weight in lb. A Polish keyboard types a decimal comma, so "0,5" is 0.5. Anything else is no weight.
export function parseWeight(s: string): number | undefined {
  const t = s.trim();
  return /^(\d+([.,]\d*)?|[.,]\d+)$/.test(t) ? Number(t.replace(',', '.')) : undefined;
}

export const zeroSpeedBy = (c: Character) => CONDITIONS.filter((n) => c.conds[n] && ZERO_SPEED.includes(n));
export const speedOf = (c: Character, base: number) => (zeroSpeedBy(c).length ? 0 : Math.max(0, base - 5 * c.exh));
// Walking Speed before Exhaustion and conditions: the typed base plus walking speed grants (Wood Elf +5 ft).
export const walkSpeed = (c: Character) => c.speedBase + activeGrants(c, 'speed').filter((g) => g.mode === 'walk').reduce((t, g) => t + num(c, g.val, g), 0);
// Another speed: the typed one or the best grant, whichever is higher ('walk' means equal to the walking Speed).
export function modeSpeed(c: Character, k: SpeedKind): { base: number; hover: boolean; by?: string } {
  const typed = c.speeds[k] || 0;
  let base = typed, by: string | undefined;
  const mine = activeGrants(c, 'speed').filter((g) => g.mode === k);
  for (const g of mine) {
    const v = g.val === 'walk' ? walkSpeed(c) : num(c, g.val, g);
    if (v > base) { base = v; by = sourceLabel(c, g) ?? g.name; }
  }
  const hover = mine.some((g) => g.hover);
  return by ? { base, hover, by } : { base, hover };
}
export const speedNow = (c: Character) => speedOf(c, walkSpeed(c));
// The HP maximum every reader uses: the typed maxHp plus HP-per-level grants × level (Tough, PHB p.202). maxHp and
// origHp stay typed (base) values, so a Long Rest restoring origHp never counts a grant twice.
export const maxHpOf = (c: Character) => c.maxHp + activeGrants(c, 'hpLvl').reduce((t, g) => t + num(c, g.val, g) * c.level, 0);
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
// The undo for an HP action: the state before and after, so Undo can leave alone what changed since (see undoHp).
const undoOf = (before: Character, after: Character, text: string) => ({ prev: snapshot(before), post: snapshot(after), text });

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
  next.hpUndo = undoOf(c, next, text);
  return next;
}

// Three failed death saves (PHB p.29) or Exhaustion level 6 (PHB p.366).
export const isDead = (c: Character) => (c.hp === 0 && c.df >= 3) || c.exh >= 6;

export function applyHeal(c: Character): Character {
  // Healing can't bring back a dead character; clear the failures first (e.g. after Revivify).
  if (!c.amount || isDead(c)) return c;
  const hp = Math.min(maxHpOf(c), c.hp + c.amount);
  const next: Character = { ...c, hp, hpUndo: null };
  let text = 'Healed ' + (hp - c.hp) + ' HP.';
  if (c.hp === 0 && hp > 0) {
    next.ds = 0;
    next.df = 0;
    // Unconscious ends when you regain HP, but you stay Prone (PHB p.377).
    if (c.conds.Unconscious) {
      next.conds = { ...c.conds, Unconscious: false, Prone: true };
      text += ' No longer Unconscious, still Prone.';
    }
  }
  next.hpUndo = undoOf(c, next, text);
  return next;
}

// Temp HP don't stack: the new set replaces the old one, and Undo keeps the old one instead (PHB p.29).
export function applySetTemp(c: Character): Character {
  if (!c.amount) return c;
  const text = 'Temp HP set to ' + c.amount + (c.temp && c.temp !== c.amount
    ? ' (replaced ' + c.temp + '; temp HP don’t stack, tap Undo to keep ' + c.temp + ').'
    : '.');
  const next = { ...c, temp: c.amount };
  return { ...next, hpUndo: undoOf(c, next, text) };
}

// Typing a new current HP is a correction, not damage or healing: no concentration check, no conditions change.
// Leaving 0 HP still resets the death saves, as regaining any HP does (PHB p.29). Kept between 0 and max HP.
export function setHp(c: Character, n: number): Character {
  const hp = clamp(n, 0, maxHpOf(c));
  if (hp === c.hp) return c;
  const next = { ...c, hp, ...(c.hp === 0 ? { ds: 0, df: 0 } : {}) };
  return { ...next, hpUndo: undoOf(c, next, 'HP set to ' + hp + ' (was ' + c.hp + ').') };
}

export function undoHp(c: Character): Character {
  if (!c.hpUndo) return c;
  // HP, temp HP and Hit Dice always go back. Death saves, conditions and Concentration go back only if they still
  // read as the action left them: a change made by hand since then (Prone, ending Concentration) stays.
  const { prev, post } = c.hpUndo;
  const back = (['ds', 'df', 'conds', 'conc'] as const).filter((k) => post && JSON.stringify(c[k]) === JSON.stringify(post[k]));
  const kept = Object.fromEntries(back.map((k) => [k, prev[k]]));
  return { ...c, hp: prev.hp, temp: prev.temp, ...(prev.hdUsed === undefined ? {} : { hdUsed: prev.hdUsed }), ...kept, hpUndo: null, concCheck: null };
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
// When a counter's partial regain comes: on a Short Rest for a Long Rest counter, at dawn for a Dawn counter.
export const regainEvent = (rc: Recharge | undefined): Counter['regainOn'] => (rc === 'long' ? 'short' : rc === 'dawn' ? 'dawn' : undefined);

// A counter's maximum now: a formula (maxV, never below 0), else a fixed max of at least 1, else none (null). It
// ignores whether the counter's source is active, so an inactive resource keeps its count (spec).
export function maxOf(c: Character, x: Partial<Counter>): number | null {
  if (x.maxV !== undefined) return Math.max(0, num(c, x.maxV));
  return x.max && x.max >= 1 ? x.max : null;
}
export type MaxKind = 'none' | 'number' | 'formula';
export const maxKindOf = (x: Partial<Counter>): MaxKind => (x.maxV !== undefined ? 'formula' : x.max ? 'number' : 'none');
// `magic` is a grant-only term: a counter's maximum never reads it.
const isMaxFormula = (t: string) => isValue(t) && !hasDice(t) && !/magic/.test(t);
// The resource form's Maximum: None, a Number (whole, 1 or more) or a Formula (a Value without dice; '0' is a real
// maximum of 0). null = refused.
export function maxFields(kind: MaxKind, text: string): Pick<Counter, 'max' | 'maxV'> | null {
  const t = text.trim();
  if (kind === 'none') return {};
  if (kind === 'number') return /^\d+$/.test(t) && Number(t) >= 1 ? { max: Number(t) } : null;
  return isMaxFormula(t) ? { maxV: t } : null;
}

// A weapon's loaded ammunition (plan 7) stays only while it names an item in inv, outside any container, that canLoad
// accepts: so it clears when the ammunition goes, is packed away or doesn't fit, or an edit changes the weapon. Run
// after fixContainers, which may change `in`. Returns c when nothing changes.
function fixLoads(c: Character): Character {
  let changed = false;
  const inv = c.inv.map((it) => {
    if (it.load === undefined) return it;
    const a = c.inv.find((x) => x.id === it.load);
    if (a && !a.in && canLoad(it, a)) return it;
    changed = true;
    return withoutKeys(it, ['load']);
  });
  return changed ? { ...c, inv } : c;
}

// The single clamp, run by update() and migrate() after every change: resource counts at most their maximum, HP at
// most max HP. Uses lost while a maximum is lower are not given back when it rises (spec). Returns c when nothing moves.
export function normalize(c0: Character): Character {
  // The container rules first (plan 6), then weapons in hand (plan 5): a quantity or equip change, or an item moved
  // into a container, may take one out of hand, through setHands. Then loaded ammunition (plan 7).
  const f = fixLoads(fixContainers(c0));
  const h = setHands(f, f.hands);
  // Weapon Mastery picks: strings, once each. The player may change them at any time; the rule says on a Long Rest
  // (PHB p.91, Weapon Mastery), which the app doesn't enforce.
  const mastery = uniqueStrings(h.mastery);
  const c = mastery.length === h.mastery.length ? h : { ...h, mastery };
  let changed = c !== c0;
  const capped = <T extends Partial<Counter>>(x: T): T => {
    const m = x.count === undefined ? null : maxOf(c, x);
    if (m === null || x.count! <= m) return x;
    changed = true;
    return { ...x, count: m };
  };
  const res = c.res.map(capped);
  const inv = c.inv.map(capped);
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
  // A refused rest asks for nothing: App then runs it, which shows the refusal. Dawn isn't a rest, so it needs no HP.
  if (e !== 'dawn' && (c.hp === 0 || isDead(c))) return [];
  return counters(c).flatMap(([kind, x]) => {
    const g = regainFor(x, e), m = maxOf(c, x);
    const dice = g && g !== 'all' ? valueAt(g, valueCtx(c)) : 0;
    return typeof dice === 'string' && m !== null && (x.count ?? 0) < m ? [{ key: counterKey(kind, x.id), name: x.name, dice }] : [];
  });
}
// Refills resources and item charges for an event, up to their maximum; a counter with no maximum is never refilled.
// rolls: the rolled totals of die regains, by restRolls key. names: 'Wild Shape +1' for each that went up.
export function refillFor(c: Character, e: RestEvent, rolls: Record<string, number> = {}): { res: Resource[]; inv: Item[]; names: string[] } {
  const names: string[] = [];
  const fill = <T extends Counted>(kind: 'res' | 'item', x: T): T => {
    const g = regainFor(x, e), m = maxOf(c, x), n = x.count ?? 0;
    if (!g || m === null) return x;
    const add = g === 'all' ? m : hasDice(g) ? rolls[counterKey(kind, x.id)] ?? 0 : num(c, g);
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
  const dawnNames = counters(c).filter(([, x]) => rechargeOf(x) === 'dawn').map(([, x]) => x.name);
  const maxHp = c.origOn && c.maxHp < c.origHp ? c.origHp : c.maxHp;
  const abilAdj = Object.fromEntries(Object.entries(c.abilAdj).map(([k, v]) => [k, Math.max(0, v || 0)]));
  // After the scores are restored: a maximum that reads a lowered score refills to its restored value.
  const { res, inv, names: refilled } = refillFor({ ...c, abilAdj }, 'long');
  // Shield lasts a round, Mage Armor 8 hours, Barkskin 1 hour (PHB p.316, p.293, p.245): none outlasts a Long Rest.
  // Sleep gives the Unconscious condition (PHB p.370) and being Incapacitated ends Concentration (PHB p.363), so it ends here.
  // Simplified: a character in Trance stays conscious (PHB p.189-190) but loses it too; a rare spell that outlasts the rest is turned on again by hand.
  const ended = [...c.acOn.map((id) => c.spells.find((x) => x.id === id)?.name), c.conc?.name].filter((n): n is string => !!n);
  const restored = [
    maxHp > c.maxHp ? ', HP maximum back to ' + maxHp : '',
    Object.values(c.abilAdj).some((v) => (v || 0) < 0) ? ', reduced ability scores restored' : ''
  ].join('');
  return {
    ...c, maxHp, abilAdj, hp: maxHpOf({ ...c, maxHp, abilAdj }), temp: 0, slotUsed: slots([]), hdUsed: 0, ds: 0, df: 0, acOn: [], effectsOn: [],
    hpUndo: null, ...setConc(null), res, inv, exh: Math.max(0, c.exh - 1),
    restMsg: {
      title: 'Long Rest complete',
      body: 'HP set to max, temp HP cleared, all spell slots and Hit Dice restored' + restored +
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
  // Pact Magic slots come back on a Short Rest too (PHB p.154).
  // shortcut: clears every slot level, because slotUsed doesn't separate Pact Magic slots from others, so a multiclass Warlock regains too many; upgrade if the sheet ever tracks them apart.
  const slotsBack = c.slotsOnShort && c.slotUsed.some((n) => n > 0);
  return {
    ...c, res, inv, ...(slotsBack ? { slotUsed: slots([]) } : {}),
    restMsg: {
      title: 'Short Rest',
      body: (slotsBack ? 'Spell slots restored. ' : '') +
        (refilled.length ? 'Refilled: ' + refilled.join(', ') + '. ' : slotsBack ? '' : 'No resources recharge on a Short Rest. ') +
        'Spend Hit Dice below: roll ' + hitDieRoll(c) + ' each (minimum 1), then Heal (' + left + ' left).'
    }
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const sameType = (def: unknown, v: unknown) => (Array.isArray(def) ? Array.isArray(v) : isObj(def) ? isObj(v) : typeof v === typeof def);
const strings = (v: unknown[]) => v.filter((x): x is string => typeof x === 'string');
const uniqueStrings = (v: unknown[]) => strings(v).filter((x, i, all) => all.indexOf(x) === i);
// Spell slot counts for levels 0–9; anything missing or damaged counts as 0.
const slots = (v: unknown[]) => Array.from({ length: 10 }, (_, i) => (typeof v[i] === 'number' ? (v[i] as number) : 0));
// Records with fixed keys: a missing or damaged key falls back to the blank character's value.
const FIXED_RECORDS = ['ch', 'abil', 'speeds', 'coins', 'notes'] as const;
// Lists of entries: each needs a name and holds only plain values.
const ENTRY_LISTS = ['senses', 'res', 'attacks', 'riders', 'inv', 'spells', 'feats', 'acMods', 'grants', 'profs', 'defenses', 'sections'] as const;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const isEntry = (x: unknown): x is Record<string, unknown> =>
  isObj(x) && typeof x.name === 'string' && Object.values(x).every((v) => v === null || typeof v !== 'object');
const WHENS: When[] = ['armor', 'noHeavy', 'noArmor', 'noShield', 'noArmorNoShield', 'active'];
// The link fields of an entry, checked on load: an unknown source kind reads as Other, any other bad value goes, and
// the fields that need a link go from an entry without one. Never touches `lvl` (a spell's level).
function cleanLinked<T extends Linked>(x: T): T {
  const { from, srcKind, srcName, when, minLvl, needEq, needAtt, linked, ...rest } = x as Linked & Record<string, unknown>;
  const out = {
    ...rest,
    ...(typeof from === 'string' ? { from } : {}),
    ...(srcKind == null ? {} : { srcKind: SRC_KINDS.some(([k]) => k === srcKind) ? srcKind : 'other' }),
    ...(typeof srcName === 'string' ? { srcName } : {}),
    ...(WHENS.includes(when as When) ? { when } : {}),
    ...(Number.isInteger(minLvl) && minLvl! >= 1 && minLvl! <= 20 ? { minLvl } : {}),
    ...(typeof needEq === 'boolean' ? { needEq } : {}),
    ...(typeof needAtt === 'boolean' ? { needAtt } : {}),
    ...(typeof linked === 'boolean' ? { linked } : {})
  } as unknown as T;
  return out.from === undefined ? dropLinkOnly(out) : out;
}
const RECHARGES: Recharge[] = ['none', 'short', 'long', 'dawn'];
// Counter fields of an item on load (resources: cleanResource). A recharge it didn't have stays unset.
function cleanCounter({ count, max, maxV, recharge, regain, regainOn }: Partial<Record<keyof Counter, unknown>>): Partial<Counter> {
  const rc = recharge === undefined ? undefined : RECHARGES.includes(recharge as Recharge) ? (recharge as Recharge) : 'none';
  const pair = typeof regain === 'string' && isValue(regain) && !!regainOn && regainOn === regainEvent(rc);
  return {
    count: count as number, ...(finite(max) && max >= 1 ? { max } : {}), ...(typeof maxV === 'string' && isMaxFormula(maxV) ? { maxV } : {}),
    ...(rc ? { recharge: rc } : {}), ...(pair ? { regain, regainOn: regainOn as Counter['regainOn'] } : {})
  };
}
// Resource fields on load: a fixed max of at least 1, a formula without dice, a known recharge, a regain only with the
// recharge it goes with (on a Short Rest for Long Rest, at dawn for Dawn), text fields as strings.
function cleanResource(r: Resource): Resource {
  const { count, max, maxV, recharge, regain, regainOn, typeName, note, casts, inv: _inv, ...rest } = r as Resource & Record<string, unknown>;
  return cleanLinked({
    ...rest,
    ...cleanCounter({ count: finite(count) ? count : 0, max, maxV, recharge: recharge ?? 'none', regain, regainOn }),
    ...(typeof typeName === 'string' ? { typeName } : {}), ...(typeof note === 'string' ? { note } : {}), ...(typeof casts === 'string' ? { casts } : {})
  } as Resource);
}
const cleanCid = <T extends { cid?: string }>(x: T): T => { const { cid, ...rest } = x; return (typeof cid === 'string' ? { ...rest, cid } : rest) as T; };
// Catalog fields of spells and items on load (all optional): a value of the wrong type or outside its list goes, never the entry.
type FieldCheck = (v: unknown) => boolean;
const isStr: FieldCheck = (v) => typeof v === 'string';
const isBool: FieldCheck = (v) => typeof v === 'boolean';
const nonEmpty: FieldCheck = (v) => typeof v === 'string' && v !== '';
const wholeNonNeg: FieldCheck = (v) => Number.isInteger(v) && (v as number) >= 0;
const among = (...xs: unknown[]): FieldCheck => (v) => xs.includes(v);
const SPELL_FIELDS: Record<string, FieldCheck> = {
  desc: isStr, school: isStr, classes: isStr, ritual: isBool, atk: among('melee', 'ranged'), save: among(...ABILITIES.map(([k]) => k)),
  fx: among('damage', 'healing', 'other'), dmg: isStr, dtype: isStr, scale: isStr, higher: isStr, healMod: (v) => v === true,
  dmgMod: (v) => v === true, dtypes: isDtypes
};
const ATTACK_FIELDS: Record<string, FieldCheck> = { econ: among('action', 'bonus', 'reaction', 'free', 'other'), group: among('weapon', 'other') };
const ITEM_FIELDS: Record<string, FieldCheck> = {
  cat: among(...ITEM_CATS), cost: isStr, wcat: among('simple', 'martial'), wrange: among('melee', 'ranged'), dmg: isStr, dtype: isStr, props: isStr,
  thrown: isStr, vers: isStr, ammo: isStr, mastery: isStr, magic: finite, strReq: finite, stealthDis: isBool, cap: finite, capVol: isStr, xdim: isBool,
  rarity: isStr, attune: isBool, base: (v) => typeof v === 'string' && v.startsWith('item/'), sec: nonEmpty,
  in: nonEmpty, load: nonEmpty, cp: wholeNonNeg, sp: wholeNonNeg, ep: wholeNonNeg, gp: wholeNonNeg, pp: wholeNonNeg
};
// A spell's parts on load: the good ones stay (partErrors, first of a repeated label), parts goes when none is left;
// never the spell.
function cleanParts(sp: Spell): Spell {
  if (sp.parts === undefined) return sp;
  const { parts, ...rest } = sp;
  const seen = new Set<string>();
  const good = (Array.isArray(parts) ? parts : []).filter((p) => {
    if (partErrors(p).length || seen.has(p.label)) return false;
    seen.add(p.label);
    return true;
  });
  return good.length ? { ...rest, parts: good } : rest;
}
const cleanFields = <T extends object>(x: T, fields: Record<string, FieldCheck>): T =>
  Object.fromEntries(Object.entries(x).filter(([k, v]) => !Object.hasOwn(fields, k) || fields[k](v))) as T;

// Resources the Inventory tab echoed before `inv` existed.
const OLD_INVENTORY_RESOURCES = ['arrows', 'potions'];

// Builds a full character from a save or a backup. Missing fields come from the blank character, never the sample;
// values of the wrong type fall back too, so damaged data can't crash the sheet on every launch.
export function migrate(data: unknown): Character {
  const def = blankCharacter();
  if (!isObj(data)) return def;
  const d = { ...def } as Record<string, unknown>;
  for (const [k, dv] of Object.entries(def)) {
    if (data[k] !== undefined && (dv === null || sameType(dv, data[k]))) d[k] = data[k];
  }
  for (const k of FIXED_RECORDS) {
    const v = d[k] as Record<string, unknown>, base = def[k] as Record<string, unknown>;
    d[k] = Object.fromEntries(Object.entries(base).map(([kk, bv]) => [kk, sameType(bv, v[kk]) ? v[kk] : bv]));
  }
  for (const k of ENTRY_LISTS) {
    // A spell's parts are the one list an entry may hold (plan 7); cleanParts checks them below.
    const ok = (x: unknown) => isEntry(k === 'spells' && isObj(x) && 'parts' in x ? { ...x, parts: null } : x);
    d[k] = (d[k] as unknown[]).filter(ok).map((x) => (typeof (x as Record<string, unknown>).id === 'string' ? x : { ...(x as object), id: newId() }));
  }
  const c = d as unknown as Character;
  // A skill's level is 0, 1 or 2: anything else would multiply the Proficiency Bonus by a wrong number.
  c.skillProf = Object.fromEntries(Object.entries(c.skillProf).filter(([, v]) => v === 0 || v === 1 || v === 2));
  // The fields rendering relies on, repaired before anything below reads them: a bad text becomes '', so damaged data can't crash the sheet.
  const texts = <T extends object>(x: T, keys: (keyof T)[]): T => ({ ...x, ...Object.fromEntries(keys.map((k) => [k, typeof x[k] === 'string' ? x[k] : ''])) });
  c.spells = c.spells.map((x) => ({ ...texts(x, ['time', 'range']), lvl: Number.isInteger(x.lvl) && x.lvl >= 0 && x.lvl <= 9 ? x.lvl : 0 }));
  c.inv = c.inv.map((i) => ({ ...i, qty: finite(i.qty) && i.qty >= 0 ? Math.floor(i.qty) : 1, eq: i.eq === true }));
  c.attacks = c.attacks.map((a) => texts(a, ['hit', 'dmg', 'info', 'mastery']));
  c.riders = c.riders.map((x) => texts(x, ['dice']));
  c.feats = c.feats.map((x) => cleanCid(cleanLinked({ ...texts(x, ['desc']), g: Object.hasOwn(GROUP_SRC, x.g) ? x.g : 'other' })));
  c.senses = c.senses.map(({ desc, ...se }) => cleanLinked({ ...texts(se, ['range']), ...(typeof desc === 'string' ? { desc } : {}) }));
  // Spells named their source in a `source` text before links; it becomes srcName unless one is set.
  c.spells = c.spells.map((x) => {
    const { source, castAb, ...sp } = x as Spell & { source?: unknown };
    const named = typeof source === 'string' && source.trim() && sp.srcName === undefined ? { srcName: source } : {};
    return cleanCid(cleanLinked({ ...sp, ...named, ...(ABILITIES.some(([k]) => k === castAb) ? { castAb } : {}) }));
  });
  // Typed attacks are manual actions (plan 5): their numbers stay as typed; a bad timing or section goes.
  c.attacks = c.attacks.map((a) => cleanFields(cleanLinked(a), ATTACK_FIELDS));
  // Every character now has a computed Unarmed Strike (plan 5), and saves copied from the old samples hold a typed one.
  // It goes once, only from a save from before `hands` existed; one typed later stays. Its "Grapple / Shove (DC n)"
  // text is covered by the computed row's Grapple and Shove DC.
  if (data.hands === undefined) c.attacks = c.attacks.filter((a) => normName(a.name) !== 'unarmed strike');
  // Weapons in hand: strings here; normalize() (below, through setHands) keeps only a valid list.
  c.hands = strings(c.hands);
  c.mastery = uniqueStrings(c.mastery);
  c.profs = c.profs.filter((p) => PROF_CATS.includes(p.cat));
  // Saves from before proficiencies were data: their Training features become proficiencies, once.
  if (data.profs === undefined) ({ feats: c.feats, profs: c.profs } = splitTraining(c.feats));
  // Grants: a link that doesn't parse goes first, so grantErrors knows the source kind; then the grant must be valid.
  c.grants = c.grants.filter((g) => parseLink(g.from) && !grantErrors(g, parseLink(g.from)!.kind).length).map(cleanLinked);
  c.inv = c.inv.map((i) => cleanFields(cleanCid(i), ITEM_FIELDS));
  // Item sections (plan 6): a named section once per id (the first stays); then an item's section that is gone clears,
  // so the item shows in the default list.
  c.sections = c.sections.filter((x, i, all) => typeof x.name === 'string' && x.name.trim() !== '' && all.findIndex((y) => y.id === x.id) === i);
  c.inv = c.inv.map((i) => (i.sec === undefined || c.sections.some((x) => x.id === i.sec) ? i : withoutKeys(i, ['sec'])));
  // A typed damage type wins over a chosen one's list (spellFromForm), so dtypes never stays next to it.
  c.spells = c.spells.map((x) => cleanFields(x, SPELL_FIELDS)).map((x) => (x.dtype && x.dtypes !== undefined ? withoutKeys(x, ['dtypes']) : x)).map(cleanParts);
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
  const whole = (v: unknown, min: number, max: number, dflt: number) => (finite(v) ? clamp(Math.floor(v), min, max) : dflt);
  c.level = whole(c.level, 1, 20, 1);
  // Whole numbers in a sane range, so a damaged or hand-edited backup can't give fractional Hit Dice or NaN bars.
  c.maxHp = whole(c.maxHp, 1, 9999, 1);
  c.hp = whole(c.hp, 0, 9999, 0);
  c.temp = whole(c.temp, 0, 9999, 0);
  for (const [k] of ABILITIES) {
    c.abil[k] = whole(c.abil[k], 1, 30, 10);
    if (c.abilAdj[k] !== undefined) c.abilAdj[k] = whole(c.abilAdj[k], -30, 30, 0);
  }
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
  // Free casts were a flag on the spell (Spell.free) and a used-list on the character (free); both are gone, so read
  // them raw. Each becomes a resource from the spell that casts it, used up when the old list said so.
  const usedFree = isObj(data.free) ? data.free : {};
  c.spells = c.spells.map((sp) => {
    const { free, ...x } = sp as Spell & { free?: unknown };
    if (free === true) c.res = [...c.res, { id: newId(), name: sp.name, note: 'Free cast', count: usedFree[sp.id] === true ? 0 : 1, max: 1, recharge: 'long', from: linkOf('spell', sp.id), srcKind: 'spell', casts: sp.id }];
    return free === undefined ? sp : x;
  });
  c.res = c.res.map((r) => (r.casts !== undefined && !c.spells.some((sp) => sp.id === r.casts) ? withoutKeys(r, ['casts']) : r));
  // Three slots, each an existing item id or ''. Checked slot by slot, so a bad slot never shifts the ones after it.
  const ids: unknown[] = c.attuneIds;
  c.attuneIds = [];
  for (let i = 0; i < 3; i++) {
    const x = ids[i];
    c.attuneIds.push(typeof x === 'string' && c.inv.some((it) => it.id === x) && !c.attuneIds.includes(x) ? x : '');
  }
  // From the raw save: old saves get today's bar (HP and AC).
  // Pills don't show items, so a pill of a resource that became an item empties.
  c.pills = sanitizePills(data.pills).map((k) => (converted.some((id) => k === resPill(id)) ? '' : k));
  // Effects switched on: links to something there, once each. A Concentration spell's effect follows c.conc instead.
  c.effectsOn = strings(c.effectsOn).filter((l, i, all) => all.indexOf(l) === i && sourceOf(c, l) && !(parseLink(l)!.kind === 'spell' && (sourceOf(c, l) as Spell).c));
  // The background was a text field in Edit details; it becomes a background feature (from the raw save, once).
  const oldBg = isObj(data.ch) && typeof data.ch.bg === 'string' ? data.ch.bg.trim() : '';
  if (oldBg && !c.feats.some((f) => f.g === 'background' && normName(f.name) === normName(oldBg))) {
    c.feats = [...c.feats, { id: newId(), g: 'background', name: oldBg, desc: '' }];
  }
  // An action grant that spends a resource that is gone no longer spends anything.
  c.grants = c.grants.map((g) => (g.kind === 'action' && g.res !== undefined && !c.res.some((r) => r.id === g.res) ? withoutKeys(g, ['res']) : g));
  const fixed = fixLinks(c);
  // A grant exists only through its source: one whose link fixLinks cleared goes. normalize() then runs the container
  // rules (plan 6) and the hands check.
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

// ---------- adding grants and removing sources (plan 3) ----------

export type RefKind = 'feature' | 'item' | 'spell' | 'sense' | 'defense' | 'res' | 'grant' | 'attack';
export interface Ref { kind: RefKind; id: string }
// One grant to add from a source. link: the id of an entry the character already has (findUnlinked), linked instead of
// added. spell: the spell entry to create for a spell grant (from the catalog), else a bare one is made.
export interface GrantInput { spec: Omit<GrantSpec, 'opt'>; link?: string; counted?: boolean; spell?: Omit<Spell, 'id'> }

type Entry = Linked & { id: string; name: string };
const LIST_KIND: [(typeof LINKED_LISTS)[number], RefKind][] = [
  ['senses', 'sense'], ['spells', 'spell'], ['feats', 'feature'], ['attacks', 'attack'], ['grants', 'grant'], ['defenses', 'defense'], ['res', 'res']
];
const SOURCE_OF_REF: Partial<Record<RefKind, SourceKind>> = { feature: 'feature', item: 'item', spell: 'spell' };
const refLink = (r: Ref) => (SOURCE_OF_REF[r.kind] ? linkOf(SOURCE_OF_REF[r.kind]!, r.id) : null);

// An entry with no source and this name (trimmed, any case, ’ = '), which a grant can link instead of adding a second.
export function findUnlinked(c: Character, kind: 'resource' | 'spell' | 'action', name: string): string | null {
  const list: Entry[] = kind === 'resource' ? c.res : kind === 'spell' ? c.spells : c.attacks;
  return list.find((x) => !x.from && normName(x.name) === normName(name))?.id ?? null;
}

// Adds a source's grants: senses, defenses, resources and spells become entries of their lists, everything else a
// Grant; each carries `from`. The spec's lvl becomes minLvl (never lvl, a spell's level). A resource or action that
// names another spec of the batch gets the id that spec produced.
export function addGrants(c: Character, from: string, inputs: GrantInput[]): Character {
  const srcKind = srcKindOfLink(c, from) ?? undefined;
  const base = { from, ...(srcKind ? { srcKind } : {}) };
  const common = (s: GrantInput['spec']) => ({ ...(s.when ? { when: s.when } : {}), ...(s.needEq ? { needEq: true } : {}), ...(s.needAtt ? { needAtt: true } : {}), ...(s.lvl ? { minLvl: s.lvl } : {}) });
  // Ids first, so a resource's casts and an action's res can name entries made later in the batch.
  const ids = new Map<GrantInput, string>(inputs.map((x) => [x, x.link ?? newId()]));
  const spellInputs = inputs.filter((x) => x.spec.kind === 'spell');
  // casts: a spell spec of the batch by its spec id, then by its catalog spell id, then a spell the character has.
  const castsOf = (v: string | undefined): [string | undefined, GrantInput | undefined] => {
    if (!v) return [undefined, undefined];
    const hit = spellInputs.find((x) => x.spec.id === v) ?? spellInputs.find((x) => x.spec.spell === v);
    if (hit) return [ids.get(hit), hit];
    return [c.spells.some((sp) => sp.id === v) ? v : undefined, undefined];
  };
  let out: Character = { ...c };
  const linkTo = <K extends 'res' | 'spells' | 'attacks'>(k: K, id: string) =>
    ({ ...out, [k]: (out[k] as Entry[]).map((x) => (x.id === id ? { ...x, ...base, linked: true } : x)) });
  for (const input of inputs) {
    const s = input.spec, id = ids.get(input)!;
    if (s.kind === 'sense') {
      out.senses = [...out.senses, { id, name: s.name.replace(/\s*\d+\s*ft\.?$/i, '').trim() || s.name, range: num(c, s.range) + ' ft', ...base, ...common(s) }];
    } else if (s.kind === 'defense') {
      out.defenses = [...out.defenses, { id, kind: s.def!, name: s.target ?? s.name, ...base, ...common(s) }];
    } else if (s.kind === 'resource') {
      if (input.link) { out = linkTo('res', id); continue; }
      const [casts, spellIn] = castsOf(s.casts);
      const mx: Pick<Counter, 'max' | 'maxV'> = s.max === undefined ? {} : /^\d+$/.test(s.max) && Number(s.max) >= 1 ? { max: Number(s.max) } : { maxV: s.max };
      const lvl = s.lvl ?? spellIn?.spec.lvl;
      const r: Resource = {
        id, name: s.name, count: 0, ...mx, recharge: s.recharge ?? 'none',
        ...(s.regain && s.regainOn ? { regain: s.regain, regainOn: s.regainOn } : {}), ...(casts ? { casts } : {}), ...(s.note ? { note: s.note } : {}),
        ...base, ...common(s), ...(lvl ? { minLvl: lvl } : {})
      };
      out.res = [...out.res, { ...r, count: maxOf(c, r) ?? 0 }];
    } else if (s.kind === 'spell') {
      if (input.link) { out = linkTo('spells', id); continue; }
      const { prep: _prep, ...sp } = input.spell ?? { name: s.name, lvl: 0, time: '', range: '' };
      const castAb = ABILITIES.find(([k]) => k === s.castAb)?.[0];
      // A spell with neither flag would load as prepared (migrate), so a granted one is always prepared or unprepared.
      // The grant's flags win over the catalog spell's prep: an always-prepared spell has no prep to linger after
      // "Always prepared" is unticked.
      out.spells = [...out.spells, { ...sp, id, ...(s.always ? { always: true } : { prep: false }), ...(castAb ? { castAb } : {}), ...base, ...common(s) }];
    } else if (s.kind === 'action' && input.link) {
      out = linkTo('attacks', id);
    } else {
      const { lvl, res, ...rest } = s;
      const resId = res === undefined ? undefined : ids.get(inputs.find((x) => x.spec.id === res && x.spec.kind === 'resource')!) ?? res;
      out.grants = [...out.grants, { ...rest, id, ...base, ...(lvl ? { minLvl: lvl } : {}), ...(resId ? { res: resId } : {}), ...(input.counted ? { counted: true } : {}) } as Grant];
    }
  }
  return out;
}

// The ref and everything whose `from` chain leads to it, once each (a visited set stops loops). An entry a grant only
// linked (`linked`) is not in the chain, and neither is anything that leads to the source through it.
export function removalChain(c: Character, ref: Ref): Ref[] {
  const out: Ref[] = [ref];
  const seen = new Set([ref.kind + ':' + ref.id]);
  for (let i = 0; i < out.length; i++) {
    const link = refLink(out[i]);
    if (!link) continue;
    for (const [list, kind] of LIST_KIND) {
      for (const x of c[list] as Entry[]) {
        if (x.from !== link || x.linked || seen.has(kind + ':' + x.id)) continue;
        seen.add(kind + ':' + x.id);
        out.push({ kind, id: x.id });
      }
    }
  }
  return out;
}

// The one removal path for features, items, spells, resources, senses, defenses, grants and attacks (roadmap). Removes
// the chain; entries a grant only linked lose the link (from, linked and the srcKind it set) and keep everything else.
export function removeRef(c0: Character, ref: Ref): Character {
  const chain = removalChain(c0, ref);
  // Removed items leave hands first, while they are still in inv: setHands reads the kind of each weapon that left
  // (Shillelagh's Quarterstaff), which it can't once the item is gone.
  const gone = (kind: RefKind) => chain.filter((r) => r.kind === kind).map((r) => r.id);
  const spells = gone('spell'), res = gone('res'), items = gone('item');
  const c = items.length ? setHands(c0, c0.hands.filter((id) => !items.includes(id))) : c0;
  const links = chain.map(refLink).filter((l): l is string => !!l);
  const unlinkIt = <T extends Entry>(x: T): T => {
    if (!x.linked || !links.includes(x.from!)) return x;
    const { from: _f, linked: _l, srcKind: _k, ...rest } = x;
    return dropLinkOnly(rest as T);
  };
  const out = { ...c };
  for (const [list, kind] of LIST_KIND) {
    const ids = gone(kind);
    (out as Record<string, unknown>)[list] = (c[list] as Entry[]).filter((x) => !ids.includes(x.id)).map(unlinkIt);
  }
  // A removed container's contents come out (to their section, or the default list) and its coins go to the purse
  // (plan 6). Only a root item can be removed (items are never in a removal chain), so only its contents need this.
  out.inv = c.inv.filter((i) => !items.includes(i.id)).map((i) => (i.in && items.includes(i.in) ? withoutKeys(i, ['in']) : i));
  const bagCoins = c.inv.filter((i) => items.includes(i.id));
  if (bagCoins.some((i) => COINS.some((k) => i[k]))) out.coins = Object.fromEntries(COINS.map((k) => [k, c.coins[k] + bagCoins.reduce((t, i) => t + (i[k] || 0), 0)])) as Character['coins'];
  out.attuneIds = c.attuneIds.map((x) => (items.includes(x) ? '' : x));
  // A weapon loaded with removed ammunition is unloaded (fixLoads also runs in normalize()).
  out.inv = fixLoads(out).inv;
  out.acOn = c.acOn.filter((id) => !spells.includes(id));
  out.effectsOn = c.effectsOn.filter((l) => !links.includes(l));
  out.res = out.res.map((r) => (r.casts !== undefined && spells.includes(r.casts) ? withoutKeys(r, ['casts']) : r));
  out.grants = out.grants.map((g) => (g.kind === 'action' && g.res !== undefined && res.includes(g.res) ? withoutKeys(g, ['res']) : g));
  out.pills = c.pills.map((k) => (res.some((id) => k === resPill(id)) ? '' : k));
  return { ...out, ...(c.conc && spells.includes(c.conc.id) ? setConc(null) : {}) };
}

// What a removal confirm shows: the names of everything else that goes, and what stays and needs the player: typed
// numbers that already include a counted grant (the app can't tell which part of a typed value it was), and entries
// that were only linked.
export function removalSummary(c: Character, ref: Ref): { goes: string[]; keep: string[] } {
  const chain = removalChain(c, ref);
  const byRef = (r: Ref): Entry | Item | undefined => (r.kind === 'item' ? c.inv : (c[LIST_KIND.find(([, k]) => k === r.kind)![0]] as Entry[])).find((x) => x.id === r.id);
  const goes = chain.slice(1).map((r) => byRef(r)?.name ?? '').filter(Boolean);
  const keep: string[] = [];
  const hand = '; lower it by hand';
  for (const r of chain.filter((x) => x.kind === 'grant')) {
    const g = c.grants.find((x) => x.id === r.id);
    if (!g?.counted) continue;
    const src = sourceOf(c, g.from)?.name ?? g.name, v = num(c, g.val, g);
    if (g.kind === 'abil' && g.ab) keep.push(`${g.ab.toUpperCase()} ${effScore(c, g.ab as Ability)} still includes ${fmt(v)} from ${src}${hand}`);
    else if (g.kind === 'speed') keep.push(`Speed ${walkSpeed(c)} ft still includes ${fmt(v)} ft from ${src}${hand}`);
    else if (g.kind === 'init') keep.push(`Initiative ${fmt(initiative(c))} still includes ${fmt(v)} from ${src}${hand}`);
    else if (g.kind === 'hpLvl') keep.push(`Max HP ${maxHpOf(c)} still includes ${fmt(v * c.level)} from ${src}${hand}`);
    else if (g.kind === 'ac' && g.acMode === 'bonus') keep.push(`AC ${armorClass(c).total} still includes ${fmt(v)} from ${src} (in the custom AC bonuses)${hand}`);
  }
  const links = chain.map(refLink).filter((l): l is string => !!l);
  for (const [list] of LIST_KIND) {
    for (const x of c[list] as Entry[]) if (x.linked && links.includes(x.from!)) keep.push(`${x.name} stays (it was on the sheet before ${sourceOf(c, x.from)?.name})`);
  }
  return { goes, keep };
}

// One thing a source gives, as a chip on the source: what it reads, where it lives and whether it counts now.
export interface Chip { label: string; ref: Ref; target: PillTarget; active: boolean; why?: string; counted?: boolean }
const DEF_NAMES: Record<DefenseKind, string> = { res: 'Resistance', vul: 'Vulnerability', imm: 'Immunity', adv: 'Advantage' };
const RECHARGE_LABEL: Record<Recharge, string> = { none: '', short: 'Short Rest', long: 'Long Rest', dawn: 'Dawn' };
function grantLabel(c: Character, g: Grant): string {
  const v = num(c, g.val, g);
  switch (g.kind) {
    case 'abil': return fmt(v) + ' ' + (g.ab ?? '').toUpperCase();
    case 'prof': return g.target ? SKILLS.find(([k]) => k === g.target)?.[1] ?? ABILITIES.find(([k]) => k === g.target)?.[1] ?? g.target : g.name;
    case 'speed': return g.mode === 'walk' ? 'Speed ' + fmt(v) + ' ft' : capital(g.mode ?? '') + (g.val === 'walk' ? ' = Speed' : ' ' + v + ' ft');
    case 'ac': return g.acMode === 'bonus' ? fmt(v) + ' AC' : g.name;
    case 'init': return 'Initiative ' + fmt(v);
    case 'hpLvl': return fmt(v) + ' HP per level';
    case 'saveBonus': return fmt(v) + ' ' + (g.ab === 'all' ? 'all' : (g.ab ?? '').toUpperCase()) + ' saves';
    case 'spellAtk': return fmt(v) + ' spell attack';
    case 'spellDc': return fmt(v) + ' spell save DC';
    default: return g.name;
  }
}
const ABILITY_GRANTS: string[] = ['abil', 'abilSet', 'saveBonus', 'checkBonus'];
const VITAL_GRANTS: string[] = ['speed', 'ac', 'init', 'size', 'carryUp'];
function grantTarget(g: Grant): PillTarget {
  if (ABILITY_GRANTS.includes(g.kind) || (g.kind === 'prof' && ['skill', 'save', 'expertise', 'half'].includes(g.cat ?? ''))) return { sec: 'sec-abilities' };
  if (g.kind === 'prof') return { tab: 'features' };
  if (VITAL_GRANTS.includes(g.kind)) return { sec: 'sec-vitals' };
  if (g.kind === 'hpLvl') return { sec: 'sec-hp' };
  if (g.kind === 'casting' || g.kind === 'spell' || g.kind === 'spellAtk' || g.kind === 'spellDc') return { tab: 'spells' };
  return { tab: 'actions' };
}
// Everything whose `from` is this link, linked entries included: senses, defenses, spells, features, attacks, grants,
// resources, in that order. Resource labels use the computed maximum.
export function grantChips(c: Character, link: string): Chip[] {
  const out: Chip[] = [];
  const add = (x: Linked & { id: string }, kind: RefKind, label: string, target: PillTarget, counted?: boolean) => {
    const why = inactiveReason(c, x);
    out.push({ label: label + (counted ? ' (counted)' : ''), ref: { kind, id: x.id }, target, active: why === null, ...(why ? { why } : {}), ...(counted ? { counted } : {}) });
  };
  const mine = <T extends Linked>(list: T[]) => list.filter((x) => x.from === link);
  for (const x of mine(c.senses)) add(x, 'sense', x.name + ' ' + x.range, { sec: 'sec-senses' });
  for (const x of mine(c.defenses)) add(x, 'defense', DEF_NAMES[x.kind] + ' · ' + x.name, { sec: 'sec-defenses' });
  for (const x of mine(c.spells)) add(x, 'spell', x.name, { tab: 'spells' });
  for (const x of mine(c.feats)) add(x, 'feature', x.name, { tab: 'features' });
  for (const x of mine(c.attacks)) add(x, 'attack', x.name, { tab: 'actions' });
  for (const g of mine(c.grants)) add(g, 'grant', grantLabel(c, g), grantTarget(g), g.counted);
  for (const r of mine(c.res)) {
    const m = maxOf(c, r), rc = RECHARGE_LABEL[rechargeOf(r)];
    add(r, 'res', m === null ? r.name : m + ' × ' + r.name + (rc ? ' / ' + rc : ''), { sec: 'sec-resources' });
  }
  return out;
}

export const removeSpell = (c: Character, id: string) => removeRef(c, { kind: 'spell', id });
// The one way to remove an item: its attunement slot empties with it, and its grants go.
export const removeItem = (c: Character, id: string) => removeRef(c, { kind: 'item', id });
export const removeFeature = (c: Character, id: string) => removeRef(c, { kind: 'feature', id });
export const removeResource = (c: Character, id: string) => removeRef(c, { kind: 'res', id });

// Top bar pills. [key, picker name, short label], in picker order.
export type PillStat = 'hp' | 'ac' | 'dc' | 'speed' | 'pp' | 'init' | 'atk' | 'hd' | 'insp';
export const PILL_STATS: [PillStat, string, string][] = [
  ['hp', 'HP', 'HP'], ['ac', 'AC', 'AC'], ['dc', 'Spell save DC', 'DC'], ['speed', 'Speed', 'Speed'], ['pp', 'Passive Perception', 'Perc'],
  ['init', 'Initiative', 'Init'], ['atk', 'Spell attack', 'Atk'], ['hd', 'Hit Dice left', 'HD'], ['insp', 'Inspiration', 'Insp']
];
export const resPill = (id: string) => 'res:' + id;
export type PillTarget = { sec: 'sec-hp' | 'sec-vitals' | 'sec-abilities' | 'sec-senses' | 'sec-defenses' | 'sec-conditions' | 'sec-resources' } | { tab: Tab };
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

// Time, a counter (so ids made in one millisecond differ) and random characters (so two devices' ids differ).
let idSeq = 0;
export const newId = () => 'n' + Date.now().toString(36) + (idSeq++).toString(36) + Math.random().toString(36).slice(2, 6);
