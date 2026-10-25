// D&D 2024 rules used by the sheet. Pure functions: each takes a character and returns the next one.
import { blankCharacter, sampleCharacter } from './defaults';
import type { AcEffect, Ability, ArmorKind, CastAbility, Character, Concentration, HpSnapshot, Item, Resource, Spell, Tab, Unarmored } from './types';

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
const INCAPACITATING = ['Incapacitated', 'Paralyzed', 'Petrified', 'Stunned', 'Unconscious'];
const ZERO_SPEED = ['Grappled', 'Restrained', 'Paralyzed', 'Petrified', 'Unconscious'];

export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const fmt = (m: number) => (m >= 0 ? '+' + m : '−' + Math.abs(m));
export const mod = (score: number) => Math.floor((score - 10) / 2);
export const profBonus = (level: number) => 2 + Math.floor((level - 1) / 4);
export const effScore = (c: Character, k: Ability) => clamp(c.abil[k] + (c.abilAdj[k] || 0), 1, 30);
export const abilityMod = (c: Character, k: Ability) => mod(effScore(c, k));
export const skillMod = (c: Character, key: string, ab: Ability) => abilityMod(c, ab) + profBonus(c.level) * (c.skillProf[key] || 0);
// Passive Perception = 10 + the Perception check bonus (PHB p.372). The sheet uses the same formula for Investigation and Insight, which the rules don't define.
export const passiveScore = (c: Character, key: string) => 10 + skillMod(c, key, SKILLS.find(([k]) => k === key)![2]);
// Saving throw: d20 + ability modifier, + Proficiency Bonus if proficient (PHB p.11).
export const saveMod = (c: Character, k: Ability) => abilityMod(c, k) + (c.saveProf[k] ? profBonus(c.level) : 0);
// Spell save DC = 8 + spellcasting ability modifier + PB; spell attack = modifier + PB (PHB p.41). null without a spellcasting ability.
export const spellSaveDC = (c: Character) => (c.castAb === 'none' ? null : 8 + abilityMod(c, c.castAb) + profBonus(c.level));
export const spellAttack = (c: Character) => (c.castAb === 'none' ? null : abilityMod(c, c.castAb) + profBonus(c.level));
// Initiative is a Dexterity check (PHB p.23); initMisc holds extra bonuses from features or items.
export const initiative = (c: Character) => abilityMod(c, 'dex') + c.initMisc;

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
    // Mage Armor sets a base AC on a creature not wearing armor (PHB p.293).
    for (const sp of spells.filter((x) => x.acFx === 'base')) candidates.push([spellPart(sp), dexPart(Infinity)]);
    candidates.push([unarmored, dexPart(Infinity)]);
  }
  // Highest sum wins; on a tie the earlier candidate stays.
  const base = candidates.reduce((b, p) => (partsSum(p) > partsSum(b) ? p : b));
  const parts: AcPart[] = [
    ...base,
    ...(shield ? [{ label: shield.name, value: (shield.acBase || 0) + (shield.acBonus || 0), note: 'shield' }] : []),
    ...c.inv.filter((i) => i.eq && !i.armor && i.acBonus).map((i) => ({ label: i.name, value: i.acBonus!, note: 'equipped item' })),
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
export const preparedCount = (c: Character) => c.spells.filter((x) => (x.lvl || 0) > 0 && !x.always && x.prep).length;
export const slotsLeft = (c: Character, level: number) => Math.max(0, c.slotMax[level] - c.slotUsed[level]);
export const setSlotUsed = (c: Character, l: number, n: number) => { const u = c.slotUsed.slice(); u[l] = n; return { slotUsed: u }; };

// Starting or ending Concentration makes the old CON save notice out of date, so it goes too.
export const setConc = (conc: Concentration | null) => ({ conc, concCheck: null });

// Casting a non-Concentration AC spell switches its AC effect on (once). A Concentration one is on through c.conc.
const acOnCast = (c: Character, sp: Spell): Partial<Character> =>
  (sp.acFx && !sp.c && !c.acOn.includes(sp.id) ? { acOn: [...c.acOn, sp.id] } : {});

// Casting with a slot uses one slot of that level. A Concentration spell starts Concentration, which ends any other (PHB p.363).
export function castSpell(c: Character, sp: Spell, level: number): Partial<Character> {
  if (!slotsLeft(c, level)) return {};
  return { ...setSlotUsed(c, level, c.slotUsed[level] + 1), ...(sp.c ? setConc({ id: sp.id, name: sp.name }) : {}), ...acOnCast(c, sp) };
}

// Using a free cast works like casting; tapping it again restores the cast but leaves the effects alone.
export function toggleFreeCast(c: Character, sp: Spell): Partial<Character> {
  const used = !c.free[sp.id];
  return { free: { ...c.free, [sp.id]: used }, ...(used && sp.c ? setConc({ id: sp.id, name: sp.name }) : {}), ...(used ? acOnCast(c, sp) : {}) };
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

export const zeroSpeedBy = (c: Character) => CONDITIONS.filter((n) => c.conds[n] && ZERO_SPEED.includes(n));
export const speedOf = (c: Character, base: number) => (zeroSpeedBy(c).length ? 0 : Math.max(0, base - 5 * c.exh));
export const speedNow = (c: Character) => speedOf(c, c.speedBase);
// Current HP against max, temp HP ignored: green from 65%, yellow from 30%, red below.
export const hpColor = (c: Character) =>
  (c.hp * 100 >= c.maxHp * 65 ? 'var(--hp-high)' : c.hp * 100 >= c.maxHp * 30 ? 'var(--hp-mid)' : 'var(--hp-low)');

// Display geometry for the HP ring, not a rule: HP and temp HP as percentages of max + temp.
// The cumulative stop is rounded, not each segment, so the two never add up past 100.
export function hpRingStops(c: Character): { hp: number; temp: number } {
  const total = Math.max(1, c.maxHp + c.temp);
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
  if (amt > 0 && c.hp === 0 && amt >= c.maxHp) {
    next.df = 3;
    text += ' Damage at 0 HP equals or exceeds max HP, so the character dies instantly.';
  } else if (amt > 0 && c.hp === 0) {
    next.df = Math.min(3, (c.ds >= 3 ? 0 : c.df) + 1);
    text += ' Damage at 0 HP: 1 death save failure marked (mark one more if it was a critical hit).';
    if (c.ds >= 3) {
      next.ds = 0;
      text += ' No longer Stable: roll death saves again.';
    }
  } else if (amt > 0 && amt - c.hp >= c.maxHp) {
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
  const hp = Math.min(c.maxHp, c.hp + c.amount);
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
  const hp = clamp(n, 0, c.maxHp);
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

// A patch for a new HP maximum: at least 1, and current HP never above it.
export function setMaxHp(c: Character, maxHp: number): Pick<Character, 'maxHp' | 'hp'> {
  const m = Math.max(1, maxHp);
  return { maxHp: m, hp: Math.min(c.hp, m) };
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

export const rechargeOf = (r: Resource) => r.recharge || 'none';

// Refills resources for a rest; returns the new list and the names that went up.
export function refillFor(res: Resource[], kind: 'short' | 'long'): [Resource[], string[]] {
  const names: string[] = [];
  const list = res.map((r) => {
    const rc = rechargeOf(r);
    const hit = kind === 'long' ? rc === 'long' || rc === 'short' : rc === 'short';
    if (!hit || !r.max) return r;
    if (r.count < r.max) names.push(r.name);
    return { ...r, count: r.max };
  });
  return [list, names];
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
  const [res, refilled] = refillFor(c.res, 'long');
  const maxHp = c.origOn && c.maxHp < c.origHp ? c.origHp : c.maxHp;
  const abilAdj = Object.fromEntries(Object.entries(c.abilAdj).map(([k, v]) => [k, Math.max(0, v || 0)]));
  // Shield lasts a round, Mage Armor 8 hours, Barkskin 1 hour (PHB p.316, p.293, p.245): none outlasts a Long Rest.
  const ended = c.acOn.map((id) => c.spells.find((x) => x.id === id)?.name).filter((n): n is string => !!n);
  const restored = [
    maxHp > c.maxHp ? ', HP maximum back to ' + maxHp : '',
    Object.values(c.abilAdj).some((v) => (v || 0) < 0) ? ', reduced ability scores restored' : ''
  ].join('');
  return {
    ...c, maxHp, abilAdj, hp: maxHp, temp: 0, slotUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], hdUsed: 0, ds: 0, df: 0, free: {}, acOn: [],
    hpUndo: null, concCheck: null, res, exh: Math.max(0, c.exh - 1),
    restMsg: {
      title: 'Long Rest complete',
      body: 'HP set to max, temp HP cleared, all spell slots, Hit Dice and free casts restored' + restored +
        (c.exh ? ', Exhaustion −1' : '') + (refilled.length ? '. Refilled: ' + refilled.join(', ') : '') +
        (ended.length ? '. ' + ended.join(', ') + ' ended' : '') + '.'
    }
  };
}

export function shortRest(c: Character): Character {
  const blocked = restBlocked(c, 'No Short Rest');
  if (blocked) return blocked;
  const [res, refilled] = refillFor(c.res, 'short');
  const left = c.level - hdSpent(c);
  return {
    ...c, res,
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
const FIXED_RECORDS = ['ch', 'abil', 'speeds', 'coins', 'notes', 'def'] as const;
// Lists of entries: each needs a name and holds only plain values.
const ENTRY_LISTS = ['senses', 'res', 'attacks', 'riders', 'inv', 'spells', 'feats', 'acMods'] as const;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isEntry = (x: unknown): x is Record<string, unknown> =>
  isObj(x) && typeof x.name === 'string' && Object.values(x).every((v) => v === null || typeof v !== 'object');
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
  for (const k of FIXED_RECORDS) {
    const v = d[k] as Record<string, unknown>, base = blank[k] as Record<string, unknown>;
    d[k] = Object.fromEntries(Object.entries(base).map(([kk, bv]) => [kk, sameType(bv, v[kk]) ? v[kk] : bv]));
  }
  for (const k of ENTRY_LISTS) {
    d[k] = (d[k] as unknown[]).filter(isEntry).map((x) => (typeof x.id === 'string' ? x : { ...x, id: newId() }));
  }
  const c = d as unknown as Character;
  c.def = { res: strings(c.def.res), vul: strings(c.def.vul), imm: strings(c.def.imm) };
  c.attune = [0, 1, 2].map((i) => strings(c.attune)[i] ?? '');
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
  // Nullable fields: keep only well-formed values. The undo row lasts seconds, so it never survives a reload.
  const conc = c.conc as unknown;
  c.conc = isObj(conc) && typeof conc.id === 'string' && typeof conc.name === 'string' ? c.conc : null;
  // Older versions kept Concentration on a spell after removing it. Checked after the entry filter above.
  if (c.conc && !c.spells.some((x) => x.id === c.conc!.id)) c.conc = null;
  c.hpUndo = null;
  if (typeof c.concCheck !== 'string') c.concCheck = null;
  const msg = c.restMsg as unknown;
  c.restMsg = isObj(msg) && typeof msg.title === 'string' && typeof msg.body === 'string' ? c.restMsg : null;
  // Older saves had no prepared flags: treat their levelled spells as prepared.
  c.spells = c.spells.map((x) => (x.prep === undefined && x.always === undefined ? { ...x, prep: true } : x));
  // AC fields: a damaged one would show NaN or join strings, so it goes, with its partner field.
  c.acMods = c.acMods.filter((m) => finite(m.val));
  if (!Object.hasOwn(UNARMORED, c.acUnarm)) c.acUnarm = 'none';
  c.inv = c.inv.map(({ armor, acBase, acBonus, ...i }) => ({
    ...i,
    ...(['light', 'medium', 'heavy', 'shield'].includes(armor as string) && finite(acBase) ? { armor, acBase } : {}),
    ...(finite(acBonus) ? { acBonus } : {})
  }));
  c.spells = c.spells.map(({ acFx, acVal, ...x }) => ({ ...x, ...(['bonus', 'base', 'floor'].includes(acFx as string) && finite(acVal) ? { acFx, acVal } : {}) }));
  c.acOn = strings(c.acOn).filter((id) => c.spells.some((x) => x.id === id && x.acFx && !x.c));
  // Old saves had a typed `ac`. Fill armor and AC spells from their names (switching none on), then add the
  // difference as a custom bonus so the number doesn't move. New saves have no `ac`, so this runs once.
  if (typeof data.ac === 'number') {
    c.inv = c.inv.map((i) => (i.armor ? i : { ...i, ...detectArmor(i.name) }));
    c.spells = c.spells.map((x) => (x.acFx ? x : { ...x, ...detectAcSpell(x.name) }));
    const total = armorClass(c).total;
    if (total !== data.ac) c.acMods = [...c.acMods, { id: newId(), name: 'Adjustment (from old AC)', val: data.ac - total }];
  }
  c.res = c.res.map((r) => (r.inv === undefined && OLD_INVENTORY_RESOURCES.includes(r.id) ? { ...r, inv: true } : r));
  // Older saves had a `refill` flag that meant a Long Rest recharge.
  c.res = c.res.map((r) => ({ ...r, recharge: r.recharge || (r.refill ? 'long' : 'none') }));
  // From the raw save, not the sample-merged copy: old saves get today's bar (HP and AC), not the sample's picks.
  c.pills = sanitizePills(data.pills);
  return c;
}

// Top bar pills. [key, picker name, short label], in picker order.
export type PillStat = 'hp' | 'ac' | 'dc' | 'speed' | 'pp' | 'init' | 'atk' | 'hd' | 'insp';
export const PILL_STATS: [PillStat, string, string][] = [
  ['hp', 'HP', 'HP'], ['ac', 'AC', 'AC'], ['dc', 'Spell save DC', 'DC'], ['speed', 'Speed', 'Speed'], ['pp', 'Passive Perception', 'Perc'],
  ['init', 'Initiative', 'Init'], ['atk', 'Spell attack', 'Atk'], ['hd', 'Hit Dice left', 'HD'], ['insp', 'Inspiration', 'Insp']
];
export const resPill = (id: string) => 'res:' + id;
export type PillTarget = { sec: 'sec-hp' | 'sec-vitals' | 'sec-senses' | 'sec-resources' } | { tab: Tab } | 'insp';
export interface PillView { key: string; label: string; value: string; max?: string; target: PillTarget }

// What a slot shows. Null for an empty slot, an unknown key, or a resource that was deleted.
export function pillView(c: Character, key: string): PillView | null {
  if (key.startsWith('res:')) {
    const r = c.res.find((x) => resPill(x.id) === key);
    return r ? { key, label: r.name, value: String(r.count), max: r.max ? String(r.max) : undefined, target: { sec: 'sec-resources' } } : null;
  }
  const stat = PILL_STATS.find(([k]) => k === key);
  if (!stat) return null;
  const label = stat[2], atk = spellAttack(c);
  switch (stat[0]) {
    case 'hp': return { key, label, value: String(c.hp), max: String(c.maxHp), target: { sec: 'sec-hp' } };
    case 'ac': return { key, label, value: String(armorClass(c).total), target: { sec: 'sec-vitals' } };
    case 'dc': return { key, label, value: String(spellSaveDC(c) ?? '—'), target: { tab: 'spells' } };
    case 'speed': return { key, label, value: String(speedNow(c)), target: { sec: 'sec-vitals' } };
    case 'pp': return { key, label, value: String(passiveScore(c, 'perception')), target: { sec: 'sec-senses' } };
    case 'init': return { key, label, value: fmt(initiative(c)), target: { sec: 'sec-vitals' } };
    case 'atk': return { key, label, value: atk === null ? '—' : fmt(atk), target: { tab: 'spells' } };
    case 'hd': return { key, label, value: String(c.level - hdSpent(c)), max: String(c.level), target: { sec: 'sec-hp' } };
    case 'insp': return { key, label, value: c.insp ? 'On' : 'Off', target: 'insp' };
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
