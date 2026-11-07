import { describe, expect, it } from 'vitest';
import { diceRange, isValue, valueAt, type ValueCtx } from './value';

const ctx = (level: number, wis = 2): ValueCtx => ({ level, pb: 2 + Math.floor((level - 1) / 4), mod: (a) => (a === 'wis' ? wis : 0) });
it('evaluates numbers, PB, level and ability modifiers with a minimum', () => {
  expect(valueAt('2', ctx(1))).toBe(2);
  expect(valueAt('pb', ctx(5))).toBe(3);
  expect(valueAt('wis>=1', ctx(1, -1))).toBe(1);
  expect(valueAt('wis+pb', ctx(5))).toBe(5);
  expect(valueAt('lvl', ctx(12))).toBe(12);
  expect(['dex', '1+dex', '1d4+dex'].map((v) => valueAt(v, { ...ctx(5), mod: () => 2 }))).toEqual([2, 3, '1d4+2']);
});
it('reads level tables, including dice and levels before the first step', () => {
  expect([1, 2, 6, 16, 17].map((l) => valueAt('2:2,6:3,17:4', ctx(l)))).toEqual([0, 2, 3, 3, 4]); // Wild Shape (PHB p.80)
  expect([1, 5, 11, 17].map((l) => valueAt('1:1d8,5:1d10,11:1d12,17:2d6', ctx(l)))).toEqual(['1d8', '1d10', '1d12', '2d6']); // Shillelagh (PHB p.316)
});
it('keeps dice expressions as text', () => {
  expect(valueAt('1d6+1', ctx(1))).toBe('1d6+1');
  expect(valueAt('-1d6', ctx(1))).toBe('-1d6');
  expect(valueAt('-2', ctx(1))).toBe(-2);
});
it('rejects malformed values', () => {
  expect(['', 'sixty', '1:2,1:3', '6:3,2:2', '1:2,lvl', 'wiz>=1', '2d', '1:pb', 'pb>=x', '--1', '1:-2', '1:2,5:d8'].map(isValue)).toEqual(Array(12).fill(false));
  expect(['60', 'pb', 'cha>=1', '1:2,5:3', '1d6+1', 'str+2', '-1d6'].map(isValue)).toEqual(Array(7).fill(true));
});

describe('diceRange', () => {
  it('sums each term’s lowest and highest roll, constants as they are', () => {
    expect(diceRange('1d3')).toEqual([1, 3]);
    expect(diceRange('1d8+1')).toEqual([2, 9]);
    expect(diceRange('2d6')).toEqual([2, 12]);
    expect(diceRange('d4')).toEqual([1, 4]);
  });
  it('is null for anything that isn’t dice and whole numbers', () => {
    expect(diceRange('pb')).toBeNull();
    expect(diceRange('7')).toBeNull();
    expect(diceRange('1d6+wis')).toBeNull();
    expect(diceRange('1:1d6,5:1d8')).toBeNull();
  });
});

describe('the magic term', () => {
  const ctx: ValueCtx = { level: 5, pb: 3, mod: () => 1 };
  it('reads the item’s magic, 0 when it has none', () => {
    expect(isValue('magic')).toBe(true);
    expect(valueAt('magic', { ...ctx, magic: 2 })).toBe(2);
    expect(valueAt('magic', ctx)).toBe(0);
    expect(valueAt('magic+1', { ...ctx, magic: 2 })).toBe(3);
  });
});
it('reads hlvl as half the level, rounded down', () => {
  expect(valueAt('hlvl', ctx(7))).toBe(3);
  expect(valueAt('1d6+hlvl', ctx(7))).toBe('1d6+3');
  expect(isValue('hlvl+cha>=1')).toBe(true);
});

describe('slot tables', () => {
  it('parses a table keyed by the slot level of the cast', () => {
    expect(isValue('@2:5,3:10')).toBe(true);
    expect(isValue('@3:1,2:2')).toBe(false);
    expect(isValue('@2:1d4,3:2')).toBe(false);
  });
  it('reads the slot level, or the first step without one (Magic Weapon, PHB p.295)', () => {
    expect(valueAt('@2:1,3:2,6:3', { ...ctx(1), slot: 5 })).toBe(2);
    expect(valueAt('@2:1,3:2,6:3', { ...ctx(1), slot: 6 })).toBe(3);
    expect(valueAt('@2:1,3:2,6:3', ctx(20))).toBe(1);
  });
});
