// Builds the local PHB pack from reference/ (gitignored): reference/build/phb-pack.json, imported on the device
// from the menu, and reference/build/check-phrases.json for the pre-push PHB check. Run from code/: npm run pack.
// Nothing here may write under code/: the pack is PHB data.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Entry } from '../../src/catalog/schema.ts';
import { applyOverlay, type Overlay } from '../lib/overlay.ts';
import { normText } from '../lib/text.ts';
import { checkEntries } from '../lib/write.ts';
import { parseClassMd, parseEquipmentMd, parseFeatsMd, parseOriginsMd, parseSpellsMd } from './parse.ts';

const root = new URL('../../../', import.meta.url);
const ref = (p: string) => new URL(`reference/${p}`, root);
const read = (u: URL) => readFileSync(u, 'utf8');
const jsonFiles = (dir: URL) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => new URL(f, dir)) : []);

const parsed: Entry[] = [
  ...parseSpellsMd(read(ref('07-spells-a.md')) + '\n' + read(ref('07-spells-b.md'))),
  ...parseFeatsMd(read(ref('05-feats.md'))),
  ...parseOriginsMd(read(ref('04-origins.md'))),
  ...parseEquipmentMd(read(ref('06-equipment.md'))),
  ...readdirSync(ref('classes/')).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort()
    .flatMap((f) => {
      try { const [c, subs, feats] = parseClassMd(read(ref(`classes/${f}`))); return [c, ...subs, ...feats]; } catch (e) { throw new Error(`${f}: ${e instanceof Error ? e.message : e}`); }
    })
];
// Whole entries the parser can't produce yet, then the overlays (grants, fields, replace: true).
for (const u of jsonFiles(ref('authored/entries/'))) {
  for (const e of JSON.parse(read(u)) as Entry[]) {
    if (parsed.some((p) => p.id === e.id)) throw new Error(`${u.pathname}: ${e.id} is already parsed`);
    parsed.push(e);
  }
}
const overlay: Overlay = {};
for (const u of jsonFiles(ref('authored/'))) {
  for (const [id, o] of Object.entries(JSON.parse(read(u)) as Overlay)) {
    if (overlay[id]) throw new Error(`${id} is overlaid twice`);
    overlay[id] = o;
  }
}
const entries = applyOverlay(parsed, overlay);

// The SRD stays by default, so the committed data and every device agree; the pack keeps PHB-only entries and the
// ones the overlay marks to replace their SRD entry.
const srdDir = new URL('code/src/data/srd/', root);
const srdText = jsonFiles(srdDir).map(read).join('\n');
const srdIds = new Set(jsonFiles(srdDir).flatMap((u) => (JSON.parse(read(u)) as Entry[]).map((e) => e.id)));
const written = checkEntries('pack', entries.filter((e) => !srdIds.has(e.id) || e.replace));
const kinds = [...new Set(entries.map((e) => e.kind))];
for (const k of kinds) {
  const p = entries.filter((e) => e.kind === k).length, w = written.filter((e) => e.kind === k).length, d = entries.filter((e) => e.kind === k && srdIds.has(e.id) && !e.replace).length;
  if (p - d !== w) throw new Error(`${k}: parsed ${p} − dropped ${d} ≠ written ${w}`);
  console.log(`${k.padEnd(10)} parsed ${String(p).padStart(4)}  dropped ${String(d).padStart(4)}  written ${String(w).padStart(4)}`);
}
mkdirSync(ref('build/'), { recursive: true });
writeFileSync(ref('build/phb-pack.json'), JSON.stringify({ app: 'dnd-character-sheet', kind: 'catalog-pack', version: 1, builtAt: new Date().toISOString(), entries: written }, null, 1) + '\n');

// Check phrases: 8 words from the start of every PHB-only description, and 8 from its middle when it has 24 or more.
// A phrase the committed SRD data or the app's own text also contains is skipped, so shared wording never blocks.
const appText = (function walk(dir: URL): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(new URL(`${d.name}/`, dir)) : /\.tsx?$/.test(d.name) ? [read(new URL(d.name, dir))] : []));
})(new URL('code/src/', root)).join('\n');
const shared = normText(srdText + '\n' + appText);
const phrases = new Set<string>();
for (const e of written) {
  const words = e.desc.split(/\s+/).filter(Boolean);
  const picks = [words.slice(0, 8), ...(words.length >= 24 ? [words.slice(Math.floor(words.length / 2) - 4, Math.floor(words.length / 2) + 4)] : [])];
  for (const w of picks) { const p = normText(w.join(' ')); if (w.length === 8 && !shared.includes(p)) phrases.add(p); }
}
if (phrases.size < 100) throw new Error(`only ${phrases.size} check phrases`);
writeFileSync(ref('build/check-phrases.json'), JSON.stringify([...phrases].sort(), null, 1) + '\n');
console.log(`pack: ${written.length} entries; ${phrases.size} check phrases`);
