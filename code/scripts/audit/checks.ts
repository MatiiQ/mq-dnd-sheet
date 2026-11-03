// Finds discrepancies between the catalog and its sources: pure functions over entries and source text, so each can be
// tested with synthetic input. catalog-audit.test.ts feeds them the real files. A finding's check and id are its key in
// the known list; its note goes only to the local report, because it can hold PHB values.
import { catalogId, slug, type Entry, type GrantSpec, type Spec } from '../../src/catalog/schema.ts';

export interface Finding { check: string; id: string; note: string }
export const keyOf = (f: Pick<Finding, 'check' | 'id'>) => `${f.check}|${f.id}`;

const nameKey = (s: string) => s.toLowerCase().replace(/­/g, '').replace(/[^a-z0-9]/g, '');
const straight = (s: string) => s.replace(/’/g, "'").replace(/­/g, '');
const descOf = (e: Entry) => e.desc ?? '';
const grantsOf = (e: Entry): Spec[] => ('grants' in e && e.grants ? e.grants : []);
// Every grant of an entry, a choice's options included.
export const flatGrants = (e: Entry): GrantSpec[] => grantsOf(e).flatMap((s) => (s.kind === 'choice' ? s.options ?? [] : [s]));
const sourceLines = (text: string) => text.split('\n').map((l) => l.trim())
  .filter((l) => l && !/^\d{1,3}$/.test(l) && !l.includes('System Reference Document'));

const SCHOOL = 'Abjuration|Conjuration|Divination|Enchantment|Evocation|Illusion|Necromancy|Transmutation';
const SPELL_LINE = new RegExp(`^(Level \\d (${SCHOOL})|(${SCHOOL}) Cantrip)`);
const MAGIC_START = /^(Wondrous Item|Armor|Weapon|Ring|Rod|Staff|Wand|Potion|Scroll|Ammunition)(,| \()/;
const MAGIC_LINE = /\b(Common|Uncommon|Rare|Legendary|Artifact|Varies|Any)\b/;

// Every spell and magic item heading of the SRD text has an entry, and every SRD entry of those kinds has a heading.
export function srdHeadingChecks(text: string, entries: Entry[]): Finding[] {
  const out: Finding[] = [], L = sourceLines(text), srd = entries.filter((e) => e.src === 'srd');
  const spells = new Set(srd.filter((e) => e.kind === 'spell').map((e) => nameKey(e.name)));
  const spellHeads = new Set(L.flatMap((l, i) => (SPELL_LINE.test(l) && i ? [nameKey(L[i - 1])] : [])));
  for (const h of spellHeads) if (!spells.has(h)) out.push({ check: 'srd-spell-missing', id: h, note: 'heading in the SRD text, no entry' });
  for (const k of spells) if (!spellHeads.has(k)) out.push({ check: 'srd-spell-extra', id: k, note: 'entry with no SRD heading' });

  const items = new Map(srd.flatMap((e) => (e.kind === 'item' && e.rarity ? [[nameKey(e.name), e] as const] : [])));
  const found = new Set<string>();
  L.forEach((l, i) => {
    // A type line can wrap before its rarity ("Weapon (Greatsword, Longsword, Rapier, Scimitar, or").
    if (!i || l.length >= 100 || !MAGIC_LINE.test(`${l} ${L[i + 1] ?? ''}`) || !MAGIC_START.test(l)) return;
    const one = nameKey(L[i - 1]), two = i > 1 ? nameKey(`${L[i - 2]} ${L[i - 1]}`) : '';
    const k = items.has(one) ? one : items.has(two) ? two : '';
    // A line that reads as prose before the type line is not a heading.
    if (!k) { if (/^[A-Z][\w’' ,+-]*$/.test(L[i - 1])) out.push({ check: 'srd-item-missing', id: one, note: `heading "${L[i - 1]}" has no entry` }); return; }
    found.add(k);
    const e = items.get(k)!, full = `${l} ${L[i + 1] ?? ''}`;
    if (e.kind !== 'item') return;
    if (!/varies|\(\+1\)/i.test(full) && !full.toLowerCase().includes((e.rarity ?? '').toLowerCase())) out.push({ check: 'srd-item-rarity', id: e.id, note: `${e.rarity} against "${full.slice(0, 80)}"` });
    if (/\(Requires/.test(full) !== !!e.attune) out.push({ check: 'srd-item-attune', id: e.id, note: `attune ${!!e.attune} against "${full.slice(0, 80)}"` });
  });
  for (const [k, e] of items) if (!found.has(k)) out.push({ check: 'srd-item-extra', id: e.id, note: 'entry with no SRD heading' });
  return out;
}

const COMPARED: Partial<Record<Entry['kind'], string[]>> = {
  spell: ['lvl', 'school', 'classes', 'time', 'range', 'comp', 'dur', 'conc', 'ritual'],
  item: ['cost', 'wt', 'wcat', 'wrange', 'dmg', 'dtype', 'props', 'thrown', 'vers', 'ammo', 'mastery', 'armor', 'acBase', 'strReq', 'stealthDis'],
  feature: ['lvl', 'again'], feat: ['cat', 'prereq', 'repeat'], background: ['abils', 'feat'], species: ['sizes', 'speed'], trait: ['lvl'], class: ['hd', 'saves']
};
const same = (a: unknown, b: unknown) => (typeof a === 'string' && typeof b === 'string' ? nameKey(a) === nameKey(b) : a === b);
const diceAndCost = (s: string) => new Set(s.match(/\d+d\d+|[\d,]+\+? GP/g) ?? []);
// parsed: the PHB parser's output before the pack drops what the SRD has. Each must be in the catalog; an SRD entry must
// agree with it, field by field, and a spell's dice and costs must not disagree in both directions (one-sided
// differences are the condensed text leaving things out).
export function referenceChecks(parsed: Entry[], entries: Entry[]): Finding[] {
  const out: Finding[] = [], byId = new Map(entries.map((e) => [e.id, e]));
  for (const p of parsed) {
    const e = byId.get(p.id);
    if (!e) { out.push({ check: 'phb-missing', id: p.id, note: 'parsed from reference/, not in the catalog (run npm run pack?)' }); continue; }
    if (e.src !== 'srd') continue;
    for (const f of COMPARED[p.kind] ?? []) {
      const a = (e as unknown as Record<string, unknown>)[f], b = (p as unknown as Record<string, unknown>)[f];
      if (f === 'classes' ? nameKey([...String(a).split(',')].sort().join()) !== nameKey([...String(b).split(',')].sort().join()) : !same(a, b)) {
        out.push({ check: 'srd-phb-field', id: `${p.id}:${f}`, note: `SRD ${JSON.stringify(a)}, PHB ${JSON.stringify(b)}` });
      }
    }
    if (p.kind === 'spell' && p.desc) {
      const s = diceAndCost(e.desc), h = diceAndCost(p.desc), so = [...s].filter((x) => !h.has(x)), po = [...h].filter((x) => !s.has(x));
      if (so.length && po.length) out.push({ check: 'srd-phb-dice', id: p.id, note: `SRD ${so.join(', ')}, PHB ${po.join(', ')}` });
    }
  }
  return out;
}

// Each class's spell list in reference/classes/<class>.md against the spells' `classes`.
export function spellListChecks(cls: string, md: string, entries: Entry[]): Finding[] {
  const title = cls.charAt(0).toUpperCase() + cls.slice(1), at = md.indexOf(`## ${title} Spell List`);
  if (at < 0) return [];
  const end = md.indexOf('\n## ', at + 3), listed = new Set<string>();
  for (const l of md.slice(at, end < 0 ? undefined : end).split('\n')) {
    if (l.startsWith('|') && !/^\|\s*(Spell|-|Name)/.test(l)) listed.add(catalogId('spell', straight(l.split('|')[1].trim())));
    else if (l.startsWith('- ')) listed.add(catalogId('spell', straight(l.slice(2).split('(')[0].trim())));
  }
  const onList = new Set(entries.filter((e) => e.kind === 'spell' && e.classes.split(',').includes(cls)).map((e) => e.id));
  return [
    ...[...listed].filter((x) => !onList.has(x)).map((id) => ({ check: 'spell-list-missing', id: `${cls}:${id}`, note: 'on the class list, not marked on the spell' })),
    ...[...onList].filter((x) => !listed.has(x)).map((id) => ({ check: 'spell-list-extra', id: `${cls}:${id}`, note: 'marked on the spell, not on the class list' }))
  ];
}

// Every "Level N: Name" heading of a class file has a feature of that name and class, gained at that level.
export function featureHeadingChecks(cls: string, md: string, entries: Entry[]): Finding[] {
  const out: Finding[] = [], feats = entries.filter((e) => e.kind === 'feature' && e.cls === cls);
  for (const m of md.matchAll(/^#{3,4} Level ([\d /]+): (.+?)(?: \(PHB.*)?$/gm)) {
    const name = m[2].replace(/\s*\(.*?\)/g, '').trim();
    if (name === 'Subclass feature') continue;
    const same = feats.filter((e) => e.kind === 'feature' && slug(e.name) === slug(name));
    if (!same.length) { out.push({ check: 'feature-missing', id: `${cls}:${slug(name)}`, note: `heading "${m[0]}" has no feature` }); continue; }
    const levels = same.flatMap((e) => (e.kind === 'feature' ? [e.lvl, ...(e.again ? e.again.split(',').map(Number) : [])] : []));
    for (const l of m[1].split('/').map(Number)) if (!levels.includes(l)) out.push({ check: 'feature-level', id: `${cls}:${slug(name)}:${l}`, note: `feature not gained at level ${l}` });
  }
  return out;
}

// Headings whose tables list things a player looks up: options, stat blocks, roll tables, mounts and vehicles.
export const LOOKUP_HEADING = /Option|Stat Block|Surge|Mounts|Tack|Vehicles|Mastery/i;
// The rows of those tables whose first cell (the second, after a number or roll range), up to five words, appears
// nowhere in the catalog's names and descriptions. One finding per table.
export function lookupTableChecks(file: string, md: string, entries: Entry[]): Finding[] {
  const text = straight(entries.map((e) => `${e.name}\n${descOf(e)}`).join('\n'));
  const out: Finding[] = [];
  let heading = '', rows: string[][] = [];
  const flush = () => {
    if (LOOKUP_HEADING.test(heading) && rows.length) {
      const absent = rows.map((r) => (/^[\d\s–-]*$/.test(r[0]) ? r[1] ?? '' : r[0])).map((c) => straight(c.replace(/\*\*/g, '')).split(/\s+/).slice(0, 5).join(' ').trim())
        .filter((c) => c && !new RegExp(`(?<!\\w)${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`).test(text));
      if (absent.length) out.push({ check: 'lookup-table-absent', id: `${file}#${heading.replace(/\s*\(PHB.*$/, '')}`, note: `${absent.length} of ${rows.length} rows absent: ${absent.slice(0, 6).join(', ')}` });
    }
    rows = [];
  };
  let header = true;
  for (const l of md.split('\n')) {
    const h = /^#{2,5} (.+)$/.exec(l);
    if (h) { flush(); heading = h[1]; header = true; continue; }
    if (!l.startsWith('|')) { if (rows.length) { flush(); } header = true; continue; }
    if (/^\|[\s:|-]+\|$/.test(l)) continue;
    if (header) { header = false; continue; }
    rows.push(l.split('|').slice(1, -1).map((c) => c.trim()));
  }
  flush();
  return out;
}

const NEEDS_TEXT = (e: Entry) => e.kind !== 'prof' && e.kind !== 'rule' && !(e.kind === 'item' && !['magic', 'gear', 'tool', 'pack', 'focus'].includes(e.cat));
const REFERENCED_TABLE = /[Tt]he ((?:[A-Z][\w’'-]* )+)table\b/g;
// What the descriptions themselves give away. headings: lines that stand alone in the source text (for text that ran
// on into the next heading); a heading that is also an entry name is a normal last word of a list.
export function textChecks(entries: Entry[], headings: Set<string> = new Set()): Finding[] {
  const out: Finding[] = [], names = new Set(entries.map((e) => e.name));
  for (const e of entries) {
    const d = descOf(e).trim(), add = (check: string, note: string) => out.push({ check, id: e.id, note });
    if (!d) { if (NEEDS_TEXT(e)) add('text-empty', 'no description'); continue; }
    if (/^#{1,6} /m.test(d) || /^\s*\|/m.test(d) || /\*\*/.test(d) || /(^|\n)-{3,}\s*$/.test(d)) add('text-markdown', 'markdown the app shows as typed');
    if (d.includes('­')) add('text-soft-hyphen', 'soft hyphen breaks searching');
    if (/System Reference Document|=====/.test(d)) add('text-page-junk', 'page header in the text');
    const last = d.split('\n').pop()!, words = last.split(/\s+/);
    if (/\b(Min\.|Cost|Level|Stage|Condition|Effect|Name)$/.test(last)) add('text-table-header-tail', `ends "${last.slice(-40)}"`);
    if (words.length >= 8 && /[a-z,]$/.test(last) && !/\d/.test(last) && !/^(Craft|Utilize):/.test(last)) add('text-cut-short', `ends "${last.slice(-40)}"`);
    for (const n of [4, 3, 2]) {
      const tail = words.slice(-n).join(' ');
      if (words.length > n && headings.has(tail) && !names.has(tail)) { add('text-heading-tail', `ends with the heading "${tail}"`); break; }
    }
    for (const m of d.matchAll(REFERENCED_TABLE)) {
      const title = m[1].trim();
      if (/Features$/.test(title)) continue;
      const lastAt = d.lastIndexOf(title);
      if (lastAt === m.index + m[0].indexOf(title)) add('table-missing', `refers to the ${title} table, which isn't in the text`);
      else if (!/\d/.test(d.slice(lastAt + title.length))) add('table-cut', `the ${title} table has no rows`);
    }
  }
  return out.filter((f, i) => out.findIndex((x) => keyOf(x) === keyOf(f)) === i);
}

// Standalone title-case lines of two to four words in the source text.
export const standaloneHeadings = (text: string) => new Set(sourceLines(text).filter((l) => /^[A-Z][\w’'-]*( [A-Z][\w’'-]*){1,3}$/.test(l)));

// Every weapon property and mastery the items name has rule text to read.
export function ruleTextChecks(entries: Entry[]): Finding[] {
  const rules = new Set(entries.filter((e) => e.kind === 'rule').map((e) => slug(e.name))), out = new Map<string, Finding>();
  for (const e of entries) {
    if (e.kind !== 'item') continue;
    const need = [...(e.props ? e.props.split(',').map((p) => `property:${p}`) : []), ...(e.mastery ? [`mastery:${slug(e.mastery)}`] : [])];
    for (const n of need) if (!rules.has(n.split(':')[1])) out.set(n, { check: 'rule-text-missing', id: n, note: `${e.name} shows it; no rule entry explains it` });
  }
  return [...out.values()];
}

const EFFECTS: { cue: RegExp; kinds: GrantSpec['kind'][]; label: string }[] = [
  { cue: /\b(?:gain|gains|have|has) a (?:Fly|Swim|Climb|Burrow) Speed|Speed increases by \d+/, kinds: ['speed'], label: 'speed' },
  { cue: /\b(?:you|target|it) (?:have|has|gain|gains) Resistance to/, kinds: ['defense'], label: 'resistance' },
  { cue: /\bextra \d+d\d+/, kinds: ['xdmg', 'dmgBonus'], label: 'extra damage' }
];
// Text that states an effect the sheet has a grant kind for, on an entry with no such grant. A heuristic: the known list
// holds the ones that are text by design, so only new entries with this shape come up.
export function effectChecks(entries: Entry[]): Finding[] {
  const out: Finding[] = [];
  for (const e of entries) {
    if (!['spell', 'feature', 'trait', 'feat'].includes(e.kind) && !(e.kind === 'item' && e.cat === 'magic')) continue;
    const kinds = new Set(flatGrants(e).map((g) => g.kind));
    for (const { cue, kinds: want, label } of EFFECTS) {
      const m = cue.exec(descOf(e));
      if (m && !want.some((k) => kinds.has(k))) out.push({ check: 'effect-no-grant', id: `${e.id}:${label}`, note: `"${m[0]}" with no ${want.join(' or ')} grant` });
    }
  }
  return out;
}
