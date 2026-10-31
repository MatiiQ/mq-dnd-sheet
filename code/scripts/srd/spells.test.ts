import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseSpells } from './spells.ts';

const text = readFileSync(new URL('./fixtures/spells.txt', import.meta.url), 'utf8');

it('parses SRD spell blocks into catalog entries', () => {
  const [splash, cure, mark] = parseSpells(text);
  expect(splash).toMatchObject({
    id: 'spell/acid-splash', kind: 'spell', name: 'Acid Splash', src: 'srd', lvl: 0, school: 'Evocation', classes: 'sorcerer,wizard',
    time: 'Action', range: '60 feet', comp: 'V, S', dur: 'Instantaneous', conc: false, ritual: false,
    save: 'dex', fx: 'damage', dice: '1d6', dtype: 'Acid', scale: 'cantrip'
  });
  expect(splash.atk).toBeUndefined();
  expect(cure).toMatchObject({
    id: 'spell/cure-wounds', lvl: 1, school: 'Abjuration', classes: 'bard,cleric,druid,paladin,ranger', range: 'Touch',
    conc: false, fx: 'healing', dice: '2d8', scale: '2d8/slot', higher: 'The healing increases by 2d8 for each spell slot level above 1.'
  });
  expect(cure.save).toBeUndefined();
  expect(cure.healMod).toBe(true);
  expect(mark.healMod).toBeUndefined();
  expect(mark).toMatchObject({
    id: 'spell/hunters-mark', name: 'Hunter’s Mark', lvl: 1, school: 'Divination', classes: 'ranger', time: 'Bonus Action', range: '90 feet',
    comp: 'V', dur: 'Concentration, up to 1 hour', conc: true, ritual: false, fx: 'damage', dice: '1d6', dtype: 'Force'
  });
  expect(mark.scale).toBeUndefined();
  // The page break inside the block is dropped and the sentence across it stays one paragraph.
  expect(mark.desc).not.toMatch(/System Reference|141/);
  expect(mark.desc).toContain('find it.\nIf the target drops to 0 Hit Points');
});

it('reads a ritual from the casting time', () => {
  const [alarm] = parseSpells('Alarm\n\nLevel 1 Abjuration (Ranger, Wizard)\n\nCasting Time: 1 minute or Ritual\nRange: 30 feet\nComponents: V, S, M (a bell and silver wire)\nDuration: 8 hours\n\nYou set an alarm.\n');
  expect(alarm).toMatchObject({ time: '1 minute', ritual: true, fx: 'other' });
});

// One SRD spell block around a body text, for the damage wordings.
const block = (body: string) => parseSpells(`Test Spell\n\nLevel 2 Evocation (Wizard)\n\nCasting Time: Action\nRange: 60 feet\nComponents: V\nDuration: Instantaneous\n\n${body}\n`)[0];

it('reads damage equal to dice plus the spellcasting ability modifier', () => {
  const e = block('Make a melee spell attack. On a hit, the target takes Force damage equal to 1d8 plus your spellcasting ability modifier.');
  expect(e).toMatchObject({ fx: 'damage', dice: '1d8', dtype: 'Force', dmgMod: true, atk: 'melee' });
  expect(block('The target takes Fire damage equal to 3d6.').dmgMod).toBeUndefined();
});

it('reads a chosen damage type as the list of types the text offers', () => {
  const orb = block('Choose Acid, Cold, Fire, Lightning, Poison, or Thunder for the type of orb you create, and then make a ranged spell attack against the target. On a hit, the target takes 3d8 damage of the chosen type.');
  expect(orb).toMatchObject({ fx: 'damage', dice: '3d8', dtypes: 'Acid,Cold,Fire,Lightning,Poison,Thunder' });
  expect(orb.dtype).toBeUndefined();
  expect(block('Make a ranged spell attack. On a hit, the target takes 1d8 damage of a type you choose: Acid, Cold, Fire, Lightning, Poison, Psychic, or Thunder.'))
    .toMatchObject({ dice: '1d8', dtypes: 'Acid,Cold,Fire,Lightning,Poison,Psychic,Thunder' });
  expect(block('Choose the spirit’s element, which determines its damage type: air (Lightning), earth (Thunder), fire (Fire), or water (Cold). On a failed save, the target takes 8d8 damage of the spirit’s type.'))
    .toMatchObject({ dice: '8d8', dtypes: 'Lightning,Thunder,Fire,Cold' });
});

it('reads "<Type> or <Type> damage" and a list of types as a chosen type', () => {
  expect(block('The creature takes 5d10 Radiant or Necrotic damage (your choice when you cast this spell).')).toMatchObject({ dice: '5d10', dtypes: 'Radiant,Necrotic' });
  expect(block('A creature takes 5d8 Acid, Cold, Fire, Lightning, or Thunder damage (your choice when you create the glyph) on a failed save.'))
    .toMatchObject({ dice: '5d8', dtypes: 'Acid,Cold,Fire,Lightning,Thunder' });
});

it('reads the same dice of two types, "NdM <Type> damage (…) or NdM <Type> damage", as a chosen type', () => {
  const g = block('On a failed save, the creature takes 3d8 Radiant damage (if you are good or neutral) or 3d8 Necrotic damage (if you are evil).');
  expect(g).toMatchObject({ fx: 'damage', dice: '3d8', dtypes: 'Radiant,Necrotic' });
  expect(g.dtype).toBeUndefined();
  expect(block('The target takes 8d6 Fire damage on a failed save.')).toMatchObject({ dice: '8d6', dtype: 'Fire' });
});
