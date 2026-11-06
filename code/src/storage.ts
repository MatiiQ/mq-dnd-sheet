import { useEffect, useRef, useState } from 'react';
import { isObj, slug } from './catalog/schema';
import { blankCharacter, druidSample, sampleCharacter } from './defaults';
import { newId, normalize } from './logic';
import { isNewerSave, migrate } from './migrate';
import type { Character } from './types';

const INDEX_KEY = 'dnd-index-v3';
const SHEET_PREFIX = 'dnd-sheet-v3:';
const sheetKey = (id: string) => SHEET_PREFIX + id;
const UNREADABLE = ':unreadable';

export interface IndexEntry { id: string; name: string; info?: string }
export type Patch = Partial<Character> | ((c: Character) => Partial<Character>);

// Every change goes through here: the patch, then the single clamp (normalize) on the result.
export const applyPatch = (c: Character, patch: Patch): Character =>
  normalize({ ...c, ...(typeof patch === 'function' ? patch(c) : patch) });

function readJSON(key: string): unknown {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
// Returns false when the browser refused to save (storage full or blocked).
function writeJSON(key: string, v: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; }
}

// Built-in examples. Their ids are reserved: they open fresh from defaults.ts every time, never enter the index
// list and never get a sheet key, so changes to an open example are thrown away when you switch away.
export const EXAMPLES: { id: string; make: () => Character }[] = [
  { id: 'example:ilyra', make: sampleCharacter },
  { id: 'example:seren', make: druidSample }
];
export const isExample = (id: string) => id.startsWith('example:');
const example = (id: string) => EXAMPLES.find((x) => x.id === id);

// Every key holding a sheet or a kept copy of one. Empty when storage is blocked.
function sheetKeys(): string[] {
  try {
    return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k): k is string => !!k?.startsWith(SHEET_PREFIX));
  } catch { return []; }
}
// The characters that have a sheet, whatever the index says.
const sheetIds = () => sheetKeys().filter((k) => !k.endsWith(UNREADABLE)).map((k) => k.slice(SHEET_PREFIX.length)).filter((id) => !isExample(id));

// Text that can't open as a character: kept copies, and sheets that don't hold a character, opened yet or not.
export function unreadableSheets(): { key: string; text: string }[] {
  try {
    return sheetKeys().filter((k) => k.endsWith(UNREADABLE) || !isObj(readJSON(k))).map((key) => ({ key, text: localStorage.getItem(key) ?? '' }));
  } catch { return []; }
}

// Copies a sheet's raw text to `<key>:unreadable`. Only into an empty key: the first copy is never overwritten, which
// also makes this safe to repeat inside setS updaters (StrictMode runs them twice). kept: false when storage refused.
// Deleting the character leaves the copy behind on purpose, as it may be the only copy of that data.
// shortcut: a key already holding an older copy keeps it and this text is not kept; give each copy its own key if that happens.
function keepRaw(key: string): { raw: string | null; kept: boolean } {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
    if (raw && localStorage.getItem(key + UNREADABLE) === null) localStorage.setItem(key + UNREADABLE, raw);
    return { raw, kept: true };
  } catch { return { raw, kept: false }; }
}

// A sheet that isn't a character (it doesn't parse, or parses to `5`) opens blank, and the save effect then writes the
// blank over it; a save from a newer app opens with what this version knows, and the save effect writes that back. So
// either one's raw text is kept first (keepRaw).
export function load(id: string): Character {
  const ex = example(id);
  if (ex) return ex.make();
  const key = sheetKey(id), data = readJSON(key);
  if (isNewerSave(data)) {
    const { kept } = keepRaw(key);
    return {
      ...migrate(data),
      restMsg: { title: 'Saved by a newer version', body: 'This character was saved by a newer version of the app, so anything this version doesn’t know was left out. ' + (kept ? 'The full data stays on this device and goes into every backup file, but the app doesn’t bring it back by itself, not even after an update.' : 'Storage is full, so no copy of the full data could be kept.') }
    };
  }
  if (isObj(data)) return migrate(data);
  const { raw, kept } = keepRaw(key);
  const blank = blankCharacter();
  const list = (readJSON(INDEX_KEY) as { list?: unknown } | null)?.list;
  const name = Array.isArray(list) ? list.find((x) => x?.id === id)?.name : undefined;
  return {
    ...blank,
    ch: { ...blank.ch, ...(typeof name === 'string' ? { name } : {}) },
    restMsg: raw
      ? { title: 'Save can’t be read', body: 'This character’s saved data couldn’t be read, so a blank sheet opened in its place. ' + (kept ? 'The old data stays on this device and goes into every backup file.' : 'Storage is full, so no copy of the old data could be kept.') }
      : { title: 'Save missing', body: 'This character’s saved data is missing, so a blank sheet opened in its place.' }
  };
}
export const charName = (c: Character) => c.ch.name || 'Unnamed character';
export const charInfo = (c: Character) => [c.ch.species, (c.ch.cls || 'Level') + ' ' + c.level].filter((x) => x).join(' · ');
const entryOf = (id: string, c: Character): IndexEntry => ({ id, name: charName(c), info: charInfo(c) });

export interface Store { id: string; list: IndexEntry[]; c: Character }

// The index with the active character's entry brought up to date. Use it before the active character changes,
// or that character keeps the name it had when the list was loaded.
export const freshList = (s: Store): IndexEntry[] =>
  s.list.map((x) => (x.id === s.id ? entryOf(x.id, s.c) : x));
export const switchStore = (s: Store, id: string, c: Character): Store => ({ id, list: freshList(s), c });
export const addToStore = (s: Store, added: { id: string; c: Character }[]): Store => ({
  id: added[0].id, c: added[0].c,
  list: [...freshList(s), ...added.map((a) => entryOf(a.id, a.c))]
});

const firstExample = (list: IndexEntry[]): Store => ({ id: EXAMPLES[0].id, list, c: EXAMPLES[0].make() });

export function initialStore(): Store {
  const idx = readJSON(INDEX_KEY) as { active?: string; list?: IndexEntry[] } | null;
  const listed = Array.isArray(idx?.list) ? idx.list.filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string') : [];
  // A sheet the index doesn't name (a damaged index, a save that stopped halfway) still gets its entry.
  const saved = [...listed, ...sheetIds().filter((id) => !listed.some((x) => x.id === id)).map((id) => {
    const data = readJSON(sheetKey(id));
    return isObj(data) ? entryOf(id, migrate(data)) : { id, name: 'Unreadable character' };
  })];
  // An open example reopens fresh, even when your own list is empty.
  const ex = example(String(idx?.active));
  if (ex) return { id: ex.id, list: saved, c: ex.make() };
  // No characters of your own: open Ilyra as an example. Nothing but the index gets written.
  if (!saved.length) return firstExample([]);
  const id = saved.some((x) => x.id === idx?.active) ? idx!.active! : saved[0].id;
  return { id, list: saved, c: load(id) };
}

// From the crash screen: the next launch opens an example instead of the character that won't render. Only the index changes.
export function openExampleOnNextLoad(): void {
  writeJSON(INDEX_KEY, { ...(readJSON(INDEX_KEY) as object | null), active: EXAMPLES[0].id });
}

// Characters can't be replaced, so ask the browser not to evict them under storage pressure. Asked once, at the first
// store change after load while one of your own characters is open (an edit, a switch, a new character or an import),
// rather than on load, because Firefox answers with a permission prompt.
let persistAsked = false;
function askPersist(): void {
  if (persistAsked) return;
  persistAsked = true;
  navigator.storage?.persist?.().catch(() => {});
}

// Saves the open character (not an example) and the index. Returns false when the browser refused.
export function persistStore(s: Store): boolean {
  return (isExample(s.id) || writeJSON(sheetKey(s.id), s.c)) && writeJSON(INDEX_KEY, { active: s.id, list: freshList(s) });
}

// The store after deleting the open character. Examples can't be deleted. With none of your own left, Ilyra opens.
// The caller removes the sheet key.
export function deleteFromStore(s: Store): Store {
  if (isExample(s.id)) return s;
  const rest = s.list.filter((x) => x.id !== s.id);
  return rest.length ? { id: rest[0].id, list: rest, c: load(rest[0].id) } : firstExample([]);
}

const BACKUP_APP = 'dnd-character-sheet';
const backup = (characters: unknown[], unreadable: { key: string; text: string }[] = []) =>
  ({ app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(), characters, ...(unreadable.length ? { unreadable } : {}) });

// Your characters, the open one as it is now. An open example isn't in the list, so it's never exported.
// Others are exported as stored; an unreadable sheet goes into `unreadable` as text, which import ignores.
export const exportStore = (s: Store) => backup(freshList(s).map((x) => (x.id === s.id ? s.c : readJSON(sheetKey(x.id)))).filter(isObj), unreadableSheets());

// Every saved character exactly as stored, without loading it. Used by the crash screen.
export function rawBackup() {
  const idx = readJSON(INDEX_KEY) as { list?: IndexEntry[] } | null;
  const ids = Array.isArray(idx?.list) ? idx.list.map((x) => x?.id) : [];
  return backup([...new Set([...ids, ...sheetIds()])].map((id) => readJSON(sheetKey(String(id)))).filter(isObj), unreadableSheets());
}

// Offers a backup file: the share sheet on a touch device that can share it (iPad: Save to Files / iCloud Drive), a download elsewhere.
// With a character's name, the file is named after it. Resolves to what happened, or null if the user cancelled the share sheet.
export async function saveBackupFile(data: unknown, name?: string): Promise<string | null> {
  const json = JSON.stringify(data, null, 2);
  const label = name === undefined ? 'backup' : slug(name) || 'character';
  const fileName = 'character-sheet-' + label + '-' + new Date().toISOString().slice(0, 10) + '.json';
  const file = new File([json], fileName, { type: 'application/json' });
  // Touch screens only: on a Mac, Safari's share menu offers no way to save the file.
  if (globalThis.matchMedia?.('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return 'Backup shared.'; } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return null;
      // Any other failure falls through to the download below.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'Backup downloaded.';
}

// Saves a backup's characters under new ids. Returns the ones that were saved, how many were skipped as saved by a
// newer app (migrate() would drop what this version doesn't know), and how many failed (not a character, or the
// browser refused: storage full), so the index never lists a character that has no sheet.
export function writeBackup(data: unknown): { added: { id: string; c: Character }[]; newer: number; failed: number } {
  const d = data as { app?: string; characters?: unknown[] } | null;
  if (!d || d.app !== BACKUP_APP || !Array.isArray(d.characters)) throw new Error('Not a character sheet backup file.');
  const found = d.characters.filter((x) => x && typeof x === 'object' && (x as Character).ch);
  if (!found.length) throw new Error('The backup has no characters.');
  const chars = found.filter((x) => !isNewerSave(x)).map(migrate), newer = found.length - chars.length;
  if (!chars.length) throw new Error('This backup was saved by a newer version of the app. Open the app online to update it, then import again.');
  const added = chars.map((c) => ({ id: newId(), c })).filter((a) => writeJSON(sheetKey(a.id), a.c));
  if (!added.length) throw new Error('The backup could not be saved: storage is full.');
  return { added, newer, failed: d.characters.length - newer - added.length };
}

// All characters, the active one, and every way to change them. Saves on each change.
export function useCharacters() {
  const [s, setS] = useState(initialStore);
  const [saveFailed, setSaveFailed] = useState(false);
  const list = freshList(s);

  const loaded = useRef(s);
  useEffect(() => {
    setSaveFailed(!persistStore(s));
    if (s !== loaded.current && !isExample(s.id)) askPersist();
  }, [s]);

  const add = (c: Character) => setS((p) => addToStore(p, [{ id: newId(), c }]));

  return {
    c: s.c, charId: s.id, list, saveFailed, isExample: isExample(s.id),
    update: (patch: Patch) => setS((p) => ({ ...p, c: applyPatch(p.c, patch) })),
    switchTo: (id: string) => setS((p) => switchStore(p, id, load(id))),
    newBlank: () => add(blankCharacter()),
    newSample: () => add(sampleCharacter()),
    newDruid: () => add(druidSample()),
    duplicate: () => {
      const copy: Character = JSON.parse(JSON.stringify(s.c));
      add({ ...copy, ch: { ...copy.ch, name: (copy.ch.name || 'Character') + ' (copy)' } });
    },
    // Adds the open character's current state under Your characters, keeping its name. Used for examples.
    makeCopy: () => add(JSON.parse(JSON.stringify(s.c))),
    deleteCurrent: () => setS((p) => {
      if (isExample(p.id)) return p;
      try { localStorage.removeItem(sheetKey(p.id)); } catch { /* ignore */ }
      return deleteFromStore(p);
    }),
    resetCurrent: () => setS((p) => ({ ...p, c: blankCharacter() })),

    exportAll: () => exportStore(s),
    exportOne: () => backup([s.c]),
    // Adds the backup's characters next to the existing ones; returns how many were added, skipped as newer, and failed.
    importAll: (data: unknown): { added: number; newer: number; failed: number } => {
      const { added, newer, failed } = writeBackup(data);
      setS((p) => addToStore(p, added));
      return { added: added.length, newer, failed };
    }
  };
}

export type CharacterStore = ReturnType<typeof useCharacters>;
