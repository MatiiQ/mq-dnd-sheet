// reference/ markdown (PHB 2024, condensed) → catalog entries with src 'phb'. Descriptions are the condensed
// reference/ text, never the OCR file. Grants come from reference/authored/ (gitignored), applied by build.ts.
import {
  catalogId, slug, type BackgroundEntry, type ChoiceSpec, type ClassEntry, type Entry, type FeatEntry, type FeatureEntry, type ItemEntry,
  type SpeciesEntry, type SpellEntry, type SubclassEntry, type TraitEntry
} from '../../src/catalog/schema.ts';
import type { Ability, ArmorKind } from '../../src/types.ts';
import { skillKey } from '../lib/skills.ts';
import { profList } from '../srd/classes.ts';
import { playName, pounds, weaponProps } from '../srd/items.ts';
import { ABIL_ALT, DAMAGE_ALT } from '../srd/spells.ts';

const ABILITY: Record<string, Ability> = { str: 'str', dex: 'dex', con: 'con', int: 'int', wis: 'wis', cha: 'cha' };
const ab = (name: string) => ABILITY[name.trim().slice(0, 3).toLowerCase()];
// Markdown markup and page citations out: bullets, bold, italics and "(PHB p.97)".
const clean = (l: string) => l.replace(/^\s*- /, '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/\s*\(PHB p\.[^)]*\)/g, '').trim();

interface Block { title: string; page?: number; depth: number; lines: string[] }
const HEAD = /^(#{1,4}) (.+?)(?: \(PHB p\.(\d+)[^)]*\))?\s*$/;
// The document split at every heading; each block holds the lines up to the next heading of any depth.
function blocks(md: string): Block[] {
  const out: Block[] = [];
  for (const l of md.split('\n')) {
    const m = HEAD.exec(l);
    if (m) out.push({ title: m[2].trim(), page: m[3] ? Number(m[3]) : undefined, depth: m[1].length, lines: [] });
    else out[out.length - 1]?.lines.push(l);
  }
  return out;
}
// The blocks under a depth-2 heading whose title starts with `section`, up to the next depth-2 heading.
function under(all: Block[], section: RegExp): Block[] {
  const a = all.findIndex((b) => b.depth === 2 && section.test(b.title));
  if (a < 0) return [];
  const z = all.findIndex((b, i) => i > a && b.depth <= 2);
  return all.slice(a + 1, z < 0 ? all.length : z);
}
const fields = (lines: string[]) => Object.fromEntries(lines.map((l) => /^- \*\*(.+?):\*\* ?(.*)$/.exec(l)).filter((m) => !!m).map((m) => [m![1], m![2].trim()]));
// Rows of the first markdown table in the lines, as header → cell.
function table(lines: string[]): Record<string, string>[] {
  const rows = lines.filter((l) => l.startsWith('|')).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
  if (rows.length < 2) return [];
  return rows.slice(2).map((r) => Object.fromEntries(r.map((c, i) => [rows[0][i], c])));
}
// Runs a block's parser; an error names the heading it came from.
function named<T>(b: Block, f: () => T): T {
  try { return f(); } catch (e) { throw new Error(`${b.title}: ${e instanceof Error ? e.message : String(e)}`); }
}
const none = (v: string | undefined) => !v || v === '—' || v === '-' || /^none$/i.test(v);

const DAMAGE = new RegExp(`(\\d+d\\d+(?: ?\\+ ?\\d+)?) (${DAMAGE_ALT}) damage`);
// The spell's own save: the first "<Ability> save" whose ability (or list of abilities) isn't given Advantage or
// Disadvantage ("Advantage on Str, Dex, and Con saving throws" is a buff). A Disadvantage after the save doesn't count.
const AB = '(?:Str|Dex|Con|Int|Wis|Cha)[a-z]*\\.?';
const SAVES = new RegExp(`\\b(${AB}(?:, ${AB})*(?:,? (?:and|or) ${AB})?) (?:saves?|saving throws?)`, 'g');
function saveOf(effect: string): { index: number; ab: string } | null {
  for (const m of effect.matchAll(SAVES)) {
    if (/\b(?:Advantage|Disadvantage|Adv\.|Disadv\.) on (?:the )?$/.test(effect.slice(0, m.index))) continue;
    return { index: m.index, ab: m[1].slice(0, 3) };
  }
  return null;
}
export function parseSpellsMd(md: string): SpellEntry[] {
  return blocks(md).filter((b) => b.depth === 3 && b.lines.some((l) => l.startsWith('- **Level/School:**'))).map((b) => named(b, () => {
    const f = fields(b.lines);
    const ls = /^(?:(\d) (\w+)|Cantrip (\w+))( \(Ritual\))?$/.exec(f['Level/School'])!;
    const lvl = ls[1] ? Number(ls[1]) : 0;
    const upgrade = f['Cantrip Upgrade'] ?? (lvl === 0 ? f['Higher Levels / Cantrip Upgrade'] : undefined);
    const higher = f['Higher Levels'] ?? (lvl > 0 ? f['Higher Levels / Cantrip Upgrade'] : undefined);
    const effect = clean(f.Effect);
    const dmg = DAMAGE.exec(effect), heal = /regains? [^.]*?(\d+d\d+(?: ?\+ ?\d+)?)/.exec(effect);
    const fx = dmg && (!heal || dmg.index <= heal.index) ? 'damage' : heal ? 'healing' : 'other';
    const atk = /\b(melee|ranged) spell attack/i.exec(effect), save = saveOf(effect);
    const e: SpellEntry = {
      id: catalogId('spell', b.title), kind: 'spell', name: b.title, src: 'phb', page: b.page,
      desc: [effect, upgrade && `Cantrip Upgrade: ${clean(upgrade)}`, higher && `Higher Levels: ${clean(higher)}`].filter(Boolean).join('\n'),
      lvl, school: ls[2] ?? ls[3], classes: f.Classes.split(/,\s*/).map(slug).join(','), time: f['Casting Time'].replace(/ or Ritual$/, ''),
      range: f.Range, comp: f.Components, dur: f.Duration, conc: /^Concentration/.test(f.Duration), ritual: / or Ritual$/.test(f['Casting Time']) || !!ls[4], fx
    };
    if (atk && (!save || atk.index < save.index)) e.atk = atk[1].toLowerCase() as 'melee' | 'ranged';
    else if (save) e.save = ab(save.ab);
    if (fx === 'damage') { e.dice = dmg![1].replace(/ /g, ''); e.dtype = dmg![2]; }
    if (fx === 'healing') e.dice = heal![1].replace(/ /g, '');
    const slotDice = higher && /(\d+d\d+) per (?:spell )?slot level/.exec(higher)?.[1];
    if (lvl === 0 && upgrade && /\b5\b/.test(upgrade)) e.scale = 'cantrip';
    else if (slotDice) e.scale = `${slotDice}/slot`;
    if (higher) e.higher = clean(higher);
    // Healing that adds the modifier ("regains 2d8 + your spellcasting ability modifier Hit Points"). Sets a flag only.
    if (fx === 'healing' && /(?:\+|plus) (?:your )?spellcasting ability modifier/.test(effect)) e.healMod = true;
    return e;
  }));
}

const FEAT_CAT: Record<string, FeatEntry['cat']> = { Origin: 'origin', General: 'general', 'Fighting Style': 'style', 'Epic Boon': 'boon' };
// "Level 4+; Intelligence, Wisdom, or Charisma 13+" → 'lvl>=4;int|wis|cha>=13'; features and armor training alike.
export function prereqMd(text: string | undefined): string | undefined {
  if (none(text)) return undefined;
  const t = text!, terms: string[] = [];
  const lvl = /Level (\d+)\+/.exec(t);
  if (lvl) terms.push(`lvl>=${lvl[1]}`);
  const abil = new RegExp(`((?:(?:${ABIL_ALT})(?:, or |, | or ))*(?:${ABIL_ALT})) (\\d+)\\+`).exec(t);
  if (abil) terms.push(`${abil[1].split(/, or |, | or /).map(ab).join('|')}>=${abil[2]}`);
  const feat = /((?:Spellcasting|Fighting Style|Pact Magic)(?: or (?:Spellcasting|Fighting Style|Pact Magic))*) feature/i.exec(t);
  if (feat) terms.push(`feature=${feat[1].split(' or ').map(slug).join('|')}`);
  const armor = /(Light|Medium|Heavy) Armor training|(Shield) training/i.exec(t);
  if (armor) terms.push(`armor=${(armor[1] ?? armor[2]).toLowerCase()}`);
  if (!terms.length) throw new Error(`unknown prerequisite ${JSON.stringify(t)}`);
  return terms.join(';');
}

export function parseFeatsMd(md: string): FeatEntry[] {
  return blocks(md).filter((b) => b.depth === 3 && b.lines.some((l) => l.startsWith('- **Category:**'))).map((b) => named(b, () => {
    const f = fields(b.lines);
    const benefits = b.lines.filter((l) => /^ {2,}- /.test(l)).map(clean);
    const e: FeatEntry = { id: catalogId('feat', b.title), kind: 'feat', name: b.title, src: 'phb', page: b.page, cat: FEAT_CAT[f.Category],
      desc: [...(none(f.ASI) ? [] : [`ASI: ${f.ASI}`]), ...(f.Benefit ? [clean(f.Benefit)] : []), ...benefits].join('\n'), grants: [] };
    const pre = prereqMd(f.Prerequisite);
    if (pre) e.prereq = pre;
    if (/^Yes/.test(f.Repeatable ?? '')) e.repeat = true;
    return e;
  }));
}

export function parseOriginsMd(md: string): Entry[] {
  const all = blocks(md), out: Entry[] = [];
  for (const b of under(all, /^Backgrounds/).filter((x) => x.depth === 3)) {
    const f = fields(b.lines);
    if (!f['Ability Scores']) continue;
    const feat = /^(.+?)(?: \((\w+)\))?$/.exec(f.Feat)!;
    const tool = f['Tool Proficiency'].replace(/^Choose one kind of /, '').replace(/\s*\(.*\)$/, '');
    out.push({ id: catalogId('background', b.title), kind: 'background', name: b.title, src: 'phb', page: b.page,
      desc: b.lines.filter((l) => l.trim()).map(clean).join('\n'),
      abils: f['Ability Scores'].split(/,\s*/).map(ab).join(','), feat: catalogId('feat', feat[1]) + (feat[2] ? `:${slug(feat[2])}` : ''),
      skills: f['Skill Proficiencies'].split(/,\s*|\s+and\s+/).map(skillKey).join(','), tool: slug(tool),
      equip: [f['Equipment A'] && `A: ${f['Equipment A']}`, f['Equipment B'] && `B: ${f['Equipment B']}`].filter(Boolean).join('; '), grants: [] } satisfies BackgroundEntry);
  }
  const species = under(all, /^Species/);
  species.forEach((b, i) => {
    if (b.depth !== 3) return;
    const f = fields(b.lines);
    if (!f.Speed) return;
    const name = b.title;
    out.push({ id: catalogId('species', name), kind: 'species', name, src: 'phb', page: b.page,
      sizes: ['tiny', 'small', 'medium', 'large'].filter((z) => new RegExp(`\\b${z}\\b`, 'i').test(f.Size.replace(/\([^)]*\)/g, ''))).join(','),
      speed: Number(/(\d+)/.exec(f.Speed)![1]), desc: b.lines.filter((l) => l.trim() && !/^ {2,}- /.test(l) && !l.startsWith('- **Traits')).map(clean).join('\n') } satisfies SpeciesEntry);
    const traits: TraitEntry[] = [];
    for (const l of b.lines) {
      const m = /^ {2}- \*\*(.+?)\.\*\* ?(.*)$/.exec(l);
      if (m) {
        const lv = /^(.+?) \(character level (\d+)\)$/.exec(m[1]);
        const tname = lv ? lv[1] : m[1];
        traits.push({ id: catalogId('trait', tname, [name]), kind: 'trait', name: tname, src: 'phb', page: b.page, species: slug(name),
          lvl: lv ? Number(lv[2]) : 1, desc: clean(m[2]), grants: [] });
      } else if (/^ {4,}- /.test(l) && traits.length) traits[traits.length - 1].desc += '\n' + clean(l);
    }
    // A lineage table (#### heading inside the species) lists options of the trait that points to "the table".
    for (const t of species.slice(i + 1).filter((x, k, arr) => x.depth === 4 && arr.slice(0, k).every((y) => y.depth === 4))) {
      const parent = traits.find((tr) => /\btable\b/.test(tr.desc));
      if (!parent) continue;
      for (const r of table(t.lines).filter((x) => 'Level 1' in x)) {
        const [first, ...cols] = Object.values(r);
        traits.push({ id: catalogId('trait', first, [name]), kind: 'trait', name: first, src: 'phb', page: b.page, species: slug(name), lvl: 1, of: parent.id,
          desc: [clean(cols[0]), `Level 3: ${clean(cols[1])}`, `Level 5: ${clean(cols[2])}`].join('\n'), grants: [] });
      }
    }
    out.push(...traits);
  });
  return out;
}

export function parseClassMd(md: string): [ClassEntry, SubclassEntry[], FeatureEntry[]] {
  const all = blocks(md);
  const name = /^(\w+)/.exec(all[0].title)![1];
  const core = Object.fromEntries(table(all.find((b) => /^Core Traits/.test(b.title))!.lines).map((r) => [r.Trait, r.Value]));
  const rows = table(all.find((b) => /Features Table/.test(b.title))!.lines);
  const head = Object.keys(rows[0]);
  const num = (v: string) => (/^\d+$/.test(v) ? Number(v) : 0);
  const slotCols = head.filter((k) => /^\d(st|nd|rd|th)?$/.test(k));
  const pact = head.includes('Slot Level');
  const levelTable = (k: string) => rows.map((r, i) => [i + 1, r[k]] as const).filter(([, v], i) => num(v) && v !== rows[i - 1]?.[k]).map(([l, v]) => `${l}:${v}`).join(',');
  const skill = /^Choose (any )?(\d+)(?: skills)?:? ?(.*)$/.exec(core['Skill Proficiencies'])!;
  const skills: ChoiceSpec = { kind: 'choice', id: 'skills', name: 'Skill proficiencies', pick: Number(skill[2]),
    pool: skill[1] ? 'skill:any' : `skill:${skill[3].split(/,\s*(?:or\s+)?|\s+or\s+/).map(skillKey).join('|')}` };
  const cast = new RegExp(`(${ABIL_ALT}) is (?:your|the) spellcasting ability`).exec(md);
  const cls: ClassEntry = {
    id: catalogId('class', name), kind: 'class', name, src: 'phb', page: all.find((b) => /^Core Traits/.test(b.title))!.page,
    desc: `Primary Ability: ${core['Primary Ability']}`, hd: Number(/d(\d+)/i.exec(core['Hit Point Die'])![1]),
    saves: core['Saving Throw Proficiencies'].split(/,\s*|\s+and\s+/).map(ab).join(','), skills,
    armor: profList(core['Armor Training']), weapons: profList(core['Weapon Proficiencies']),
    slots: pact ? rows.map((r) => { const s = Array(9).fill(0); s[num(r['Slot Level']) - 1] = num(r['Spell Slots']); return s; })
      : slotCols.length ? rows.map((r) => [...slotCols.map((k) => num(r[k])), ...Array(9 - slotCols.length).fill(0)]) : []
  };
  if (!none(core['Tool Proficiencies'])) cls.tools = core['Tool Proficiencies'];
  if (cast) cls.castAb = ab(cast[1]);
  if (pact) cls.pact = true;
  if (head.includes('Cantrips')) cls.cantrips = levelTable('Cantrips');
  if (head.includes('Prepared Spells')) cls.prepared = levelTable('Prepared Spells');

  const norm = (s: string) => s.replace(/’/g, "'").replace(/\s*\(.*\)$/, '').trim();
  const levelsOf = (fname: string) => rows.flatMap((r, i) => (r['Class Features'].split(/,\s*/).some((x) => norm(x) === norm(fname)) ? [i + 1] : []));
  const feature = (b: Block, sub?: string): FeatureEntry | null => {
    const m = /^Level (\d+): (.+)$/.exec(b.title);
    if (!m || /^subclass feature$/i.test(m[2])) return null; // a pointer to the subclass, not a feature
    const e: FeatureEntry = { id: catalogId('feature', m[2], [name, sub]), kind: 'feature', name: m[2], src: 'phb', page: b.page, cls: slug(name),
      lvl: Number(m[1]), desc: b.lines.filter((l) => l.trim()).map(clean).join('\n'), grants: [] };
    if (sub) e.sub = slug(sub);
    else { const again = levelsOf(m[2]).filter((l) => l > e.lvl); if (again.length) e.again = again.join(','); }
    return e;
  };
  // A feature gained at several levels can have a heading at each; the first one holds it, `again` the rest.
  const feats = under(all, /^Class Features/).filter((b) => b.depth === 3).map((b) => feature(b))
    .filter((f, i, arr): f is FeatureEntry => !!f && arr.findIndex((x) => x?.id === f.id) === i);
  const subs: SubclassEntry[] = [];
  let sub: string | undefined;
  for (const b of under(all, /^Subclasses/)) {
    if (b.depth === 3) {
      sub = b.title;
      subs.push({ id: catalogId('subclass', sub, [name]), kind: 'subclass', name: sub, src: 'phb', page: b.page, cls: slug(name),
        desc: b.lines.filter((l) => l.trim()).map(clean).join('\n') });
    } else if (b.depth === 4 && sub) {
      const f = feature(b, sub);
      if (f && !feats.some((x) => x.id === f.id)) feats.push(f);
    }
  }
  return [cls, subs, feats];
}

const ARMOR_KIND: Record<string, ArmorKind> = { Light: 'light', Medium: 'medium', Heavy: 'heavy', Shield: 'shield' };
export function parseEquipmentMd(md: string): ItemEntry[] {
  const out: ItemEntry[] = [];
  const add = (name: string, f: Omit<ItemEntry, 'id' | 'kind' | 'name' | 'src' | 'desc'> & { desc?: string }, page?: number) => {
    const n = playName(name.replace(/'/g, '’'));
    if (out.some((e) => e.id === catalogId('item', n))) return;
    out.push({ id: catalogId('item', n), kind: 'item', name: n, src: 'phb', desc: '', ...(page ? { page } : {}), ...f });
  };
  const wt = (w: string | undefined) => { const p = pounds(w ?? ''); return p === undefined ? {} : { wt: p }; };
  const cost = (c: string | undefined) => (c && /\d/.test(c) ? { cost: c } : {});
  for (const b of blocks(md)) {
    for (const r of table(b.lines)) {
      if (r.Name && r.Mastery) {
        const e: ItemEntry = { id: '', kind: 'item', name: '', src: 'phb', desc: '', cat: 'weapon' };
        weaponProps(e, r.Properties);
        add(r.Name, { cat: 'weapon', wcat: r.Category.toLowerCase() as 'simple' | 'martial', wrange: r.Type.toLowerCase() as 'melee' | 'ranged', dmg: r.Damage,
          dtype: r['Damage Type'], mastery: slug(r.Mastery), ...wt(r.Weight), ...cost(r.Cost),
          ...Object.fromEntries(Object.entries(e).filter(([k]) => ['props', 'thrown', 'vers', 'ammo'].includes(k))) }, b.page);
      } else if (r.Armor && r.AC) {
        const kind = ARMOR_KIND[r.Category] ?? (r.Armor === 'Shield' ? 'shield' : 'light');
        add(r.Armor, { cat: kind === 'shield' ? 'shield' : 'armor', armor: kind, acBase: Number(/\d+/.exec(r.AC)![0]), ...wt(r.Weight), ...cost(r.Cost),
          ...(none(r.Strength) ? {} : { strReq: Number(/\d+/.exec(r.Strength)![0]) }), ...(r.Stealth === 'Disadvantage' ? { stealthDis: true } : {}) }, b.page);
      } else if (r.Tool) add(r.Tool, { cat: 'tool', ...wt(r.Weight), ...cost(r.Cost), desc: [r.Ability && `Ability: ${r.Ability}`, r['Utilize (DC)'] && `Utilize: ${r['Utilize (DC)']}`].filter(Boolean).join('\n') }, b.page);
      else if (r.Pack) add(r.Pack, { cat: 'pack', ...wt(r.Weight), ...cost(r.Cost), desc: r.Contents ?? '' }, b.page);
      else if (r.Item && 'Mechanical use' in r && r.Item !== 'Ammunition') add(r.Item, { cat: /Pack$/.test(r.Item) ? 'pack' : 'gear', ...wt(r.Weight), ...cost(r.Cost), desc: clean(r['Mechanical use'] ?? '') }, b.page);
    }
  }
  return out;
}
