import { describe, expect, it } from 'vitest';
import { blankCharacter } from '../defaults';
import type { Character } from '../types';
import { revealOf, revealPlace } from './nav';

const c: Character = {
  ...blankCharacter(),
  feats: [{ id: 'f', g: 'class' as const, name: 'Rage', desc: '' }],
  inv: [{ id: 'i', name: 'Rope', qty: 1, wt: 5, eq: false }],
  spells: [{ id: 's', name: 'Bless', lvl: 1, time: 'Action', range: '30 feet' }]
};

describe('revealOf', () => {
  it('maps a link whose source exists to its target', () => {
    expect(revealOf(c, 'feature:f')).toEqual({ kind: 'feature', id: 'f' });
    expect(revealOf(c, 'item:i')).toEqual({ kind: 'item', id: 'i' });
    expect(revealOf(c, 'spell:s')).toEqual({ kind: 'spell', id: 's' });
  });
  it('gives null for a class link (a class row is not a revealable entry)', () => {
    const withRow = { ...c, classes: [{ id: 'c1', name: 'Ranger', clsId: '', sub: '', subId: '', lvl: 1, hd: 10 as const, prep: 0 }] };
    expect(revealOf(withRow, 'class:c1')).toBeNull();
  });
  it('gives null for a dangling link, no link, or a non-link', () => {
    expect(revealOf(c, 'feature:gone')).toBeNull();
    expect(revealOf(c, undefined)).toBeNull();
    expect(revealOf(c, 'other')).toBeNull();
  });
});

describe('revealPlace', () => {
  it('maps each kind to its tab or section and row id', () => {
    expect(revealPlace({ kind: 'res', id: 'r' })).toEqual({ sec: 'sec-resources', dom: 'res-r' });
    expect(revealPlace({ kind: 'feature', id: 'f' })).toEqual({ tab: 'features', dom: 'feat-f' });
    expect(revealPlace({ kind: 'item', id: 'i' })).toEqual({ tab: 'inventory', dom: 'item-i' });
    expect(revealPlace({ kind: 'spell', id: 's' })).toEqual({ tab: 'spells', dom: 'spell-s' });
  });
});
