// Each audit check against synthetic data: a seeded defect is found, the clean case isn't flagged. No source files needed.
import { describe, expect, it } from 'vitest';
import { mergeCatalog } from '../../src/catalog/merge.ts';
import type { Entry } from '../../src/catalog/schema.ts';
import { effectChecks, featureHeadingChecks, keyOf, lookupTableChecks, referenceChecks, ruleTextChecks, spellListChecks, srdHeadingChecks, standaloneHeadings, textChecks, type Finding } from './checks.ts';
import { grantSourceChecks, poolChecks, ruleCatChecks, unreadFieldChecks } from './wiring.ts';

const spell = (name: string, extra: object = {}) => ({ id: `spell/${name.toLowerCase().replace(/ /g, '-')}`, kind: 'spell', name, src: 'srd', desc: 'Some text.', lvl: 1, school: 'Evocation', classes: 'wizard', time: 'Action', range: '60 feet', comp: 'V', dur: 'Instantaneous', conc: false, ritual: false, fx: 'other', ...extra }) as unknown as Entry;
const item = (name: string, extra: object = {}) => ({ id: `item/${name.toLowerCase().replace(/ /g, '-')}`, kind: 'item', name, src: 'srd', desc: 'Some text.', cat: 'magic', ...extra }) as unknown as Entry;
const feature = (name: string, extra: object = {}) => ({ id: `feature/wizard/${name.toLowerCase().replace(/ /g, '-')}`, kind: 'feature', name, src: 'srd', desc: 'Some text.', cls: 'wizard', lvl: 1, grants: [], ...extra }) as unknown as Entry;
const keys = (fs: Finding[]) => fs.map(keyOf);

describe('source checks', () => {
  const srdText = 'Burning Tune\nLevel 1 Evocation (Wizard)\nText.\nLost Song\nLevel 2 Illusion (Bard)\nText.\nCloak of Tests\nWondrous Item, Rare (Requires Attunement)\nText.\nWrapped Blade\nWeapon (Longsword, Rapier, or\nScimitar), Legendary\nText.\n';
  it('finds a spell or magic item the catalog lacks or has no heading for, and a wrong rarity or attunement', () => {
    const entries = [spell('Burning Tune'), spell('Invented Spell'), item('Cloak of Tests', { rarity: 'Rare', attune: true }), item('Wrapped Blade', { rarity: 'Legendary' })];
    expect(keys(srdHeadingChecks(srdText, entries))).toEqual(['srd-spell-missing|lostsong', 'srd-spell-extra|inventedspell']);
    expect(keys(srdHeadingChecks(srdText, [spell('Burning Tune'), spell('Lost Song'), item('Cloak of Tests', { rarity: 'Common', attune: true })]))).toEqual(['srd-item-rarity|item/cloak-of-tests', 'srd-item-missing|wrappedblade']);
    expect(keys(srdHeadingChecks(srdText, [spell('Burning Tune'), spell('Lost Song'), item('Cloak of Tests', { rarity: 'Rare' }), item('Wrapped Blade', { rarity: 'Legendary' })]))).toEqual(['srd-item-attune|item/cloak-of-tests']);
  });
  it('finds a parsed entry the catalog lacks, and SRD fields and dice that disagree', () => {
    const parsed = [spell('Burning Tune', { lvl: 2, desc: 'Deals 2d8.', src: 'phb' }), spell('Pack Only', { src: 'phb' })];
    expect(keys(referenceChecks(parsed, [spell('Burning Tune', { desc: 'Deals 1d8.' })]))).toEqual(['srd-phb-field|spell/burning-tune:lvl', 'srd-phb-dice|spell/burning-tune', 'phb-missing|spell/pack-only']);
    expect(referenceChecks([spell('Burning Tune', { desc: 'Short.', classes: 'bard,wizard' })], [spell('Burning Tune', { desc: 'Deals 1d8.', classes: 'wizard,bard' })])).toEqual([]);
  });
  it('compares a class spell list both ways', () => {
    const md = '## Wizard Spell List\n| Spell | School |\n|---|---|\n| Burning Tune | Evocation |\n| Lost Song | Illusion |\n\n## Next\n';
    expect(keys(spellListChecks('wizard', md, [spell('Burning Tune'), spell('Invented Spell')]))).toEqual(['spell-list-missing|wizard:spell/lost-song', 'spell-list-extra|wizard:spell/invented-spell']);
  });
  it('finds a feature heading with no entry, or at a level the entry does not have', () => {
    const md = '### Level 1: Known (PHB p.1)\n### Level 2 / 6: Again (PHB p.1)\n### Level 3: Lost\n### Level 4: Subclass feature\n';
    expect(keys(featureHeadingChecks('wizard', md, [feature('Known'), feature('Again', { lvl: 2 })]))).toEqual(['feature-level|wizard:again:6', 'feature-missing|wizard:lost']);
  });
  it('finds a lookup table with rows the catalog never mentions, and reads a roll table by its second cell', () => {
    const md = '### Widget Options\n| Option | Rule |\n|---|---|\n| Some | a |\n| Absent One | b |\n\n#### Surge Table\n| d100 | Effect |\n|---|---|\n| 01-04 | You turn into a teapot for now |\n\n### Unrelated\n| Name | x |\n|---|---|\n| Nowhere | y |\n';
    const f = lookupTableChecks('a.md', md, [spell('Spell', { desc: 'Some text.' })]);
    expect(keys(f)).toEqual(['lookup-table-absent|a.md#Widget Options', 'lookup-table-absent|a.md#Surge Table']);
    expect(f[0].note).toContain('Absent One');
  });
});

describe('text checks', () => {
  const one = (desc: string, e = spell('Spell', { desc })) => keys(textChecks([e], new Set(['Other Tools']))).map((k) => k.split('|')[0]);
  it('leaves good text alone', () => {
    expect(one('A sentence.\nThe Rolls table lists them:\nRolls 1 Cat 2 Dog')).toEqual([]);
    expect(textChecks([item('Longsword', { desc: '', cat: 'weapon' })])).toEqual([]);
  });
  it.each([
    ['text-empty', ''], ['text-markdown', 'Text.\n##### Table'], ['text-markdown', 'Text.\n| a | b |'], ['text-markdown', 'Text.\n---'],
    ['text-soft-hyphen', 'Meta­magic text.'], ['text-page-junk', 'Text. System Reference Document 5.2.1.'],
    ['text-table-header-tail', 'Rows 1 Cold 2 Freezing Condition'], ['text-cut-short', 'such as manipulating a simple tool and a very long clause,'],
    ['text-heading-tail', 'A list of things and Other Tools'], ['table-missing', 'Roll on the Wild Weather table.'], ['table-cut', 'The Costs table shows it.\nCosts Level Price']
  ])('%s', (check, desc) => expect(one(desc)).toContain(check));
  it('reads standalone headings from source lines, not prose', () => {
    expect([...standaloneHeadings('Other Tools\nthe other tools here\nOne\n')]).toEqual(['Other Tools']);
  });
});

describe('catalog against the sheet', () => {
  it('finds a weapon property or mastery with no rule text', () => {
    expect(keys(ruleTextChecks([item('Sword', { props: 'finesse,light', mastery: 'sap' }), { id: 'rule/light', kind: 'rule', name: 'Light', src: 'srd', desc: 'x', cat: 'action' } as unknown as Entry]))).toEqual(['rule-text-missing|property:finesse', 'rule-text-missing|mastery:sap']);
  });
  it('finds a stated effect with no grant of its kind', () => {
    const fly = 'The target gains a Fly Speed of 60 feet.';
    expect(keys(effectChecks([spell('Fly', { desc: fly }), spell('Has Grant', { desc: fly, grants: [{ id: 'g', kind: 'speed', name: 'Fly', mode: 'fly', val: '60' }] }), item('Gear', { desc: fly, cat: 'gear' })]))).toEqual(['effect-no-grant|spell/fly:speed']);
  });
  it('traces entry fields nothing reads, and doesn’t flag ones the add flow reads', () => {
    const cls = { id: 'class/wizard', kind: 'class', name: 'Wizard', src: 'srd', desc: 'x', hd: 6, saves: 'int,wis', skills: { kind: 'choice', id: 's', name: 'Skills', pick: 2, pool: 'skill:any' }, armor: '', weapons: '' } as unknown as Entry;
    const found = keys(unreadFieldChecks(mergeCatalog([cls, spell('Burning Tune')], null)));
    expect(found).toEqual(expect.arrayContaining(['field-unread|class.hd', 'field-unread|class.saves']));
    expect(found).not.toContain('field-unread|spell.lvl');
  });
  it('finds a pool that offers nothing', () => {
    const f = feature('Invocations', { grants: [{ kind: 'choice', id: 'i', name: 'Pick', pick: 1, pool: 'invocation:any' }, { kind: 'choice', id: 's', name: 'Skill', pick: 1, pool: 'skill:any' }] });
    expect(keys(poolChecks(mergeCatalog([f], null)))).toEqual(['pool-empty|invocation:any']);
  });
  it('finds grant kinds, grant fields and rule categories the code never names', () => {
    const f = feature('F', { grants: [{ id: 'a', kind: 'casting', name: 'C', ab: 'int', list: 'wizard', s1: '3:2' }, { id: 'b', kind: 'crit', name: 'Crit', val: '19' }] });
    expect(keys(grantSourceChecks([f], "kind === 'casting'; g.ab; g.list; g.val"))).toEqual(['grant-field-unread|casting.s1', 'grant-kind-unread|crit']);
    const rule = (cat: string) => ({ id: `rule/${cat}`, kind: 'rule', name: cat, src: 'srd', desc: 'x', cat }) as unknown as Entry;
    expect(keys(ruleCatChecks([rule('action'), rule('sense')], "e.cat === 'action'"))).toEqual(['rule-cat-unread|sense']);
  });
});
