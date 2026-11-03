// Whether catalog data reaches the app. Imports the app's add flow, so it runs under Vitest, not plain node.
import { addFromCatalog, choicesOf, featureCandidates, freeText, itemQuestions, itemStats, matchId, nestedEntries, optionGroups, poolOptions, type AddChoices, type FeatureType, type ItemAnswers } from '../../src/catalog/copy.ts';
import type { Catalog } from '../../src/catalog/merge.ts';
import type { Entry } from '../../src/catalog/schema.ts';
import { blankCharacter } from '../../src/defaults.ts';
import type { Character } from '../../src/types.ts';
import { flatGrants, type Finding } from './checks.ts';

// Answers every choice of an entry and of the entries nested under it with the first options, so it can be added.
function autoAnswers(cat: Catalog, c: Character, e: Entry, preset: Record<string, string[]> = {}, depth = 0): AddChoices {
  const picks: Record<string, string[]> = { ...preset };
  for (const ch of choicesOf(e)) {
    if (picks[ch.id]) continue;
    if (ch.options) picks[ch.id] = optionGroups(ch).slice(0, ch.pick).map((g) => g.value);
    else if (ch.pool) picks[ch.id] = freeText(cat, c, ch.pool, picks) ? Array.from({ length: ch.pick }, (_, i) => `Typed ${i}`) : poolOptions(cat, c, ch.pool, picks).slice(0, ch.pick).map((o) => o.value);
  }
  const nested: Record<string, AddChoices> = {};
  if (depth < 4) for (const n of nestedEntries(cat, e, picks)) nested[n.entry.id] = autoAnswers(cat, c, n.entry, n.preset, depth + 1);
  const item: ItemAnswers = {};
  for (const q of itemQuestions(cat, e)) {
    if (q.key === 'base') item.base = q.options?.[0]?.value;
    else if (q.key === 'bonus') item.bonus = 1;
    else item.charges = q.min;
  }
  return { picks, counted: {}, links: {}, nested, item };
}

// Fields every list shows or the merge uses; rule entries are read only by the Actions tab (see ruleCatChecks).
const SHOWN = ['id', 'kind', 'name', 'desc', 'src', 'replace'];
// Fields of catalog entries that nothing reads while each entry is listed, previewed and added. Traced at run time with
// a proxy around every entry, so a field read under any variable name counts.
export function unreadFieldChecks(cat: Catalog): Finding[] {
  const seen = new Set<string>();
  const wrap = (e: Entry): Entry => new Proxy(e, { get(t, p, r) { if (typeof p === 'string') seen.add(`${t.kind}.${p}`); return Reflect.get(t, p, r); } });
  const list = cat.list.map(wrap), traced: Catalog = { list, byId: new Map(list.map((e) => [cat.list[list.indexOf(e)].id, e])) };
  const base = { ...blankCharacter(), level: 20 };
  for (const e of list) {
    if (e.kind === 'item') { itemStats(e); itemQuestions(traced, e); }
    try { addFromCatalog(base, traced, e, autoAnswers(traced, base, e)); } catch { /* a class can't be added; a field read only past that point stays unread */ }
  }
  for (const e of cat.list) {
    if (e.kind === 'class') {
      const c = { ...base, ch: { ...base.ch, cls: e.name, clsId: matchId(traced, 'class', e.name) } };
      for (const t of ['class', 'sub', 'feat', 'species', 'background'] as FeatureType[]) featureCandidates(traced, c, t);
    }
  }
  const out = new Map<string, Finding>();
  for (const e of cat.list) {
    if (e.kind === 'rule') continue;
    for (const k of Object.keys(e)) {
      const f = `${e.kind}.${k}`;
      if (!SHOWN.includes(k) && !seen.has(f)) out.set(f, { check: 'field-unread', id: f, note: `${e.id} has it; nothing reads it when listing or adding` });
    }
  }
  return [...out.values()];
}

// Pools that offer nothing, so the player can only type a name: the option list isn't in the catalog. '$' pools depend
// on another pick, and skill:proficient on the character.
export function poolChecks(cat: Catalog): Finding[] {
  const c = blankCharacter(), out = new Map<string, Finding>();
  for (const e of cat.list) {
    for (const ch of choicesOf(e)) {
      if (!ch.pool || ch.pool.includes('$') || ch.pool === 'skill:proficient') continue;
      if (!poolOptions(cat, c, ch.pool, {}).length) out.set(ch.pool, { check: 'pool-empty', id: ch.pool, note: `${e.id}: the player can only type a name` });
    }
  }
  return [...out.values()];
}

const COMMON_GRANT_FIELDS = ['id', 'kind', 'name', 'when', 'lvl', 'opt', 'needEq', 'needAtt'];
const readBy = (src: string, f: string) => new RegExp(`\\.${f}\\b|'${f}'`).test(src);
// Grant kinds and fields that app code never names. src: the app's code without the schema, the grant form and the types.
export function grantSourceChecks(entries: Entry[], src: string): Finding[] {
  const out = new Map<string, Finding>();
  for (const e of entries) {
    for (const g of flatGrants(e)) {
      if (!src.includes(`'${g.kind}'`)) out.set(`k${g.kind}`, { check: 'grant-kind-unread', id: g.kind, note: `${e.id} uses it` });
      for (const f of Object.keys(g)) {
        if (!COMMON_GRANT_FIELDS.includes(f) && !readBy(src, f)) out.set(`${g.kind}.${f}`, { check: 'grant-field-unread', id: `${g.kind}.${f}`, note: `${e.id} sets it` });
      }
    }
  }
  return [...out.values()];
}

// Rule categories the app never filters on, so their text is never shown.
export function ruleCatChecks(entries: Entry[], src: string): Finding[] {
  const cats = new Set(entries.flatMap((e) => (e.kind === 'rule' ? [e.cat] : [])));
  return [...cats].filter((c) => !new RegExp(`\\.cat === '${c}'`).test(src)).map((c) => ({ check: 'rule-cat-unread', id: c, note: `rule entries of category ${c} are never shown` }));
}
