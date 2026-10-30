import { describe, expect, it } from 'vitest';
import { AC_SPELLS } from '../logic';
import spells from '../data/srd/spells.json';
import { validateEntry, type Entry, type SpellEntry } from './schema';

// Every committed SRD data file, read through Vite so no Node types are needed under src/.
const files = import.meta.glob<{ default: Entry[] }>('../data/srd/*.json', { eager: true });
const all = Object.values(files).flatMap((m) => m.default);

describe('committed SRD data', () => {
  it('validates every entry', () => {
    for (const e of all) expect([e.id, validateEntry(e)]).toEqual([e.id, []]);
  });
  it('holds SRD entries only, each id once', () => {
    expect(all.filter((e) => e.src !== 'srd').map((e) => e.id)).toEqual([]);
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
  });
});

describe('SRD spells', () => {
  const list = spells as SpellEntry[];
  it('holds every spell in SRD 5.2.1', () => expect(list).toHaveLength(339));
  it('carries the AC effects the sheet knows by name (AC_SPELLS)', () => {
    for (const [name, [fx, val]] of Object.entries(AC_SPELLS)) {
      expect(list.find((e) => e.name.toLowerCase() === name)).toMatchObject({ acFx: fx, acVal: val });
    }
  });
});
