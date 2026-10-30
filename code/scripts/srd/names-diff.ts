// Lists spell, item and feat names that are in the SRD data but not in reference/ (PHB 2024), and the other way
// round, to find PHB entries the SRD publishes under another name (PHB_TO_SRD in src/catalog/schema.ts).
// Run from code/: node scripts/srd/names-diff.ts (needs reference/ and a built code/src/data/srd/).
import { readFileSync } from 'node:fs';
import type { Entry } from '../../src/catalog/schema.ts';

const root = new URL('../../../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');
const norm = (s: string) => s.trim().toLowerCase().replace(/’/g, "'");
const srd = (file: string, kind: string) => (JSON.parse(read(`code/src/data/srd/${file}.json`)) as Entry[]).filter((e) => e.kind === kind && e.src === 'srd').map((e) => e.name);
const headings = (md: string) => [...md.matchAll(/^### (.+?) \(PHB p\.[\d–-]+\)$/gm)].map((m) => m[1]);
// First column of every markdown table row in the equipment chapter.
const tableNames = (md: string) => [...md.matchAll(/^\| ([^|]+?) \|/gm)].map((m) => m[1]).filter((n) => !/^(Name|Item|---|Armor|Tool|Focus|Type|Pack|Lifestyle|Service|Mount|Vehicle)/.test(n));

const sets: [string, string[], string[]][] = [
  ['spell', srd('spells', 'spell'), [...headings(read('reference/07-spells-a.md')), ...headings(read('reference/07-spells-b.md'))]],
  ['feat', srd('origins', 'feat'), headings(read('reference/05-feats.md'))],
  ['item', srd('items', 'item').filter((n) => !/^(Wand|Staff|Ring|Rod|Potion|Cloak|Boots)/.test(n)), tableNames(read('reference/06-equipment.md'))]
];
for (const [kind, s, p] of sets) {
  const ps = new Set(p.map(norm)), ss = new Set(s.map(norm));
  console.log(`\n## ${kind}: ${s.length} SRD, ${p.length} PHB`);
  console.log(`SRD only (${s.filter((n) => !ps.has(norm(n))).length}): ${s.filter((n) => !ps.has(norm(n))).join(' | ')}`);
  if (kind !== 'item') console.log(`PHB only (${p.filter((n) => !ss.has(norm(n))).length}): ${p.filter((n) => !ss.has(norm(n))).join(' | ')}`);
}
