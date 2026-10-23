import { useEffect, useState } from 'react';
import { blankCharacter, sampleCharacter } from './defaults';
import { migrate } from './logic';
import type { Character } from './types';

const INDEX_KEY = 'dnd-index-v3';
const sheetKey = (id: string) => 'dnd-sheet-v3:' + id;

export interface IndexEntry { id: string; name: string; info?: string }
export type Patch = Partial<Character> | ((c: Character) => Partial<Character>);

function readJSON(key: string): unknown {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeJSON(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

const load = (id: string): Character => ({ ...sampleCharacter(), ...migrate(readJSON(sheetKey(id))) });
const charId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
export const charName = (c: Character) => c.ch.name || 'Unnamed character';
export const charInfo = (c: Character) => [c.ch.species, (c.ch.cls || 'Level') + ' ' + c.level].filter((x) => x).join(' · ');

interface Store { id: string; list: IndexEntry[]; c: Character }

function initial(): Store {
  const idx = readJSON(INDEX_KEY) as { active?: string; list?: IndexEntry[] } | null;
  if (!idx || !Array.isArray(idx.list) || !idx.list.length) {
    const id = charId();
    return { id, list: [{ id, name: 'Ilyra Moonbrook' }], c: sampleCharacter() };
  }
  const id = idx.list.some((x) => x.id === idx.active) ? idx.active! : idx.list[0].id;
  return { id, list: idx.list, c: load(id) };
}

const BACKUP_APP = 'dnd-character-sheet';

// All characters, the active one, and every way to change them. Saves on each change.
export function useCharacters() {
  const [s, setS] = useState(initial);
  const list = s.list.map((x) => (x.id === s.id ? { id: x.id, name: charName(s.c), info: charInfo(s.c) } : x));

  useEffect(() => {
    writeJSON(sheetKey(s.id), s.c);
    writeJSON(INDEX_KEY, { active: s.id, list: s.list.map((x) => (x.id === s.id ? { id: x.id, name: charName(s.c), info: charInfo(s.c) } : x)) });
  }, [s]);

  const add = (c: Character) => setS((p) => {
    const id = charId();
    return { id, list: [...p.list, { id, name: charName(c) }], c };
  });

  return {
    c: s.c, charId: s.id, list,
    update: (patch: Patch) => setS((p) => ({ ...p, c: { ...p.c, ...(typeof patch === 'function' ? patch(p.c) : patch) } })),
    switchTo: (id: string) => setS((p) => ({ ...p, id, c: load(id) })),
    newBlank: () => add(blankCharacter()),
    newSample: () => add(sampleCharacter()),
    duplicate: () => {
      const copy: Character = JSON.parse(JSON.stringify(s.c));
      add({ ...copy, ch: { ...copy.ch, name: (copy.ch.name || 'Character') + ' (copy)' } });
    },
    deleteCurrent: () => setS((p) => {
      const rest = p.list.filter((x) => x.id !== p.id);
      if (!rest.length) return p;
      try { localStorage.removeItem(sheetKey(p.id)); } catch { /* ignore */ }
      return { id: rest[0].id, list: rest, c: load(rest[0].id) };
    }),
    resetCurrent: () => setS((p) => ({ ...p, c: blankCharacter() })),

    exportAll: () => ({
      app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(),
      characters: list.map((x) => (x.id === s.id ? s.c : load(x.id)))
    }),
    // Adds the backup's characters next to the existing ones; returns how many were added.
    importAll: (data: unknown): number => {
      const d = data as { app?: string; characters?: unknown[] } | null;
      if (!d || d.app !== BACKUP_APP || !Array.isArray(d.characters)) throw new Error('Not a character sheet backup file.');
      const chars = d.characters.filter((x) => x && typeof x === 'object' && (x as Character).ch).map((x) => ({ ...sampleCharacter(), ...migrate(x) }));
      if (!chars.length) throw new Error('The backup has no characters.');
      const added = chars.map((c) => ({ id: charId(), c }));
      added.forEach((a) => writeJSON(sheetKey(a.id), a.c));
      setS((p) => ({ id: added[0].id, c: added[0].c, list: [...p.list, ...added.map((a) => ({ id: a.id, name: charName(a.c), info: charInfo(a.c) }))] }));
      return added.length;
    }
  };
}

export type CharacterStore = ReturnType<typeof useCharacters>;
