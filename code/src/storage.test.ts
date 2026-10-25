import { afterEach, describe, expect, it, vi } from 'vitest';
import { blankCharacter, druidSample, sampleCharacter } from './defaults';
import { addToStore, deleteFromStore, exportStore, freshList, initialStore, load, persistStore, switchStore, writeBackup, type Store } from './storage';

const renamed = (): Store => ({
  id: 'a', list: [{ id: 'a', name: 'Ilyra Moonbrook' }, { id: 'b', name: 'Other' }],
  c: { ...sampleCharacter(), ch: { ...sampleCharacter().ch, name: 'Bob' } }
});

describe('character list', () => {
  it('shows the active character as it is now', () => {
    expect(freshList(renamed())[0]).toEqual({ id: 'a', name: 'Bob', info: 'Wood Elf · Ranger 5' });
  });
  it('keeps the renamed entry after switching to or adding another character', () => {
    const s = switchStore(renamed(), 'b', blankCharacter());
    expect(s.id).toBe('b');
    expect(s.list[0].name).toBe('Bob');
    const a = addToStore(renamed(), [{ id: 'c', c: blankCharacter() }]);
    expect(a.id).toBe('c');
    expect(a.list.map((x) => x.name)).toEqual(['Bob', 'Other', 'New character']);
  });
});

// localStorage backed by a Map; `fail(n)` says whether the n-th setItem call (from 0) throws.
const stubStorage = (fail: (n: number) => boolean = () => false) => {
  const m = new Map<string, string>();
  let n = 0;
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { if (fail(n++)) throw new Error('QuotaExceededError'); m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); }
  });
  return m;
};
const backupOf = (n: number) => ({ app: 'dnd-character-sheet', version: 1, characters: Array.from({ length: n }, () => sampleCharacter()) });

describe('backup import', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('keeps only the characters that were saved', () => {
    const m = stubStorage((n) => n > 0);
    const r = writeBackup(backupOf(3));
    expect(r.added).toHaveLength(1);
    expect(r.failed).toBe(2);
    expect(m.size).toBe(1);
  });
  it('throws when no character could be saved', () => {
    stubStorage(() => true);
    expect(() => writeBackup(backupOf(2))).toThrow(/backup/);
  });
  it('rejects a file that is not a backup', () => {
    stubStorage();
    expect(() => writeBackup({ app: 'other' })).toThrow('Not a character sheet backup file.');
  });
});

describe('unreadable sheet', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('keeps a copy of the raw text before falling back to the sample, never overwriting an earlier copy', () => {
    const m = stubStorage();
    m.set('dnd-sheet-v3:x', '{not json');
    expect(load('x').ch.name).toBe(sampleCharacter().ch.name);
    expect(m.get('dnd-sheet-v3:x:unreadable')).toBe('{not json');
    m.set('dnd-sheet-v3:x', '{second');
    load('x');
    expect(m.get('dnd-sheet-v3:x:unreadable')).toBe('{not json');
  });
});

describe('example characters', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('loads an example fresh without reading storage', () => {
    const m = stubStorage();
    m.set('dnd-sheet-v3:example:seren', JSON.stringify({ ...druidSample(), hp: 1 }));
    expect(load('example:seren')).toEqual(druidSample());
  });
  it('opens Ilyra as an example on a fresh install and saves no sheet for her', () => {
    const m = stubStorage();
    const s = initialStore();
    expect(s).toMatchObject({ id: 'example:ilyra', list: [] });
    persistStore(s);
    expect([...m.keys()]).toEqual(['dnd-index-v3']);
  });
  it('reopens an active example fresh after a reload', () => {
    const m = stubStorage();
    m.set('dnd-index-v3', JSON.stringify({ active: 'example:seren', list: [{ id: 'a', name: 'Bob' }] }));
    const s = initialStore();
    expect(s.id).toBe('example:seren');
    expect(s.c).toEqual(druidSample());
    expect(s.list.map((x) => x.id)).toEqual(['a']);
  });
  it('reopens an active example after a reload even when your list is empty', () => {
    const m = stubStorage();
    m.set('dnd-index-v3', JSON.stringify({ active: 'example:seren', list: [] }));
    expect(initialStore()).toMatchObject({ id: 'example:seren', list: [] });
  });
  it('leaves an open example out of Export all', () => {
    const m = stubStorage();
    m.set('dnd-sheet-v3:a', JSON.stringify(blankCharacter()));
    const data = exportStore({ id: 'example:ilyra', list: [{ id: 'a', name: 'New character' }], c: sampleCharacter() });
    expect(data.characters).toHaveLength(1);
    expect((data.characters[0] as { ch: { name: string } }).ch.name).toBe('New character');
  });
  it('opens an example after deleting the last own character', () => {
    const s = deleteFromStore({ id: 'a', list: [{ id: 'a', name: 'Bob' }], c: blankCharacter() });
    expect(s).toMatchObject({ id: 'example:ilyra', list: [] });
  });
  it('never deletes an example', () => {
    const s: Store = { id: 'example:ilyra', list: [{ id: 'a', name: 'Bob' }], c: sampleCharacter() };
    expect(deleteFromStore(s)).toBe(s);
  });
});
