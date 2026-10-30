// Builds code/src/data/srd/*.json from the extracted SRD text (see README.md). Run from code/: npm run srd.
import { existsSync, readFileSync } from 'node:fs';
import type { Entry } from '../../src/catalog/schema.ts';
import { applyOverlay, type Overlay } from '../lib/overlay.ts';
import { writeEntries } from '../lib/write.ts';
import { parseSpells } from './spells.ts';
import { section } from './text.ts';

const root = new URL('../../../', import.meta.url);
const srdText = readFileSync(new URL('resources/srd/srd.txt', root), 'utf8');
const overlay = (name: string): Overlay => {
  const p = new URL(`code/scripts/srd/overlay/${name}.json`, root);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
};
const out = (name: string, entries: Entry[]) => {
  writeEntries(new URL(`code/src/data/srd/${name}.json`, root).pathname, applyOverlay(entries, overlay(name)));
  console.log(`${name}: ${entries.length} entries`);
};

out('spells', parseSpells(section(srdText, 'Acid Arrow', 'Rules Glossary', 'Spell Descriptions')));
