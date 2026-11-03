// The catalog against its sources and the app, on a machine that has them (reference/, the built pack, the extracted SRD
// text; none of them are in the repo, so CI skips this). Run from code/: npm run audit-catalog. Fails on a discrepancy
// that isn't in reference/audit-known.json, and on a known one that is gone. Accept the current state with
// AUDIT_UPDATE=1 npm run audit-catalog. Every finding, with its note, goes to reference/build/audit-report.txt. Both
// files stay in reference/ (gitignored), because they name and can quote PHB content.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mergeCatalog } from '../../src/catalog/merge.ts';
import type { Entry } from '../../src/catalog/schema.ts';
import srd from '../../src/data/srd/index.ts';
import { parseClassMd, parseEquipmentMd, parseFeatsMd, parseOriginsMd, parseSpellsMd } from '../pack/parse.ts';
import { effectChecks, featureHeadingChecks, keyOf, lookupTableChecks, referenceChecks, ruleTextChecks, spellListChecks, srdHeadingChecks, standaloneHeadings, textChecks, type Finding } from './checks.ts';
import { grantSourceChecks, poolChecks, ruleCatChecks, unreadFieldChecks } from './wiring.ts';

const root = new URL('../../../', import.meta.url);
const at = (p: string) => new URL(p, root);
const PACK = at('reference/build/phb-pack.json'), SRD_TEXT = at('resources/srd/srd.txt'), KNOWN = at('reference/audit-known.json'), REPORT = at('reference/build/audit-report.txt');
const ready = existsSync(PACK) && existsSync(SRD_TEXT);
const read = (u: URL) => readFileSync(u, 'utf8');

// The app's code, without what only stores or edits catalog data: tests, generated data, the schema, the grant form, the types, the sample characters.
function appCode(dir: URL): string {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    if (d.isDirectory()) return d.name === 'data' ? [] : [appCode(new URL(`${d.name}/`, dir))];
    return /\.tsx?$/.test(d.name) && !/\.test\.|^(schema|types|names|defaults)\.ts$|^GrantEditor\.tsx$/.test(d.name) ? [read(new URL(d.name, dir))] : [];
  }).join('\n');
}

describe.skipIf(!ready)('catalog audit', () => {
  if (!ready) return; // a skipped describe still runs its body, which reads the files
  it('finds nothing outside the known list', () => {
    const packEntries = (JSON.parse(read(PACK)) as { entries: Entry[] }).entries;
    const cat = mergeCatalog(srd, packEntries), entries = cat.list;
    const srdText = read(SRD_TEXT), ref = (p: string) => read(at(`reference/${p}`));
    const classFiles = readdirSync(at('reference/classes/')).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort();
    const classMd = classFiles.map((f) => [f.slice(0, -3), ref(`classes/${f}`)] as const);
    const parsed: Entry[] = [
      ...parseSpellsMd(`${ref('07-spells-a.md')}\n${ref('07-spells-b.md')}`), ...parseFeatsMd(ref('05-feats.md')), ...parseOriginsMd(ref('04-origins.md')),
      ...parseEquipmentMd(ref('06-equipment.md')), ...classMd.flatMap(([, md]) => { const [c, subs, feats] = parseClassMd(md); return [c, ...subs, ...feats]; })
    ];
    const code = appCode(at('code/src/'));
    const findings: Finding[] = [
      ...srdHeadingChecks(srdText, entries), ...referenceChecks(parsed, entries),
      ...classMd.flatMap(([cls, md]) => [...spellListChecks(cls, md, entries), ...featureHeadingChecks(cls, md, entries), ...lookupTableChecks(`classes/${cls}.md`, md, entries)]),
      ...lookupTableChecks('06-equipment.md', ref('06-equipment.md'), entries),
      ...textChecks(entries, standaloneHeadings(srdText)), ...ruleTextChecks(entries), ...effectChecks(entries),
      ...unreadFieldChecks(cat), ...poolChecks(cat), ...grantSourceChecks(entries, code), ...ruleCatChecks(entries, code)
    ].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
    writeFileSync(REPORT, findings.map((f) => `${keyOf(f)}\n    ${f.note}`).join('\n') + '\n');
    const keys = findings.map(keyOf);
    if (process.env.AUDIT_UPDATE) writeFileSync(KNOWN, JSON.stringify(keys, null, 1) + '\n');
    const known: string[] = existsSync(KNOWN) ? JSON.parse(read(KNOWN)) : [];
    expect({ new: findings.filter((f) => !known.includes(keyOf(f))).map((f) => `${keyOf(f)}: ${f.note}`), gone: known.filter((k) => !keys.includes(k)) }).toEqual({ new: [], gone: [] });
  }, 120000);
});
