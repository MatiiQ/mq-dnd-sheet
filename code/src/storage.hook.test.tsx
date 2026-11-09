// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleCharacter } from './defaults';
import { mount } from './test-dom';
import { initialStore, saveBackupFile, useCharacters, type CharacterStore } from './storage';

let store: CharacterStore;
function Probe() { store = useCharacters(); return null; }
const sheet = (id: string) => JSON.parse(localStorage.getItem('dnd-sheet-v3:' + id) ?? 'null');
const index = () => JSON.parse(localStorage.getItem('dnd-index-v3') ?? 'null');

// Set before the first mount: the request is made once per page load.
const persist = vi.fn(async () => true);
Object.defineProperty(navigator, 'storage', { value: { persist }, configurable: true });

describe('useCharacters with nothing open', () => {
  beforeEach(() => { localStorage.clear(); mount(<Probe />); });
  it('has no character, and update does nothing', () => {
    expect(store.c).toBeNull();
    act(() => store.update({ hp: 3 }));
    expect(store.c).toBeNull();
    expect(index()).toEqual({ active: '', list: [] });
  });
});

describe('useCharacters', () => {
  beforeEach(() => { localStorage.clear(); mount(<Probe />); });
  afterEach(() => { vi.unstubAllGlobals(); });

  // Firefox answers persist() with a prompt, so it waits for a change instead of coming on load.
  it('asks for persistent storage once, at the first store change after load', () => {
    expect(persist).not.toHaveBeenCalled();
    act(() => store.newBlank());
    act(() => store.update((c) => ({ ch: { ...c.ch, name: 'Bob' } })));
    act(() => store.update((c) => ({ ch: { ...c.ch, name: 'Rob' } })));
    expect(persist).toHaveBeenCalledOnce();
  });

  it('add and newBlank return the id of the character added, and the list holds it', () => {
    let id = '';
    act(() => { id = store.newBlank(); });
    expect(store.list.some((x) => x.id === id)).toBe(true);
    expect(store.charId).toBe(id);
    expect('newSample' in store || 'newDruid' in store).toBe(false);
  });

  it('saves a change to the sheet and the index', () => {
    act(() => store.newBlank());
    act(() => store.update((c) => ({ ch: { ...c.ch, name: 'Bob' } })));
    expect(sheet(store.charId).ch.name).toBe('Bob');
    expect(index().active).toBe(store.charId);
    expect(index().list.find((x: { id: string }) => x.id === store.charId).name).toBe('Bob');
  });
  it('deletes the sheet and it stays gone after a restart', () => {
    act(() => store.newBlank());
    const id = store.charId;
    act(() => store.deleteCurrent());
    expect(sheet(id)).toBeNull();
    expect(initialStore().list.map((x) => x.id)).not.toContain(id);
  });
  it('imports next to the existing characters', () => {
    act(() => store.newBlank());
    let r: { added: number; newer: number; failed: number } | undefined;
    act(() => { r = store.importAll({ app: 'dnd-character-sheet', version: 1, characters: [sampleCharacter()] }); });
    expect(r).toEqual({ added: 1, newer: 0, failed: 0 });
    expect(store.list).toHaveLength(2);
    expect(sheet(store.charId).ch.name).toBe(sampleCharacter().ch.name);
  });
  it('reports a refused save', () => {
    act(() => store.newBlank());
    expect(store.saveFailed).toBe(false);
    // happy-dom's localStorage doesn't call Storage.prototype.setItem, so the whole object is swapped.
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('QuotaExceededError'); } });
    act(() => store.update((c) => ({ classes: [{ ...c.classes[0], lvl: 2 }] })));
    expect(store.saveFailed).toBe(true);
  });
});

describe('saveBackupFile', () => {
  const nav = navigator as unknown as { canShare?: unknown; share?: unknown };
  let click: ReturnType<typeof vi.spyOn>;
  let coarse = true;
  beforeEach(() => {
    coarse = true;
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)' && coarse }));
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => { delete nav.canShare; delete nav.share; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('shares a backup on iPad', async () => {
    nav.canShare = () => true;
    nav.share = vi.fn(async () => {});
    expect(await saveBackupFile({})).toBe('Backup shared.');
    expect(nav.share).toHaveBeenCalledOnce();
    expect(click).not.toHaveBeenCalled();
  });
  it('returns null when the share sheet is cancelled', async () => {
    nav.canShare = () => true;
    nav.share = async () => { throw new DOMException('cancelled', 'AbortError'); };
    expect(await saveBackupFile({})).toBeNull();
    expect(click).not.toHaveBeenCalled();
  });
  it('downloads when sharing fails', async () => {
    nav.canShare = () => true;
    nav.share = async () => { throw new Error('nope'); };
    expect(await saveBackupFile({})).toBe('Backup downloaded.');
    expect(click).toHaveBeenCalledOnce();
  });
  // Safari on a Mac can share a file, but its share menu has no Save.
  it('downloads without a touch screen, even when the browser can share', async () => {
    coarse = false;
    nav.canShare = () => true;
    nav.share = vi.fn(async () => {});
    expect(await saveBackupFile({})).toBe('Backup downloaded.');
    expect(nav.share).not.toHaveBeenCalled();
  });
  it('downloads when sharing is missing', async () => {
    expect(await saveBackupFile({})).toBe('Backup downloaded.');
    expect(click).toHaveBeenCalledOnce();
  });
});
