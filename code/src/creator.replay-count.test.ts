// replaySteps applies each level once (spec §2 "Performance"): its own file, so the applyLevel spy affects nothing else.
import { describe, expect, it, vi } from 'vitest';
import { mergeCatalog } from './catalog/merge';
import type { ChoiceSpec, ClassEntry, Entry } from './catalog/schema';
import { replaySteps, type CreatorAnswers } from './creator';
import { applyLevel } from './levelup';

vi.mock('./levelup', async (orig) => { const m = await orig<typeof import('./levelup')>(); return { ...m, applyLevel: vi.fn(m.applyLevel) }; });

const skills: ChoiceSpec = { kind: 'choice', id: 'skills', name: 'Skills', pick: 1, pool: 'skill:stealth|insight' };
const ranger: ClassEntry = { id: 'class/ranger', kind: 'class', name: 'Ranger', src: 'srd', desc: '', hd: 10, saves: 'str,dex', skills, armor: '', weapons: '', slots: [] };
const cat = mergeCatalog([ranger, { id: 'prof/common', kind: 'prof', name: 'Common', src: 'srd', desc: '', cat: 'language' } as Entry], null);
const lv = { pick: { cls: 'class/ranger' }, ans: { hp: { mode: 'fixed' as const, val: 6 }, flows: {}, spells: {} } };
const fiveLevels: CreatorAnswers = { cls: 'class/ranger', start: 5, bgFlow: {}, spFlow: {}, skills: ['stealth'], languages: [], method: 'array',
  scores: { str: 10, dex: 15, con: 14, int: 12, wis: 13, cha: 8 }, details: { name: '', align: '', appearance: '', notes: '' },
  first: { flows: {}, spells: {} }, levels: [lv, lv, lv, lv] };

describe('replaySteps', () => {
  it('calls applyLevel once per level for a starting level of 5', () => {
    const r = replaySteps(cat, fiveLevels, { fill: true });
    expect(r.c.classes[0].lvl).toBe(5);
    expect(vi.mocked(applyLevel)).toHaveBeenCalledTimes(5);
  });
});
