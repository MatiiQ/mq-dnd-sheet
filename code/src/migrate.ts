// Save repair: builds a full, valid character from a save or a backup, however old or damaged. This file imports
// logic.ts, never the reverse, so the rules stay free of old save formats.
import { blankCharacter } from './defaults';
import { AC_EFFECTS, grantErrors, isDtypes, isObj, ITEM_CATS, partErrors } from './catalog/schema';
import { PROF_NAMES, type ProfCat } from './catalog/names';
import { isValue } from './catalog/value';
import { dropLinkOnly, fixLinks, GROUP_SRC, linkOf, parseLink, sourceOf, SRC_KINDS } from './links';
import { ABILITIES, armorClass, CAST_NAMES, clamp, CONDITION_OPTIONS, detectAcSpell, detectArmor, fmt, isMaxFormula, newId, normalize, normName, PROF_CATS, rechargeOf, regainEvent, resPill, sanitizePills, SIZES, slots, SPELL_SORTS, strings, TABS, UNARMORED, uniqueStrings, withoutKeys } from './logic';
import type { AcEffect, Character, Counter, DefenseKind, Feature, Item, Linked, Prof, Recharge, Resource, Spell, When } from './types';

const sameType = (def: unknown, v: unknown) => (Array.isArray(def) ? Array.isArray(v) : isObj(def) ? isObj(v) : typeof v === typeof def);
const DEFENSE_KINDS: DefenseKind[] = ['res', 'vul', 'imm', 'adv'];
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
  dmgMod: (v) => v === true, dtypes: isDtypes, linkAlways: (v) => v === true, linkCastAb: among('none', ...ABILITIES.map(([k]) => k))
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
