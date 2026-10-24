import { describe, expect, it } from 'vitest';
import { patchEntry, removeEntry } from './sheet';

describe('removeEntry', () => {
  it('removes only the entry with that id', () => {
    const list = [{ id: 'a', name: 'Rope' }, { id: 'b', name: 'Rope' }, { id: 'c', name: 'Torch' }];
    expect(removeEntry(list, 'b')).toEqual([{ id: 'a', name: 'Rope' }, { id: 'c', name: 'Torch' }]);
  });
  it('returns an equal list for an unknown id', () => {
    expect(removeEntry([{ id: 'a' }], 'x')).toEqual([{ id: 'a' }]);
  });
});

describe('patchEntry', () => {
  const list = [{ id: 'a', n: 1 }, { id: 'b', n: 2 }];
  it('merges a patch into the entry with that id only', () => {
    expect(patchEntry(list, 'b', { n: 5 })).toEqual([{ id: 'a', n: 1 }, { id: 'b', n: 5 }]);
  });
  it('accepts a function of the current entry', () => {
    expect(patchEntry(list, 'a', (e) => ({ n: e.n + 1 }))).toEqual([{ id: 'a', n: 2 }, { id: 'b', n: 2 }]);
  });
});
