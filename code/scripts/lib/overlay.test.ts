import { expect, it } from 'vitest';
import type { Entry } from '../../src/catalog/schema.ts';
import { applyOverlay } from './overlay.ts';

it('overlays grants and fields by id, and fails on an id with no entry', () => {
  const e = { id: 'spell/aid', kind: 'spell', name: 'Aid', src: 'srd', desc: 'x' } as Entry;
  expect(applyOverlay([e], { 'spell/aid': { desc: 'y' } })[0].desc).toBe('y');
  expect(() => applyOverlay([e], { 'spell/ayd': { desc: 'y' } })).toThrow(/spell\/ayd/);
});
