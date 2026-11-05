// One SRD class → its ClassEntry, its subclass and every class and subclass feature. Input: the class's column text
// (from "Core <Class> Traits" on) and the -layout text holding its features table. Grants come from overlays.
import { catalogId, slug, type ChoiceSpec, type ClassEntry, type FeatureEntry, type SubclassEntry } from '../../src/catalog/schema.ts';
import type { Ability } from '../../src/types.ts';
import { skillKey } from '../lib/skills.ts';
import { ABILITY_NAMES } from './spells.ts';
import { dropFragments, paragraphs, srdLines } from './text.ts';

const LABELS = ['Primary Ability', 'Hit Point Die', 'Saving Throw Proficiencies', 'Skill Proficiencies', 'Weapon Proficiencies',
  'Tool Proficiencies', 'Armor Training', 'Starting Equipment'];
const split = (s: string) => s.split(/,\s*(?:and\s+|or\s+)?|\s+and\s+|\s+or\s+/).map((x) => x.trim()).filter(Boolean);

// "Light and Medium armor and Shields" → 'Light armor,Medium armor,Shields': a bare adjective takes the noun after it.
export function profList(text: string): string {
  if (/^None$/i.test(text.trim())) return '';
  // "…and Martial weapons that have the Finesse or Light property": the clause stays with its noun.
  const clause = / that .*$/.exec(text.replace(/\.$/, ''))?.[0] ?? '';
  const parts = split(text.replace(/\.$/, '').slice(0, text.length - clause.length));
  parts[parts.length - 1] += clause;
  const out: string[] = [];
  for (let i = parts.length - 1; i >= 0; i--) {
    const noun = /\b(armor|weapons)$/.exec(parts[i]);
    out.unshift(parts[i]);
    if (noun) for (let j = i - 1; j >= 0 && /^(Light|Medium|Heavy|Simple|Martial)$/.test(parts[j]); j--, i--) out.unshift(`${parts[j]} ${noun[1]}`);
  }
  return out.join(',');
}

interface Table { title: string; text: string; rows: { lvl: number; feats: string[]; cells: string[] }[]; slots: number; cantrips: number; prepared: number; pact: boolean }
// The "<Class> Features" table: per level, the feature names and the trailing columns; which columns are slots,
// Cantrips and Prepared Spells is read off the header words above them.
export function featuresTable(layout: string, cls: string): Table {
  const lines = layout.replace(/\f/g, '').split('\n');
  const t = lines.findIndex((l) => l.trim() === `${cls} Features`);
  if (t < 0) throw new Error(`${cls} Features table not found`);
  const first = lines.findIndex((l, i) => i > t && /^\s+1\s+\+2\s/.test(l));
  const head = lines.slice(t + 1, first);
  const rows: Table['rows'] = [];
  let end = first, firstTokens: { x: number; s: string }[] = [];
  for (let i = first; i < lines.length; i++) {
    const l = lines[i], m = /^(\s+)(\d+)\s+\+\d\s+(.*)$/.exec(l);
    if (m) {
      const chunks = m[3].split(/\s{2,}/);
      const feats = chunks[0] === '—' ? [] : [chunks[0]];
      const cells = chunks.slice(1).join(' ').split(/\s+/).reduce<string[]>((a, c) => (c === 'ft.' ? [...a.slice(0, -1), `${a[a.length - 1]} ft.`] : [...a, c]), []);
      if (!rows.length) {
        let x = l.length - m[3].length + chunks[0].length;
        firstTokens = cells.map((s) => { x = l.indexOf(s.split(' ')[0], x); const at = x; x += s.length; return { x: at, s }; });
      }
      rows.push({ lvl: Number(m[2]), feats, cells });
      end = i;
    } else if (rows.length && /^\s{10,}\S/.test(l) && !/\d\s*$/.test(l)) {
      rows[rows.length - 1].feats.push(l.trim()); end = i;
    } else if (rows.length >= 20) break;
  }
  const names = (r: Table['rows'][number]) => r.feats.join(' ').split(/,\s*/).map((f) => f.trim()).filter(Boolean);
  // A header word's column: the first row's cell nearest to it.
  const near = (word: string) => {
    for (const h of head) {
      const at = h.indexOf(word);
      if (at >= 0) return firstTokens.reduce((b, tk, k) => (Math.abs(tk.x - at) < Math.abs(firstTokens[b].x - at) ? k : b), 0);
    }
    return -1;
  };
  const digits = (head[head.length - 1].match(/(?<=\s)[1-9](?=\s|$)/g) ?? []).length;
  const pact = head.join(' ').includes('Slot') && /Level\s*$/.test(head[head.length - 1]);
  return {
    title: `${cls} Features`, text: lines.slice(t, end + 1).join(' ').replace(/\s+/g, ' '),
    rows: rows.slice(0, 20).map((r) => ({ ...r, feats: names(r) })), slots: pact ? 2 : digits, pact,
    cantrips: near('Cantrips'), prepared: near('Prepared')
  };
}

// '1:2,2:3,…' from a column, one step wherever the value changes.
const levelTable = (vals: string[]) => vals.map((v, i) => [i + 1, v] as const).filter(([, v], i) => v !== '—' && v !== vals[i - 1]).map(([l, v]) => `${l}:${v}`).join(',');

// What an option's prerequisite line asks that the app can test: a level and other features. The rest stays in the text.
export function optionPrereq(text: string): { lvl?: number; prereq?: string } {
  const lvl = /Level (\d+)\+/.exec(text)?.[1];
  const feats = text.split(/[,;]/).flatMap((p) => { const m = /^\s*([A-Z][\w’' ]+?) Invocation\s*$/i.exec(p); return m ? [`feature=${slug(m[1])}`] : []; });
  const prereq = [...(lvl ? [`lvl>=${lvl}`] : []), ...feats].join(';');
  return { ...(lvl ? { lvl: Number(lvl) } : {}), ...(prereq ? { prereq } : {}) };
}

// The options of a section, each under a line that is exactly its name: "Prerequisite:" up to the first blank line, a
// "Repeatable." paragraph, and the rest as text. Names not in the text are skipped.
export function parseOptions(lines: string[], names: string[], o: { cls: string; of: FeatureEntry['of']; lvl: number }): FeatureEntry[] {
  const heads = lines.flatMap((l, i) => (names.includes(l) ? [i] : []));
  return heads.map((at, k) => {
    const body = lines.slice(at + 1, heads[k + 1] ?? lines.length);
    while (body.length && !body[0]) body.shift();
    let pre = '';
    if (body[0]?.startsWith('Prerequisite:')) { const n = body.findIndex((l) => !l); pre = body.splice(0, n < 0 ? body.length : n).join(' '); }
    if (body[0]?.startsWith('Cost:')) pre = body.shift()!;
    const { lvl, prereq } = optionPrereq(pre);
    return { id: catalogId('feature', lines[at], [o.cls]), kind: 'feature', name: lines[at], src: 'srd', cls: slug(o.cls), lvl: lvl ?? o.lvl, of: o.of,
      ...(prereq ? { prereq } : {}), ...(body.some((l) => l.startsWith('Repeatable.')) ? { repeat: true } : {}),
      desc: [...(pre ? [pre] : []), ...paragraphs(body)].join('\n'), grants: [] };
  });
}
const METAMAGIC = ['Careful Spell', 'Distant Spell', 'Empowered Spell', 'Extended Spell', 'Heightened Spell', 'Quickened Spell', 'Seeking Spell', 'Subtle Spell', 'Transmuted Spell', 'Twinned Spell'];
const INVOCATIONS = ['Agonizing Blast', 'Armor of Shadows', 'Ascendant Step', 'Devil’s Sight', 'Devouring Blade', 'Eldritch Mind', 'Eldritch Smite', 'Eldritch Spear', 'Fiendish Vigor', 'Gaze of Two Minds',
  'Gift of the Depths', 'Gift of the Protectors', 'Investment of the Chain Master', 'Lessons of the First Ones', 'Lifedrinker', 'Mask of Many Faces', 'Master of Myriad Forms', 'Misty Visions', 'One with Shadows',
  'Otherworldly Leap', 'Pact of the Blade', 'Pact of the Chain', 'Pact of the Tome', 'Repelling Blast', 'Thirsting Blade', 'Visions of Distant Realms', 'Whispers of the Grave', 'Witch Sight'];

export function parseClass(text: string, layout: string): [ClassEntry, SubclassEntry[], FeatureEntry[]] {
  const raw = srdLines(text);
  const name = /^Core (\w+) Traits$/.exec(raw.find((l) => l.text.trim())!.text.trim())![1];
  const table = featuresTable(layout, name);
  const HEAD = /^Level (\d+): (.+)$/, SUB = /^(\w+) Subclass:(.*)$/;
  const L = dropFragments(raw, [table.text], (i) => HEAD.test(raw[i].text.trim()) || SUB.test(raw[i].text.trim()));
  const lines = L.map((l) => l.text.trim());
  while (lines.length && (!lines[lines.length - 1] || /^[A-Z][a-z]+$/.test(lines[lines.length - 1]))) { lines.pop(); L.pop(); } // the next class's name

  // Core traits: the labelled table up to "Becoming a <Class>".
  const core = lines.slice(1, lines.findIndex((l) => l.startsWith('Becoming a'))).join(' ').replace(/\s+/g, ' ');
  const at = LABELS.map((lb) => [lb, core.indexOf(lb)] as const).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]);
  const f = Object.fromEntries(at.map(([lb, i], k) => [lb, core.slice(i + lb.length, at[k + 1]?.[1] ?? core.length).trim()]));
  const skill = /^Choose (any )?(\d+)(?: skills)?:? ?(.*)$/.exec(f['Skill Proficiencies'])!;
  const skills: ChoiceSpec = { kind: 'choice', id: 'skills', name: 'Skill proficiencies', pick: Number(skill[2]),
    pool: skill[1] ? 'skill:any' : `skill:${split(skill[3]).map(skillKey).join('|')}` };
  const cast = /Spellcasting Ability\. (\w+) is (?:your|the) spellcasting ability/.exec(lines.join(' '));
  const col = (k: number) => table.rows.map((r) => r.cells[k]);
  const n = table.rows[0].cells.length;
  const c: ClassEntry = {
    id: catalogId('class', name), kind: 'class', name, src: 'srd', desc: `Primary Ability: ${f['Primary Ability']}\nStarting Equipment: ${f['Starting Equipment']}`,
    hd: Number(/D(\d+) per/.exec(f['Hit Point Die'])![1]), saves: split(f['Saving Throw Proficiencies']).map((a) => ABILITY_NAMES[a]).join(','),
    skills, armor: profList(f['Armor Training']), weapons: profList(f['Weapon Proficiencies'])
  };
  if (f['Tool Proficiencies']) c.tools = f['Tool Proficiencies'];
  if (cast) c.castAb = ABILITY_NAMES[cast[1]] as Ability;
  if (table.pact) {
    c.pact = true;
    c.slots = table.rows.map((r) => { const s = Array(9).fill(0); s[Number(r.cells[n - 1]) - 1] = Number(r.cells[n - 2]); return s; });
  } else if (table.slots) {
    c.slots = table.rows.map((r) => [...r.cells.slice(n - table.slots).map((v) => (v === '—' ? 0 : Number(v))), ...Array(9 - table.slots).fill(0)]);
  } else c.slots = [];
  if (table.cantrips >= 0) c.cantrips = levelTable(col(table.cantrips));
  if (table.prepared >= 0) c.prepared = levelTable(col(table.prepared));

  // Features: "Level N: Name" headings; the subclass section starts at "<Class> Subclass: Name".
  const STOP = (l: string) => HEAD.test(l) || SUB.test(l) || /^\w+ Spell List$/.test(l) || /^(Metamagic|Eldritch Invocation) Options$/.test(l) || l === table.title;
  const subs: SubclassEntry[] = [], feats: FeatureEntry[] = [];
  let sub: SubclassEntry | undefined;
  lines.forEach((l, i) => {
    const sm = SUB.exec(l);
    if (sm && sm[1] === name) {
      let sname = sm[2].trim(), j = i + 1;
      while (!lines[j]) j++;
      // A long name wraps: the next line holds its end when the name is empty or the next line has at most two words.
      if (!sname || / (of|the)$/.test(sname) || lines[j].split(' ').length <= 2) { sname = `${sname} ${lines[j]}`.trim(); j++; }
      let k = j; while (k < lines.length && !STOP(lines[k])) k++;
      sub = { id: catalogId('subclass', sname, [name]), kind: 'subclass', name: sname, src: 'srd', cls: slug(name), desc: paragraphs(lines.slice(j, k)).join('\n') };
      subs.push(sub);
      return;
    }
    const hm = HEAD.exec(l);
    if (!hm) return;
    let k = i + 1; while (k < lines.length && !STOP(lines[k])) k++;
    const fname = hm[2].trim(), lvl = Number(hm[1]);
    if (feats.some((x) => x.name === fname && x.sub === (sub ? slug(sub.name) : undefined))) return;
    const e: FeatureEntry = { id: catalogId('feature', fname, [name, sub?.name]), kind: 'feature', name: fname, src: 'srd',
      cls: slug(name), lvl, desc: paragraphs(lines.slice(i + 1, k)).join('\n'), grants: [] };
    if (sub) e.sub = slug(sub.name);
    else {
      const again = table.rows.filter((r) => r.lvl > lvl && r.feats.some((t) => t.replace(/\s*\(.*\)$/, '') === fname)).map((r) => r.lvl);
      if (again.length) e.again = again.join(',');
    }
    feats.push(e);
  });
  for (const [title, names, of, lvl] of [['Metamagic Options', METAMAGIC, 'metamagic', 2], ['Eldritch Invocation Options', INVOCATIONS, 'invocation', 1]] as const) {
    const a = lines.indexOf(title);
    if (a < 0) continue;
    const z = lines.findIndex((l, i) => i > a && (/^\w+ Spell List$/.test(l) || SUB.test(l)));
    feats.push(...parseOptions(lines.slice(a + 1, z < 0 ? lines.length : z), [...names], { cls: name, of, lvl }));
  }
  return [c, subs, feats];
}
