import { describe, expect, it } from 'vitest';
import items from '../data/srd/items.json';
import { withBase } from './base';
import type { ItemEntry } from './schema';

const it_ = (id: string) => (items as ItemEntry[]).find((e) => e.id === id)!;

describe('withBase', () => {
  it('copies the base’s weapon fields and weight under the magic item’s own, and sets base to its id', () => {
    const out = withBase(it_('item/holy-avenger'), it_('item/longsword'));
    expect(out).toMatchObject({ id: 'item/holy-avenger', base: 'item/longsword', wcat: 'martial', dmg: '1d8', dtype: 'Slashing', vers: '1d10', mastery: 'sap', wt: 3, magic: 3 });
  });
  it('copies armor fields and drops a Strength requirement of 0 and a Stealth Disadvantage of false (Mithral Armor)', () => {
    const mithral = { ...it_('item/mithral-armor'), strReq: 0, stealthDis: false };
    const out = withBase(mithral, it_('item/plate-armor'));
    expect(out).toMatchObject({ base: 'item/plate-armor', armor: 'heavy', acBase: 18 });
    expect(['strReq' in out, 'stealthDis' in out]).toEqual([false, false]);
  });
  it('takes a Shield as a base (Animated Shield)', () => {
    expect(withBase(it_('item/animated-shield'), it_('item/shield'))).toMatchObject({ armor: 'shield', base: 'item/shield' });
  });
  it('throws on a base that is no mundane weapon, armor or Shield', () => {
    expect(() => withBase(it_('item/holy-avenger'), it_('item/sun-blade'))).toThrow(/base/);
    expect(() => withBase(it_('item/holy-avenger'), it_('item/rope'))).toThrow(/base/);
    expect(() => withBase(it_('item/ammunition-1-2-or-3'), it_('item/arrows'))).toThrow(/base/);
  });
});
