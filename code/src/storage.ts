import { useEffect, useState } from 'react';
import { blankCharacter, druidSample, sampleCharacter } from './defaults';
import { migrate, newId } from './logic';
import type { Character } from './types';

const INDEX_KEY = 'dnd-index-v3';
const sheetKey = (id: string) => 'dnd-sheet-v3:' + id;

export interface IndexEntry { id: string; name: string; info?: string }
export type Patch = Partial<Character> | ((c: Character) => Partial<Character>);

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

// A sheet that doesn't parse falls back to the sample, and the save effect then writes the sample over it.
// So the raw text is copied to `<key>:unreadable` first. Only into an empty key: the first copy is never
// overwritten, which also makes this safe to repeat inside setS updaters (StrictMode runs them twice).
// Deleting the character leaves the copy behind on purpose, as it is the only copy of that data.
export function load(id: string): Character {
  const ex = example(id);
  if (ex) return ex.make();
  const key = sheetKey(id), data = readJSON(key);
  if (data === null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw && localStorage.getItem(key + ':unreadable') === null) localStorage.setItem(key + ':unreadable', raw);
    } catch { /* ignore */ }
  }
  return migrate(data);
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
  const saved = Array.isArray(idx?.list) ? idx.list.filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string') : [];
  // An open example reopens fresh, even when your own list is empty.
  const ex = example(String(idx?.active));
  if (ex) return { id: ex.id, list: saved, c: ex.make() };
  // No characters of your own: open Ilyra as an example. Nothing but the index gets written.
  if (!saved.length) return firstExample([]);
  const id = saved.some((x) => x.id === idx?.active) ? idx!.active! : saved[0].id;
  return { id, list: saved, c: load(id) };
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
const backup = (characters: unknown[]) => ({ app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(), characters });

// Your characters, the open one as it is now. An open example isn't in the list, so it's never exported.
export const exportStore = (s: Store) => backup(freshList(s).map((x) => (x.id === s.id ? s.c : load(x.id))));

// Every saved character exactly as stored, without loading it. Used by the crash screen.
export function rawBackup() {
  const idx = readJSON(INDEX_KEY) as { list?: IndexEntry[] } | null;
  const ids = Array.isArray(idx?.list) ? idx.list.map((x) => x?.id) : [];
  return backup(ids.map((id) => readJSON(sheetKey(String(id)))).filter((x) => x));
}

// Offers a backup file: the share sheet on iPad (Save to Files / iCloud Drive), a download elsewhere.
// With a character's name, the file is named after it. Resolves to what happened, or null if the user cancelled the share sheet.
export async function saveBackupFile(data: unknown, name?: string): Promise<string | null> {
  const json = JSON.stringify(data, null, 2);
  const slug = name === undefined ? 'backup' : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character';
  const fileName = 'character-sheet-' + slug + '-' + new Date().toISOString().slice(0, 10) + '.json';
  const file = new File([json], fileName, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return 'Backup shared.'; } catch { return null; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'Backup downloaded.';
}

// Saves a backup's characters under new ids. Returns the ones that were saved and how many the browser refused
// (storage full), so the index never lists a character that has no sheet.
export function writeBackup(data: unknown): { added: { id: string; c: Character }[]; failed: number } {
  const d = data as { app?: string; characters?: unknown[] } | null;
  if (!d || d.app !== BACKUP_APP || !Array.isArray(d.characters)) throw new Error('Not a character sheet backup file.');
  const chars = d.characters.filter((x) => x && typeof x === 'object' && (x as Character).ch).map(migrate);
  if (!chars.length) throw new Error('The backup has no characters.');
  const added = chars.map((c) => ({ id: newId(), c })).filter((a) => writeJSON(sheetKey(a.id), a.c));
  if (!added.length) throw new Error('The backup could not be saved: storage is full.');
  return { added, failed: chars.length - added.length };
}

// All characters, the active one, and every way to change them. Saves on each change.
export function useCharacters() {
  const [s, setS] = useState(initialStore);
  const [saveFailed, setSaveFailed] = useState(false);
  const list = freshList(s);

  useEffect(() => {
    setSaveFailed(!persistStore(s));
  }, [s]);

  const add = (c: Character) => setS((p) => addToStore(p, [{ id: newId(), c }]));

  return {
    c: s.c, charId: s.id, list, saveFailed, isExample: isExample(s.id),
    update: (patch: Patch) => setS((p) => ({ ...p, c: { ...p.c, ...(typeof patch === 'function' ? patch(p.c) : patch) } })),
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
    // Adds the backup's characters next to the existing ones; returns how many were added and how many failed.
    importAll: (data: unknown): { added: number; failed: number } => {
      const { added, failed } = writeBackup(data);
      setS((p) => addToStore(p, added));
      return { added: added.length, failed };
    }
  };
}

export type CharacterStore = ReturnType<typeof useCharacters>;
