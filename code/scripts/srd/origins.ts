// SRD feats, backgrounds and species → catalog entries. Grants come from overlay/origins.json.
import { catalogId, slug, type BackgroundEntry, type FeatEntry, type SpeciesEntry, type TraitEntry } from '../../src/catalog/schema.ts';
import { ABILITY_NAMES } from './spells.ts';
import { norm, paragraphs, RUN_IN, srdLines, unbalanced } from './text.ts';

const nextText = (lines: string[], i: number) => { for (let j = i + 1; j < lines.length; j++) if (lines[j].trim()) return j; return -1; };
const abilityKey = (n: string) => ABILITY_NAMES[n.trim()];

const FEAT_CAT: Record<string, FeatEntry['cat']> = { Origin: 'origin', General: 'general', 'Fighting Style': 'style', 'Epic Boon': 'boon' };
const FEAT_LINE = /^(Origin|General|Fighting Style|Epic Boon) Feat\b/;
// "Level 4+, Strength or Dexterity 13+" → 'lvl>=4;str|dex>=13'; "Fighting Style Feature" → 'feature=fighting-style'.
export function prereq(text: string): string {
  return text.split(/,\s*/).map((t) => {
    const lvl = /^Level (\d+)\+$/.exec(t);
    if (lvl) return `lvl>=${lvl[1]}`;
    const ab = /^(.+?) (\d+)\+$/.exec(t);
    if (ab) return `${ab[1].split(/,? or |, /).map(abilityKey).join('|')}>=${ab[2]}`;
    const feat = /^(.+) Feature$/.exec(t);
    if (feat) return `feature=${slug(feat[1])}`;
    throw new Error(`unknown prerequisite ${JSON.stringify(t)}`);
  }).join(';');
}

export function parseFeats(text: string): FeatEntry[] {
  const L = srdLines(text), lines = L.map((l) => l.text);
  const starts = lines.flatMap((l, i) => (l.trim() && !FEAT_LINE.test(l) && FEAT_LINE.test(lines[nextText(lines, i)] ?? '') ? [i] : []));
  return starts.map((s, n) => {
    const end = starts[n + 1] ?? lines.length;
    let i = nextText(lines, s), head = lines[i].trim();
    while (unbalanced(head)) head += ' ' + lines[++i].trim();
    const m = /^(.+?) Feat(?: \(Prerequisite: (.+)\))?$/.exec(head)!;
    // A category heading ("General Feats") sits between the last feat of one category and the first of the next.
    const body = lines.slice(i + 1, end);
    const name = lines[s].trim();
    const e: FeatEntry = { id: catalogId('feat', name), kind: 'feat', name, src: 'srd', cat: FEAT_CAT[m[1]],
      desc: paragraphs(body.filter((l) => !/^(Origin|General|Fighting Style|Epic Boon) Feats$/.test(l.trim()))).join('\n'), grants: [] };
    if (m[2]) e.prereq = prereq(m[2]);
    if (/^Repeatable\./m.test(e.desc)) e.repeat = true;
    return e;
  });
}

const BG_FIELD = /^(Ability Scores|Feat|Skill Proficiencies|Tool Proficiency|Equipment): ?(.*)$/;
export function parseBackgrounds(text: string): BackgroundEntry[] {
  const L = srdLines(text), lines = L.map((l) => l.text);
  const starts = lines.flatMap((l, i) => (l.trim() && /^Ability Scores:/.test(lines[nextText(lines, i)] ?? '') ? [i] : []));
  return starts.map((s, n) => {
    const f: Record<string, string> = {};
    let last = '';
    for (const l of lines.slice(s + 1, starts[n + 1] ?? lines.length).map((x) => x.trim()).filter(Boolean)) {
      const m = BG_FIELD.exec(l);
      if (m) f[(last = m[1])] = m[2];
      else if (last) f[last] = /[a-z]-$/.test(f[last]) ? f[last].slice(0, -1) + l : `${f[last]} ${l}`;
    }
    const feat = /^(.+?)(?: \((\w+)\))? \(see “Feats”\)$/.exec(f.Feat)!;
    const name = lines[s].trim();
    return {
      id: catalogId('background', name), kind: 'background', name, src: 'srd',
      desc: Object.entries(f).map(([k, v]) => `${k}: ${v}`).join('\n'),
      feat: catalogId('feat', feat[1]) + (feat[2] ? `:${slug(feat[2])}` : ''),
      equip: f.Equipment, grants: []
    };
  });
}

const TABLE_TITLES = ['Draconic Ancestors', 'Elven Lineages', 'Fiendish Legacies'];
// Tables in the species pages, from the -layout text: title → [the block's text, its rows of Level 1/3/5 columns].
function speciesTables(layout: string) {
  const lines = layout.replace(/\f/g, '').split('\n');
  const out: { title: string; text: string; rows: { name: string; cells: string[] }[] }[] = [];
  lines.forEach((l, i) => {
    const title = TABLE_TITLES.find((t) => l.trim().startsWith(t) && /^ {5}\S/.test(l));
    if (!title) return;
    let j = i + 1;
    while (j < lines.length && !/^ {7}\S/.test(lines[j]) && !(lines[j].trim() === '' && (lines[j + 1] ?? '').trim() === '')) j++;
    const block = lines.slice(i, j);
    const head = block.find((b) => b.includes('Level 1'));
    const rows: { name: string; cells: string[] }[] = [];
    if (head) {
      const at = [head.indexOf('Level 1'), head.indexOf('Level 3'), head.indexOf('Level 5')];
      for (const b of block.slice(block.indexOf(head) + 1)) {
        if (!b.trim()) continue;
        // A cell starts at the first word after a gap near its header's column (a row can start a character early).
        const col = (a: number) => { for (let p = Math.max(1, a - 3); p < b.length; p++) if (b[p] !== ' ' && b[p - 1] === ' ' && b[p - 2] === ' ') return p; return b.length; };
        const [c1, c3, c5] = at.map(col);
        const cells = [b.slice(c1, c3), b.slice(c3, c5), b.slice(c5)].map((c) => c.trim());
        if (/^ {5}\S/.test(b)) rows.push({ name: b.slice(5, c1).trim(), cells });
        else rows[rows.length - 1].cells = rows[rows.length - 1].cells.map((c, k) => norm(`${c} ${cells[k]}`));
      }
    }
    out.push({ title, text: norm(block.join(' ')), rows: rows.map((r) => ({ ...r, cells: r.cells.map(norm) })) });
  });
  return out;
}

const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
export function parseSpecies(text: string, layout: string): [SpeciesEntry[], TraitEntry[]] {
  const tables = speciesTables(layout);
  // Fragments of the tables that the column crop cut into the prose.
  const junk = (l: string) => { const t = norm(l); return TABLE_TITLES.includes(t) || (t.length <= 45 && tables.some((tb) => tb.text.includes(t))); };
  const all = srdLines(text), raw = all.map((l) => l.text);
  const isName = (i: number) => /^Creature Type:/.test(raw[nextText(raw, i)] ?? '');
  const cand = raw.map((l, i) => !!l.trim() && !RUN_IN.test(l.trim()) && !isName(i) && junk(l));
  const prevText = (i: number) => { for (let j = i - 1; j >= 0; j--) if (raw[j].trim()) return j; return -1; };
  // Only runs of fragments go: a lone match ("120 feet." ending a sentence) is prose.
  const L = all.filter((_, i) => !(cand[i] && (TABLE_TITLES.includes(norm(raw[i])) || cand[prevText(i)] || cand[nextText(raw, i)])));
  const lines = L.map((l) => l.text);
  const starts = lines.flatMap((l, i) => (l.trim() && /^Creature Type:/.test(lines[nextText(lines, i)] ?? '') ? [i] : []));
  const species: SpeciesEntry[] = [], traits: TraitEntry[] = [];
  starts.forEach((s, n) => {
    const name = lines[s].trim(), block = lines.slice(s + 1, starts[n + 1] ?? lines.length);
    const at = (re: RegExp) => block.findIndex((l) => re.test(l));
    let size = block[at(/^Size:/)];
    if (!/Speed:/.test(block[at(/^Size:/) + 1] ?? '')) size += ' ' + block[at(/^Size:/) + 1];
    const sizes = SIZES.filter((z) => new RegExp(`\\b${z}\\b`).test(size.replace(/\([^)]*\)/g, ''))).map((z) => z.toLowerCase()).join(',');
    const speed = Number(/^Speed: (\d+) feet/.exec(block[at(/^Speed:/)])![1]);
    const intro = at(/special traits\.$/);
    species.push({ id: catalogId('species', name), kind: 'species', name, src: 'srd', sizes, speed,
      desc: paragraphs(block.slice(0, intro + 1)).join('\n') });
    // Traits: a run-in heading that starts a paragraph (the line before it ends a sentence).
    const body = block.slice(intro + 1);
    const heads = body.flatMap((l, i) => {
      const prev = body.slice(0, i).filter((x) => x.trim()).pop() ?? '.';
      return RUN_IN.test(l.trim()) && /[.:]$/.test(prev.trim()) ? [i] : [];
    });
    heads.forEach((h, k) => {
      const m = RUN_IN.exec(body[h].trim())!;
      const desc = paragraphs([m[2], ...body.slice(h + 1, heads[k + 1] ?? body.length)]).join('\n');
      const lvl = Number(/^(?:When you reach|Starting at) character level (\d+)/.exec(desc)?.[1] ?? 1);
      traits.push({ id: catalogId('trait', m[1], [name]), kind: 'trait', name: m[1], src: 'srd',
        species: slug(name), lvl, desc, grants: [] });
    });
    // Lineage tables: each row is an option of the trait that names the table.
    for (const tb of tables.filter((t) => t.rows.length)) {
      const parent = traits.find((t) => t.species === slug(name) && t.desc.includes(`the ${tb.title} table`));
      if (!parent) continue;
      for (const r of tb.rows) {
        traits.push({ id: catalogId('trait', r.name, [name]), kind: 'trait', name: r.name, src: 'srd', species: slug(name), lvl: 1,
          of: parent.id, desc: `${r.cells[0]}\nLevel 3: ${r.cells[1]}\nLevel 5: ${r.cells[2]}`, grants: [] });
      }
    }
  });
  return [species, traits];
}
