import { describe, expect, it } from 'vitest';
import rules from '../data/srd/rules.json';
import { COMBAT_ACTIONS, normName } from '../logic';
import namesSrc from './names?raw';
import { PROF_NAMES } from './names';
import type { RuleEntry } from './schema';

describe('SRD rules texts', () => {
  const list = rules as RuleEntry[];
  it('hold the 12 actions and Opportunity Attack, which uses the Reaction', () => {
    const actions = list.filter((r) => r.cat === 'action');
    expect(actions).toHaveLength(13);
    expect(actions.map((r) => r.name).filter((n) => n !== 'Opportunity Attack').sort()).toEqual([...COMBAT_ACTIONS].sort());
  });
  it('hold the four senses', () => {
    expect(list.filter((r) => r.cat === 'sense').map((r) => r.name).sort()).toEqual(['Blindsight', 'Darkvision', 'Tremorsense', 'Truesight']);
  });
});

describe('bundled proficiency names', () => {
  it('cover every part of both samples’ Training', () => {
    const known = new Set(PROF_NAMES.flatMap((p) => [p.name, p.short].filter((x): x is string => !!x).map(normName)));
    const parts = ['Light', 'Medium', 'Shields', 'Simple', 'Martial', 'Cartographer’s Tools', 'Herbalism Kit', 'Calligrapher’s Supplies',
      'Common', 'Elvish', 'Sylvan', 'Draconic', 'Druidic', 'Dwarvish'];
    expect(parts.filter((p) => !known.has(normName(p)))).toEqual([]);
  });
  it('have unique ids and stay import-free, so migrate() never waits for a chunk', () => {
    expect(new Set(PROF_NAMES.map((p) => p.id)).size).toBe(PROF_NAMES.length);
    expect(namesSrc).not.toMatch(/^import /m);
  });
});
