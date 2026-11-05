// Save repair: builds a full, valid character from a save or a backup, however damaged. This file imports
// logic.ts, never the reverse, so the rules stay free of old save formats.
import { blankCharacter } from './defaults';
import { AC_EFFECTS, grantErrors, isDtypes, isObj, ITEM_CATS, partErrors } from './catalog/schema';
import { isValue } from './catalog/value';
import { dropLinkOnly, fixLinks, GROUP_SRC, parseLink, sourceOf, SRC_KINDS } from './links';
import { ABILITIES, CAST_NAMES, clamp, isMaxFormula, newId, normalize, PROF_CATS, regainEvent, sanitizePills, SIZES, slots, SPELL_SORTS, strings, TABS, UNARMORED, uniqueStrings, withoutKeys } from './logic';
import type { AcEffect, Character, Counter, DefenseKind, Linked, Recharge, Resource, Spell, When } from './types';

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
  c.spells = c.spells.map((x) => {
    const { castAb, ...sp } = x;
    return cleanCid(cleanLinked({ ...sp, ...(ABILITIES.some(([k]) => k === castAb) ? { castAb } : {}) }));
  });
  // Typed attacks are manual actions (plan 5): their numbers stay as typed; a bad timing or section goes.
  c.attacks = c.attacks.map((a) => cleanFields(cleanLinked(a), ATTACK_FIELDS));
  // Weapons in hand: strings here; normalize() (below, through setHands) keeps only a valid list.
  c.hands = strings(c.hands);
  c.mastery = uniqueStrings(c.mastery);
  c.profs = c.profs.filter((p) => PROF_CATS.includes(p.cat));
  // Grants: a link that doesn't parse goes first, so grantErrors knows the source kind; then the grant must be valid.
  c.grants = c.grants.filter((g) => parseLink(g.from) && !grantErrors(g, parseLink(g.from)!.kind).length).map(cleanLinked);
  c.inv = c.inv.map((i) => cleanFields(cleanCid(i), ITEM_FIELDS));
  // Item sections (plan 6): a named section once per id (the first stays); then an item's section that is gone clears,
  // so the item shows in the default list.
  c.sections = c.sections.filter((x, i, all) => typeof x.name === 'string' && x.name.trim() !== '' && all.findIndex((y) => y.id === x.id) === i)
    .map((x) => (x.in === undefined || typeof x.in === 'string' ? x : withoutKeys(x, ['in'])));
  // A bag's section whose bag is gone, and an item's section of another place, go in fixContainers (normalize, below).
  c.inv = c.inv.map((i) => (i.sec === undefined || c.sections.some((x) => x.id === i.sec) ? i : withoutKeys(i, ['sec'])));
  // A typed damage type wins over a chosen one's list (spellFromForm), so dtypes never stays next to it.
  c.spells = c.spells.map((x) => cleanFields(x, SPELL_FIELDS)).map((x) => (x.dtype && x.dtypes !== undefined ? withoutKeys(x, ['dtypes']) : x)).map(cleanParts);
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
  // Concentration on a spell that is gone clears. Checked after the entry filter above.
  if (c.conc && !c.spells.some((x) => x.id === c.conc!.id)) c.conc = null;
  c.hpUndo = null;
  // Inspiration is a counter, 0 or more. This deliberately departs from the rules, where a character has at most one
  // Heroic Inspiration (PHB p.13, p.368): the book says it doesn't stack, the sheet counts it with no maximum (house rule).
  c.insp = finite(c.insp) ? Math.max(0, Math.floor(c.insp)) : 0;
  // inspOn: a non-boolean already fell back to the blank character's true (sameType above).
  if (typeof c.concCheck !== 'string') c.concCheck = null;
  const msg = c.restMsg as unknown;
  c.restMsg = isObj(msg) && typeof msg.title === 'string' && typeof msg.body === 'string' ? c.restMsg : null;
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
  c.res = c.res.map(cleanResource);
  c.res = c.res.map((r) => (r.casts !== undefined && !c.spells.some((sp) => sp.id === r.casts) ? withoutKeys(r, ['casts']) : r));
  // Three slots, each an existing item id or ''. Checked slot by slot, so a bad slot never shifts the ones after it.
  const ids: unknown[] = c.attuneIds;
  c.attuneIds = [];
  for (let i = 0; i < 3; i++) {
    const x = ids[i];
    c.attuneIds.push(typeof x === 'string' && c.inv.some((it) => it.id === x) && !c.attuneIds.includes(x) ? x : '');
  }
  c.pills = sanitizePills(data.pills);
  // Effects switched on: links to something there, once each. A Concentration spell's effect follows c.conc instead.
  c.effectsOn = strings(c.effectsOn).filter((l, i, all) => all.indexOf(l) === i && sourceOf(c, l) && !(parseLink(l)!.kind === 'spell' && (sourceOf(c, l) as Spell).c));
  // An action grant that spends a resource that is gone no longer spends anything.
  c.grants = c.grants.map((g) => (g.kind === 'action' && g.res !== undefined && !c.res.some((r) => r.id === g.res) ? withoutKeys(g, ['res']) : g));
  const fixed = fixLinks(c);
  // A grant exists only through its source: one whose link fixLinks cleared goes. normalize() then runs the container
  // rules (plan 6) and the hands check.
  return normalize({ ...fixed, grants: fixed.grants.filter((g) => g.from) });
}
