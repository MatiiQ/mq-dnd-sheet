// Compares the built SRD class data with the class tables in reference/classes/*.md (PHB 2024). reference/ is
// gitignored, so this runs only on a machine that has it.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ClassEntry, Entry, FeatureEntry } from '../../src/catalog/schema.ts';

const REF = new URL('../../../reference/classes/', import.meta.url);
const data: Entry[] = JSON.parse(readFileSync(new URL('../../src/data/srd/classes.json', import.meta.url), 'utf8'));
const norm = (s: string) => s.trim().replace(/’/g, "'");
const CLASSES = data.filter((e): e is ClassEntry => e.kind === 'class');

// The 20 rows of the class table, as header → cell.
function table(md: string): Record<string, string>[] {
  const lines = md.split('\n'), h = lines.findIndex((l) => l.startsWith('| Level |'));
  const cells = (l: string) => l.split('|').slice(1, -1).map((c) => c.trim());
  const head = cells(lines[h]);
  return lines.slice(h + 2, h + 22).map((l) => Object.fromEntries(cells(l).map((c, i) => [head[i], c])));
}

describe.skipIf(!existsSync(REF))('SRD classes against reference/classes', () => {
  if (!existsSync(REF)) return; // a skipped describe still runs its body, which reads the files
  for (const c of CLASSES) {
    describe(c.name, () => {
      const rows = table(readFileSync(new URL(`${c.name.toLowerCase()}.md`, REF), 'utf8'));
      const feats = data.filter((e): e is FeatureEntry => e.kind === 'feature' && e.cls === c.id.split('/')[1] && !e.sub);
      const levels = (f: FeatureEntry) => [f.lvl, ...(f.again ? f.again.split(',').map(Number) : [])];
      it('has every feature of the table at its levels', () => {
        const missing: string[] = [];
        rows.forEach((r, i) => {
          for (const name of r['Class Features'].split(/,\s*/).map((x) => norm(x.replace(/\s*\(.*\)$/, '')))) {
            if (name === '—' || name === '-' || name === 'Subclass feature') continue;
            if (!feats.some((f) => norm(f.name) === name && levels(f).includes(i + 1))) missing.push(`${i + 1}: ${name}`);
          }
        });
        expect(missing).toEqual([]);
      });
      it('has the table’s spell slots and cantrips', () => {
        const slotCols = Object.keys(rows[0]).filter((k) => /^\d(st|nd|rd|th)?$/.test(k));
        const want = rows.map((r) => {
          if (c.pact) { const s = Array(9).fill(0); s[Number(r['Slot Level']) - 1] = Number(r['Spell Slots']); return s; }
          return [...slotCols.map((k) => (/^\d+$/.test(r[k]) ? Number(r[k]) : 0)), ...Array(9 - slotCols.length).fill(0)];
        });
        expect(c.slots).toEqual(slotCols.length || c.pact ? want : []);
        if ('Cantrips' in rows[0]) {
          const at = (l: number) => Number(c.cantrips!.split(',').map((s) => s.split(':').map(Number)).filter(([lv]) => lv <= l).pop()![1]);
          expect(rows.map((_, i) => at(i + 1))).toEqual(rows.map((r) => Number(r.Cantrips)));
        } else expect(c.cantrips).toBeUndefined();
      });
    });
  }
});
