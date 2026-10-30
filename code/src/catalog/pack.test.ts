import { expect, it } from 'vitest';
import srdEntries from '../data/srd/index';
import { packSummary, parsePackFile } from './pack';
import { catalogId, PHB_TO_SRD, slug, type Entry } from './schema';

const validEntry: Entry = { id: 'spell/glimmer', kind: 'spell', name: 'Glimmer', src: 'phb', desc: 'x', lvl: 0, school: 'Evocation', classes: 'wizard',
  time: 'Action', range: '60 feet', comp: 'V', dur: 'Instantaneous', conc: false, ritual: false, fx: 'other' };
const file = (entries: unknown[], version = 1) => JSON.stringify({ app: 'dnd-character-sheet', kind: 'catalog-pack', version, entries });

it('accepts a valid pack and rejects anything else with a message', () => {
  expect(parsePackFile(file([validEntry]))).toEqual({ ok: true, entries: [validEntry] });
  for (const bad of ['{', '{"app":"dnd-character-sheet","version":1,"characters":[]}', file([], 2), file([{ id: 'x' }]), file([{ ...validEntry, src: 'srd' }]),
    '{"app":"dnd-character-sheet","kind":"catalog-pack","version":1,"entries":[{"id":"spell/gl']) {
    expect(parsePackFile(bad)).toMatchObject({ ok: false, error: expect.any(String) });
  }
});
it('accepts a pack built before an alias was added, with the entry moved to the SRD id', () => {
  const [phb, srdName] = Object.entries(PHB_TO_SRD).find(([, s]) => srdEntries.some((e) => e.id === catalogId('spell', s)))!; // a spell alias
  const stale = { ...validEntry, id: 'spell/' + slug(phb), name: phb };
  expect(parsePackFile(file([stale]))).toMatchObject({ ok: true, entries: [{ id: catalogId('spell', srdName) }] });
  // the same entry under its PHB and its SRD name lands on one id after re-keying: rejected, not listed twice
  const twin = { ...validEntry, id: catalogId('spell', srdName), name: srdName };
  expect(parsePackFile(file([stale, twin]))).toMatchObject({ ok: false, error: expect.stringContaining(catalogId('spell', srdName)) });
});
it('summarises a pack by kind', () => {
  expect(packSummary([validEntry])).toBe('PHB data: 1 spell loaded');
  const feat = { id: 'feat/a', kind: 'feat', name: 'a', src: 'phb', desc: 'x', cat: 'general', grants: [] } as Entry;
  expect(packSummary([validEntry, { ...validEntry, id: 'spell/b', name: 'b' }, feat])).toBe('PHB data: 2 spells, 1 feat loaded');
});
