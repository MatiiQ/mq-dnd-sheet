// D&D 2024 rules used by the sheet. Pure functions: each takes a character and returns the next one.
import { blankCharacter, sampleCharacter } from './defaults';
import type { Ability, Character, HpSnapshot, Resource } from './types';

export const ABILITIES: [Ability, string][] = [
  ['str', 'STRENGTH'], ['dex', 'DEXTERITY'], ['con', 'CONSTITUTION'],
  ['int', 'INTELLIGENCE'], ['wis', 'WISDOM'], ['cha', 'CHARISMA']
];

export const SKILLS: [string, string, Ability][] = [
  ['athletics', 'Athletics', 'str'],
  ['acrobatics', 'Acrobatics', 'dex'], ['sleight', 'Sleight of Hand', 'dex'], ['stealth', 'Stealth', 'dex'],
  ['arcana', 'Arcana', 'int'], ['history', 'History', 'int'], ['investigation', 'Investigation', 'int'], ['nature', 'Nature', 'int'], ['religion', 'Religion', 'int'],
  ['animal', 'Animal Handling', 'wis'], ['insight', 'Insight', 'wis'], ['medicine', 'Medicine', 'wis'], ['perception', 'Perception', 'wis'], ['survival', 'Survival', 'wis'],
  ['deception', 'Deception', 'cha'], ['intimidation', 'Intimidation', 'cha'], ['performance', 'Performance', 'cha'], ['persuasion', 'Persuasion', 'cha']
];

export const CONDITION_RULES: Record<string, string> = {
  Blinded: 'You can’t see and fail checks that need sight. Attacks against you have Advantage; your attacks have Disadvantage.',
  Charmed: 'You can’t attack the charmer or target it with harmful abilities. The charmer has Advantage on social checks against you.',
  Deafened: 'You can’t hear and fail checks that need hearing.',
  Frightened: 'Disadvantage on ability checks and attack rolls while the source is in sight. You can’t willingly move closer to it.',
  Grappled: 'Speed 0. Disadvantage on attacks against anyone but the grappler. The grappler can drag you.',
  Incapacitated: 'No actions, Bonus Actions or Reactions. Concentration breaks. You can’t speak. Disadvantage on Initiative.',
  Invisible: 'Advantage on Initiative. Attacks against you have Disadvantage; your attacks have Advantage (unless the target can see you).',
  Paralyzed: 'Incapacitated, Speed 0. Auto-fail STR and DEX saves. Attacks against you have Advantage; hits within 5 ft are critical hits.',
  Petrified: 'Turned to stone: Incapacitated, Speed 0. Auto-fail STR and DEX saves. Attacks against you have Advantage. Resistance to all damage; immune to Poisoned.',
  Poisoned: 'Disadvantage on attack rolls and ability checks.',
  Prone: 'Crawl or spend half your Speed to stand. Disadvantage on your attacks. Attacks against you have Advantage within 5 ft, Disadvantage beyond.',
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
export const conSave = (c: Character) => abilityMod(c, 'con') + (c.saveProf.con ? profBonus(c.level) : 0);

export const zeroSpeedBy = (c: Character) => CONDITIONS.filter((n) => c.conds[n] && ZERO_SPEED.includes(n));
export const speedOf = (c: Character, base: number) => (zeroSpeedBy(c).length ? 0 : Math.max(0, base - 5 * c.exh));
export const speedNow = (c: Character) => speedOf(c, c.speedBase);
// Current HP against max, temp HP ignored: green from 65%, yellow from 30%, red below.
export const hpColor = (c: Character) =>
  (c.hp * 100 >= c.maxHp * 65 ? 'var(--hp-high)' : c.hp * 100 >= c.maxHp * 30 ? 'var(--hp-mid)' : 'var(--hp-low)');

export function toggleCondition(c: Character, name: string): Character {
  const conds = { ...c.conds, [name]: !c.conds[name] };
  const endsConc = conds[name] && INCAPACITATING.includes(name) && c.conc;
  return { ...c, conds, conc: endsConc ? null : c.conc };
}

const snapshot = (c: Character): HpSnapshot => ({ hp: c.hp, temp: c.temp, ds: c.ds, df: c.df, conds: c.conds, conc: c.conc });

export function applyDamage(c: Character): Character {
  if (!c.amount) return c;
  const absorbed = Math.min(c.temp, c.amount);
  const amt = c.amount - absorbed;
  const next: Character = { ...c, temp: c.temp - absorbed, hp: Math.max(0, c.hp - amt), concCheck: null };
  let text = 'Took ' + c.amount + ' damage' + (absorbed ? ' (' + absorbed + ' absorbed by temp HP)' : '') + '.';
  // Damage at 0 HP (PHB p.29): one failure, or death if it equals or exceeds max HP. A Stable character starts rolling again.
  if (amt > 0 && c.hp === 0 && amt >= c.maxHp) {
    next.df = 3;
    text += ' Damage at 0 HP equals or exceeds max HP, so the character dies instantly.';
  } else if (amt > 0 && c.hp === 0) {
    next.df = Math.min(3, c.df + 1);
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
    next.concCheck = 'Concentration on ' + c.conc.name + ': CON save DC ' + dc + ' · roll d20 ' + fmt(conSave(c)) + '. If you fail, tap the blue chip in the top bar to end it.';
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

export function applyHeal(c: Character): Character {
  // Healing can't bring back a dead character; clear the failures first (e.g. after Revivify).
  if (!c.amount || (c.hp === 0 && c.df >= 3)) return c;
  const hp = Math.min(c.maxHp, c.hp + c.amount);
  const next: Character = { ...c, hp, hpUndo: { prev: snapshot(c), text: 'Healed ' + (hp - c.hp) + ' HP.' } };
  if (c.hp === 0 && hp > 0) {
    next.ds = 0;
    next.df = 0;
    if (c.conds.Unconscious) {
      next.conds = { ...c.conds, Unconscious: false };
      next.hpUndo!.text += ' No longer Unconscious.';
    }
  }
  return next;
}

export function applySetTemp(c: Character): Character {
  if (!c.amount) return c;
  const text = c.amount > c.temp
    ? 'Temp HP set to ' + c.amount + '.'
    : 'Temp HP unchanged (' + c.temp + ' is already higher; temp HP doesn’t stack).';
  return { ...c, temp: Math.max(c.temp, c.amount), hpUndo: { prev: snapshot(c), text } };
}

export function undoHp(c: Character): Character {
  if (!c.hpUndo) return c;
  return { ...c, ...c.hpUndo.prev, hpUndo: null, concCheck: null };
}

// Hides the undo row, unless a newer HP action has replaced it since `shown`.
export function clearHpUndo(c: Character, shown: Character['hpUndo']): Character {
  return c.hpUndo === shown ? { ...c, hpUndo: null } : c;
}

export function spendHitDie(c: Character): Character {
  const used = Math.min(c.hdUsed, c.level);
  if (used >= c.level) return c;
  return { ...c, hdUsed: used + 1, amount: 0 };
}

export const rechargeOf = (r: Resource) => r.recharge || (r.refill ? 'long' : 'none');

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

// Either rest needs at least 1 HP to start (PHB p.370, p.373).
const restBlocked = (c: Character, title: string): Character =>
  ({ ...c, restMsg: { title, body: 'A rest can only start with at least 1 HP. Heal first.' } });

export function longRest(c: Character): Character {
  if (c.hp === 0) return restBlocked(c, 'No Long Rest');
  const [res, refilled] = refillFor(c.res, 'long');
  return {
    ...c, hp: c.maxHp, temp: 0, slotUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], hdUsed: 0, ds: 0, df: 0, free: {},
    hpUndo: null, concCheck: null, res, exh: Math.max(0, c.exh - 1),
    restMsg: {
      title: 'Long Rest complete',
      body: 'HP set to max, temp HP cleared, all spell slots, Hit Dice and free casts restored' +
        (c.exh ? ', Exhaustion −1' : '') + (refilled.length ? '. Refilled: ' + refilled.join(', ') : '') + '.'
    }
  };
}

export function shortRest(c: Character): Character {
  if (c.hp === 0) return restBlocked(c, 'No Short Rest');
  const [res, refilled] = refillFor(c.res, 'short');
  const left = c.level - Math.min(c.hdUsed, c.level);
  return {
    ...c, res,
    restMsg: {
      title: 'Short Rest',
      body: (refilled.length ? 'Refilled: ' + refilled.join(', ') + '. ' : 'No resources recharge on a Short Rest. ') +
        'Spend Hit Dice below: roll 1d' + c.hdDie + ' ' + fmt(abilityMod(c, 'con')) + ' each, then Heal (' + left + ' left).'
    }
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const sameType = (def: unknown, v: unknown) => (Array.isArray(def) ? Array.isArray(v) : isObj(def) ? isObj(v) : typeof v === typeof def);
const strings = (v: unknown[]) => v.filter((x): x is string => typeof x === 'string');
// Records with fixed keys: a missing or damaged key falls back to the blank character's value.
const FIXED_RECORDS = ['ch', 'abil', 'speeds', 'coins', 'notes', 'def'] as const;
// Lists of entries: each needs a name and holds only plain values.
const ENTRY_LISTS = ['senses', 'res', 'attacks', 'riders', 'inv', 'spells', 'feats'] as const;
const isEntry = (x: unknown): x is Record<string, unknown> =>
  isObj(x) && typeof x.name === 'string' && Object.values(x).every((v) => v === null || typeof v !== 'object');
const TABS: Character['tab'][] = ['actions', 'resources', 'spells', 'inventory', 'features', 'notes'];
const CAST_ABILITIES: Character['castAb'][] = ['none', 'int', 'wis', 'cha'];
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
  c.attune = strings(c.attune);
  c.slotMax = c.slotMax.map((n) => (typeof n === 'number' ? n : 0));
  c.slotUsed = c.slotUsed.map((n) => (typeof n === 'number' ? n : 0));
  if (!TABS.includes(c.tab)) c.tab = def.tab;
  if (!CAST_ABILITIES.includes(c.castAb)) c.castAb = 'none';
  if (c.spellFilter !== 'prepared') c.spellFilter = 'all';
  // Nullable fields: keep only well-formed values. The undo row lasts seconds, so it never survives a reload.
  const conc = c.conc as unknown;
  c.conc = isObj(conc) && typeof conc.id === 'string' && typeof conc.name === 'string' ? c.conc : null;
  c.hpUndo = null;
  if (typeof c.concCheck !== 'string') c.concCheck = null;
  const msg = c.restMsg as unknown;
  c.restMsg = isObj(msg) && typeof msg.title === 'string' && typeof msg.body === 'string' ? c.restMsg : null;
  // Older saves had no prepared flags: treat their levelled spells as prepared.
  c.spells = c.spells.map((x) => (x.prep === undefined && x.always === undefined ? { ...x, prep: true } : x));
  c.res = c.res.map((r) => (r.inv === undefined && OLD_INVENTORY_RESOURCES.includes(r.id) ? { ...r, inv: true } : r));
  return c;
}

export const newId = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
