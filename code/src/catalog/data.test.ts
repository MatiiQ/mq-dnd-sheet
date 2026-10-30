import { describe, expect, it } from 'vitest';
import { AC_SPELLS, ARMORS, SKILLS } from '../logic';
import classes from '../data/srd/classes.json';
import items from '../data/srd/items.json';
import origins from '../data/srd/origins.json';
import spells from '../data/srd/spells.json';
import { validateEntry, type Entry, type BackgroundEntry, type ChoiceSpec, type ClassEntry, type FeatEntry, type GrantSpec, type ItemEntry, type Spec, type SpellEntry } from './schema';

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

describe('SRD items', () => {
  const list = items as ItemEntry[];
  const by = (name: string) => list.find((e) => e.name === name);
  it('match the sheet’s armor table (ARMORS)', () => {
    const armor = list.filter((e) => e.cat === 'armor' || e.cat === 'shield').map((e) => [e.name, e.armor, e.acBase]);
    expect(armor.sort()).toEqual(ARMORS.map((a) => [...a]).sort());
  });
  it('read Bag of Holding’s capacity from its SRD text', () => {
    expect(by('Bag of Holding')).toMatchObject({ xdim: true, cap: 500, capVol: '64 cubic feet', wt: 5 });
  });
  it('give non-armor magic items their AC as a grant, never acBonus', () => {
    for (const e of list.filter((x) => x.acBonus !== undefined)) expect([e.name, e.armor]).toEqual([e.name, expect.any(String)]);
    expect(by('Ring of Protection')!.grants).toContainEqual(expect.objectContaining({ kind: 'ac', val: '1', needEq: true, needAtt: true }));
  });
});

const specs = (e: Entry): Spec[] => ('grants' in e && e.grants ? e.grants : []);
const flat = (e: Entry): GrantSpec[] => specs(e).flatMap((s) => (s.kind === 'choice' ? s.options ?? [] : [s]));

describe('SRD origins', () => {
  const list = origins as Entry[];
  const ids = new Set(all.map((e) => e.id));
  it('give every feat that raises a score an abil grant or choice with the right cap', () => {
    for (const f of list.filter((e): e is FeatEntry => e.kind === 'feat' && /Increase (one|your|two)/.test(e.desc))) {
      const caps = flat(f).filter((g) => g.kind === 'abil').map((g) => g.cap);
      expect([f.id, caps.length > 0 && caps.every((c) => c === (f.cat === 'boon' ? 30 : 20))]).toEqual([f.id, true]);
    }
  });
  it('give every background a three-ability choice, a real feat and real skills', () => {
    const bgs = list.filter((e): e is BackgroundEntry => e.kind === 'background');
    expect(bgs).toHaveLength(4);
    const keys = SKILLS.map(([k]) => k);
    for (const b of bgs) {
      const abil = specs(b).find((s): s is ChoiceSpec => s.kind === 'choice' && !!s.options?.every((o) => o.kind === 'abil'));
      expect([b.id, abil?.pick, abil?.options?.map((o) => o.ab).join(',')]).toEqual([b.id, 3, b.abils]);
      expect(ids.has(b.feat.split(':')[0])).toBe(true);
      for (const k of b.skills.split(',')) expect(keys).toContain(k);
    }
  });
  it('point every grant at entries that exist', () => {
    for (const e of all) {
      for (const g of flat(e)) {
        for (const ref of [g.spell, g.casts]) if (ref && !ref.startsWith('$')) expect([e.id, ids.has(ref) && ref]).toEqual([e.id, ref]);
        if (g.kind === 'prof' && g.cat === 'skill' && g.target) expect(SKILLS.map(([k]) => k)).toContain(g.target);
      }
      for (const s of specs(e)) {
        const of = s.kind === 'choice' && /^trait:of=(.+)$/.exec(s.pool ?? '')?.[1];
        if (of) expect([e.id, ids.has(of)]).toEqual([e.id, true]);
      }
      if (e.kind === 'trait' && e.of) expect([e.id, ids.has(e.of)]).toEqual([e.id, true]);
    }
  });
});

describe('SRD classes', () => {
  const list = (classes as Entry[]).filter((e): e is ClassEntry => e.kind === 'class');
  it('hold the 12 classes, one subclass each', () => {
    expect(list.map((c) => c.name)).toEqual(['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard']);
    expect((classes as Entry[]).filter((e) => e.kind === 'subclass')).toHaveLength(12);
  });
  it('offer skills by the app’s keys and mark only the Warlock as Pact Magic', () => {
    const keys = SKILLS.map(([k]) => k);
    for (const c of list) {
      const pool = c.skills.pool!.slice('skill:'.length);
      if (pool !== 'any') for (const k of pool.split('|')) expect([c.name, keys.includes(k) && k]).toEqual([c.name, k]);
    }
    expect(list.filter((c) => c.pact).map((c) => c.name)).toEqual(['Warlock']);
  });
});
