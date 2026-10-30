// Builds code/src/data/srd/*.json from the extracted SRD text (see README.md). Run from code/: npm run srd.
import { existsSync, readFileSync } from 'node:fs';
import type { Entry } from '../../src/catalog/schema.ts';
import { applyOverlay, type Overlay } from '../lib/overlay.ts';
import { writeEntries } from '../lib/write.ts';
import { parseArmor, parseGear, parseMagicItems, parseTools, parseWeapons } from './items.ts';
import { parseClass } from './classes.ts';
import { parseBackgrounds, parseFeats, parseSpecies } from './origins.ts';
import { parseSpells } from './spells.ts';
import { layoutBetween, section } from './text.ts';

const root = new URL('../../../', import.meta.url);
const srdText = readFileSync(new URL('resources/srd/srd.txt', root), 'utf8');
const layout = readFileSync(new URL('resources/srd/srd-layout.txt', root), 'utf8');
const overlay = (name: string): Overlay => {
  const p = new URL(`code/scripts/srd/overlay/${name}.json`, root);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
};
const out = (name: string, entries: Entry[]) => {
  writeEntries(new URL(`code/src/data/srd/${name}.json`, root).pathname, applyOverlay(entries, overlay(name)));
  console.log(`${name}: ${entries.length} entries`);
};

out('spells', parseSpells(section(srdText, 'Acid Arrow', 'Rules Glossary', 'Spell Descriptions')));
out('items', [
  ...parseWeapons(layoutBetween(layout, /^\s+Name\s+Damage\s+Properties/, /^\s+Pistol\s/)),
  ...parseArmor(layoutBetween(layout, /^\s+Armor\s+Armor Class \(AC\)/, /^\s+Shield\s+\+2/)),
  ...parseGear(section(srdText, 'Acid (25 GP)', 'Mounts and Vehicles'),
    layoutBetween(layout, /^\s+Adventuring Gear\s+Item\s+Weight/, /^\s+Ink\s+—/) + '\n' + layoutBetween(layout, /^\s+Type\s+Amount Storage/, /^\s+Needles\s/)),
  ...parseTools(section(srdText, 'Alchemist’s Supplies (50 GP)', 'Adventuring Gear')),
  ...parseMagicItems(section(srdText, 'Adamantine Armor', 'Monsters', 'Magic Items A–Z'))
]);
const [species, traits] = parseSpecies(section(srdText, 'Dragonborn', 'Feats', 'Species Descriptions'), layout);
out('origins', [
  ...parseFeats(section(srdText, 'Origin Feats', 'Equipment', 'Feat Descriptions')),
  ...parseBackgrounds(section(srdText, 'Acolyte', 'Character Species', 'Background Descriptions')),
  ...species, ...traits
]);
const CLASSES = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard'];
out('classes', CLASSES.flatMap((c, i) => {
  const [cls, subs, feats] = parseClass(section(srdText, `Core ${c} Traits`, CLASSES[i + 1] ? `Core ${CLASSES[i + 1]} Traits` : 'Character Origins'), layout);
  return [cls, ...subs, ...feats];
}));
