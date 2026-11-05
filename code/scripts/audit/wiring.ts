// Whether catalog data reaches the app. Imports the app's add flow, so it runs under Vitest, not plain node.
// shortcut: these checks only catch names nothing mentions (field-unread stops at the copy to the character; the others
// search the code for a word), so a green result doesn't prove a field works. logic.test.ts covers behaviour.
import { atLevel, addFromCatalog, choicesOf, featureCandidates, freeText, itemQuestions, itemStats, matchId, nestedEntries, optionGroups, poolOptions, type AddChoices, type FeatureType, type ItemAnswers } from '../../src/catalog/copy.ts';
import type { Catalog } from '../../src/catalog/merge.ts';
import type { Entry } from '../../src/catalog/schema.ts';
import { blankCharacter } from '../../src/defaults.ts';
import { spellUsable } from '../../src/logic.ts';
import type { Character } from '../../src/types.ts';
import { flatGrants, type Finding } from './checks.ts';

// Answers every choice of an entry and of the entries nested under it with the first options, so it can be added.
function autoAnswers(cat: Catalog, c: Character, entry: Entry, preset: Record<string, string[]> = {}, depth = 0): AddChoices {
  const e = atLevel(c, entry);
  const picks: Record<string, string[]> = { ...preset };
  for (const ch of choicesOf(e)) {
    if (picks[ch.id]) continue;
    if (ch.options) picks[ch.id] = optionGroups(ch).slice(0, ch.pick).map((g) => g.value);
    else if (ch.pool) picks[ch.id] = freeText(cat, c, ch.pool, picks) ? Array.from({ length: ch.pick }, (_, i) => `Typed ${i}`) : poolOptions(cat, c, ch.pool, picks, [e]).slice(0, ch.pick).map((o) => o.value);
  }
  const nested: Record<string, AddChoices> = {};
  if (depth < 4) for (const n of nestedEntries(cat, e, picks)) nested[n.entry.id] = autoAnswers(cat, c, n.entry, n.preset, depth + 1);
  const item: ItemAnswers = {};
  for (const q of itemQuestions(cat, e)) {
    if (q.key === 'base') item.base = q.options?.[0]?.value;
    else if (q.key === 'bonus') item.bonus = 1;
    else item.charges = q.min;
  }
  return { picks, counted: {}, links: {}, nested, item, ...(e.kind === 'background' && e.equipA !== undefined ? { equip: 'A' as const } : {}) };
}

// Kinds the add flow refuses, by design.
const NOT_ADDED: Entry['kind'][] = ['class', 'prof', 'rule'];
// Fields every list shows or the merge uses; rule entries are read only by the Actions tab (see ruleCatChecks).
const SHOWN = ['id', 'kind', 'name', 'desc', 'src', 'replace'];
// Fields of catalog entries that nothing reads while each entry is listed, previewed and added. Traced at run time with
// a proxy around every entry, so a field read under any variable name counts.
export function unreadFieldChecks(cat: Catalog): Finding[] {
  const seen = new Set<string>(), out = new Map<string, Finding>();
  let tracing = true;
  const wrap = (e: Entry): Entry => new Proxy(e, { get(t, p, r) { if (tracing && typeof p === 'string') seen.add(`${t.kind}.${p}`); return Reflect.get(t, p, r); } });
  const list = cat.list.map(wrap), traced: Catalog = { list, byId: new Map(list.map((e) => [e.id, e])) };
  const base = { ...blankCharacter(), level: 20 };
  for (const e of list) {
    if (e.kind === 'item') { itemStats(e); itemQuestions(traced, e); }
    if (NOT_ADDED.includes(e.kind)) continue;
    // An item whose base the player chooses is spread into a copy, which reads every field, so its add counts no reads.
    tracing = !(e.kind === 'item' && itemQuestions(traced, e).some((q) => q.key === 'base'));
    try {
      addFromCatalog(base, traced, e, autoAnswers(traced, base, e));
      // A background's package B is the other answer of its equipment step.
      if (e.kind === 'background' && e.equipA !== undefined) addFromCatalog(base, traced, e, { ...autoAnswers(traced, base, e), equip: 'B' });
    } catch (err) {
      out.set(`add:${e.id}`, { check: 'add-throws', id: e.id, note: err instanceof Error ? err.message : String(err) });
    }
    tracing = true;
  }
  for (const e of cat.list) {
    if (e.kind === 'class') {
      const c = { ...base, ch: { ...base.ch, cls: e.name, clsId: matchId(traced, 'class', e.name) } };
      for (const t of ['class', 'sub', 'feat', 'species', 'background'] as FeatureType[]) featureCandidates(traced, c, t);
    }
  }
  const unread = new Map<string, string[]>();
  for (const e of cat.list) {
    if (e.kind === 'rule') continue;
    for (const k of Object.keys(e)) {
      const f = `${e.kind}.${k}`;
      if (!SHOWN.includes(k) && !seen.has(f)) unread.set(f, [...(unread.get(f) ?? []), e.id]);
    }
  }
  for (const [f, ids] of unread) out.set(f, { check: 'field-unread', id: f, note: `${ids.sort().join(', ')}: nothing reads it when listing or adding` });
  return [...out.values()];
}

// Pools that offer nothing, so the player can only type a name (the option list isn't in the catalog), or fewer options
// than the choice picks. '$' pools depend on another pick, and skill:proficient on the character.
export function poolChecks(cat: Catalog): Finding[] {
  const c = blankCharacter(), users = new Map<string, string[]>();
  for (const e of cat.list) {
    for (const ch of choicesOf(e)) {
      if (!ch.pool || ch.pool.includes('$') || ch.pool === 'skill:proficient') continue;
      const n = poolOptions(cat, c, ch.pool, {}).length;
      if (!n || n < ch.pick) users.set(`${n ? 'pool-short' : 'pool-empty'}|${ch.pool}`, [...(users.get(`${n ? 'pool-short' : 'pool-empty'}|${ch.pool}`) ?? []), e.id]);
    }
  }
  return [...users].map(([k, ids]) => { const [check, id] = k.split('|'); return { check, id, note: `${[...new Set(ids)].sort().join(', ')}: ${check === 'pool-empty' ? 'the player can only type a name' : 'fewer options than the pick'}` }; });
}

const COMMON_GRANT_FIELDS = ['id', 'kind', 'name', 'when', 'lvl', 'opt', 'needEq', 'needAtt'];
const readBy = (src: string, f: string) => new RegExp(`\\.${f}\\b|'${f}'`).test(src);
// Grant kinds and fields that app code never names. src: the app's code without the schema, the grant form and the types.
export function grantSourceChecks(entries: Entry[], src: string): Finding[] {
  const users = new Map<string, Set<string>>(), mark = (k: string, id: string) => users.set(k, (users.get(k) ?? new Set()).add(id));
  for (const e of entries) {
    for (const g of flatGrants(e)) {
      if (!src.includes(`'${g.kind}'`)) mark(`grant-kind-unread|${g.kind}`, e.id);
      for (const f of Object.keys(g)) if (!COMMON_GRANT_FIELDS.includes(f) && !readBy(src, f)) mark(`grant-field-unread|${g.kind}.${f}`, e.id);
    }
  }
  return [...users].map(([k, ids]) => { const [check, id] = k.split('|'); return { check, id, note: `${[...ids].sort().join(', ')}: ${check === 'grant-kind-unread' ? 'uses it' : 'sets it'}` }; });
}

// Rule categories the app never filters on, so their text is never shown.
export function ruleCatChecks(entries: Entry[], src: string): Finding[] {
  const cats = new Set(entries.flatMap((e) => (e.kind === 'rule' ? [e.cat] : [])));
  return [...cats].filter((c) => !new RegExp(`\\.cat === '${c}'`).test(src)).map((c) => ({ check: 'rule-cat-unread', id: c, note: `rule entries of category ${c} are never shown` }));
}

const granters = (cat: Catalog) => cat.list.filter((e) => e.kind === 'feature' || e.kind === 'feat');

// A free cast that names a catalog spell the character already has (from another feature, say) and ends up pointing at
// nothing: the counter shows, the spell gets no button.
export function freeCastLinkChecks(cat: Catalog): Finding[] {
  const out: Finding[] = [], base = { ...blankCharacter(), level: 20 };
  for (const e of granters(cat)) {
    for (const g of flatGrants(e).filter((x) => x.kind === 'resource' && x.casts?.startsWith('spell/'))) {
      const sp = cat.byId.get(g.casts!);
      if (!sp) continue;
      const c = addFromCatalog(addFromCatalog(base, cat, sp, autoAnswers(cat, base, sp)), cat, e, autoAnswers(cat, base, e));
      if (c.res.some((r) => r.name === g.name && !r.casts)) out.push({ check: 'free-cast-unlinked', id: `${e.id}:${g.id}`, note: `${g.casts} is on the sheet; the resource doesn't cast it` });
    }
  }
  return out;
}

// A levelled spell a feature or feat adds that can't be cast with prepared-spell tracking on until the player prepares it.
export function grantedSpellChecks(cat: Catalog): Finding[] {
  const base = { ...blankCharacter(), level: 20, usePrep: true }, out: Finding[] = [];
  for (const e of granters(cat)) {
    if (!flatGrants(e).some((g) => g.kind === 'spell')) continue;
    const sheet = addFromCatalog(base, cat, e, autoAnswers(cat, base, e));
    const stuck = sheet.spells.filter((sp) => sp.from && sp.lvl > 0 && !spellUsable(sheet, sp));
    if (stuck.length) out.push({ check: 'granted-spell-unprepared', id: e.id, note: `${stuck.length} spell(s) added not always prepared` });
  }
  return out;
}

// A background adds its equipment only as text: no item, no coins.
export function backgroundEquipChecks(cat: Catalog): Finding[] {
  const base = blankCharacter(), plain = cat.list.filter((e) => e.kind === 'background' && e.equip).filter((e) => {
    const c = addFromCatalog(base, cat, e, autoAnswers(cat, base, e));
    return c.inv.length === base.inv.length && JSON.stringify(c.coins) === JSON.stringify(base.coins);
  });
  return plain.length ? [{ check: 'background-equipment-text', id: 'background', note: `${plain.map((e) => e.id).sort().join(', ')}: equipment is only text` }] : [];
}
