import { describe, expect, it } from 'vitest';
import { blankCharacter, sampleCharacter } from './defaults';
import { hasMastery, masterySlots } from './actions';
import { migrate, normalize } from './logic';
import { applyPatch } from './storage';
import type { Character, Grant } from './types';

const ilyra = (p: Partial<Character> = {}): Character => ({ ...sampleCharacter(), ...p });
const raw = (c: Character) => JSON.parse(JSON.stringify(c)) as Record<string, unknown>;

describe('weapon mastery', () => {
  it('counts picks up to the Weapon Mastery slots, oldest first', () => {
    const c = ilyra({ mastery: ['longbow', 'shortsword'] });
    expect(masterySlots(c)).toBe(2);
    expect(hasMastery(c, 'longbow')).toBe(true);
    expect(hasMastery(ilyra({ mastery: ['longbow', 'shortsword', 'dagger'] }), 'dagger')).toBe(false);
    expect(hasMastery(ilyra({ mastery: ['dagger', 'longbow'] }), 'dagger')).toBe(true);
    expect(hasMastery(ilyra({ mastery: [] }), 'longbow')).toBe(false);
  });
  it('gives mastery of a weapon named by a grant', () => {
    const g: Grant = { id: 'gx', kind: 'prof', name: 'Hand Crossbow mastery', cat: 'mastery', target: 'Hand Crossbow', from: 'feature:f3' };
    expect(hasMastery(ilyra({ mastery: [], grants: [...sampleCharacter().grants, g] }), 'hand-crossbow')).toBe(true);
  });
  it('reads the slot count at the level (Fighter: 3, 4 from level 4)', () => {
    const c: Character = {
      ...blankCharacter(), level: 4, feats: [{ id: 'fw', g: 'class', name: 'Weapon Mastery', desc: '' }],
      grants: [{ id: 'gm', kind: 'prof', name: 'Weapon Mastery', cat: 'mastery', val: '1:3,4:4', from: 'feature:fw' }]
    };
    expect(masterySlots(c)).toBe(4);
    expect(masterySlots({ ...c, level: 3 })).toBe(3);
  });
  it('keeps the picks valid on load and on every change', () => {
    const { mastery: _m, ...old } = raw(ilyra({ mastery: ['longbow'] }));
    expect(migrate(old).mastery).toEqual([]);
    expect(migrate({ ...raw(ilyra()), mastery: ['x', 'x', 3] }).mastery).toEqual(['x']);
    expect(applyPatch(ilyra(), { mastery: ['x', 'x'] }).mastery).toEqual(['x']);
    const ok = ilyra({ mastery: ['longbow'] });
    expect(normalize(ok)).toBe(ok);
  });
});
