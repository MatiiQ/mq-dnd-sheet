// D&D 2024 rules used by the sheet. Pure functions: each takes a character and returns the next one.
import { blankCharacter, sampleCharacter } from './defaults';
import type { Ability, CastAbility, Character, Concentration, HpSnapshot, Resource, Spell, Tab } from './types';

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

export const TABS: [Tab, string][] = [['actions', 'Actions'], ['resources', 'Resources'], ['spells', 'Spells'], ['inventory', 'Inventory'], ['features', 'Features & Traits'], ['notes', 'Notes']];

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
// A levelled spell can be cast when it is prepared or always prepared; always-prepared spells don't count
// toward the prepared limit (PHB p.235). With tracking off (classes that know their spells), every spell can be cast.
export const spellUsable = (c: Character, sp: Spell) => !c.usePrep || !!sp.always || !!sp.prep;
export const preparedCount = (c: Character) => c.spells.filter((x) => (x.lvl || 0) > 0 && !x.always && x.prep).length;
export const slotsLeft = (c: Character, level: number) => Math.max(0, c.slotMax[level] - c.slotUsed[level]);
export const setSlotUsed = (c: Character, l: number, n: number) => { const u = c.slotUsed.slice(); u[l] = n; return { slotUsed: u }; };

// Starting or ending Concentration makes the old CON save notice out of date, so it goes too.
export const setConc = (conc: Concentration | null) => ({ conc, concCheck: null });

// Casting with a slot uses one slot of that level. A Concentration spell starts Concentration, which ends any other (PHB p.363).
export function castSpell(c: Character, sp: Spell, level: number): Partial<Character> {
  if (!slotsLeft(c, level)) return {};
  return { ...setSlotUsed(c, level, c.slotUsed[level] + 1), ...(sp.c ? setConc({ id: sp.id, name: sp.name }) : {}) };
}

// Removing a spell ends Concentration on it and drops its free cast.
export function removeSpell(c: Character, id: string): Character {
  const { [id]: _, ...free } = c.free;
  return { ...c, spells: c.spells.filter((x) => x.id !== id), free, ...(c.conc?.id === id ? setConc(null) : {}) };
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
  const restored = [
    maxHp > c.maxHp ? ', HP maximum back to ' + maxHp : '',
    Object.values(c.abilAdj).some((v) => (v || 0) < 0) ? ', reduced ability scores restored' : ''
  ].join('');
  return {
    ...c, maxHp, abilAdj, hp: maxHp, temp: 0, slotUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], hdUsed: 0, ds: 0, df: 0, free: {},
    hpUndo: null, concCheck: null, res, exh: Math.max(0, c.exh - 1),
    restMsg: {
      title: 'Long Rest complete',
      body: 'HP set to max, temp HP cleared, all spell slots, Hit Dice and free casts restored' + restored +
        (c.exh ? ', Exhaustion −1' : '') + (refilled.length ? '. Refilled: ' + refilled.join(', ') : '') + '.'
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
const ENTRY_LISTS = ['senses', 'res', 'attacks', 'riders', 'inv', 'spells', 'feats'] as const;
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
  c.res = c.res.map((r) => (r.inv === undefined && OLD_INVENTORY_RESOURCES.includes(r.id) ? { ...r, inv: true } : r));
  // Older saves had a `refill` flag that meant a Long Rest recharge.
  c.res = c.res.map((r) => ({ ...r, recharge: r.recharge || (r.refill ? 'long' : 'none') }));
  return c;
}

export const newId = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
