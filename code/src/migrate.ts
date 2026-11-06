// Save repair: builds a full, valid character from a save or a backup, however damaged. This file imports
// logic.ts, never the reverse, so the rules stay free of old save formats.
import { blankCharacter, SAVE_VERSION } from './defaults';
import { AC_EFFECTS, grantErrors, isDtypes, isObj, ITEM_CATS, partErrors } from './catalog/schema';
import { isValue } from './catalog/value';
import { dropLinkOnly, fixLinks, GROUP_SRC, parseLink, sourceOf, SRC_KINDS } from './links';
import { ABILITIES, CAST_NAMES, clamp, isMaxFormula, newId, normalize, PROF_CATS, regainEvent, sanitizePills, SIZES, slots, SPELL_SORTS, strings, TABS, UNARMORED, uniqueStrings, withoutKeys } from './logic';
import type { Ability, AcEffect, Attack, Character, Counter, DefenseKind, Feature, Item, Linked, Recharge, Resource, Section, Sense, Spell, When } from './types';

const sameType = (def: unknown, v: unknown) => (Array.isArray(def) ? Array.isArray(v) : isObj(def) ? isObj(v) : typeof v === typeof def);
const DEFENSE_KINDS: DefenseKind[] = ['res', 'vul', 'imm', 'adv'];
// Records with fixed keys: a missing or damaged key falls back to the blank character's value.
const FIXED_RECORDS = ['ch', 'abil', 'speeds', 'coins', 'notes'] as const;
// Lists of entries: each needs a name and holds only plain values.
const ENTRY_LISTS = ['senses', 'res', 'attacks', 'riders', 'inv', 'spells', 'feats', 'acMods', 'grants', 'profs', 'defenses', 'sections'] as const;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const isEntry = (x: unknown): x is Record<string, unknown> =>
  isObj(x) && typeof x.name === 'string' && Object.values(x).every((v) => v === null || typeof v !== 'object');
const WHENS: When[] = ['armor', 'noHeavy', 'noArmor', 'noShield', 'noArmorNoShield', 'active', 'empty'];
// The link fields of an entry, checked on load: an unknown source kind reads as Other, any other bad value goes, and
// the fields that need a link go from an entry without one. Never touches `lvl` (a spell's level).
function cleanLinked<T extends Linked>(x: T): T {
  const { from, srcKind, srcName, when, minLvl, needEq, needAtt, linked, needAura, needHand, ...rest } = x as Linked & Record<string, unknown>;
  const out = {
    ...rest,
    ...(typeof from === 'string' ? { from } : {}),
    ...(srcKind == null ? {} : { srcKind: SRC_KINDS.some(([k]) => k === srcKind) ? srcKind : 'other' }),
    ...(typeof srcName === 'string' ? { srcName } : {}),
    ...(WHENS.includes(when as When) ? { when } : {}),
    ...(Number.isInteger(minLvl) && minLvl! >= 1 && minLvl! <= 20 ? { minLvl } : {}),
    ...(typeof needEq === 'boolean' ? { needEq } : {}),
    ...(typeof needAtt === 'boolean' ? { needAtt } : {}),
    ...(typeof linked === 'boolean' ? { linked } : {}),
    ...(typeof needAura === 'string' ? { needAura } : {}),
    ...(typeof needHand === 'boolean' ? { needHand } : {})
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
  const { count, max, maxV, recharge, regain, regainOn, typeName, note, casts, ...rest } = r as Resource & Record<string, unknown>;
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
  dur: isStr, comp: isStr, dice: isStr, c: isBool, always: isBool, prep: isBool,
  fx: among('damage', 'healing', 'other'), dmg: isStr, dtype: isStr, scale: isStr, higher: isStr, healMod: (v) => v === true,
  dmgMod: (v) => v === true, dtypes: isDtypes, acOther: (v) => v === true, linkAlways: (v) => v === true, linkCastAb: among('none', ...ABILITIES.map(([k]) => k))
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

const texts = <T extends object>(x: T, keys: (keyof T)[]): T => ({ ...x, ...Object.fromEntries(keys.map((k) => [k, typeof x[k] === 'string' ? x[k] : ''])) });
const isAbility = (v: unknown): v is Ability => ABILITIES.some(([k]) => k === v);

// One cleaner per entry list. Each keeps the entry and drops only its bad fields; the text fields rendering relies on
// become '' when damaged, so damaged data can't crash the sheet.
function cleanSpell(x: Spell): Spell {
  const { castAb, acFx, acVal, ...sp } = x;
  const linked = cleanCid(cleanLinked({
    ...texts(sp, ['time', 'range']), lvl: Number.isInteger(sp.lvl) && sp.lvl >= 0 && sp.lvl <= 9 ? sp.lvl : 0, ...(isAbility(castAb) ? { castAb } : {})
  }));
  const f = cleanFields(linked, SPELL_FIELDS);
  // A typed damage type wins over a chosen one's list (spellFromForm), so dtypes never stays next to it.
  const typed = f.dtype && f.dtypes !== undefined ? withoutKeys(f, ['dtypes']) : f;
  // AC fields: a damaged one would show NaN or join strings, so it goes, with its partner field.
  return { ...cleanParts(typed), ...(AC_EFFECTS.includes(acFx as AcEffect) && finite(acVal) ? { acFx, acVal } : {}) };
}
function cleanItem(x: Item, sections: Section[]): Item {
  const { armor, acBase, acBonus, wt, desc, count, max, maxV, recharge, regain, regainOn, ...i } = cleanFields(cleanCid(x), ITEM_FIELDS);
  const out: Item = {
    ...i,
    qty: finite(i.qty) && i.qty >= 0 ? Math.floor(i.qty) : 1, eq: i.eq === true,
    // Charges: only with a count; the other fields as on resources.
    ...(finite(count) ? cleanCounter({ count, max, maxV, recharge, regain, regainOn }) : {}),
    ...(['light', 'medium', 'heavy', 'shield'].includes(armor as string) && finite(acBase) ? { armor, acBase } : {}),
    ...(finite(acBonus) ? { acBonus } : {}),
    ...(finite(wt) && wt >= 0 ? { wt } : {}),
    ...(typeof desc === 'string' ? { desc } : {})
  };
  // A section that is gone clears, so the item shows in the default list. A section of another place (a bag's section
  // on an item outside it) goes in fixContainers, through normalize().
  return out.sec === undefined || sections.some((s) => s.id === out.sec) ? out : withoutKeys(out, ['sec']);
}
// Typed attacks are manual actions: their numbers stay as typed; a bad timing or section goes.
const cleanAttack = (a: Attack): Attack => cleanFields(cleanLinked(texts(a, ['hit', 'dmg', 'info', 'mastery'])), ATTACK_FIELDS);
const cleanFeature = (x: Feature): Feature => cleanCid(cleanLinked({ ...texts(x, ['desc']), g: Object.hasOwn(GROUP_SRC, x.g) ? x.g : 'other' }));
const cleanSense = ({ desc, plus, ...se }: Sense): Sense =>
  cleanLinked({ ...texts(se, ['range']), ...(typeof desc === 'string' ? { desc } : {}), ...(typeof plus === 'boolean' ? { plus } : {}) });
// A named section once per id (the first stays); `in` only as a string (fixContainers checks the bag).
const cleanSections = (list: Section[]): Section[] =>
  list.filter((x, i, all) => typeof x.name === 'string' && x.name.trim() !== '' && all.findIndex((y) => y.id === x.id) === i)
    .map((x) => (x.in === undefined || typeof x.in === 'string' ? x : withoutKeys(x, ['in'])));

type Raw = Record<string, unknown>;
// Version steps: STEPS[n] turns a version-n save into version n+1, before the repair below. None yet: every save so
// far is version 1. Add one with each SAVE_VERSION bump, and keep the old format's fixture (src/fixtures/).
export const STEPS: Record<number, (d: Raw) => Raw> = {};
// A save without a usable `v` predates the field, which came with version 1.
export const saveVersion = (d: Raw): number => (Number.isInteger(d.v) && (d.v as number) >= 1 ? (d.v as number) : 1);
// Written by a newer app (a backup from an updated device, opened by an older offline copy): the repair below would
// drop what this app doesn't know, so load() keeps the raw text first.
export const isNewerSave = (d: unknown): boolean => isObj(d) && saveVersion(d) > SAVE_VERSION;
export function upgrade(d: Raw, steps = STEPS, to = SAVE_VERSION): Raw {
  for (let v = saveVersion(d); v < to; v++) d = steps[v](d);
  return d;
}

// Builds a full character from a save or a backup: the version steps, then the repair. Missing fields come from the
// blank character, never the sample; values of the wrong type fall back too, so damaged data can't crash the sheet.
// The result is saved on launch, so whatever this drops is gone: drop a bad field, never the entry, where possible.
export function migrate(data: unknown): Character {
  const def = blankCharacter();
  if (!isObj(data)) return def;
  const raw = upgrade(data);
  const d = { ...def } as Raw;
  for (const [k, dv] of Object.entries(def)) {
    if (raw[k] !== undefined && (dv === null || sameType(dv, raw[k]))) d[k] = raw[k];
  }
  for (const k of FIXED_RECORDS) {
    const v = d[k] as Raw, base = def[k] as Raw;
    d[k] = Object.fromEntries(Object.entries(base).map(([kk, bv]) => [kk, sameType(bv, v[kk]) ? v[kk] : bv]));
  }
  for (const k of ENTRY_LISTS) {
    // A spell's parts are the one list an entry may hold; cleanParts checks them.
    const ok = (x: unknown) => isEntry(k === 'spells' && isObj(x) && 'parts' in x ? { ...x, parts: null } : x);
    d[k] = (d[k] as unknown[]).filter(ok).map((x) => (typeof (x as Raw).id === 'string' ? x : { ...(x as object), id: newId() }));
  }
  const c = d as unknown as Character;
  c.v = SAVE_VERSION;

  // Entry lists. Sections before items (an item's sec), spells before what names a spell (res.casts, acOn, conc).
  c.sections = cleanSections(c.sections);
  c.spells = c.spells.map(cleanSpell);
  c.inv = c.inv.map((i) => cleanItem(i, c.sections));
  c.attacks = c.attacks.map(cleanAttack);
  c.riders = c.riders.map((x) => texts(x, ['dice']));
  c.feats = c.feats.map(cleanFeature);
  c.senses = c.senses.map(cleanSense);
  c.profs = c.profs.filter((p) => PROF_CATS.includes(p.cat));
  c.defenses = c.defenses.filter((x) => DEFENSE_KINDS.includes(x.kind)).map(cleanLinked);
  c.acMods = c.acMods.filter((m) => finite(m.val));
  c.res = c.res.map(cleanResource).map((r) => (r.casts !== undefined && !c.spells.some((sp) => sp.id === r.casts) ? withoutKeys(r, ['casts']) : r));
  // Grants: a link that doesn't parse goes first, so grantErrors knows the source kind; then the grant must be valid.
  // An action grant that spends a resource that is gone no longer spends anything.
  c.grants = c.grants.filter((g) => parseLink(g.from) && !grantErrors(g, parseLink(g.from)!.kind).length).map(cleanLinked)
    .map((g) => (g.kind === 'action' && g.res !== undefined && !c.res.some((r) => r.id === g.res) ? withoutKeys(g, ['res']) : g));

  // Records. A skill's level is 0, 1 or 2: anything else would multiply the Proficiency Bonus by a wrong number.
  c.skillProf = Object.fromEntries(Object.entries(c.skillProf).filter(([, v]) => v === 0 || v === 1 || v === 2));
  c.saveProf = Object.fromEntries(Object.entries(c.saveProf).filter(([k, v]) => isAbility(k) && typeof v === 'boolean'));
  c.conds = Object.fromEntries(Object.entries(c.conds).filter(([, v]) => typeof v === 'boolean'));

  // Numbers. These values size lists of buttons, so an out-of-range number could freeze the sheet. Limits match the UI;
  // whole numbers in a sane range, so a damaged backup can't give fractional Hit Dice or NaN bars.
  const whole = (v: unknown, min: number, max: number, dflt: number) => (finite(v) ? clamp(Math.floor(v), min, max) : dflt);
  c.level = whole(c.level, 1, 20, 1);
  c.maxHp = whole(c.maxHp, 1, 9999, 1);
  c.hp = whole(c.hp, 0, 9999, 0);
  c.temp = whole(c.temp, 0, 9999, 0);
  c.abilAdj = { ...c.abilAdj }; // a copy: the save passed in stays as it was
  for (const [k] of ABILITIES) {
    c.abil[k] = whole(c.abil[k], 1, 30, 10);
    if (c.abilAdj[k] !== undefined) c.abilAdj[k] = whole(c.abilAdj[k], -30, 30, 0);
  }
  c.slotMax = slots(c.slotMax).map((n) => clamp(n, 0, 9));
  c.slotUsed = slots(c.slotUsed).map((n, i) => clamp(n, 0, c.slotMax[i]));
  c.exh = clamp(c.exh, 0, 6);
  c.ds = clamp(c.ds, 0, 3);
  c.df = clamp(c.df, 0, 3);
  c.hdUsed = clamp(c.hdUsed, 0, c.level);
  // Inspiration is a counter, 0 or more. This deliberately departs from the rules, where a character has at most one
  // Heroic Inspiration (PHB p.13, p.368): the book says it doesn't stack, the sheet counts it with no maximum (house rule).
  // inspOn: a non-boolean already fell back to the blank character's true (sameType above).
  c.insp = finite(c.insp) ? Math.max(0, Math.floor(c.insp)) : 0;

  // Choices from fixed lists.
  if (!TABS.some(([t]) => t === c.tab)) c.tab = def.tab;
  if (!Object.hasOwn(CAST_NAMES, c.castAb)) c.castAb = 'none';
  if (c.spellFilter !== 'prepared') c.spellFilter = 'all';
  if (!SPELL_SORTS.some(([k]) => k === c.spellSort)) c.spellSort = 'az';
  if (!SIZES.some(([k]) => k === c.size)) c.size = 'medium';
  if (!Object.hasOwn(UNARMORED, c.acUnarm)) c.acUnarm = 'none';
  c.pills = sanitizePills(raw.pills);

  // Nullable fields: keep only well-formed values. The undo row lasts seconds, so it never survives a reload.
  // Concentration on a spell that is gone clears.
  const conc = c.conc as unknown;
  c.conc = isObj(conc) && typeof conc.id === 'string' && typeof conc.name === 'string' && c.spells.some((x) => x.id === conc.id) ? c.conc : null;
  c.hpUndo = null;
  if (typeof c.concCheck !== 'string') c.concCheck = null;
  const msg = c.restMsg as unknown;
  c.restMsg = isObj(msg) && typeof msg.title === 'string' && typeof msg.body === 'string' ? c.restMsg : null;

  // Lists of ids, checked against the entries above.
  c.acOn = strings(c.acOn).filter((id) => c.spells.some((x) => x.id === id && x.acFx && !x.c));
  // Three attunement slots, each an existing item id or ''. Checked slot by slot, so a bad slot never shifts the ones after it.
  const ids: unknown[] = c.attuneIds;
  c.attuneIds = [];
  for (let i = 0; i < 3; i++) {
    const x = ids[i];
    c.attuneIds.push(typeof x === 'string' && c.inv.some((it) => it.id === x) && !c.attuneIds.includes(x) ? x : '');
  }
  // Effects switched on: links to something there, once each. A Concentration spell's effect follows c.conc instead.
  c.effectsOn = strings(c.effectsOn).filter((l, i, all) => all.indexOf(l) === i && sourceOf(c, l) && !(parseLink(l)!.kind === 'spell' && (sourceOf(c, l) as Spell).c));
  // Weapons in hand: strings here; normalize() (below, through setHands) keeps only a valid list.
  c.hands = strings(c.hands);
  c.mastery = uniqueStrings(c.mastery);

  const fixed = fixLinks(c);
  // A grant exists only through its source: one whose link fixLinks cleared goes. normalize() then runs the container
  // rules and the hands check.
  return normalize({ ...fixed, grants: fixed.grants.filter((g) => g.from) });
}
