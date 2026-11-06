import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { goldOf, multiOf, parseClass, parseOptions, primaryOf, toolsOf } from './classes.ts';

const fx = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const [cls, subs, feats] = parseClass(fx('ranger.txt'), fx('ranger-layout.txt'));
const row = (...n: number[]) => [...n, ...Array(9 - n.length).fill(0)];

it('reads the core traits', () => {
  expect(cls).toMatchObject({
    id: 'class/ranger', kind: 'class', name: 'Ranger', src: 'srd', hd: 10, saves: 'str,dex', castAb: 'wis',
    skills: { kind: 'choice', id: 'skills', name: 'Skill proficiencies', pick: 3, pool: 'skill:animal|athletics|insight|investigation|nature|perception|stealth|survival' },
    weapons: 'Simple weapons,Martial weapons', armor: 'Light armor,Medium armor,Shields'
  });
  expect(cls.tools).toBeUndefined();
  expect(cls.pact).toBeUndefined();
});
it('reads the spellcasting columns of the features table', () => {
  expect(cls.slots).toHaveLength(20);
  expect([cls.slots![0], cls.slots![4], cls.slots![16], cls.slots![19]]).toEqual([row(2), row(4, 2), row(4, 3, 3, 3, 1), row(4, 3, 3, 3, 2)]);
  expect(cls.prepared).toBe('1:2,2:3,3:4,4:5,5:6,7:7,9:9,11:10,13:11,15:12,17:14,19:15');
  expect(cls.cantrips).toBeUndefined();
});
it('reads one feature per name, with the later levels of a repeated one', () => {
  expect(feats.filter((f) => !f.sub).map((f) => [f.id, f.lvl, f.again])).toEqual([
    ['feature/ranger/favored-enemy', 1, undefined], ['feature/ranger/weapon-mastery', 1, undefined], ['feature/ranger/deft-explorer', 2, undefined],
    ['feature/ranger/fighting-style', 2, undefined], ['feature/ranger/ranger-subclass', 3, undefined],
    ['feature/ranger/ability-score-improvement', 4, '8,12,16'], ['feature/ranger/extra-attack', 5, undefined]
  ]);
  expect(feats[0]).toMatchObject({ kind: 'feature', cls: 'ranger', src: 'srd', grants: [] });
  expect(feats[0].desc).toMatch(/^You always have the Hunter’s Mark spell prepared\./);
  expect(feats[0].desc).not.toContain('Weapon Mastery');
});
it('reads the subclass and its features', () => {
  expect(subs).toEqual([expect.objectContaining({ id: 'subclass/ranger/hunter', kind: 'subclass', name: 'Hunter', cls: 'ranger' })]);
  expect(feats.filter((f) => f.sub).map((f) => [f.id, f.lvl, f.sub])).toEqual([
    ['feature/ranger/hunter/hunters-lore', 3, 'hunter'], ['feature/ranger/hunter/hunters-prey', 3, 'hunter']
  ]);
  expect(feats.find((f) => f.name === 'Hunter’s Prey')!.desc).toContain('Colossus Slayer. Your tenacity');
});

it('reads option features from a section, with prerequisites, repeat and wrapped prerequisite lines', () => {
  const lines = ['Agonizing Blast', '', 'Prerequisite: Level 2+ Warlock, a Warlock Cantrip', 'That Deals Damage', '', 'Add your Charisma modifier.', 'Repeatable. You can gain this more than once.', '',
    'Devouring Blade', '', 'Prerequisite: Level 12+ Warlock, Thirsting Blade', 'Invocation', '', 'Two attacks.', '', 'Armor of Shadows', '', 'Cast Mage Armor.', ''];
  const opts = parseOptions(lines, ['Agonizing Blast', 'Armor of Shadows', 'Devouring Blade', 'Not In This Text'], { cls: 'Warlock', of: 'invocation', lvl: 1 });
  expect(opts.map((o) => o.id)).toEqual(['feature/warlock/agonizing-blast', 'feature/warlock/devouring-blade', 'feature/warlock/armor-of-shadows']);
  expect(opts[0]).toMatchObject({ kind: 'feature', src: 'srd', cls: 'warlock', of: 'invocation', lvl: 2, prereq: 'lvl>=2', repeat: true, grants: [] });
  expect(opts[1]).toMatchObject({ lvl: 12, prereq: 'lvl>=12;feature=thirsting-blade' });
  expect(opts[1].desc).toBe('Prerequisite: Level 12+ Warlock, Thirsting Blade Invocation\nTwo attacks.');
  expect(opts[2].prereq).toBeUndefined();
});
it('reads a Cost line right under the heading', () => {
  const [o] = parseOptions(['Empowered Spell', 'Cost: 1 Sorcery Point', '', 'Reroll dice.', ''], ['Empowered Spell'], { cls: 'Sorcerer', of: 'metamagic', lvl: 2 });
  expect(o).toMatchObject({ id: 'feature/sorcerer/empowered-spell', of: 'metamagic', lvl: 2, desc: 'Cost: 1 Sorcery Point\nReroll dice.' });
});

it('reads the primary abilities and the gold of the starting packages', () => {
  // The fixture is an excerpt without the packages' gold or the multiclass bullet: those are checked on the strings
  // below and on the built data (data.test.ts).
  expect(cls.primary).toBe('dex,wis');
  expect(cls.gpA).toBeUndefined();
  expect(cls.multi).toBeUndefined();
  expect(primaryOf('Strength or Dexterity')).toBe('str|dex');
  expect(primaryOf('Charisma')).toBe('cha');
  expect(goldOf('Choose A or B: (A) Greataxe, 4 Handaxes, Explorer’s Pack, and 15 GP; or (B) 75 GP')).toEqual([15, 75]);
  expect(goldOf('Choose A, B, or C: (A) Chain Mail, and 4 GP; (B) Scimitar, and 11 GP; or (C) 155 GP')).toEqual([4, 155]);
});
it('reads tool choices and multiclass skill and tool picks', () => {
  expect(toolsOf('Choose 3 Musical Instruments (see “Equipment”)')).toEqual({ kind: 'choice', id: 'tools', name: 'Tool proficiencies', pick: 3, pool: 'tool:musical-instrument' });
  expect(toolsOf('Choose one type of Artisan’s Tools or Musical Instrument (see “Equipment”)')).toMatchObject({ pick: 1, pool: 'tool:artisan|musical-instrument' });
  expect(toolsOf('Thieves’ Tools')).toBe('Thieves’ Tools');
  expect(toolsOf("Choose one type of Artisan's Tools or Musical Instrument (chapter 6)")).toMatchObject({ pick: 1, pool: 'tool:artisan|musical-instrument' });
  const skills = { kind: 'choice' as const, id: 'skills', name: 'Skill proficiencies', pick: 2, pool: 'skill:arcana|history' };
  expect(multiOf('Gain the following traits from the Core Bard Traits table: Hit Point Die, proficiency in one skill of your choice, proficiency with one Musical Instrument of your choice, and training with Light armor.', skills))
    .toEqual({ armor: 'Light armor', skills: { kind: 'choice', id: 'mskills', name: 'Skill proficiency', pick: 1, pool: 'skill:any' },
      tools: { kind: 'choice', id: 'mtools', name: 'Tool proficiency', pick: 1, pool: 'tool:musical-instrument' } });
  expect(multiOf('Gain the following traits from the Core Rogue Traits table: Hit Point Die, proficiency in one skill of your choice from the Rogue’s skill list, proficiency with Thieves’ Tools, and training with Light armor.', skills))
    .toEqual({ armor: 'Light armor', tools: 'Thieves’ Tools', skills: { kind: 'choice', id: 'mskills', name: 'Skill proficiency', pick: 1, pool: 'skill:arcana|history' } });
  expect(multiOf('Gain the Hit Point Die trait from the Core Monk Traits table.', skills)).toEqual({});
});
