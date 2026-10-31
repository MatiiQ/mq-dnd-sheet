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
