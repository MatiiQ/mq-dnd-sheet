import { afterEach, describe, expect, it, vi } from 'vitest';
import { withClass } from './test-fixtures';
import { blankCharacter, druidSample, SAVE_VERSION, sampleCharacter } from './defaults';
import { isActive } from './links';
import { longRest } from './logic';
import { addToStore, applyPatch, deleteFromStore, exportStore, freshList, initialStore, load, openExampleOnNextLoad, persistStore, rawBackup, switchStore, unreadableSheets, writeBackup, type Store } from './storage';

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
    removeItem: (k: string) => { m.delete(k); },
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null
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
  it('keeps a copy of the raw text before opening blank, never overwriting an earlier copy', () => {
    const m = stubStorage();
    m.set('dnd-sheet-v3:x', '{not json');
    expect(load('x').inv).toEqual([]);
    expect(m.get('dnd-sheet-v3:x:unreadable')).toBe('{not json');
    m.set('dnd-sheet-v3:x', '{second');
    load('x');
    expect(m.get('dnd-sheet-v3:x:unreadable')).toBe('{not json');
  });
});

describe('save from a newer app', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const newer = () => JSON.stringify({ ...blankCharacter(), v: SAVE_VERSION + 1, ch: { ...blankCharacter().ch, name: 'Future' }, futureField: { a: 1 } });
  it('keeps the raw text, then opens what this version knows, with a notice', () => {
    const m = stubStorage();
    m.set('dnd-sheet-v3:x', newer());
    const c = load('x');
    expect(c.ch.name).toBe('Future');
    expect(c.v).toBe(SAVE_VERSION);
    expect(c.restMsg?.title).toBe('Saved by a newer version');
    expect(c.restMsg?.body).toContain('stays on this device');
    expect(m.get('dnd-sheet-v3:x:unreadable')).toBe(newer());
    expect(unreadableSheets().map((x) => x.key)).toEqual(['dnd-sheet-v3:x:unreadable']);
  });
  it('does not promise a copy it could not keep', () => {
    const m = stubStorage();
    m.set('dnd-sheet-v3:x', newer());
    const setItem = localStorage.setItem;
    localStorage.setItem = () => { throw new Error('full'); };
    const body = load('x').restMsg?.body;
    localStorage.setItem = setItem;
    expect(body).toContain('no copy');
  });
  it('skips a backup character saved by a newer app instead of importing it cut down', () => {
    const m = stubStorage();
    const r = writeBackup({ ...backupOf(1), characters: [blankCharacter(), JSON.parse(newer())] });
    expect(r).toMatchObject({ newer: 1, failed: 0 });
    expect(r.added).toHaveLength(1);
    expect(m.size).toBe(1);
    expect(() => writeBackup({ ...backupOf(1), characters: [JSON.parse(newer())] })).toThrow(/newer version/);
  });
  it('opens a current save without a copy or a notice', () => {
    const m = stubStorage();
    m.set('dnd-sheet-v3:x', JSON.stringify(blankCharacter()));
    expect(load('x').restMsg).toBeNull();
    expect(m.has('dnd-sheet-v3:x:unreadable')).toBe(false);
  });
});

describe('v1 saves', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('load keeps the raw v1 text once', async () => {
    const m = stubStorage();
    const fx = (await import('./fixtures/save-v1-ilyra.json')).default;
    const raw = JSON.stringify(fx);
    m.set('dnd-sheet-v3:x', raw);
    m.set('dnd-index-v3', JSON.stringify({ active: 'x', list: [{ id: 'x', name: 'Ilyra' }] }));
    const c = load('x');
    expect(m.get('dnd-sheet-v3:x:unreadable')).toBe(raw);
    m.set('dnd-sheet-v3:x', JSON.stringify(c));
    load('x');
    expect(m.get('dnd-sheet-v3:x:unreadable')).toBe(raw);
    expect(c.restMsg).toBeNull();
    expect(unreadableSheets().map((u) => u.key)).toEqual(['dnd-sheet-v3:x:unreadable']);
    expect(initialStore().list.map((e) => e.id)).toEqual(['x']);
    const s = deleteFromStore({ id: 'x', list: [{ id: 'x', name: 'Ilyra' }], c });
    persistStore(s);
    expect(m.get('dnd-sheet-v3:x:unreadable')).toBe(raw);
  });
  it('keeps no copy of a v2 save', () => {
    const m = stubStorage();
    m.set('dnd-sheet-v3:y', JSON.stringify(blankCharacter()));
    load('y');
    expect(m.has('dnd-sheet-v3:y:unreadable')).toBe(false);
  });
});

describe('reaching every saved character', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const named = (name: string) => JSON.stringify({ ...blankCharacter(), ch: { ...blankCharacter().ch, name } });
  it('rebuilds the list when the index is unreadable', () => {
    const m = stubStorage();
    m.set('dnd-index-v3', '{bad');
    m.set('dnd-sheet-v3:a', named('Ann'));
    const s = initialStore();
    expect(s.list.map((x) => x.id)).toEqual(['a']);
    expect(s.id).toBe('a');
    expect(s.c!.ch.name).toBe('Ann');
    expect(s.list[0].name).toBe('Ann');
  });
  it('adds a sheet missing from a good index, keeping the active one', () => {
    const m = stubStorage();
    m.set('dnd-index-v3', JSON.stringify({ active: 'a', list: [{ id: 'a', name: 'Ann' }] }));
    m.set('dnd-sheet-v3:a', named('Ann'));
    m.set('dnd-sheet-v3:b', named('Bob'));
    const s = initialStore();
    expect(s.id).toBe('a');
    expect(s.list.map((x) => x.name)).toEqual(['Ann', 'Bob']);
  });
  it('never lists an :unreadable key as a character', () => {
    const m = stubStorage();
    m.set('dnd-sheet-v3:a:unreadable', '{bad');
    expect(initialStore()).toEqual({ id: '', list: [], c: null });
  });
  it('names a rebuilt entry whose sheet does not parse', () => {
    const m = stubStorage();
    m.set('dnd-sheet-v3:a', 'not json');
    expect(initialStore().list).toEqual([{ id: 'a', name: 'Unreadable character' }]);
  });
  it('rawBackup holds a sheet missing from the index', () => {
    const m = stubStorage();
    m.set('dnd-index-v3', JSON.stringify({ active: 'a', list: [{ id: 'a', name: 'Ann' }] }));
    m.set('dnd-sheet-v3:a', named('Ann'));
    m.set('dnd-sheet-v3:b', named('Bob'));
    expect(rawBackup().characters.map((x) => (x as { ch: { name: string } }).ch.name)).toEqual(['Ann', 'Bob']);
  });
  it('opens an unreadable sheet blank, under its name, with a notice', () => {
    const m = stubStorage();
    m.set('dnd-index-v3', JSON.stringify({ active: 'x', list: [{ id: 'x', name: 'Mine' }] }));
    m.set('dnd-sheet-v3:x', 'not json');
    const c = load('x');
    expect(c.ch.name).toBe('Mine');
    expect(c.inv).toEqual([]);
    expect(c.restMsg?.title).toBe('Save can’t be read');
    expect(m.get('dnd-sheet-v3:x:unreadable')).toBe('not json');
  });
  it('does not promise a copy it could not keep', () => {
    const m = stubStorage();
    m.set('dnd-sheet-v3:x', 'not json');
    const setItem = localStorage.setItem;
    localStorage.setItem = () => { throw new Error('full'); };
    const body = load('x').restMsg?.body;
    localStorage.setItem = setItem;
    expect(body).toContain('no copy');
    expect(body).not.toContain('stays on this device');
  });
  it('treats a save that is no object as unreadable', () => {
    for (const raw of ['5', '[]', '"x"']) {
      const m = stubStorage();
      m.set('dnd-sheet-v3:x', raw);
      const c = load('x');
      expect(c.inv).toEqual([]);
      expect(c.restMsg?.title).toBe('Save can’t be read');
      expect(m.get('dnd-sheet-v3:x:unreadable')).toBe(raw);
    }
  });
  it('says a missing sheet is missing', () => {
    const m = stubStorage();
    const c = load('x');
    expect(c.restMsg?.body).toContain('missing');
    expect(m.has('dnd-sheet-v3:x:unreadable')).toBe(false);
  });
  it('carries unreadable text in both backups, unopened ones too', () => {
    const m = stubStorage();
    m.set('dnd-index-v3', JSON.stringify({ active: 'a', list: [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bad' }, { id: 'n', name: 'Num' }] }));
    m.set('dnd-sheet-v3:a', named('Ann'));
    m.set('dnd-sheet-v3:b', '{bad');
    m.set('dnd-sheet-v3:n', '5');
    m.set('dnd-sheet-v3:old:unreadable', 'old text');
    const want = [{ key: 'dnd-sheet-v3:b', text: '{bad' }, { key: 'dnd-sheet-v3:n', text: '5' }, { key: 'dnd-sheet-v3:old:unreadable', text: 'old text' }];
    expect(unreadableSheets()).toEqual(want);
    expect(rawBackup().unreadable).toEqual(want);
    const data = exportStore(initialStoreOf('a'));
    expect(data.unreadable).toEqual(want);
    expect(data.characters).toHaveLength(1);
    expect(rawBackup().characters).toHaveLength(1);
  });
  it('adds no unreadable field to a clean backup', () => {
    const m = stubStorage();
    m.set('dnd-sheet-v3:a', named('Ann'));
    expect(rawBackup()).not.toHaveProperty('unreadable');
  });
  it('import ignores the unreadable field', () => {
    const m = stubStorage();
    const r = writeBackup({ ...backupOf(1), unreadable: [{ key: 'dnd-sheet-v3:b', text: '{bad' }] });
    expect(r.added).toHaveLength(1);
    expect(m.size).toBe(1);
  });
  it('counts entries without ch as failed', () => {
    stubStorage();
    const r = writeBackup({ app: 'dnd-character-sheet', version: 1, characters: [{ ch: {} }, { x: 1 }] });
    expect(r.added).toHaveLength(1);
    expect(r.failed).toBe(1);
  });
});
const initialStoreOf = (id: string): Store => ({ id, list: [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bad' }, { id: 'n', name: 'Num' }], c: blankCharacter() });

describe('example characters', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('loads an example fresh without reading storage', () => {
    const m = stubStorage();
    m.set('dnd-sheet-v3:example:seren', JSON.stringify({ ...druidSample(), hp: 1 }));
    expect(load('example:seren')).toEqual(druidSample());
  });
  it('opens no character on a fresh install (the welcome screen) and writes only the index', () => {
    const m = stubStorage();
    const s = initialStore();
    expect(s).toEqual({ id: '', list: [], c: null });
    expect(persistStore(s)).toBe(true);
    expect([...m.keys()]).toEqual(['dnd-index-v3']);
    expect(JSON.parse(m.get('dnd-index-v3')!)).toEqual({ active: '', list: [] });
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
  it('opens no character after deleting the last own character', () => {
    const s = deleteFromStore({ id: 'a', list: [{ id: 'a', name: 'Bob' }], c: blankCharacter() });
    expect(s).toEqual({ id: '', list: [], c: null });
  });
  it('still reopens an active example when you have characters of your own', () => {
    const m = stubStorage();
    m.set('dnd-sheet-v3:a', JSON.stringify(blankCharacter()));
    m.set('dnd-index-v3', JSON.stringify({ active: 'example:ilyra', list: [{ id: 'a', name: 'New character' }] }));
    expect(initialStore()).toMatchObject({ id: 'example:ilyra' });
  });
  it('never deletes an example', () => {
    const s: Store = { id: 'example:ilyra', list: [{ id: 'a', name: 'Bob' }], c: sampleCharacter() };
    expect(deleteFromStore(s)).toBe(s);
  });
});

describe('one clamp after every change', () => {
  const wild = { id: 'wild', name: 'Wild Shape', count: 3, maxV: '2:2,6:3,17:4', recharge: 'long' as const };
  const base = () => (withClass({ ...druidSample(), res: [wild] }, { lvl: 6 }));
  it('lowers a count when the level lowers its maximum, and never gives it back', () => {
    const lower = applyPatch(base(), (c) => ({ classes: [{ ...c.classes[0], lvl: 5 }] }));
    expect(lower.res[0].count).toBe(2);
    expect(applyPatch(lower, (c) => ({ classes: [{ ...c.classes[0], lvl: 6 }] })).res[0].count).toBe(2);
  });
  const wis = (count = 5) => ({ ...druidSample(), res: [{ id: 'o', name: 'Omen', count, maxV: 'wis>=1', recharge: 'none' as const }] });
  it('follows a lower ability score, a negative adjustment and a removed ability grant', () => {
    expect(applyPatch(wis(), (c) => ({ abil: { ...c.abil, wis: 18 } })).res[0].count).toBe(4);
    expect(applyPatch(wis(), { abilAdj: { wis: -2 } }).res[0].count).toBe(4);
    const granted = { ...wis(), abil: { ...druidSample().abil, wis: 18 },
      grants: [{ id: 'g', kind: 'abil' as const, name: 'ASI', ab: 'wis', val: '2', cap: 20 as const, from: 'feature:f13' }] };
    expect(applyPatch(granted, { grants: [] }).res[0].count).toBe(4);
  });
  it('a Long Rest that restores a score doesn\'t raise a count that doesn\'t recharge', () => {
    const low = applyPatch(wis(), { abilAdj: { wis: -2 } });
    expect(applyPatch(low, (c) => longRest(c)).res[0].count).toBe(4);
  });
  it('lowers HP when Heavy armor switches off an HP grant', () => {
    const c = { ...sampleCharacter(), hp: 54, inv: [], grants: [{ id: 't', kind: 'hpLvl' as const, name: 'Tough', val: '2', when: 'noHeavy' as const, from: 'feature:f10' }] };
    expect(applyPatch(c, { inv: [{ id: 'm', name: 'Chain Mail', qty: 1, eq: true, armor: 'heavy', acBase: 16 }] }).hp).toBe(44);
  });
  it('keeps the count of an item\'s resource while the item is off', () => {
    const c = { ...sampleCharacter(), inv: [{ id: 'r', name: 'Ring', qty: 1, eq: true }],
      res: [{ id: 'x', name: 'Charge', count: 1, max: 1, from: 'item:r', needEq: true }] };
    const off = applyPatch(c, { inv: [{ ...c.inv[0], eq: false }] });
    expect(off.res[0].count).toBe(1);
    expect(isActive(off, off.res[0])).toBe(false);
    expect(applyPatch(off, { inv: c.inv }).res[0].count).toBe(1);
  });
});

describe('openExampleOnNextLoad', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('opens the example next and keeps the saved character listed', () => {
    const m = stubStorage();
    const c = { ...blankCharacter(), ch: { ...blankCharacter().ch, name: 'Bob' } };
    persistStore({ id: 'a', list: [{ id: 'a', name: 'Bob' }], c });
    const saved = m.get('dnd-sheet-v3:a');
    openExampleOnNextLoad();
    const s = initialStore();
    expect(s.id).toBe('example:ilyra');
    expect(s.list.map((x) => x.id)).toContain('a');
    expect(m.get('dnd-sheet-v3:a')).toBe(saved);
  });
});
