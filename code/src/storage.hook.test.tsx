// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleCharacter } from './defaults';
import { initialStore, saveBackupFile, useCharacters, type CharacterStore } from './storage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let store: CharacterStore;
function Probe() { store = useCharacters(); return null; }
let root: Root;
const mount = () => {
  root = createRoot(document.body.appendChild(document.createElement('div')));
  act(() => root.render(<Probe />));
};
const sheet = (id: string) => JSON.parse(localStorage.getItem('dnd-sheet-v3:' + id) ?? 'null');
const index = () => JSON.parse(localStorage.getItem('dnd-index-v3') ?? 'null');

describe('useCharacters', () => {
  beforeEach(() => { localStorage.clear(); mount(); });
  afterEach(() => { act(() => root.unmount()); vi.unstubAllGlobals(); });

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
    let r: { added: number; failed: number } | undefined;
    act(() => { r = store.importAll({ app: 'dnd-character-sheet', version: 1, characters: [sampleCharacter()] }); });
    expect(r).toEqual({ added: 1, failed: 0 });
    expect(store.list).toHaveLength(2);
    expect(sheet(store.charId).ch.name).toBe(sampleCharacter().ch.name);
  });
  it('reports a refused save', () => {
    act(() => store.newBlank());
    expect(store.saveFailed).toBe(false);
    // happy-dom's localStorage doesn't call Storage.prototype.setItem, so the whole object is swapped.
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('QuotaExceededError'); } });
    act(() => store.update({ level: 2 }));
    expect(store.saveFailed).toBe(true);
  });
});

describe('saveBackupFile', () => {
  const nav = navigator as unknown as { canShare?: unknown; share?: unknown };
  let click: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => { delete nav.canShare; delete nav.share; vi.restoreAllMocks(); });

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
  it('downloads when sharing is missing', async () => {
    expect(await saveBackupFile({})).toBe('Backup downloaded.');
    expect(click).toHaveBeenCalledOnce();
  });
});
