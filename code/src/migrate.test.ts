import { describe, expect, it } from 'vitest';
import { blankCharacter, druidSample, SAVE_VERSION, sampleCharacter } from './defaults';
import { cleanClasses, cleanLevel, isNewerSave, migrate, saveVersion, STEPS, upgrade } from './migrate';
import { abilityMod, armorClass, carriedWeight, classLine, hdSpent, maxHpOf, normalize } from './logic';
import { isActive } from './links';
import { spellActions } from './actions';
import { inventoryGroups } from './inventory';
import type { Character, Item, Spell } from './types';

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

describe('top-level fields', () => {
  it('keeps saved pills and repairs damaged ones', () => {
    expect(migrate(sampleCharacter()).pills).toEqual(['hp', 'ac', 'res:favored']);
    expect(migrate({ ...sampleCharacter(), pills: ['x', 'hp', 'hp', 'ac'] }).pills).toEqual(['', 'hp', '']);
    expect(migrate({ ...sampleCharacter(), pills: [3, 'res:a'] }).pills).toEqual(['', 'res:a', '']);
    expect(migrate({ ...sampleCharacter(), pills: 'hp' }).pills).toEqual(['hp', 'ac', '']);
  });
  it('fills a missing or wrong-type field from the blank character, never the sample', () => {
    const c = migrate({ ch: { name: 'Sparse' } });
    expect(c).toMatchObject({ classes: [{ lvl: 1 }], inv: [], spells: [], attacks: [], amount: 0 });
    expect(migrate({ ...sampleCharacter(), inv: 'x' }).inv).toEqual([]);
    expect(migrate(null)).toEqual(blankCharacter());
    expect(migrate('x')).toEqual(blankCharacter());
    for (const k of ['spellSort', 'size', 'carryUp', 'attuneIds', 'grants', 'effectsOn', 'profs', 'defenses', 'hands', 'mastery', 'sections'] as const) {
      const raw = { ...sampleCharacter() } as Record<string, unknown>;
      delete raw[k];
      expect(migrate(raw)[k]).toEqual(blankCharacter()[k]);
      expect(migrate({ ...sampleCharacter(), [k]: 7 })[k]).toEqual(blankCharacter()[k]); // no new field is a number
    }
  });
  it('keeps only skill levels 0, 1 and 2', () => {
    const c = migrate({ ...sampleCharacter(), skillProf: { arcana: 'x', nature: 2, stealth: 5, history: 1.5, insight: 0 } });
    expect(c.skillProf).toEqual({ nature: 2, insight: 0 });
  });
  it('replaces values of the wrong type so the sheet can render', () => {
    const c = migrate({
      ...sampleCharacter(), spells: 'x', conds: null, abil: { str: '12', dex: 14 }, tab: 'nope', castAb: 'str',
      attacks: [{ id: 'a', name: 'Club', hit: {} }, { name: 'Sling', hit: '+4' }, 7],
      slotMax: [0, 4], slotUsed: [0, 'x'],
      conc: { name: 'Bless' }, hpUndo: { prev: 1 }, restMsg: { title: 1 }
    });
    expect(c.spells).toEqual([]);
    expect(c.conds).toEqual({});
    expect(c.abil).toMatchObject({ str: 10, dex: 14 });
    expect(c).toMatchObject({ tab: 'actions', castAb: 'none', conc: null, hpUndo: null, restMsg: null });
    expect(c.attacks.map((a) => a.name)).toEqual(['Sling']);
    expect(c.attacks[0].id).toBeTruthy();
    // Resources moved out of the tabs into the left column.
    expect(migrate({ ...sampleCharacter(), tab: 'resources' }).tab).toBe('actions');
    expect(c.slotMax).toEqual([0, 4, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(c.slotUsed).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(migrate({ ...sampleCharacter(), castAb: 'toString' }).castAb).toBe('none'); // only an inherited key
    expect(migrate({ ...sampleCharacter(), spellSort: 'zz' }).spellSort).toBe('az');
  });
  it('clamps levels, HP and values that size lists of buttons, and keeps exactly three attunement slots', () => {
    const c = migrate({ ...sampleCharacter(), slotMax: [0, 1e9], slotUsed: [0, 50], exh: 99, ds: -1, df: 7, hdUsed: { 10: 1e9 }, attuneIds: [] });
    expect(c).toMatchObject({ exh: 6, ds: 0, df: 3, hdUsed: { 10: 5 } });
    expect(c.slotMax[1]).toBe(9);
    expect(c.slotUsed[1]).toBe(9);
    expect(c.attuneIds).toEqual(['', '', '']);
    expect(migrate({ attuneIds: ['a', 'b', 'c', 'd'] }).attuneIds).toEqual(['', '', '']); // ids of missing items drop
    expect(migrate({ ...sampleCharacter(), hp: -3, maxHp: 20 })).toMatchObject({ hp: 0 });
    expect(migrate({ ...sampleCharacter(), classes: [{ ...sampleCharacter().classes[0], lvl: 5.5 }] }).classes[0].lvl).toBe(1);
  });
  it('keeps Heroic Inspiration a whole count of 0 or more, with no maximum (house rule)', () => {
    const vals = [true, false, 3, 2.7, -4, 'x', null, undefined];
    expect(vals.map((insp) => migrate({ ...sampleCharacter(), insp }).insp)).toEqual([0, 0, 3, 2, 0, 0, 0, 0]);
  });
  it('drops missing, repeated and damaged attunement ids', () => {
    const inv = [{ id: 'i2', name: 'Ring', qty: 1, eq: true }];
    expect(migrate({ attuneIds: ['i2', 'gone', 'i2'], inv }).attuneIds).toEqual(['i2', '', '']);
    expect(migrate({ attuneIds: [3, 'i2'], inv }).attuneIds).toEqual(['', 'i2', '']);
  });
  it('drops damaged weights and sizes on load', () => {
    const c = migrate({ ...sampleCharacter(), size: 'colossal', carryUp: 'yes', inv: [{ id: 'a', name: 'Rope', qty: 1, eq: false, wt: 'x' }, { id: 'b', name: 'Pot', qty: 1, eq: false, wt: -3 }] });
    expect(c).toMatchObject({ size: 'medium', carryUp: false });
    expect(c.inv.map((i) => i.wt)).toEqual([undefined, undefined]);
  });
  it('keeps inspOn a boolean, on when missing', () => {
    expect(blankCharacter().inspOn).toBe(true);
    expect(migrate({ ...blankCharacter(), inspOn: 'yes' }).inspOn).toBe(true);
    expect(migrate({ ...blankCharacter(), inspOn: false }).inspOn).toBe(false);
    const { inspOn: _, ...rest } = blankCharacter();
    expect(migrate(rest).inspOn).toBe(true);
  });
});

describe('entry fields', () => {
  it('keeps dmgMod and a damage type list only when well formed, and never dtypes next to a typed dtype', () => {
    const sp = { id: 'a', name: 'Orb', lvl: 1, time: 'Action', range: '90 ft', fx: 'damage', dmg: '3d8' };
    const c = migrate({ ...sampleCharacter(), spells: [{ ...sp, dmgMod: true, dtypes: 'Acid,Cold' }, { ...sp, id: 'b', dmgMod: 'yes', dtypes: 'Acid' },
      { ...sp, id: 'c', dtype: 'Fire', dtypes: 'Acid,Cold' }] });
    expect(c.spells[0]).toMatchObject({ dmgMod: true, dtypes: 'Acid,Cold' });
    expect([c.spells[1].dmgMod, c.spells[1].dtypes]).toEqual([undefined, undefined]);
    expect([c.spells[2].dtype, c.spells[2].dtypes]).toEqual(['Fire', undefined]);
  });
  it('keeps a spell’s good parts, drops the bad ones, and drops parts when none is left, never the spell', () => {
    const sp = { id: 'a', name: 'Ice Knife', lvl: 1, time: 'Action', range: '60 ft', fx: 'damage', dmg: '1d10', atk: 'ranged' };
    const burst = { label: 'Burst', fx: 'damage', dice: '2d6', dtype: 'Cold', save: 'dex', scale: '1d6/slot' };
    const c = migrate({ ...sampleCharacter(), spells: [{ ...sp, parts: [burst, { label: 'Bad', fx: 'other', dice: '1d4' }, { ...burst }, 'x'] },
      { ...sp, id: 'b', parts: [{ label: '', fx: 'damage', dice: '1d4' }] }, { ...sp, id: 'c', parts: 'Burst' }] });
    expect(c.spells.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(c.spells[0].parts).toEqual([burst]);
    expect([c.spells[1].parts, c.spells[2].parts]).toEqual([undefined, undefined]);
  });
  it('drops a proficiency with an unknown category', () => {
    expect(migrate({ ...sampleCharacter(), profs: [{ id: 'a', cat: 'vehicle', name: 'Boat' }, { id: 'b', cat: 'tool', name: 'Lute' }] }).profs).toEqual([{ id: 'b', cat: 'tool', name: 'Lute' }]);
  });
  it('fills fields the sheet reads when they are missing or the wrong type', () => {
    const c = migrate({ ...blankCharacter(),
      spells: [{ id: 's', name: 'S', lvl: 1 }, { id: 't', name: 'T', lvl: 'x', time: 5, range: null }],
      inv: [{ id: 'i', name: 'I' }, { id: 'j', name: 'J', qty: '2', eq: 'yes' }],
      attacks: [{ id: 'a', name: 'A' }], senses: [{ id: 'n', name: 'N' }], riders: [{ id: 'r', name: 'R' }],
      feats: [{ id: 'f', name: 'F', g: 'nope' }] });
    expect(c.spells[1]).toMatchObject({ lvl: 0, time: '', range: '' });
    expect(c.inv[0]).toMatchObject({ qty: 1, eq: false });
    expect(c.inv[1]).toMatchObject({ qty: 1, eq: false });
    expect(c.attacks[0]).toMatchObject({ hit: '', dmg: '', info: '', mastery: '' });
    expect(c.senses[0].range).toBe('');
    expect(c.riders[0].dice).toBe('');
    expect(c.feats[0]).toMatchObject({ g: 'other', desc: '' });
    expect(() => spellActions(c)).not.toThrow();
    expect(carriedWeight(c)).not.toBeNaN();
  });
  it('keeps good values while repairing', () => {
    const c = migrate({ ...blankCharacter(),
      spells: [{ id: 's', name: 'S', lvl: 3, time: 'Action', range: '30 ft' }, { id: 't', name: 'T', lvl: 1.5, time: 'x', range: 'y' }, { id: 'u', name: 'U', lvl: 10, time: 'x', range: 'y' }],
      inv: [{ id: 'i', name: 'I', qty: 2.7, eq: true }, { id: 'j', name: 'J', qty: 0, eq: false }, { id: 'k', name: 'K', qty: -1, eq: false }] });
    expect(c.spells.map((x) => x.lvl)).toEqual([3, 0, 0]);
    expect(c.spells[0]).toMatchObject({ time: 'Action', range: '30 ft' });
    expect(c.inv.map((x) => x.qty)).toEqual([2, 0, 1]);
    expect(c.inv[0].eq).toBe(true);
  });
  it('drops a defense of an unknown kind and reads an unknown source kind as Other', () => {
    const c = migrate({ ...sampleCharacter(), defenses: [{ id: 'a', kind: 'weak', name: 'Fire' }, { id: 'b', kind: 'res', name: 'Cold', srcKind: 'x' }] });
    expect(c.defenses).toEqual([{ id: 'b', kind: 'res', name: 'Cold', srcKind: 'other' }]);
  });
  it('checks resource fields on load', () => {
    const c = migrate({ ...sampleCharacter(), res: [
      { id: 'a', name: 'A', count: 1, max: 0, recharge: 'long' }, { id: 'b', name: 'B', count: 1, recharge: 'weekly' },
      { id: 'c', name: 'C', count: 1, max: 2, recharge: 'dawn', regain: '1', regainOn: 'short' },
      { id: 'd', name: 'D', count: 1, max: 2, recharge: 'long', regain: '1', regainOn: 'short', typeName: 'Ki', note: 3 },
      { id: 'e', name: 'E', count: 1, maxV: '1d4' }, { id: 'f', name: 'F', count: 1, maxV: 'wis>=1' },
      { id: 'g', name: 'G', count: 1, from: 'feature:gone', srcKind: 'class', srcName: 'Monk' }, { id: 'h', name: 'H', count: 'x' }] });
    expect(c.res).toEqual([
      { id: 'a', name: 'A', count: 1, recharge: 'long' }, { id: 'b', name: 'B', count: 1, recharge: 'none' },
      { id: 'c', name: 'C', count: 1, max: 2, recharge: 'dawn' },
      { id: 'd', name: 'D', count: 1, max: 2, recharge: 'long', regain: '1', regainOn: 'short', typeName: 'Ki' },
      { id: 'e', name: 'E', count: 1, recharge: 'none' }, { id: 'f', name: 'F', count: 1, maxV: 'wis>=1', recharge: 'none' },
      { id: 'g', name: 'G', count: 1, srcKind: 'class', srcName: 'Monk', recharge: 'none' }, { id: 'h', name: 'H', count: 0, recharge: 'none' }]);
    expect(migrate(c)).toEqual(c);
  });
  it('checks item charge fields on load', () => {
    const c = migrate({ ...sampleCharacter(), inv: [{ id: 'a', name: 'A', qty: 1, eq: false, count: 2, max: 0, recharge: 'weekly', regain: '1', regainOn: 'dawn' },
      { id: 'b', name: 'B', qty: 1, eq: false, max: 3 }] });
    expect(c.inv).toEqual([{ id: 'a', name: 'A', qty: 1, eq: false, count: 2, recharge: 'none' }, { id: 'b', name: 'B', qty: 1, eq: false }]);
  });
  it('drops a cast link to a spell that is gone', () => {
    const c = migrate({ ...sampleCharacter(), res: [{ id: 'x', name: 'X', count: 1, max: 1, recharge: 'long', casts: 'gone' }] });
    expect(c.res[0].casts).toBeUndefined();
  });
  it('keeps acOther through a load, and drops a bad value', () => {
    const sp = { id: 'h', name: 'Haste', lvl: 3, range: '30 feet', acFx: 'bonus', acVal: 2 };
    expect(migrate({ spells: [{ ...sp, acOther: true }] }).spells[0].acOther).toBe(true);
    expect(migrate({ spells: [{ ...sp, acOther: 'yes' }] }).spells[0]).not.toHaveProperty('acOther');
  });
  it('keeps a sense\'s plus flag and a skill grant\'s orExpert through a save', () => {
    const c = migrate({ ...sampleCharacter(), senses: [{ id: 's', name: 'Darkvision', range: '60 ft', plus: true }],
      grants: [{ id: 'g', kind: 'prof', name: 'Keen', cat: 'skill', target: 'arcana', orExpert: true, from: 'feature:f10' }] });
    expect(c.senses[0].plus).toBe(true);
    expect(c.grants[0].orExpert).toBe(true);
  });
  const raw = (attacks: unknown[]) => ({ ...JSON.parse(JSON.stringify(sampleCharacter())), attacks });
  it('keeps typed attacks with their numbers, a valid timing and section', () => {
    const bow = { id: 'b', name: 'Longbow', hit: '+9', dmg: '1d8 +4 Piercing', info: '150/600 ft', mastery: 'Slow' };
    const out = migrate(raw([bow, { ...bow, id: 'x', econ: 'sometimes', group: 'x' }, { ...bow, id: 'y', econ: 'bonus', group: 'weapon' }]));
    expect(out.attacks[0]).toEqual(bow);
    expect(out.attacks[1]).toEqual({ ...bow, id: 'x' });
    expect(out.attacks[2]).toEqual({ ...bow, id: 'y', econ: 'bonus', group: 'weapon' });
    expect(migrate(JSON.parse(JSON.stringify(out))).attacks).toEqual(out.attacks);
  });
  describe('AC fields on load', () => {
    const old = (p: Record<string, unknown>) => ({ ...blankCharacter(), ...p }) as Record<string, unknown>;
    it('drops damaged or stale AC state', () => {
      const c = migrate(old({
        spells: [{ id: 'sh', name: 'Shield', lvl: 1, time: 'Reaction', range: 'Self', source: 'W', acFx: 'bonus', acVal: 5 },
          { id: 'sf', name: 'Shield of Faith', lvl: 1, time: 'Bonus Action', range: '60 ft', source: 'C', c: true, acFx: 'bonus', acVal: 2 },
          { id: 'bl', name: 'Bless', lvl: 1, time: 'Action', range: '30 ft', source: 'C' }],
        acOn: ['sh', 'sf', 'bl', 'gone', 7], acUnarm: 'wizard', acMods: [{ id: 'm', name: 'Ok', val: 1 }, { id: 'x', name: 'Bad', val: 'two' }]
      }));
      expect(c.acOn).toEqual(['sh']);
      expect(c.acUnarm).toBe('none');
      expect(c.acMods.map((m) => m.name)).toEqual(['Ok']);
    });
    it('drops damaged AC fields on items and spells', () => {
      const c = migrate(old({
        inv: [{ id: 'a', name: 'A', qty: 1, eq: true, armor: 'light', acBase: '12' },
          { id: 'b', name: 'B', qty: 1, eq: true, armor: 'robe', acBase: 11 },
          { id: 'c', name: 'C', qty: 1, eq: true, armor: 'heavy', acBase: 16, acBonus: '1' },
          { id: 'd', name: 'D', qty: 1, eq: false, acBonus: '1' }],
        spells: [{ id: 'x', name: 'X', lvl: 1, time: 'Action', range: 'Self', source: 'W', acFx: 'bonus', acVal: 'x' },
          { id: 'y', name: 'Y', lvl: 1, time: 'Action', range: 'Self', source: 'W', acFx: 'wall', acVal: 3 }]
      }));
      expect(c.inv.map((i) => [i.armor, i.acBase, i.acBonus])).toEqual([
        [undefined, undefined, undefined], [undefined, undefined, undefined], ['heavy', 16, undefined], [undefined, undefined, undefined]
      ]);
      expect(c.spells.map((s) => [s.acFx, s.acVal])).toEqual([[undefined, undefined], [undefined, undefined]]);
      expect(Number.isFinite(armorClass(c).total)).toBe(true);
    });
  });
});

describe('containers on load', () => {
  const bagOf = (p: Partial<Item> = {}): Item => ({ id: 'bag', name: 'Bag of Holding', qty: 1, eq: false, wt: 5, xdim: true, cap: 500, cat: 'magic', ...p });
  const save = (inv: unknown[], p: Partial<Character> = {}) =>
    JSON.parse(JSON.stringify({ ...blankCharacter(), inv, ...p })) as Record<string, unknown>;
  const inOf = (c: Character, id: string) => c.inv.find((i) => i.id === id)!.in;

  it('clears an in that names a missing item, a non-container, itself, or is set on a container', () => {
    const c = migrate(save([
      bagOf(), bagOf({ id: 'bag2', in: 'bag' }),
      { id: 'a', name: 'A', qty: 1, eq: false, in: 'gone' }, { id: 'b', name: 'B', qty: 1, eq: false, in: 'a' },
      { id: 'self', name: 'S', qty: 1, eq: false, in: 'self' }, { id: 'ok', name: 'Ok', qty: 1, eq: false, wt: 3, in: 'bag' }
    ]));
    expect(c.inv.map((i) => i.id)).toEqual(['bag', 'bag2', 'a', 'b', 'self', 'ok']);
    expect(['bag2', 'a', 'b', 'self'].map((id) => inOf(c, id))).toEqual([undefined, undefined, undefined, undefined]);
    expect(inOf(c, 'ok')).toBe('bag');
    expect(carriedWeight(c)).toBe(10);
  });

  it('unequips an item inside and drops it from hands', () => {
    const sw: Item = { id: 'sw', name: 'Shortsword', qty: 1, eq: true, cat: 'weapon', wcat: 'martial', wrange: 'melee', dmg: '1d6', props: 'finesse,light', in: 'bag' };
    const c = migrate(save([bagOf(), sw], { hands: ['sw'] }));
    expect(c.inv[1]).toMatchObject({ eq: false, in: 'bag' });
    expect(c.hands).toEqual([]);
  });

  it('keeps a bag with coins, and drops bad coin and in values from the item, keeping it', () => {
    const c = migrate(save([
      bagOf({ gp: 100, sp: 3 }), bagOf({ id: 'neg', gp: -3 }), bagOf({ id: 'half', gp: 2.5 }),
      { id: 'n', name: 'N', qty: 1, eq: false, wt: 1, in: 5 }, { id: 't', name: 'T', qty: 1, eq: false, wt: 1, in: true }, { id: 'e', name: 'E', qty: 1, eq: false, wt: 1, in: '' }
    ]));
    expect(c.inv.map((i) => i.id)).toEqual(['bag', 'neg', 'half', 'n', 't', 'e']);
    expect(c.inv[0]).toMatchObject({ gp: 100, sp: 3 });
    expect('gp' in c.inv[1] || 'gp' in c.inv[2]).toBe(false);
    expect(c.inv.slice(3).every((i) => !('in' in i))).toBe(true);
    expect(carriedWeight(c)).toBe(15 + 3);
    expect(inventoryGroups(c)[0].items.map((i) => i.id)).toEqual(['bag', 'neg', 'half', 'n', 't', 'e']);
  });

  it('moves coins on an item that is not a container to the purse', () => {
    const c = migrate(save([{ id: 'r', name: 'Rope', qty: 1, eq: false, gp: 7 }]));
    expect('gp' in c.inv[0]).toBe(false);
    expect(c.coins.gp).toBe(7);
  });
});

describe('catalog fields', () => {
  const load = (inv: Record<string, unknown>[], spells: Record<string, unknown>[] = []) => migrate({ ...blankCharacter(), inv, spells });
  it('keeps a formula charges maximum and drops a die', () => {
    expect(load([{ id: 'i1', name: 'Rod', qty: 1, eq: false, count: 2, maxV: 'pb' }]).inv[0].maxV).toBe('pb');
    expect(load([{ id: 'i1', name: 'Rod', qty: 1, eq: false, count: 2, maxV: '1d6' }]).inv[0].maxV).toBeUndefined();
  });
  it('drops a bad catalog field and keeps the entry', () => {
    const c = load(
      [{ id: 'i1', name: 'Sword', qty: 1, eq: false, wcat: 'exotic', magic: '1', cat: 'vehicle', cost: 15, dmg: '1d8', base: 'dagger' },
        { id: 'i2', name: 'Venom', qty: 1, eq: false, base: 'item/dagger', magic: 1, props: 'finesse' }],
      [{ id: 's1', name: 'Bolt', lvl: 0, time: 'Action', range: '', atk: 'thrown', save: 'dex', fx: 'damage', ritual: 'no' }]
    );
    const [i1, i2] = c.inv as (Item & Record<string, unknown>)[];
    expect(i1).toMatchObject({ id: 'i1', name: 'Sword', dmg: '1d8' });
    for (const k of ['wcat', 'magic', 'cat', 'cost', 'base']) expect(i1[k]).toBeUndefined();
    expect(i2).toMatchObject({ base: 'item/dagger', magic: 1, props: 'finesse' });
    const s1 = c.spells[0] as Spell & Record<string, unknown>;
    expect(s1).toMatchObject({ name: 'Bolt', save: 'dex', fx: 'damage' });
    expect(s1.atk).toBeUndefined();
    expect(s1.ritual).toBeUndefined();
  });
});

describe('class rows and level records', () => {
  const A = { id: 'a', name: 'Ranger', clsId: 'class/ranger', sub: '', subId: '', lvl: 5, hd: 10 as const, prep: 6, castAb: 'wis' as const };
  const rec = (p: Raw = {}) => ({ n: 6, cls: 'a', added: [], picks: {}, set: [], ...p });

  it('cleans a row field by field, and drops a row that is not an entry', () => {
    expect(cleanClasses([A])).toEqual([A]);
    const [r] = cleanClasses([{ id: 'x.y', name: 'Fighter', clsId: 3, lvl: 25, hd: 7, prep: -1, castAb: 'none' }]);
    expect(r).toMatchObject({ name: 'Fighter', clsId: '', sub: '', subId: '', lvl: 1, hd: 8, prep: 0 });
    expect(r.id).not.toContain('.');
    expect(r.castAb).toBeUndefined();
    expect(cleanClasses([{ lvl: 3 }, 'x', null])).toEqual([]);
  });
  it('keeps a good record and checks its fields', () => {
    expect(cleanLevel(rec(), [A])).toEqual(rec());
    expect(cleanLevel(rec({ base: true, hp: { mode: 'fixed', val: 6, gain: 6 } }), [A])).toEqual(rec({ base: true, hp: { mode: 'fixed', val: 6, gain: 6 } }));
    expect(cleanLevel(rec({ base: false, hp: { mode: 'x', val: 6, gain: 6 } }), [A])).toEqual(rec());
    expect(cleanLevel(rec({ added: ['feature:f1', 'bogus', 3, 'grant:g'] }), [A])!.added).toEqual(['feature:f1', 'grant:g']);
    expect(cleanLevel(rec({ picks: { 'feature:f/c': ['a', 3], bad: 'x' } }), [A])!.picks).toEqual({ 'feature:f/c': ['a'] });
  });
  it('drops a record that names no row, or has no whole level', () => {
    expect(cleanLevel(rec({ cls: 'gone' }), [A])).toBeNull();
    expect(cleanLevel(rec({ n: 1.5 }), [A])).toBeNull();
    expect(cleanLevel('x', [A])).toBeNull();
  });
  it('keeps only set entries whose key and values fit', () => {
    const set = [
      { key: 'castAb', was: '', now: 'wis' },
      { key: 'slotMax', was: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0], now: [0, 3, 0, 0, 0, 0, 0, 0, 0, 0] },
      { key: 'slotMax', was: [0, 2], now: [0, 3] },
      { key: 'pactMax', was: 1, now: 2 },
      { key: 'row.a.prep', was: 'x', now: 3 },
      { key: 'row.a.lvl', was: 1, now: 2 },
      { key: 'row.gone.sub', was: '', now: 'Hunter' },
      { key: 'row.a.castAb', was: '', now: 'int' },
      { key: 'row.a.castAb', now: 'int' },
      { key: 'row.a.sub', was: '', now: 'Hunter' }
    ];
    expect(cleanLevel(rec({ set }), [A])!.set.map((x) => x.key)).toEqual(['castAb', 'slotMax', 'pactMax', 'row.a.castAb', 'row.a.sub']);
  });
});

describe('save v2: class rows from a v1 save', () => {
  const v1 = (p: Raw = {}): Raw => ({ ...structuredClone(files['./fixtures/save-v1-ilyra.json'].default), ...p });
  it.each(fixtures.filter(([, fx]) => saveVersion(fx) === 1))('%s gets one row and one base record', (_, fx) => {
    const c = migrate(fx), ch = fx.ch as Raw;
    expect(c.classes).toHaveLength(1);
    const r = c.classes[0];
    expect(r).toMatchObject({ name: ch.cls, clsId: ch.clsId, sub: ch.sub, subId: ch.subId, lvl: fx.level, hd: fx.hdDie, prep: fx.prepMax });
    if (fx.castAb !== 'none') expect(r.castAb).toBe(fx.castAb);
    expect(c.levels).toEqual([{ base: true, n: fx.level, cls: r.id, added: [], picks: {}, set: [] }]);
    expect(c.hdUsed).toEqual({ [fx.hdDie as number]: fx.hdUsed });
    expect(c.v).toBe(2);
    for (const k of ['level', 'hdDie', 'prepMax', 'slotsOnShort']) expect(c).not.toHaveProperty(k);
    for (const k of ['cls', 'sub', 'clsId', 'subId']) expect(c.ch).not.toHaveProperty(k);
  });
  it('v1 with an hdDie of 7 gets a d8 row', () => expect(migrate(v1({ hdDie: 7 })).classes[0].hd).toBe(8));
  it('v1 with an empty class at level 1 keeps a row named ""', () => {
    const c = migrate(v1({ level: 1, ch: { ...(v1().ch as Raw), cls: '', sub: '', clsId: '', subId: '' } }));
    expect(c.classes[0]).toMatchObject({ name: '', lvl: 1 });
    expect(classLine(c)).toBe('Level 1');
  });
  it('v1 Warlock with slotsOnShort moves the highest slot row to the pact pool', () => {
    const c = migrate(v1({ slotsOnShort: true, slotMax: [0, 2, 0, 2, 0, 0, 0, 0, 0, 0], slotUsed: [0, 1, 0, 1, 0, 0, 0, 0, 0, 0] }));
    expect([c.pactMax, c.pactLvl, c.pactUsed]).toEqual([2, 3, 1]);
    expect(c.slotMax[3]).toBe(0);
    expect(c.slotMax[1]).toBe(2);
    expect(c).not.toHaveProperty('slotsOnShort');
  });
  it('v1 hpUndo hdUsed number becomes {die, used}', () => {
    const snap = { hp: 1, temp: 0, ds: 0, df: 0, conds: {}, conc: null, hdUsed: 2 };
    const out = STEPS[1](v1({ hpUndo: { prev: snap, post: { ...snap, hdUsed: 3 }, text: 'x' } }));
    const u = out.hpUndo as { prev: Raw; post: Raw };
    expect(u.prev.hdUsed).toEqual({ die: 10, used: 2 });
    expect(u.post.hdUsed).toEqual({ die: 10, used: 3 });
  });
  it('conBase: v1 gets its CON modifier, v2 keeps a valid 0, v2 with a missing or 1.5 conBase gets the modifier', () => {
    const grant = { id: 'gc', kind: 'abil', name: 'CON', ab: 'con', val: '2', cap: 20, from: 'feature:f1' };
    const fx = v1({ abil: { ...(v1().abil as Raw), con: 16 }, grants: [...(v1().grants as Raw[]), grant] });
    const c = migrate(fx);
    expect(c.conBase).toBe(4);
    expect(abilityMod(c, 'con')).toBe(4);
    expect(maxHpOf(c)).toBe(fx.maxHp);
    const v2 = { ...c } as Raw;
    expect(migrate({ ...v2, conBase: 0 }).conBase).toBe(0);
    const { conBase: _, ...noBase } = v2;
    expect(migrate(noBase).conBase).toBe(4);
    expect(migrate({ ...v2, conBase: 1.5 }).conBase).toBe(4);
  });
  it('clamps the pact pool', () => {
    const v2 = migrate(v1()) as unknown as Raw;
    const c = migrate({ ...v2, pactMax: 99, pactLvl: 9, pactUsed: 50 });
    expect([c.pactMax, c.pactLvl, c.pactUsed]).toEqual([9, 5, 9]);
    const x = migrate({ ...v2, pactMax: 'x', pactLvl: 'x', pactUsed: 'x' });
    expect([x.pactMax, x.pactLvl, x.pactUsed]).toEqual([0, 0, 0]);
    expect(normalize({ ...c, pactMax: 2 }).pactUsed).toBe(2);
  });
  it('hdLast never survives a load', () => {
    const v2 = migrate(v1()) as unknown as Raw;
    expect(migrate({ ...v2, hdLast: 8 })).not.toHaveProperty('hdLast');
  });
});

describe('save v2: repair', () => {
  const base = () => migrate(files['./fixtures/save-v1-ilyra.json'].default) as unknown as Raw;
  const row = (id: string, lvl: number, p: Raw = {}) => ({ id, name: id.toUpperCase(), clsId: '', sub: '', subId: '', lvl, hd: 8, prep: 0, ...p });
  const rec = (n: number, cls: string, p: Raw = {}) => ({ n, cls, added: [], picks: {}, set: [], ...p });
  it('caps the rows at 20 levels from the last row, with a notice', () => {
    const c = migrate({ ...base(), classes: [row('a', 15), row('b', 8)], levels: [rec(15, 'a', { base: true }), rec(23, 'b', { base: true })] });
    expect(c.classes.map((r) => r.lvl)).toEqual([15, 5]);
    expect(c.restMsg?.title).toBe('Levels repaired');
  });
  it('drops a record naming no row, and a base record after a non-base one', () => {
    const c = migrate({ ...base(), classes: [row('a', 6)], levels: [rec(5, 'a', { base: true }), rec(6, 'a'), rec(6, 'a', { base: true }), rec(7, 'gone')] });
    expect(c.levels).toEqual([rec(5, 'a', { base: true }), rec(6, 'a')]);
    expect(c.restMsg).toBeNull();
  });
  it('collapses records that do not add up to one base record, with a notice', () => {
    const c = migrate({ ...base(), classes: [row('a', 5), row('b', 2)], levels: [rec(5, 'a', { base: true }), rec(6, 'a'), rec(7, 'b')] });
    expect(c.levels).toEqual([rec(7, 'a', { base: true })]);
    expect(c.restMsg?.title).toBe('Levels repaired');
  });
  it('clamps hdUsed per pool and drops other keys', () => {
    const c = migrate({ ...base(), classes: [row('a', 5)], levels: [rec(5, 'a', { base: true })], hdUsed: { 8: 9, 7: 1 } });
    expect(c.hdUsed).toEqual({ 8: 5 });
  });
  it('clears a Spell.cls naming no row', () => {
    const b = base();
    const spells = (b.spells as Raw[]).map((sp, i) => (i === 0 ? { ...sp, cls: 'gone' } : i === 1 ? { ...sp, cls: (b.classes as Raw[])[0].id } : sp));
    const c = migrate({ ...b, spells });
    expect(c.spells[0].cls).toBeUndefined();
    expect(c.spells[1].cls).toBe((b.classes as Raw[])[0].id);
  });
  it('gives a character with no rows an empty one at level 1', () => {
    const c = migrate({ ...base(), classes: [], levels: [] });
    expect(c.classes).toMatchObject([{ name: '', lvl: 1, hd: 8, prep: 0, clsId: '', sub: '', subId: '' }]);
    expect(c.levels).toEqual([rec(1, c.classes[0].id, { base: true })]);
  });
  it('keeps a class grant whose row is there, and drops one whose row is gone', () => {
    const b = base(), id = (b.classes as Raw[])[0].id as string;
    const g = { id: 'gp', kind: 'prof', name: 'Stealth', cat: 'skill', target: 'stealth' };
    const c = migrate({ ...b, grants: [{ ...g, from: 'class:' + id }, { ...g, id: 'gq', from: 'class:gone' }] });
    expect(c.grants.map((x) => x.id)).toEqual(['gp']);
    expect(isActive(c, c.grants[0])).toBe(true);
  });
  it('hdSpent never shows more spent than a shrunk pool holds', () => {
    const c = migrate(base());
    expect(hdSpent({ ...c, hdUsed: { 10: 4 }, classes: [{ ...c.classes[0], lvl: 2 }] }, 10)).toBe(2);
  });
  it('the samples keep their HP', () => {
    expect(maxHpOf(sampleCharacter())).toBe(44);
    expect(maxHpOf(druidSample())).toBe(99);
  });
});

describe('needAura and needHand on load', () => {
  const defense = { id: 'd', kind: 'imm' as const, name: 'Frightened', from: 'feature:f' };
  it('drops a value that is not a feature id or a boolean', () => {
    const m = migrate({ ...blankCharacter(), defenses: [{ ...defense, needAura: 5, needHand: 'yes' }] as never });
    expect(m.defenses[0]).not.toHaveProperty('needAura');
    expect(m.defenses[0]).not.toHaveProperty('needHand');
  });
  it('drops needAura from an entry with no source, which no longer rides on the aura', () => {
    const { from: _f, ...hand } = defense;
    expect(migrate({ ...blankCharacter(), defenses: [{ ...hand, needAura: 'feature/paladin/aura-of-protection' }] as never }).defenses[0]).not.toHaveProperty('needAura');
  });
});
