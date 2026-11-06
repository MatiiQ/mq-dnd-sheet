import { describe, expect, it } from 'vitest';
import { blankCharacter, druidSample, SAVE_VERSION, sampleCharacter } from './defaults';
import { isNewerSave, migrate, saveVersion, STEPS, upgrade } from './migrate';

// Frozen saves, one file per format version and case. Never regenerate or edit one: it stands for saves already on
// players' devices. A format change adds a step (STEPS) and a new fixture; the old fixtures must still load.
type Raw = Record<string, unknown>;
const files = import.meta.glob<{ default: Raw }>('./fixtures/*.json', { eager: true });
const fixtures: [string, Raw][] = Object.entries(files).map(([f, m]) => [f.slice('./fixtures/'.length), m.default]);
const LISTS = ['senses', 'res', 'attacks', 'riders', 'inv', 'spells', 'feats', 'acMods', 'grants', 'profs', 'defenses', 'sections'] as const;

describe('saved characters', () => {
  it('has fixtures', () => expect(fixtures.length).toBeGreaterThanOrEqual(3));
  it.each(fixtures)('%s keeps every entry', (_, fx) => {
    const c = migrate(fx);
    expect(c.v).toBe(SAVE_VERSION);
    for (const k of LISTS) expect(c[k].map((x) => x.id), k).toEqual((fx[k] as { id: string }[]).map((x) => x.id));
  });
  it.each(fixtures.filter(([, fx]) => saveVersion(fx) === SAVE_VERSION))('%s loads unchanged in the current format', (_, fx) => {
    const before = structuredClone(fx);
    expect(migrate(fx)).toEqual(before);
    expect(fx).toEqual(before); // migrate never changes the save it reads
  });
  it('leaves both samples unchanged', () => {
    expect(migrate(sampleCharacter())).toEqual(sampleCharacter());
    expect(migrate(druidSample())).toEqual(druidSample());
  });
});

describe('save versions', () => {
  it('reads a missing or damaged v as version 1, and writes the current one', () => {
    for (const v of [undefined, 0, -2, 1.5, 'x']) expect(saveVersion({ v })).toBe(1);
    expect(migrate({ ch: { name: 'Old' } }).v).toBe(SAVE_VERSION);
    expect(migrate({ ...blankCharacter(), v: SAVE_VERSION + 1 }).v).toBe(SAVE_VERSION);
  });
  it('has a step from every older version', () => {
    for (let v = 1; v < SAVE_VERSION; v++) expect(STEPS[v], 'step ' + v).toBeTypeOf('function');
  });
  it('runs the steps in order, from the save’s version', () => {
    const steps = { 1: (d: Raw) => ({ ...d, a: 1 }), 2: (d: Raw) => ({ ...d, b: (d.a as number) + 1 }) };
    expect(upgrade({ v: 1 }, steps, 3)).toEqual({ v: 1, a: 1, b: 2 });
    expect(upgrade({ v: 2, a: 5 }, steps, 3)).toEqual({ v: 2, a: 5, b: 6 });
    expect(upgrade({ v: 3 }, steps, 3)).toEqual({ v: 3 });
  });
  it('knows a save from a newer app', () => {
    expect(isNewerSave({ v: SAVE_VERSION + 1 })).toBe(true);
    expect(isNewerSave({ v: SAVE_VERSION })).toBe(false);
    expect(isNewerSave({})).toBe(false);
    expect(isNewerSave('x')).toBe(false);
  });
});

describe('field checks', () => {
  it('drops a bad spell flag or text, a bad sense plus, and bad save or condition values, never the entry', () => {
    const sp = { id: 's', name: 'S', lvl: 1, time: 'Action', range: 'Self' };
    const c = migrate({ ...blankCharacter(),
      spells: [{ ...sp, c: 'no', always: 1, prep: true, dur: 5, comp: 'V', dice: null }],
      senses: [{ id: 'd', name: 'Darkvision', range: '60 ft', plus: 'yes' }],
      saveProf: { str: true, dex: 'yes', luck: true }, conds: { Prone: true, Poisoned: 'x' } });
    expect(c.spells[0]).toEqual({ ...sp, prep: true, comp: 'V' });
    expect(c.senses[0]).not.toHaveProperty('plus');
    expect(c.saveProf).toEqual({ str: true });
    expect(c.conds).toEqual({ Prone: true });
  });
  it('repairs a copy, never the save it reads', () => {
    const save = { ...blankCharacter(), abilAdj: { str: 2.5 } };
    expect(migrate(save).abilAdj).toEqual({ str: 2 });
    expect(save.abilAdj).toEqual({ str: 2.5 });
  });
});
