import { expect, it } from 'vitest';
import type { Entry } from '../../src/catalog/schema.ts';
import { validateEntry } from '../../src/catalog/schema.ts';
import { applyOverlay } from './overlay.ts';

it('overlays grants and fields by id, and fails on an id with no entry', () => {
  const e = { id: 'spell/aid', kind: 'spell', name: 'Aid', src: 'srd', desc: 'x' } as Entry;
  expect(applyOverlay([e], { 'spell/aid': { desc: 'y' } })[0].desc).toBe('y');
  expect(() => applyOverlay([e], { 'spell/ayd': { desc: 'y' } })).toThrow(/spell\/ayd/);
});

it('removes a field the overlay sets to null and keeps the rest', () => {
  const e = {
    id: 'spell/haste', kind: 'spell', name: 'Haste', src: 'srd', desc: 'x', lvl: 3, school: 'Transmutation',
    time: '1 action', range: '30 feet', comp: 'V, S, M', dur: '1 minute', conc: true, ritual: false,
    classes: 'Wizard', fx: 'other', save: 'dex',
  } as unknown as Entry;
  const [out] = applyOverlay([e], { 'spell/haste': { save: null, desc: 'y' } });
  expect('save' in out).toBe(false);
  expect(out.desc).toBe('y');
  expect((out as { lvl: number }).lvl).toBe(3);
  expect(validateEntry(out)).toEqual([]);
});
