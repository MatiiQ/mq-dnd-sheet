// Finds discrepancies between the catalog and its sources: pure functions over entries and source text, so each can be
// tested with synthetic input. catalog-audit.test.ts feeds them the real files. A finding's check and id are its key in
// the known list; its note goes only to gitignored files in reference/, because it can hold PHB values.
import { createHash } from 'node:crypto';
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
const RARITY = /\b(Very Rare|Uncommon|Common|Rare|Legendary|Artifact)\b/gi;
// One rarity against the type line's only one (the rarity can wrap to the next line); several ("Rare (Silver), Very Rare
// (Bronze)") whole.
const rarityMatches = (rarity: string, line: string, full: string) => {
  const own = rarity.match(RARITY) ?? [], src = line.match(RARITY) ?? full.match(RARITY) ?? [];
  return own.length > 1 ? nameKey(full).includes(nameKey(rarity)) : src.length === 1 && own[0]?.toLowerCase() === src[0].toLowerCase();
};

// Every spell and magic item heading of the SRD text has an entry, and every SRD entry of those kinds has a heading.
export function srdHeadingChecks(text: string, entries: Entry[]): Finding[] {
  const out: Finding[] = [], L = sourceLines(text), srd = entries.filter((e) => e.src === 'srd' || e.replace);
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
    if (!k) {
      // A heading can wrap, its last line starting lower case.
      const head = /^[a-z]/.test(L[i - 1]) && i > 1 ? `${L[i - 2]} ${L[i - 1]}` : L[i - 1];
      if (/^[A-Z][\w’' ,+()-]*$/.test(head)) out.push({ check: 'srd-item-missing', id: nameKey(head), note: `heading "${head}" has no entry` });
      return;
    }
    found.add(k);
    const e = items.get(k)!, full = `${l} ${L[i + 1] ?? ''}`;
    if (e.kind !== 'item') return;
    if (!/varies|\(\+1\)/i.test(full) && !rarityMatches(e.rarity ?? '', l, full)) out.push({ check: 'srd-item-rarity', id: e.id, note: `${e.rarity} against "${full.slice(0, 80)}"` });
    if (/\(Requires/.test(full) !== !!e.attune) out.push({ check: 'srd-item-attune', id: e.id, note: `attune ${!!e.attune} against "${full.slice(0, 80)}"` });
  });
  for (const [k, e] of items) if (!found.has(k)) out.push({ check: 'srd-item-extra', id: e.id, note: 'entry with no SRD heading' });
  return out;
}

const COMPARED: Partial<Record<Entry['kind'], string[]>> = {
  spell: ['lvl', 'school', 'classes', 'time', 'range', 'comp', 'dur', 'conc', 'ritual'],
  item: ['cost', 'wt', 'wcat', 'wrange', 'dmg', 'dtype', 'props', 'thrown', 'vers', 'ammo', 'mastery', 'armor', 'acBase', 'strReq', 'stealthDis'],
  feature: ['lvl', 'again'], feat: ['cat', 'prereq', 'repeat'], background: ['feat'], species: ['sizes', 'speed'], trait: ['lvl'], class: ['hd', 'saves', 'armor', 'weapons', 'tools', 'skills']
};
// Spell numbers the parser reads from condensed text, so it can leave one out: compared only when both sides have it.
const COMPARED_IF_BOTH = ['dice', 'dtype', 'save', 'atk', 'scale'];
const same = (a: unknown, b: unknown) => (typeof a === 'string' && typeof b === 'string' ? nameKey(a) === nameKey(b) : a === b);
// A value as it compares: a spell's class list in any order, a class's skill choice as its pick and sorted pool.
function comparable(f: string, v: unknown): unknown {
  if (f === 'classes') return [...String(v).split(',')].sort().join();
  if (f === 'tools' && typeof v === 'string') return v.replace(/\s*\([^)]*\)$/, ''); // the "see …" pointer differs by book
  if (f !== 'skills' || typeof v !== 'object' || !v) return v;
  const c = v as { pick?: number; pool?: string };
  return `${c.pick} ${(c.pool ?? '').split(/[:|]/).sort().join()}`;
}
const diceAndCost = (s: string) => new Set(s.match(/\d+d\d+|[\d,]+\+? GP/g) ?? []);
// parsed: the PHB parser's output before the pack drops what the SRD has. Each must be in the catalog and agree with it,
// field by field. A difference on a PHB-only entry means a hand overlay or a stale pack. An SRD spell's dice and costs
// must not disagree in both directions (one-sided differences are the condensed text leaving things out).
export function referenceChecks(parsed: Entry[], entries: Entry[]): Finding[] {
  const out: Finding[] = [], byId = new Map(entries.map((e) => [e.id, e]));
  for (const p of parsed) {
    const e = byId.get(p.id);
    if (!e) { out.push({ check: 'phb-missing', id: p.id, note: 'parsed from reference/, not in the catalog (run npm run pack?)' }); continue; }
    const check = e.src === 'srd' ? 'srd-phb-field' : 'pack-field', label = e.src === 'srd' ? 'SRD' : 'Pack';
    const ev = e as unknown as Record<string, unknown>, pv = p as unknown as Record<string, unknown>;
    const differs = (f: string) => !same(comparable(f, ev[f]), comparable(f, pv[f]));
    const report = (f: string) => out.push({ check, id: `${p.id}:${f}`, note: `${label} ${JSON.stringify(ev[f])}, PHB ${JSON.stringify(pv[f])}` });
    for (const f of COMPARED[p.kind] ?? []) if (differs(f)) report(f);
    if (p.kind === 'spell') for (const f of COMPARED_IF_BOTH) if (ev[f] !== undefined && pv[f] !== undefined && differs(f)) report(f);
    if (e.src === 'srd' && p.kind === 'spell' && p.desc) {
      const s = diceAndCost(e.desc), h = diceAndCost(p.desc), so = [...s].filter((x) => !h.has(x)), po = [...h].filter((x) => !s.has(x));
      if (so.length && po.length) out.push({ check: 'srd-phb-dice', id: p.id, note: `SRD ${so.join(', ')}, PHB ${po.join(', ')}` });
    }
  }
  return out;
}

// A parser that gives fewer entries of a kind than the catalog holds: a format change in reference/ turned it off, so
// nothing of that kind gets compared. The parsers give no rules, proficiencies or magic items.
export function coverageChecks(parsed: Entry[], entries: Entry[]): Finding[] {
  const count = (list: Entry[]) => {
    const n = new Map<string, number>();
    for (const e of list) if (e.kind !== 'rule' && e.kind !== 'prof' && !(e.kind === 'item' && e.cat === 'magic')) n.set(e.kind, (n.get(e.kind) ?? 0) + 1);
    return n;
  };
  const from = count(parsed);
  return [...count(entries)].filter(([k, n]) => (from.get(k) ?? 0) < n).map(([k, n]) => ({ check: 'parser-short', id: k, note: `parsed ${from.get(k) ?? 0}, catalog holds ${n}` }));
}

// A spell's numbers against its own description. Not `save`: the condensed PHB text often leaves it out.
export function spellNumberChecks(entries: Entry[]): Finding[] {
  const out: Finding[] = [];
  for (const e of entries) {
    if (e.kind !== 'spell') continue;
    const add = (f: string, note: string) => out.push({ check: `spell-self-${f}`, id: e.id, note }), d = e.desc.toLowerCase();
    const lead = e.dice ? /^\d+d\d+/.exec(e.dice)?.[0] : undefined;
    if (lead && !d.includes(lead)) add('dice', `dice ${e.dice} not in the text`);
    if (e.dtype && !d.includes(e.dtype.toLowerCase())) add('dtype', `${e.dtype} not in the text`);
    if (e.atk && !d.includes(`${e.atk} spell attack`)) add('atk', `no ${e.atk} spell attack in the text`);
    if (/^Concentration/.test(e.dur) !== !!e.conc) add('conc', `conc ${!!e.conc} against "${e.dur}"`);
  }
  return out;
}

// A whole-number charge count against the item's own text. Rolled counts (1d3) and formulas are left out.
export function itemNumberChecks(entries: Entry[]): Finding[] {
  return entries.flatMap((e) => (e.kind === 'item' && e.charges && /^\d+$/.test(e.charges) && !new RegExp(`\\b${e.charges} charges?\\b`, 'i').test(e.desc)
    ? [{ check: 'item-self-charges', id: e.id, note: `charges ${e.charges} not in the text` }] : []));
}

// Rule entries against the parser's reading of the SRD glossary, both ways.
export function ruleSourceChecks(parsed: Entry[], entries: Entry[]): Finding[] {
  const ids = (list: Entry[]) => new Set(list.filter((e) => e.kind === 'rule').map((e) => e.id)), from = ids(parsed), have = ids(entries);
  return [
    ...[...from].filter((x) => !have.has(x)).map((id) => ({ check: 'rule-source-missing', id, note: 'in the SRD glossary, no entry' })),
    ...[...have].filter((x) => !from.has(x)).map((id) => ({ check: 'rule-source-extra', id, note: 'entry with no SRD glossary heading' }))
  ];
}

// Each entry's grants as a short hash. Grant values mostly have no source to compare with, so any change needs accepting.
export const grantHashes = (entries: Entry[]): Record<string, string> => Object.fromEntries(entries.filter((e) => grantsOf(e).length)
  .map((e) => [e.id, createHash('sha1').update(JSON.stringify(grantsOf(e))).digest('hex').slice(0, 12)]).sort(([a], [b]) => a.localeCompare(b)));
export function grantChecks(entries: Entry[], stored: Record<string, string>): Finding[] {
  const now = grantHashes(entries);
  return [...new Set([...Object.keys(now), ...Object.keys(stored)])].sort().filter((id) => now[id] !== stored[id])
    .map((id) => ({ check: 'grants-changed', id, note: `grants ${stored[id] ?? 'none'} now ${now[id] ?? 'none'}; accept with AUDIT_UPDATE=1` }));
}

// Known findings. accepted: fine as they are. todo: real defects still to fix. A note holds what the finding covers, so a
// known finding that gets worse fails too.
export interface KnownEntry { note: string; reason: string }
export interface Known { accepted: Record<string, KnownEntry>; todo: Record<string, KnownEntry>; grants?: Record<string, string> }
export function compareKnown(findings: Finding[], known: Known): { new: string[]; changed: string[]; gone: string[] } {
  const all = { ...known.accepted, ...known.todo }, keys = new Set(findings.map(keyOf));
  return {
    new: findings.filter((f) => !all[keyOf(f)]).map((f) => `${keyOf(f)}: ${f.note}`),
    changed: findings.filter((f) => all[keyOf(f)] && all[keyOf(f)].note !== f.note).map((f) => `${keyOf(f)}: ${JSON.stringify(all[keyOf(f)].note)} is now ${JSON.stringify(f.note)}`),
    gone: Object.keys(all).filter((k) => !keys.has(k))
  };
}
// The list after accepting the findings: a kept key keeps its group and reason, a new one goes to todo for triage.
export function updateKnown(findings: Finding[], known: Known): { next: Known; added: string[]; removed: string[]; changed: string[] } {
  const next: Known = { accepted: {}, todo: {} }, was = compareKnown(findings, known);
  for (const f of findings) {
    const k = keyOf(f), group = known.accepted[k] ? 'accepted' : 'todo';
    next[group][k] = { note: f.note, reason: known[group][k]?.reason ?? 'new, not triaged' };
  }
  return { next, added: was.new.map((x) => x.slice(0, x.indexOf(': '))), removed: was.gone, changed: was.changed.map((x) => x.slice(0, x.indexOf(': '))) };
}

// Each class's spell list in reference/classes/<class>.md against the spells' `classes`.
export function spellListChecks(cls: string, md: string, entries: Entry[]): Finding[] {
  const title = cls.charAt(0).toUpperCase() + cls.slice(1), at = md.indexOf(`## ${title} Spell List`);
  const onList = new Set(entries.filter((e) => e.kind === 'spell' && e.classes.split(',').includes(cls)).map((e) => e.id));
  if (at < 0) return onList.size ? [{ check: 'spell-list-no-heading', id: cls, note: `${onList.size} spells name the class; no "## ${title} Spell List" heading` }] : [];
  const end = md.indexOf('\n## ', at + 3), listed = new Set<string>();
  for (const l of md.slice(at, end < 0 ? undefined : end).split('\n')) {
    if (l.startsWith('|') && !/^\|\s*(Spell|-|Name)/.test(l)) listed.add(catalogId('spell', straight(l.split('|')[1].trim())));
    else if (l.startsWith('- ')) listed.add(catalogId('spell', straight(l.slice(2).split('(')[0].trim())));
  }
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
export const LOOKUP_HEADING = /Option|Stat Block|Surge|Mounts|Tack|Vehicles|Mastery|Languages/i;
// The rows of those tables whose first cell (the second, after a number or roll range), up to five words, appears
// nowhere in the catalog's names and descriptions. One finding per table.
export function lookupTableChecks(file: string, md: string, entries: Entry[]): Finding[] {
  const text = straight(entries.map((e) => `${e.name}\n${descOf(e)}`).join('\n'));
  const out: Finding[] = [];
  let heading = '', rows: string[][] = [];
  const flush = () => {
    if (LOOKUP_HEADING.test(heading) && rows.length) {
      const absent = rows.map((r) => (/^[\d\s–—-]*$/.test(r[0]) ? r[1] ?? '' : r[0])).map((c) => straight(c.replace(/\*/g, '')).split(/\s+/).slice(0, 5).join(' ').trim())
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

const NEEDS_TEXT = (e: Entry) => e.kind !== 'prof' && !(e.kind === 'item' && !['magic', 'gear', 'tool', 'pack', 'focus'].includes(e.cat));
const REFERENCED_TABLE = /[Tt]he ((?:[A-Z][\w’'-]* )+)table\b/g;
// What the descriptions themselves give away. headings: lines that stand alone in the source text (for text that ran
// on into the next heading); a heading that is also an entry name is a normal last word of a list.
export function textChecks(entries: Entry[], headings: Set<string> = new Set()): Finding[] {
  const out: Finding[] = [], names = new Set(entries.map((e) => e.name));
  // A table may sit in the entry that owns it (Wild Magic Surge), not in those that refer to it.
  const tableLines = new Set(entries.flatMap((e) => descOf(e).split('\n').filter((l) => / Table$/.test(l.trim())).map((l) => l.trim())));
  for (const e of entries) {
    const d = descOf(e).trim(), add = (check: string, note: string) => out.push({ check, id: e.id, note });
    if (!d) { if (NEEDS_TEXT(e)) add('text-empty', 'no description'); continue; }
    if (/^#{1,6} /m.test(d) || /^\s*\|/m.test(d) || /\*\*/.test(d) || /(^|\n)-{3,}\s*$/.test(d)) add('text-markdown', 'markdown the app shows as typed');
    if (d.includes('­')) add('text-soft-hyphen', 'soft hyphen breaks searching');
    if (/System Reference Document|=====|\(PHB p\./.test(d)) add('text-page-junk', 'page header in the text');
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
      if (lastAt === m.index + m[0].indexOf(title)) { if (!tableLines.has(`${title} Table`)) out.push({ check: 'table-missing', id: `${e.id}:${title}`, note: `refers to the ${title} table, which isn't in the text` }); }
      else if (!/\d|\n/.test(d.slice(lastAt + title.length))) out.push({ check: 'table-cut', id: `${e.id}:${title}`, note: `the ${title} table has no rows` });
    }
  }
  return out.filter((f, i) => out.findIndex((x) => keyOf(x) === keyOf(f)) === i);
}

// Standalone title-case lines of two to four words in the source text.
export const standaloneHeadings = (text: string) => new Set(sourceLines(text).filter((l) => /^[A-Z][\w’'-]*( [A-Z][\w’'-]*){1,3}$/.test(l)));

// Every weapon property and mastery the items name has rule text to read.
export function ruleTextChecks(entries: Entry[]): Finding[] {
  const rules = new Set(entries.filter((e) => e.kind === 'rule').map((e) => slug(e.name))), users = new Map<string, string[]>();
  for (const e of entries) {
    if (e.kind !== 'item') continue;
    const need = [...(e.props ? e.props.split(',').map((p) => `property:${p}`) : []), ...(e.mastery ? [`mastery:${slug(e.mastery)}`] : [])];
    for (const n of need) if (!rules.has(n.split(':')[1])) users.set(n, [...(users.get(n) ?? []), e.name]);
  }
  return [...users].map(([id, names]) => ({ check: 'rule-text-missing', id, note: `${names.sort().join(', ')} show it; no rule entry explains it` }));
}

const EFFECTS: { cue: RegExp; kinds: GrantSpec['kind'][]; label: string }[] = [
  { cue: /\b(?:gain|gains|have|has) a (?:Fly|Swim|Climb|Burrow) Speed|Speed increases by \d+/g, kinds: ['speed'], label: 'speed' },
  { cue: /\b(?:you|target|it) (?:have|has|gain|gains) Resistance to/gi, kinds: ['defense'], label: 'resistance' },
  { cue: /\bextra \d+d\d+/g, kinds: ['xdmg', 'dmgBonus'], label: 'extra damage' }
];
// Text that states an effect the sheet has a grant kind for, on an entry with no such grant. A heuristic: the known list
// holds the ones that are text by design, so only new entries with this shape come up.
export function effectChecks(entries: Entry[]): Finding[] {
  const out: Finding[] = [];
  for (const e of entries) {
    if (!['spell', 'feature', 'trait', 'feat'].includes(e.kind) && !(e.kind === 'item' && e.cat === 'magic')) continue;
    const kinds = new Set(flatGrants(e).map((g) => g.kind));
    for (const { cue, kinds: want, label } of EFFECTS) {
      const m = [...descOf(e).matchAll(cue)].map((x) => `"${x[0]}"`);
      if (m.length && !want.some((k) => kinds.has(k))) out.push({ check: 'effect-no-grant', id: `${e.id}:${label}`, note: `${m.join(', ')} with no ${want.join(' or ')} grant` });
    }
  }
  return out;
}

// The rest looks at class features and feats only: what their text says against what the sheet gets from them.
const isGranter = (e: Entry) => e.kind === 'feature' || e.kind === 'feat';
const has = (...kinds: GrantSpec['kind'][]) => (e: Entry) => flatGrants(e).some((g) => kinds.includes(g.kind));
const hasPool = (prefix: string) => (e: Entry) => grantsOf(e).some((s) => s.kind === 'choice' && !!s.pool?.startsWith(prefix));
// Options a pool offers are listed under the feature that offers them, whose row spends them: text is all they need.
const isPoolOption = (e: Entry) => e.kind === 'feature' && (e.of === 'maneuver' || e.of === 'metamagic');
// What these say belongs to setting up the class (slots, cantrips, prepared counts), a separate piece of work.
const isClassSetup = (e: Entry) => e.kind === 'feature' && /^(Spellcasting|Pact Magic)$/.test(e.name);
const nothingHoldsIt = () => false;
// Each cue with what would carry it. check names the gap: mechanic-no-grant has a grant kind waiting; the others have no
// field or kind in the schema yet, so nothing can satisfy them (give `done` a real test when one comes).
const MECHANICS: { check: string; label: string; cue: RegExp; done: (e: Entry, m: RegExpMatchArray) => boolean }[] = [
  { check: 'mechanic-no-grant', label: 'cantrip', cue: /\b(?:learn|know)\b[^.\n]*\bcantrips?\b/i, done: (e) => has('spell')(e) || hasPool('spell:')(e) },
  { check: 'mechanic-no-grant', label: 'free cast', cue: /\bcast [^.\n]{0,60}?without (?:expending )?a (?:spell )?slot/i, done: (e) => flatGrants(e).some((g) => (g.kind === 'resource' && !!g.casts) || (g.kind === 'spell' && !!g.always)) },
  { check: 'mechanic-no-grant', label: 'sense', cue: /\b(?:have|gain) (?:Truesight|Blindsight|Tremorsense|Darkvision)\b|\bTruesight \d+ ft|\bsee normally in Dim Light/i, done: has('sense') },
  { check: 'mechanic-no-grant', label: 'extra attacks', cue: /\bExtra Attack feature\b|\battack twice\b|\btwo extra attacks\b/i, done: has('attacks') },
  { check: 'mechanic-no-grant', label: 'attack ability', cue: /\buse your \w+ modifier[^.\n]*\battack|\binstead of (?:using )?(?:your )?(?:Strength|Dexterity)[^.\n]*\battack/i, done: has('atkAbil', 'unarmed') },
  { check: 'mechanic-no-grant', label: 'damage bonus', cue: /\badd your (?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) modifier to [^.\n(]*\bdamage|\bbonus to the damage\b/i, done: has('dmgBonus', 'xdmg') },
  { check: 'mechanic-no-grant', label: 'attack bonus', cue: /\badd your \w+ modifier to (?:the )?attack rolls?|\bbonus to (?:your )?attack rolls?/i, done: has('atkBonus', 'spellAtk') },
  { check: 'mechanic-no-grant', label: 'spell save DC', cue: /\bspell save DC[^.\n]*\bincreases? by \d/i, done: has('spellDc') },
  { check: 'mechanic-no-grant', label: 'damage die', cue: /\b(?:becomes|is now|are now|is) (?:a )?(d\d+)\b/i, done: (e, m) => flatGrants(e).some((g) => new RegExp(`\\b\\d*${m[1]}\\b`).test(`${g.die ?? ''},${g.dice ?? ''}`)) },
  { check: 'mechanic-no-grant', label: 'Light extra attack', cue: /\bextra attack of the Light property|\bextra attack as a Bonus Action/i, done: has('lightExtra') },
  { check: 'mechanic-no-grant', label: 'feat pick', cue: /\bOrigin feat of your choice/i, done: hasPool('feat:') },
  { check: 'mechanic-no-grant', label: 'save Advantage', cue: /\bAdvantage on [^.\n]*\bsaving throws?/i, done: has('defense') },
  { check: 'mechanic-no-field', label: 'save DC', cue: /\bDC (?:equal to |equals |= ?)?8 ?(?:plus|\+)|\bFocus Save DC\b/i, done: (e) => flatGrants(e).some((g) => g.dc !== undefined) },
  { check: 'mechanic-no-field', label: 'half a number', cue: /\bhalf (?:your )?(?:[A-Z]\w+ level|Proficiency Bonus)/, done: (e) => flatGrants(e).some((g) => g.cat === 'half' || Object.values(g).some((v) => typeof v === 'string' && /\bhlvl\b/.test(v))) },
  { check: 'mechanic-no-field', label: 'regain on Initiative', cue: /\broll Initiative[^.\n]*\bregain|\bregain[^.\n]*\broll Initiative|\brecharges? when you roll Initiative/i, done: (e) => flatGrants(e).some((g) => g.regainTo !== undefined) },
  { check: 'mechanic-no-field', label: 'stat block', cue: /\bstat block\b|\bFind (?:Familiar|Steed)\b/, done: nothingHoldsIt },
  { check: 'mechanic-no-field', label: 'state to track', cue: /\bward\b[^.\n]*\b(?:Hit Points|HP)\b|\bforetelling|\broll two d20s/i, done: (e) => flatGrants(e).some((g) => g.kind === 'resource' || !!g.uses) }
];
export function mechanicChecks(entries: Entry[]): Finding[] {
  const out: Finding[] = [];
  for (const e of entries.filter((x) => isGranter(x) && !isPoolOption(x) && !isClassSetup(x))) {
    for (const { check, label, cue, done } of MECHANICS) {
      const m = descOf(e).match(cue);
      if (m && !done(e, m)) out.push({ check, id: `${e.id}:${label}`, note: `"${m[0].slice(0, 70)}" and nothing on the sheet holds it` });
    }
  }
  return out;
}

// A feature or feat that gives the sheet nothing past ability scores, or that says it takes a Bonus Action or Reaction
// and has no row in the Actions tab.
export function rowChecks(entries: Entry[]): Finding[] {
  const out: Finding[] = [];
  for (const e of entries.filter((x) => isGranter(x) && !isPoolOption(x) && !isClassSetup(x))) {
    const timing = descOf(e).match(/\b(?:Bonus Action|Reaction)\b/)?.[0], gs = flatGrants(e);
    if (gs.every((g) => g.kind === 'abil') && !grantsOf(e).some((s) => s.kind === 'choice' && s.pool)) out.push({ check: 'text-only', id: e.id, note: `no row or number${gs.length ? ' past its ability increase' : ''}${timing ? `; the text names a ${timing}` : ''}` });
    else if (timing && !gs.some((g) => g.kind === 'action' || g.kind === 'lightExtra')) out.push({ check: 'timing-no-row', id: e.id, note: `the text names a ${timing}; no action grant` });
  }
  return out;
}

const SPENDS = /\b(?:spend|expend)\b[^.;:]*/i;
// An action row whose note says it spends something, with no `res` or `uses`: tapping it spends nothing.
export function actionCostChecks(entries: Entry[]): Finding[] {
  return entries.filter(isGranter).flatMap((e) => flatGrants(e).filter((g) => g.kind === 'action' && !g.res && !g.uses && SPENDS.test(g.note ?? ''))
    .map((g) => ({ check: 'action-cost-unlinked', id: `${e.id}:${g.id}`, note: `"${g.note!.match(SPENDS)![0].trim().slice(0, 60)}" with no res` })));
}

// One spell granted by two entries of a class: the sheet lists it twice. A subclass counts with its class, two subclasses
// never meet.
export function repeatedSpellChecks(entries: Entry[]): Finding[] {
  const features = entries.filter((e) => e.kind === 'feature'), out: Finding[] = [];
  for (const e of features) {
    if (e.kind !== 'feature') continue;
    const mine = new Set(flatGrants(e).flatMap((g) => (g.kind === 'spell' && g.spell?.startsWith('spell/') ? [g.spell] : [])));
    for (const f of features) {
      if (f.kind !== 'feature' || f.id <= e.id || f.cls !== e.cls || (f.sub && e.sub && f.sub !== e.sub)) continue;
      for (const g of new Set(flatGrants(f).map((x) => x.spell))) if (g && mine.has(g)) out.push({ check: 'spell-granted-twice', id: `${e.id}+${f.id}:${g}`, note: 'both grant it, so it shows twice' });
    }
  }
  return out;
}

// A feature whose text allows "another feat" with a pool of one feat category: the rest of the feats can't be picked there.
export function featPoolChecks(entries: Entry[]): Finding[] {
  const users = new Map<string, string[]>();
  for (const e of entries.filter((x) => x.kind === 'feature' && /\bor another feat\b/i.test(descOf(x)))) {
    for (const s of grantsOf(e)) if (s.kind === 'choice' && /^feat:cat=/.test(s.pool ?? '')) users.set(s.pool!, [...(users.get(s.pool!) ?? []), e.id]);
  }
  return [...users].map(([id, ids]) => ({ check: 'feat-pool-narrow', id, note: `${ids.sort().join(', ')}: the text allows another feat` }));
}
