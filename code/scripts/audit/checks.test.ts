// Each audit check against synthetic data: a seeded defect is found, the clean case isn't flagged. No source files needed.
import { describe, expect, it } from 'vitest';
import { mergeCatalog } from '../../src/catalog/merge.ts';
import type { Entry } from '../../src/catalog/schema.ts';
import { actionCostChecks, compareKnown, coverageChecks, effectChecks, featPoolChecks, featureHeadingChecks, grantChecks, grantHashes, itemNumberChecks, keyOf, lookupTableChecks, mechanicChecks, referenceChecks, repeatedSpellChecks, rowChecks, ruleSourceChecks, ruleTextChecks, spellListChecks, spellNumberChecks, srdHeadingChecks, standaloneHeadings, textChecks, updateKnown, type Finding } from './checks.ts';
import { backgroundEquipChecks, freeCastLinkChecks, grantedSpellChecks, grantSourceChecks, poolChecks, ruleCatChecks, unreadFieldChecks } from './wiring.ts';

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
  it('compares rarities whole, so a word inside another word is no match', () => {
    const text = 'Boots\nWondrous Item, Uncommon\nText.\nGem\nWondrous Item, Very Rare\nText.\n';
    const check = (a: string, b: string) => keys(srdHeadingChecks(text, [item('Boots', { rarity: a }), item('Gem', { rarity: b })]));
    expect(check('Uncommon', 'Very Rare')).toEqual([]);
    expect(check('Common', 'Rare')).toEqual(['srd-item-rarity|item/boots', 'srd-item-rarity|item/gem']);
  });
  it('compares a compound rarity whole', () => {
    const text = 'Horn\nWondrous Item, Rare (Silver or Brass), Very Rare (Bronze), or Legendary (Iron)\nText.\n';
    const whole = 'Rare (Silver or Brass), Very Rare (Bronze), or Legendary (Iron)';
    expect(srdHeadingChecks(text, [item('Horn', { rarity: whole })])).toEqual([]);
    expect(keys(srdHeadingChecks(text, [item('Horn', { rarity: 'Rare' })]))).toEqual(['srd-item-rarity|item/horn']);
  });
  it('reports a missing item whose heading has parentheses or wraps', () => {
    const text = 'Stone (Luck)\nWondrous Item, Uncommon\nText.\nAmulet of Proof against Detection\nand Location\nWondrous Item, Uncommon\nText.\n';
    expect(keys(srdHeadingChecks(text, []))).toEqual(['srd-item-missing|stoneluck', 'srd-item-missing|amuletofproofagainstdetectionandlocation']);
  });
  it('flags a parser that returns fewer entries of a kind than the catalog holds', () => {
    const feat = (n: string) => ({ id: `feat/${n}`, kind: 'feat', name: n, src: 'srd', desc: 'x', cat: 'general' }) as unknown as Entry;
    expect(keys(coverageChecks([feat('a')], [feat('a'), feat('b')]))).toEqual(['parser-short|feat']);
    expect(keys(coverageChecks([], [feat('a')]))).toEqual(['parser-short|feat']);
    expect(coverageChecks([feat('a')], [feat('a')])).toEqual([]);
  });
  it('leaves kinds the parsers never give, and magic items, out of the parser count', () => {
    const rule = { id: 'rule/dash', kind: 'rule', name: 'Dash', src: 'srd', desc: 'x', cat: 'action' } as unknown as Entry;
    expect(coverageChecks([], [rule, item('Cloak', { cat: 'magic' })])).toEqual([]);
    expect(keys(coverageChecks([], [item('Rope', { cat: 'gear' })]))).toEqual(['parser-short|item']);
  });
  it('compares fields of PHB-only entries too', () => {
    const pack = spell('Pack Only', { src: 'phb', lvl: 3 });
    expect(keys(referenceChecks([spell('Pack Only', { src: 'phb', lvl: 2 })], [pack]))).toEqual(['pack-field|spell/pack-only:lvl']);
  });
  it('compares a spell number only when both sides have one', () => {
    const e = spell('Tune', { scale: '1d8/slot', dice: '2d8', save: 'dex', dtype: 'Fire', atk: 'ranged' });
    expect(referenceChecks([spell('Tune', { scale: '1d8/slot', dice: '2d8', save: 'dex', dtype: 'Fire', atk: 'ranged' })], [e])).toEqual([]);
    expect(referenceChecks([spell('Tune')], [e])).toEqual([]);
    expect(keys(referenceChecks([spell('Tune', { scale: '2d8/slot', dice: '3d8', save: 'con', dtype: 'Cold', atk: 'melee' })], [e]))).toEqual(['srd-phb-field|spell/tune:dice', 'srd-phb-field|spell/tune:dtype', 'srd-phb-field|spell/tune:save', 'srd-phb-field|spell/tune:atk', 'srd-phb-field|spell/tune:scale']);
  });
  it('compares class and background proficiencies, a skill pool in any order', () => {
    const cls = (extra: object) => ({ id: 'class/x', kind: 'class', name: 'X', src: 'srd', desc: '', hd: 8, saves: 'str', armor: 'light', weapons: 'simple', skills: { kind: 'choice', id: 's', name: 'S', pick: 2, pool: 'skill:arc|his' }, ...extra }) as unknown as Entry;
    expect(referenceChecks([cls({ skills: { kind: 'choice', id: 's', name: 'S', pick: 2, pool: 'skill:his|arc' } })], [cls({})])).toEqual([]);
    expect(keys(referenceChecks([cls({ armor: 'heavy', tools: 'Lute', skills: { kind: 'choice', id: 's', name: 'S', pick: 3, pool: 'skill:arc|his' } })], [cls({})]))).toEqual(['srd-phb-field|class/x:armor', 'srd-phb-field|class/x:tools', 'srd-phb-field|class/x:skills']);
    const pick = (pool: string) => ({ kind: 'choice' as const, id: 'tools', name: 'T', pick: 1, pool });
    expect(keys(referenceChecks([cls({ tools: pick('tool:artisan|musical-instrument') })], [cls({ tools: pick('tool:musical-instrument|artisan') })]))).toEqual([]);
    const bg = (extra: object) => ({ id: 'background/x', kind: 'background', name: 'X', src: 'srd', desc: '', feat: 'feat/a', ...extra }) as unknown as Entry;
    expect(keys(referenceChecks([bg({ feat: 'feat/b' })], [bg({})]))).toEqual(['srd-phb-field|background/x:feat']);
  });
  it('compares class tools without their "see" pointer', () => {
    const cls = (tools: string) => ({ id: 'class/x', kind: 'class', name: 'X', src: 'srd', desc: '', hd: 8, saves: 'str', armor: '', weapons: '', tools, skills: { kind: 'choice', id: 's', name: 'S', pick: 1, pool: 'skill:arc' } }) as unknown as Entry;
    expect(referenceChecks([cls('Choose 3 Musical Instruments (see chapter 6)')], [cls('Choose 3 Musical Instruments (see “Equipment”)')])).toEqual([]);
    expect(keys(referenceChecks([cls('Choose 2 Lutes (chapter 6)')], [cls('Choose 3 Lutes (see “Equipment”)')]))).toEqual(['srd-phb-field|class/x:tools']);
  });
  it('finds a referred table in the entry whose text holds it', () => {
    const f = (name: string, desc: string) => ({ id: `feature/x/${name}`, kind: 'feature', name, src: 'phb', cls: 'x', lvl: 1, desc, grants: [] }) as unknown as Entry;
    const user = f('a', 'Roll on the Surge Roll table.');
    expect(keys(textChecks([user, f('b', 'Surge Roll Table\n1 Boom')]))).toEqual([]);
    expect(keys(textChecks([user]))).toEqual(['table-missing|feature/x/a:Surge Roll']);
  });
  it('finds a spell whose dice, damage type, attack or concentration its own text does not back', () => {
    const ok = spell('Ok', { desc: 'A ranged spell attack deals 8d6 Fire damage.', dice: '8d6', dtype: 'Fire', atk: 'ranged', dur: 'Concentration, up to 1 minute', conc: true });
    const bad = spell('Bad', { desc: 'Deals 8d6 Fire damage.', dice: '1d6', dtype: 'Cold', atk: 'melee', dur: 'Instantaneous', conc: true });
    expect(spellNumberChecks([ok])).toEqual([]);
    expect(keys(spellNumberChecks([bad]))).toEqual(['spell-self-dice|spell/bad', 'spell-self-dtype|spell/bad', 'spell-self-atk|spell/bad', 'spell-self-conc|spell/bad']);
  });
  it('finds a plain charge count the item text does not state, and leaves rolled charges alone', () => {
    expect(itemNumberChecks([item('Wand', { desc: 'It has 7 charges.', charges: '7' }), item('Dice', { desc: 'It has 1d3 charges.', charges: '1d3' })])).toEqual([]);
    expect(keys(itemNumberChecks([item('Wand', { desc: 'It has 7 charges.', charges: '99' })]))).toEqual(['item-self-charges|item/wand']);
  });
  it('finds a rule the SRD text lacks, and one the SRD text has with no entry', () => {
    const rule = (name: string) => ({ id: `rule/${name.toLowerCase()}`, kind: 'rule', name, src: 'srd', desc: 'x', cat: 'action' }) as unknown as Entry;
    const parsed = [rule('Dash'), rule('Hide')];
    expect(ruleSourceChecks(parsed, parsed)).toEqual([]);
    expect(keys(ruleSourceChecks(parsed, [rule('Dash'), rule('Sprint')]))).toEqual(['rule-source-missing|rule/hide', 'rule-source-extra|rule/sprint']);
  });
  it('flags a changed, a new and a removed grant list by hash', () => {
    const g = (val: string) => [{ id: 'r', kind: 'resource', name: 'R', max: val, recharge: 'long' }];
    const stored = grantHashes([feature('A', { grants: g('2') }), feature('Gone', { grants: g('1') })]);
    expect(Object.keys(stored)).toEqual(['feature/wizard/a', 'feature/wizard/gone']);
    expect(grantChecks([feature('A', { grants: g('2') }), feature('Gone', { grants: g('1') })], stored)).toEqual([]);
    expect(keys(grantChecks([feature('A', { grants: g('99') }), feature('New', { grants: g('1') })], stored))).toEqual(['grants-changed|feature/wizard/a', 'grants-changed|feature/wizard/gone', 'grants-changed|feature/wizard/new']);
  });
  it('reports a class with spells whose list heading is gone', () => {
    expect(keys(spellListChecks('wizard', '## Wizard Spells\n', [spell('Burning Tune')]))).toEqual(['spell-list-no-heading|wizard']);
    expect(spellListChecks('fighter', '## Nothing\n', [spell('Burning Tune')])).toEqual([]);
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
  it('reads language tables as lookup tables', () => {
    expect(keys(lookupTableChecks('a.md', '#### Rare Languages\n| Language | Origin |\n|---|---|\n| Abyssal | Demons |\n', []))).toEqual(['lookup-table-absent|a.md#Rare Languages']);
    expect(lookupTableChecks('a.md', '#### Standard Languages\n| Roll | Language |\n|---|---|\n| — | Common |\n| 1 | Abyssal* |\n', [spell('Common'), spell('Abyssal')])).toEqual([]);
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
    ['text-soft-hyphen', 'Meta­magic text.'], ['text-page-junk', 'Text. System Reference Document 5.2.1.'], ['text-page-junk', 'Some Table (PHB p.97)\nText.'],
    ['text-table-header-tail', 'Rows 1 Cold 2 Freezing Condition'], ['text-cut-short', 'such as manipulating a simple tool and a very long clause,'],
    ['text-heading-tail', 'A list of things and Other Tools'], ['table-missing', 'Roll on the Wild Weather table.'], ['table-cut', 'The Costs table shows it.\nCosts Level Price']
  ])('%s', (check, desc) => expect(one(desc)).toContain(check));
  it('needs text on a rule', () => {
    expect(keys(textChecks([{ id: 'rule/dash', kind: 'rule', name: 'Dash', src: 'srd', desc: '', cat: 'action' } as unknown as Entry]))).toEqual(['text-empty|rule/dash']);
  });
  it('keeps one finding per table an entry refers to', () => {
    expect(keys(textChecks([spell('Spell', { desc: 'See the Wild Weather table, or the Cold Snap table.' })]))).toEqual(['table-missing|spell/spell:Wild Weather', 'table-missing|spell/spell:Cold Snap']);
  });
  it('reads standalone headings from source lines, not prose', () => {
    expect([...standaloneHeadings('Other Tools\nthe other tools here\nOne\n')]).toEqual(['Other Tools']);
  });
});

describe('catalog against the sheet', () => {
  it('finds a weapon property or mastery with no rule text', () => {
    expect(keys(ruleTextChecks([item('Sword', { props: 'finesse,light', mastery: 'sap' }), { id: 'rule/light', kind: 'rule', name: 'Light', src: 'srd', desc: 'x', cat: 'action' } as unknown as Entry]))).toEqual(['rule-text-missing|property:finesse', 'rule-text-missing|mastery:sap']);
  });
  it('names every item behind one rule-text finding, sorted', () => {
    const [f] = ruleTextChecks([item('Sword', { props: 'light' }), item('Axe', { props: 'light' })]);
    expect(f.note).toContain('Axe, Sword');
  });
  it('quotes every matching cue of an effect finding', () => {
    const [f] = effectChecks([spell('Two', { desc: 'Then you have Resistance to Fire. The target has Resistance to Cold.' })]);
    expect(f.note).toContain('you have Resistance to');
    expect(f.note).toContain('target has Resistance to');
  });
  it('finds a stated effect at the start of a sentence', () => {
    expect(keys(effectChecks([spell('Capital', { desc: 'You have Resistance to Fire damage.' })]))).toEqual(['effect-no-grant|spell/capital:resistance']);
  });
  it('finds a stated effect with no grant of its kind', () => {
    const fly = 'The target gains a Fly Speed of 60 feet.';
    expect(keys(effectChecks([spell('Fly', { desc: fly }), spell('Has Grant', { desc: fly, grants: [{ id: 'g', kind: 'speed', name: 'Fly', mode: 'fly', val: '60' }] }), item('Gear', { desc: fly, cat: 'gear' })]))).toEqual(['effect-no-grant|spell/fly:speed']);
  });
  it('traces entry fields nothing reads, and doesn’t flag ones the add flow reads', () => {
    const cls = { id: 'class/wizard', kind: 'class', name: 'Wizard', src: 'srd', desc: 'x', hd: 6, saves: 'int,wis', skills: { kind: 'choice', id: 's', name: 'Skills', pick: 2, pool: 'skill:any' }, armor: '', weapons: '', junk: 1 } as unknown as Entry;
    const found = keys(unreadFieldChecks(mergeCatalog([cls, spell('Burning Tune')], null)));
    // The level engine reads a class's hd and saves (the audit levels each class), so only the unknown field is flagged.
    expect(found).toContain('field-unread|class.junk');
    expect(found).not.toContain('field-unread|class.hd');
    expect(found).not.toContain('field-unread|spell.lvl');
  });
  it('counts a read of an item field only when it is not the base-copy spread', () => {
    const base = { id: 'item/longsword', kind: 'item', name: 'Longsword', src: 'srd', desc: '', cat: 'weapon', wcat: 'martial', wrange: 'melee', dmg: '1d8', dtype: 'Slashing' };
    const magic = item('Blade', { base: 'weapon', baseOf: 'item/longsword', junk: 1 });
    expect(keys(unreadFieldChecks(mergeCatalog([base as unknown as Entry, magic], null)))).toContain('field-unread|item.junk');
  });
  it('reports an entry the add flow throws on, and skips kinds that can not be added', () => {
    const rule = { id: 'rule/dash', kind: 'rule', name: 'Dash', src: 'srd', desc: 'x', cat: 'action' } as unknown as Entry;
    const found = keys(unreadFieldChecks(mergeCatalog([rule, item('No Base', { base: 'armor', baseOf: 'item/nothing' })], null)));
    expect(found).toContain('add-throws|item/no-base');
    expect(found).not.toContain('add-throws|rule/dash');
  });
  it('finds a pool with fewer options than the pick', () => {
    const f = feature('Greedy', { grants: [{ kind: 'choice', id: 'g', name: 'Pick', pick: 3, pool: 'ability:str' }] });
    expect(keys(poolChecks(mergeCatalog([f], null)))).toEqual(['pool-short|ability:str']);
  });
  it('names every entry using an empty pool, sorted', () => {
    const pick = { kind: 'choice', id: 'i', name: 'Pick', pick: 1, pool: 'invocation:any' };
    const [one] = poolChecks(mergeCatalog([feature('Zed', { grants: [pick] }), feature('Abe', { grants: [pick] })], null));
    expect(one.note).toContain('feature/wizard/abe, feature/wizard/zed');
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

describe('known list', () => {
  const f = (id: string, note: string): Finding => ({ check: 'c', id, note });
  const known = { accepted: { 'c|a': { note: 'one', reason: 'fine' } }, todo: { 'c|b': { note: 'two', reason: 'later' } } };
  it('passes when findings match', () => {
    expect(compareKnown([f('a', 'one'), f('b', 'two')], known)).toEqual({ new: [], changed: [], gone: [] });
  });
  it('reports a new finding, a changed note and a gone key', () => {
    expect(compareKnown([f('a', 'worse'), f('c', 'three')], known)).toEqual({ new: ['c|c: three'], changed: ['c|a: "one" is now "worse"'], gone: ['c|b'] });
  });
  it('keeps a kept key’s group and reason on update, sends a new one to todo, and lists what changed', () => {
    const r = updateKnown([f('a', 'worse'), f('b', 'two'), f('c', 'three')], { ...known, todo: { ...known.todo, 'c|d': { note: 'x', reason: 'y' } } });
    expect(r.next.accepted['c|a']).toEqual({ note: 'worse', reason: 'fine' });
    expect(r.next.todo['c|b']).toEqual({ note: 'two', reason: 'later' });
    expect(r.next.todo['c|c'].note).toBe('three');
    expect(r).toMatchObject({ added: ['c|c'], removed: ['c|d'], changed: ['c|a'] });
  });
});

describe('checks after the second-print fixes', () => {
  const spellText = 'Telekinesis\nLevel 5 Transmutation (Sorcerer, Wizard)\n';
  const spell = { id: 'spell/telekinesis', kind: 'spell', name: 'Telekinesis', src: 'phb', replace: true, desc: 'x', lvl: 5, school: 'Transmutation', classes: 'wizard', time: 'Action', range: '60 feet', comp: 'V', dur: '1 hour', conc: false, ritual: false, fx: 'other' } as unknown as Entry;
  it('counts a PHB entry that replaces its SRD entry as having one', () => {
    expect(srdHeadingChecks(spellText, [spell]).filter((f) => f.check === 'srd-spell-missing')).toEqual([]);
  });
  it('accepts a table written as plain lines without digits', () => {
    const e = { id: 'feature/x/y', kind: 'feature', name: 'Y', src: 'srd', cls: 'x', lvl: 1, grants: [], desc: 'As shown in the Land Ward table.\nLand Ward (land: Resistance)\nArid: Fire' } as unknown as Entry;
    expect(textChecks([e]).filter((f) => f.check === 'table-cut')).toEqual([]);
  });
});

describe('what a feature or feat says against what the sheet gets', () => {
  const action = (extra: object = {}) => ({ id: 'a', kind: 'action', name: 'Row', econ: 'other', ...extra });
  const spellGrant = (extra: object = {}) => ({ id: 's', kind: 'spell', name: 'Spell', spell: 'spell/burning-tune', ...extra });
  const feat = (name: string, extra: object = {}) => ({ id: `feat/${name.toLowerCase()}`, kind: 'feat', name, src: 'srd', desc: 'Some text.', cat: 'general', grants: [], ...extra }) as unknown as Entry;

  it.each([
    ['mechanic-no-grant|feature/wizard/a:free cast', 'You can cast Test Spell without expending a spell slot.', { kind: 'resource', id: 'r', name: 'R', recharge: 'long', casts: 'spell/x' }],
    ['mechanic-no-grant|feature/wizard/a:cantrip', 'You learn two Wizard cantrips.', { kind: 'spell', id: 's', name: 'S', spell: 'spell/x' }],
    ['mechanic-no-grant|feature/wizard/a:sense', 'You have Truesight with a range of 30 feet.', { kind: 'sense', id: 's', name: 'S', range: '30' }],
    ['mechanic-no-grant|feature/wizard/a:extra attacks', 'You gain the Extra Attack feature for this weapon.', { kind: 'attacks', id: 'x', name: 'X', val: '2' }],
    ['mechanic-no-grant|feature/wizard/a:attack ability', 'You can use your Charisma modifier for the attack rolls.', { kind: 'atkAbil', id: 'x', name: 'X', ab: 'cha' }],
    ['mechanic-no-grant|feature/wizard/a:damage bonus', 'You add your Charisma modifier to that damage.', { kind: 'dmgBonus', id: 'x', name: 'X', val: 'cha' }],
    ['mechanic-no-grant|feature/wizard/a:attack bonus', 'You add your Charisma modifier to attack rolls with it.', { kind: 'atkBonus', id: 'x', name: 'X', val: 'cha' }],
    ['mechanic-no-grant|feature/wizard/a:spell save DC', 'The spell save DC of your spells increases by 1.', { kind: 'spellDc', id: 'x', name: 'X', val: '1' }],
    ['mechanic-no-grant|feature/wizard/a:damage die', 'The die becomes a d8.', { kind: 'unarmed', id: 'x', name: 'X', die: '1d8', abs: 'str' }],
    ['mechanic-no-grant|feature/wizard/a:Light extra attack', 'You can make one extra attack as a Bonus Action.', { kind: 'lightExtra', id: 'x', name: 'X', addMod: false }],
    ['mechanic-no-grant|feature/wizard/a:feat pick', 'You gain an Origin feat of your choice.', { kind: 'choice', id: 'c', name: 'C', pick: 1, pool: 'feat:cat=origin' }],
    ['mechanic-no-grant|feature/wizard/a:save Advantage', 'You have Advantage on Constitution saving throws.', { kind: 'defense', id: 'x', name: 'X', def: 'adv', target: 'Con' }]
  ])('%s, until a grant carries it', (key, desc, grant) => {
    expect(keys(mechanicChecks([feature('A', { desc })]))).toEqual([key]);
    expect(mechanicChecks([feature('A', { desc, grants: [grant] })])).toEqual([]);
  });
  it('reads a die only from the grant\'s die or dice, not from its name', () => {
    expect(keys(mechanicChecks([feature('A', { desc: 'The die becomes a d8.', grants: [{ kind: 'unarmed', id: 'x', name: 'd6, or 1d8 bare handed', die: '1d6', abs: 'str' }] })]))).toEqual(['mechanic-no-grant|feature/wizard/a:damage die']);
  });
  it.each([
    ['save DC', 'The DC equals 8 plus your Wisdom modifier.'], ['half a number', 'You gain half your Wizard level.'],
    ['regain on Initiative', 'When you roll Initiative, you regain all uses.'], ['stat block', 'It uses the stat block below.'], ['state to track', 'Record the foretelling rolls.'], ['state to track', 'The ward has Hit Points equal to your level.']
  ])('%s has no field to hold it', (label, desc) => expect(keys(mechanicChecks([feature('A', { desc })]))).toEqual([`mechanic-no-field|feature/wizard/a:${label}`]));
  it('lets a half-proficiency grant answer the half cue, and skips class setup and pool options', () => {
    expect(mechanicChecks([feature('A', { desc: 'Add half your Proficiency Bonus.', grants: [{ kind: 'prof', id: 'x', name: 'X', cat: 'half' }] })])).toEqual([]);
    expect(mechanicChecks([feature('Spellcasting', { desc: 'You know two cantrips.' }), feature('B', { of: 'metamagic', desc: 'You know two cantrips.' })])).toEqual([]);
    expect(rowChecks([feature('Spellcasting'), feature('B', { of: 'maneuver' })])).toEqual([]);
  });

  it('finds an entry that gives nothing past its ability increase, and timing with no row', () => {
    const abil = { kind: 'abil', id: 'x', name: 'X', ab: 'str', val: '1', cap: 20 };
    expect(rowChecks([feat('A', { grants: [abil] }), feature('B', { desc: 'As a Reaction, do it.' }), feat('C', { desc: 'As a Bonus Action, do it.', grants: [abil, { kind: 'speed', id: 's', name: 'S', mode: 'walk', val: '10' }] })]).map((f) => [keyOf(f), f.note])).toEqual([
      ['text-only|feat/a', 'no row or number past its ability increase'], ['text-only|feature/wizard/b', 'no row or number; the text names a Reaction'], ['timing-no-row|feat/c', 'the text names a Bonus Action; no action grant']
    ]);
    expect(rowChecks([feat('A', { desc: 'As a Reaction, do it.', grants: [action()] }), feat('B', { grants: [{ kind: 'choice', id: 'c', name: 'C', pick: 1, pool: 'skill:any' }] })])).toEqual([]);
  });
  it('finds an action row that says it spends something and has no res', () => {
    expect(keys(actionCostChecks([feature('A', { grants: [action({ note: 'Spend 1 point to run.' })] })]))).toEqual(['action-cost-unlinked|feature/wizard/a:a']);
    expect(actionCostChecks([feature('A', { grants: [action({ note: 'Spend 1 point to run.', uses: 'feature/wizard/b' })] })])).toEqual([]);
    expect(actionCostChecks([feature('A', { grants: [action({ note: 'Spend 1 point.', res: 'r' }), action({ id: 'b', note: 'Run fast.' })] })])).toEqual([]);
  });
  it('finds a spell two entries of a class grant, not two subclasses or classes that happen to share it', () => {
    const f = (id: string, extra: object) => feature(id, { grants: [spellGrant()], ...extra });
    expect(keys(repeatedSpellChecks([f('A', { sub: 'x' }), f('B', { sub: 'x' })]))).toEqual(['spell-granted-twice|feature/wizard/a+feature/wizard/b:spell/burning-tune']);
    expect(keys(repeatedSpellChecks([f('A', {}), f('B', { sub: 'x' })]))).toHaveLength(1);
    expect(repeatedSpellChecks([f('A', { sub: 'x' }), f('B', { sub: 'y' }), f('C', { cls: 'bard' })])).toEqual([]);
  });
  it('finds a one-category feat pool on a feature whose text allows another feat', () => {
    const pool = { kind: 'choice', id: 'c', name: 'C', pick: 1, pool: 'feat:cat=general' };
    expect(keys(featPoolChecks([feature('A', { desc: 'Gain this feat or another feat you qualify for.', grants: [pool] })]))).toEqual(['feat-pool-narrow|feat:cat=general']);
    expect(featPoolChecks([feature('A', { grants: [pool] })])).toEqual([]);
  });

  const cast = { kind: 'resource', id: 'r', name: 'Free cast', max: '1', recharge: 'long', casts: 'spell/burning-tune' };
  it('finds no lost link on a free cast of a spell already on the sheet, or of one granted with it', () => {
    expect(freeCastLinkChecks(mergeCatalog([spell('Burning Tune'), feature('A', { grants: [cast] })], null))).toEqual([]);
    expect(freeCastLinkChecks(mergeCatalog([spell('Burning Tune'), feature('A', { grants: [spellGrant(), cast] })], null))).toEqual([]);
  });
  it('finds a granted levelled spell that needs preparing, not an always-prepared one or a cantrip', () => {
    expect(keys(grantedSpellChecks(mergeCatalog([spell('Burning Tune'), feature('A', { grants: [spellGrant()] })], null)))).toEqual(['granted-spell-unprepared|feature/wizard/a']);
    expect(grantedSpellChecks(mergeCatalog([spell('Burning Tune'), feature('A', { grants: [spellGrant({ always: true })] })], null))).toEqual([]);
    expect(grantedSpellChecks(mergeCatalog([spell('Burning Tune', { lvl: 0 }), feature('A', { grants: [spellGrant()] })], null))).toEqual([]);
  });
  it('finds a background whose equipment adds no item or coin', () => {
    const bg = { id: 'background/test', kind: 'background', name: 'Test', src: 'srd', desc: 'Text.', feat: 'feat/none', equip: 'A: Rope; B: 50 GP', grants: [] } as unknown as Entry;
    expect(keys(backgroundEquipChecks(mergeCatalog([bg], null)))).toEqual(['background-equipment-text|background']);
    expect(backgroundEquipChecks(mergeCatalog([{ ...bg, equip: '' } as Entry], null))).toEqual([]);
  });
});

it('accepts a regain on Initiative held by an action with regainTo', () => {
  const f = { id: 'feature/wizard/a', kind: 'feature', name: 'A', cls: 'wizard', lvl: 1, src: 'srd', desc: 'When you roll Initiative, you regain all uses.',
    grants: [{ id: 'g', kind: 'action', name: 'G', econ: 'free', uses: 'feature/wizard/b', regainTo: 'all' }] } as unknown as Entry;
  expect(mechanicChecks([f])).toEqual([]);
});

it('accepts a save DC held by an action with dc', () => {
  const f = { id: 'feature/wizard/a', kind: 'feature', name: 'A', cls: 'wizard', lvl: 1, src: 'srd', desc: 'The target saves against DC 8 + your bonus.',
    grants: [{ id: 'g', kind: 'action', name: 'G', econ: 'other', dc: '8+pb', dcAb: 'wis' }] } as unknown as Entry;
  expect(mechanicChecks([f])).toEqual([]);
});
it('takes the Light extra attack row for the Bonus Action its text names', () => {
  const f = { id: 'feat/a', kind: 'feat', name: 'A', cat: 'general', src: 'srd', desc: 'You attack as a Bonus Action.',
    grants: [{ id: 'g', kind: 'lightExtra', name: 'G', addMod: false, anyMelee: true }] } as unknown as Entry;
  expect(rowChecks([f])).toEqual([]);
});

it('accepts half a level held by an hlvl value', () => {
  const f = { id: 'feature/wizard/a', kind: 'feature', name: 'A', cls: 'wizard', lvl: 1, src: 'srd', desc: 'Add half your Wizard level.',
    grants: [{ id: 'g', kind: 'action', name: 'G', econ: 'other', dice: '1d6+hlvl' }] } as unknown as Entry;
  expect(mechanicChecks([f])).toEqual([]);
});

it('accepts a free cast held by an always-prepared spell', () => {
  const f = { id: 'feature/wizard/a', kind: 'feature', name: 'A', cls: 'wizard', lvl: 1, src: 'srd', desc: 'You can cast Jump without expending a spell slot.',
    grants: [{ id: 'g', kind: 'spell', name: 'Jump', spell: 'spell/jump', always: true }] } as unknown as Entry;
  expect(mechanicChecks([f])).toEqual([]);
});

it('accepts state to track held by a resource, or by an action using another feature\'s', () => {
  const f = (g: object) => ({ id: 'feature/wizard/a', kind: 'feature', name: 'A', cls: 'wizard', lvl: 1, src: 'srd', desc: 'Your ward has 10 Hit Points.', grants: [g] }) as unknown as Entry;
  expect(mechanicChecks([f({ id: 'g', kind: 'resource', name: 'Ward HP', max: '10', recharge: 'long' })])).toEqual([]);
  expect(mechanicChecks([f({ id: 'g', kind: 'action', name: 'Ward', econ: 'reaction', uses: 'feature/wizard/b' })])).toEqual([]);
});
