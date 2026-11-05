// The catalog against its sources and the app, on a machine that has them (reference/, the built pack, the extracted SRD
// text; none of them are in the repo, so CI skips this). Run from code/: npm run audit-catalog, which rebuilds the pack and
// sets AUDIT_REQUIRED=1, so a missing file fails instead of skipping. Fails on a discrepancy that isn't in
// reference/audit-known.json, on a known one whose note changed or that is gone, and on grants whose hash changed. Accept
// the current state with AUDIT_UPDATE=1 npm run audit-catalog (the old list goes to audit-known.json.bak; new keys land
// in `todo`). Every finding, with its note, goes to reference/build/audit-report.txt. Both files stay in reference/
// (gitignored), because they name and can quote PHB content.
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mergeCatalog } from '../../src/catalog/merge.ts';
import type { Entry } from '../../src/catalog/schema.ts';
import srd from '../../src/data/srd/index.ts';
import { parseClassMd, parseEquipmentMd, parseFeatsMd, parseOriginsMd, parseSpellsMd } from '../pack/parse.ts';
import { parseRules, parseWeaponRules } from '../srd/rules.ts';
import { section } from '../srd/text.ts';
import { actionCostChecks, compareKnown, coverageChecks, effectChecks, featPoolChecks, featureHeadingChecks, grantChecks, grantHashes, itemNumberChecks, keyOf, lookupTableChecks, mechanicChecks, ownPoolChecks, referenceChecks, repeatedSpellChecks, rowChecks, ruleSourceChecks, ruleTextChecks, spellListChecks, spellNumberChecks, srdHeadingChecks, standaloneHeadings, textChecks, updateKnown, type Finding, type Known } from './checks.ts';
import { backgroundEquipChecks, freeCastLinkChecks, grantedSpellChecks, grantSourceChecks, poolChecks, ruleCatChecks, unreadFieldChecks } from './wiring.ts';

const root = new URL('../../../', import.meta.url);
const at = (p: string) => new URL(p, root);
const PACK = at('reference/build/phb-pack.json'), SRD_TEXT = at('resources/srd/srd.txt'), KNOWN = at('reference/audit-known.json'), REPORT = at('reference/build/audit-report.txt');
const ready = existsSync(PACK) && existsSync(SRD_TEXT);
const read = (u: URL) => readFileSync(u, 'utf8');
if (!ready && process.env.AUDIT_REQUIRED === '1') throw new Error('catalog audit: reference/build/phb-pack.json or resources/srd/srd.txt is missing, so nothing would be checked');

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
    const pack = JSON.parse(read(PACK)) as { builtAt: string; entries: Entry[] }, packEntries = pack.entries;
    const cat = mergeCatalog(srd, packEntries), entries = cat.list;
    const srdText = read(SRD_TEXT), ref = (p: string) => read(at(`reference/${p}`));
    const classFiles = readdirSync(at('reference/classes/')).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort();
    const classMd = classFiles.map((f) => [f.slice(0, -3), ref(`classes/${f}`)] as const);
    const parsed: Entry[] = [
      ...parseSpellsMd(`${ref('07-spells-a.md')}\n${ref('07-spells-b.md')}`), ...parseFeatsMd(ref('05-feats.md')), ...parseOriginsMd(ref('04-origins.md')),
      ...parseEquipmentMd(ref('06-equipment.md')), ...classMd.flatMap(([, md]) => { const [c, subs, feats] = parseClassMd(md); return [c, ...subs, ...feats]; })
    ];
    const code = appCode(at('code/src/')), creation = ref('02-character-creation.md');
    const update = process.env.AUDIT_UPDATE === '1';
    const known: Known = existsSync(KNOWN) ? JSON.parse(read(KNOWN)) : { accepted: {}, todo: {} };
    const findings: Finding[] = [
      ...srdHeadingChecks(srdText, entries), ...referenceChecks(parsed, entries), ...coverageChecks(parsed, entries),
      ...spellNumberChecks(entries), ...itemNumberChecks(entries),
      ...ruleSourceChecks([...parseRules(section(srdText, 'Rules Glossary', 'Gameplay Toolbox')), ...parseWeaponRules(section(srdText, 'Properties', 'Weapons'))], entries), ...(update ? [] : grantChecks(entries, known.grants ?? {})),
      ...classMd.flatMap(([cls, md]) => [...spellListChecks(cls, md, entries), ...featureHeadingChecks(cls, md, entries), ...lookupTableChecks(`classes/${cls}.md`, md, entries)]),
      ...lookupTableChecks('06-equipment.md', ref('06-equipment.md'), entries),
      // Only proficiency entries feed the language picker: a language named in some description doesn't count.
      ...lookupTableChecks('02-character-creation.md', creation.slice(creation.indexOf('#### Standard Languages'), creation.indexOf('## Step 3')), entries.filter((e) => e.kind === 'prof')),
      ...textChecks(entries, standaloneHeadings(srdText)), ...ruleTextChecks(entries), ...effectChecks(entries),
      ...mechanicChecks(entries), ...rowChecks(entries), ...actionCostChecks(entries), ...ownPoolChecks(entries), ...repeatedSpellChecks(entries), ...featPoolChecks(entries),
      ...freeCastLinkChecks(cat), ...grantedSpellChecks(cat), ...backgroundEquipChecks(cat),
      ...unreadFieldChecks(cat), ...poolChecks(cat), ...grantSourceChecks(entries, code), ...ruleCatChecks(entries, code)
    ].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
    const todo = findings.filter((f) => known.todo[keyOf(f)]).length;
    writeFileSync(REPORT, `# audit ${new Date().toISOString()}, pack built ${pack.builtAt}; ${findings.length} findings, ${todo} known and still todo\n${findings.map((f) => `${keyOf(f)}\n    ${f.note}`).join('\n')}\n`);
    if (update) {
      const { next, added, removed, changed } = updateKnown(findings, known);
      if (existsSync(KNOWN)) copyFileSync(KNOWN, new URL('audit-known.json.bak', KNOWN));
      writeFileSync(KNOWN, JSON.stringify({ ...next, grants: grantHashes(entries) }, null, 1) + '\n');
      console.log(`audit-known.json updated (old list in audit-known.json.bak).\nadded ${added.length}: ${added.join(', ')}\nremoved ${removed.length}: ${removed.join(', ')}\nnote changed ${changed.length}: ${changed.join(', ')}`);
      return;
    }
    expect(compareKnown(findings, known)).toEqual({ new: [], changed: [], gone: [] });
  }, 120000);
});
