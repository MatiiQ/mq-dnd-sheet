import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBackgrounds, parseFeats, parseSpecies } from './origins.ts';

const fx = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

describe('feats', () => {
  const feats = parseFeats(fx('feats.txt'));
  it('reads category, prerequisites and description', () => {
    expect(feats.map((f) => [f.id, f.cat, f.prereq])).toEqual([
      ['feat/alert', 'origin', undefined], ['feat/grappler', 'general', 'lvl>=4;str|dex>=13'],
      ['feat/archery', 'style', 'feature=fighting-style'], ['feat/defense', 'style', 'feature=fighting-style']
    ]);
    expect(feats[0]).toMatchObject({ kind: 'feat', name: 'Alert', src: 'srd', grants: [] });
    expect(feats[0].desc).toMatch(/^You gain the following benefits\.\nInitiative Proficiency\. When you roll Initiative, you can add/);
    expect(feats[2].desc).toBe('You gain a +2 bonus to attack rolls you make with Ranged weapons.');
  });
});

describe('backgrounds', () => {
  it('reads abilities, feat with its option, skills, tool and equipment', () => {
    const [acolyte] = parseBackgrounds(fx('backgrounds.txt'));
    expect(acolyte).toMatchObject({
      id: 'background/acolyte', kind: 'background', name: 'Acolyte', src: 'srd', abils: 'int,wis,cha', feat: 'feat/magic-initiate:cleric',
      skills: 'insight,religion', tool: 'calligraphers-supplies', grants: []
    });
    expect(acolyte.equip).toBe('Choose A or B: (A) Calligrapher’s Supplies, Book (prayers), Holy Symbol, Parchment (10 sheets), Robe, 8 GP; or (B) 50 GP');
  });
});

describe('species', () => {
  const [species, traits] = parseSpecies(fx('species.txt'), fx('species-layout.txt'));
  it('reads size and speed', () => {
    expect(species).toEqual([expect.objectContaining({ id: 'species/elf', kind: 'species', name: 'Elf', sizes: 'medium', speed: 30 })]);
  });
  it('reads each trait, and each lineage of the table as a trait of its own', () => {
    expect(traits.map((t) => t.id)).toEqual(['trait/elf/darkvision', 'trait/elf/elven-lineage', 'trait/elf/fey-ancestry', 'trait/elf/keen-senses',
      'trait/elf/trance', 'trait/elf/drow', 'trait/elf/high-elf', 'trait/elf/wood-elf']);
    expect(traits[0]).toMatchObject({ species: 'elf', lvl: 1, grants: [], desc: 'You have Darkvision with a range of 60 feet.' });
    expect(traits.find((t) => t.name === 'Wood Elf')).toMatchObject({ of: 'trait/elf/elven-lineage',
      desc: 'Your Speed increases to 35 feet. You also know the Druidcraft cantrip.\nLevel 3: Longstrider\nLevel 5: Pass without Trace' });
    expect(traits.find((t) => t.name === 'Drow')!.desc).toMatch(/^The range of your Darkvision increases to 120 feet\. You also/);
  });
});
