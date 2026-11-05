import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { validateEntry } from '../../src/catalog/schema.ts';
import { parseLanguages, parseRules, parseWeaponRules } from './rules.ts';
import { srdLines } from './text.ts';

const text = readFileSync(new URL('./fixtures/rules.txt', import.meta.url), 'utf8');

it('reads actions, Opportunity Attack and senses from the glossary', () => {
  const rules = parseRules(text);
  expect(rules.map((r) => [r.id, r.cat])).toEqual([
    ['rule/attack', 'action'], ['rule/blindsight', 'sense'], ['rule/darkvision', 'sense'], ['rule/opportunity-attack', 'action']
  ]);
  expect(rules[0]).toMatchObject({ kind: 'rule', name: 'Attack', src: 'srd' });
  expect(rules[0].desc).toMatch(/^When you take the Attack action, you can make one attack roll/);
  expect(rules[0].desc).toContain('\nMoving between Attacks. If you move');
  // a stray line from another entry, cut in by the column crop, is dropped
  expect(rules[1].desc).toBe('If you have Blindsight, you can see within a specific range without relying on physical sight. Within that range, you can see anything that isn’t behind Total Cover even if you have the Blinded condition or are in Darkness. Moreover, in that range, you can see something that has the Invisible condition.');
});

it('reads the standard and rare languages', () => {
  expect(parseLanguages(text)).toEqual(['Common', 'Common Sign Language', 'Draconic', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc',
    'Abyssal', 'Primordial', 'Celestial', 'Sylvan', 'Deep Speech', 'Thieves’ Cant', 'Druidic', 'Undercommon', 'Infernal']);
});

it('drops soft hyphens from extracted lines', () => {
  expect(srdLines('Short\u00adsword').map((l) => l.text)).toEqual(['Shortsword']);
});

it('reads the weapon properties and masteries', () => {
  const fixture = ['Properties', '', 'Here are definitions.', '', 'Two-Handed', '', 'Needs two hands.', '', 'Range', '', 'Two numbers.', '', 'Versatile', '', 'One or two', 'hands.', '',
    'Mastery Properties', '', 'Each weapon has one.', '', 'Improvised Weapons', '', 'Use a table leg.', '', '90', '', 'System Reference Document 5.2.1', '', '\fCleave', 'Hit a second', 'creature.'].join('\n');
  const list = parseWeaponRules(fixture);
  expect(list.map((e) => e.id)).toEqual(['rule/two-handed', 'rule/versatile', 'rule/cleave']);
  expect(list.find((e) => e.id === 'rule/two-handed')).toMatchObject({ cat: 'property', name: 'Two-Handed', desc: 'Needs two hands.' });
  expect(list.find((e) => e.id === 'rule/cleave')).toMatchObject({ cat: 'mastery', src: 'srd', desc: 'Hit a second creature.' });
  expect(list.find((e) => e.id === 'rule/versatile')!.desc).toBe('One or two hands.');
  for (const e of list) expect(validateEntry(e)).toEqual([]);
});
