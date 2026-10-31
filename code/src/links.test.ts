import { describe, expect, it } from 'vitest';
import { sampleCharacter } from './defaults';
import { fixLinks, parseLink, sourceLabel, wouldLoop } from './links';
import { migrate } from './logic';
import type { Character, Feature } from './types';

const make = (p: Partial<Character> = {}): Character => ({ ...sampleCharacter(), ...p });
const feat = (id: string, from?: string): Feature => ({ id, g: 'other', name: id.toUpperCase(), desc: '', ...(from ? { from } : {}) });

describe('links', () => {
  it('parses a link to a feature, item or spell, and nothing else', () => {
    expect(parseLink('feature:f2')).toEqual({ kind: 'feature', id: 'f2' });
    expect(parseLink('item:i9')).toEqual({ kind: 'item', id: 'i9' });
    expect(parseLink('spell:sp4')).toEqual({ kind: 'spell', id: 'sp4' });
    expect([parseLink('res:x'), parseLink('feature:'), parseLink(3), parseLink(undefined)]).toEqual([null, null, null, null]);
  });

  it('labels a source by its link, else by srcKind and srcName', () => {
    const c = make();
    expect(sourceLabel(c, { from: 'feature:f11' })).toBe('Species · Darkvision');
    expect(sourceLabel(c, { from: 'item:i9' })).toBe('Item · Cloak of Elvenkind');
    expect(sourceLabel(c, { from: 'spell:sp4' })).toBe('Spell · Hunter’s Mark');
    expect(sourceLabel(c, { srcKind: 'species', srcName: 'Wood Elf' })).toBe('Species · Wood Elf');
    expect(sourceLabel(c, { srcName: 'Wood Elf' })).toBe('Wood Elf');
    expect(sourceLabel(c, {})).toBeUndefined();
  });

  it('finds a link that would close a loop, and stops on loops already there', () => {
    const c = make({ feats: [feat('A'), feat('B', 'feature:A'), feat('X')] });
    expect(wouldLoop(c, 'feature:A', 'feature:B')).toBe(true);
    expect(wouldLoop(c, 'feature:A', 'feature:A')).toBe(true);
    expect(wouldLoop(c, 'feature:A', 'feature:X')).toBe(false);
    const ring = make({ feats: [feat('A', 'feature:C'), feat('B', 'feature:A'), feat('C', 'feature:B'), feat('X')] });
    expect(wouldLoop(ring, 'feature:X', 'feature:A')).toBe(false);
  });

  it('repairs dangling links, loops and self-links, keeping the source text', () => {
    const dangling = fixLinks(make({ senses: [{ id: 's', name: 'Darkvision', range: '60 ft', from: 'feature:gone', srcKind: 'species', srcName: 'Elf' }] }));
    expect(dangling.senses[0]).toEqual({ id: 's', name: 'Darkvision', range: '60 ft', srcKind: 'species', srcName: 'Elf' });
    const loop = fixLinks(make({ feats: [feat('A', 'feature:B'), feat('B', 'feature:A')] }));
    expect(loop.feats.map((x) => x.from)).toEqual([undefined, 'feature:A']);
    expect(fixLinks(loop)).toEqual(loop);
    expect(fixLinks(make({ feats: [feat('A', 'feature:A')] })).feats[0].from).toBeUndefined();
    const ok = make({ feats: [feat('A'), feat('B', 'feature:A')] });
    expect(fixLinks(ok).feats).toEqual(ok.feats);
  });

  it('drops the fields that need a link when a link goes, once', () => {
    const raw = { ...sampleCharacter(), senses: [{ id: 's', name: 'Darkvision', range: '60 ft', from: 'item:gone', needEq: true, when: 'active' }] };
    const once = migrate(raw);
    expect(once.senses[0]).toEqual({ id: 's', name: 'Darkvision', range: '60 ft' });
    expect(migrate(once)).toEqual(once);
  });

  it('checks link fields on load: unknown kinds read Other, bad values go, a spell level is never a gate', () => {
    const c = migrate({ ...sampleCharacter(), senses: [{ id: 's', name: 'Blindsight', range: '10 ft', srcKind: 'race', when: 'always', minLvl: 0, needEq: 'yes' },
      { id: 't', name: 'Tremorsense', range: '5 ft', minLvl: 3, when: 'noHeavy' }] });
    expect(c.senses[0]).toEqual({ id: 's', name: 'Blindsight', range: '10 ft', srcKind: 'other' });
    expect(c.senses[1]).toMatchObject({ minLvl: 3, when: 'noHeavy' });
    const cantrip = migrate(sampleCharacter()).spells.find((x) => x.id === 'sp1')!;
    expect(cantrip.lvl).toBe(0);
    expect(cantrip.minLvl).toBeUndefined();
  });
});
