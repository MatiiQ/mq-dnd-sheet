import { describe, expect, it } from 'vitest';
import { withClass, withClasses } from '../test-fixtures';
import srdEntries from '../data/srd/index';
import { blankCharacter } from '../defaults';
import { removeRef, armorClass, spellUsable, type GrantInput } from '../logic';
import { inactiveReason, isActive } from '../links';
import type { Character } from '../types';
import { mergeCatalog } from './merge';
import type { ClassEntry, Entry, FeatureEntry, ItemEntry, SpellEntry } from './schema';
import { atLevel, addPackage, classProfInputs, addFromCatalog, featureCandidates, nestedEntries, type AddChoices, poolOptions, prereqMet } from './copy';

const cat = mergeCatalog(srdEntries, null);
const withSkills = (keys: string[], over: Partial<Character> = {}): Character => ({ ...blankCharacter(), skillProf: Object.fromEntries(keys.map((k) => [k, 1])), ...over });
// ---- Task 4: adding from the catalog ----
const A = (picks: Record<string, string[]> = {}, nested?: Record<string, AddChoices>, more: Partial<AddChoices> = {}): AddChoices =>
  ({ picks, counted: {}, links: {}, ...(nested ? { nested } : {}), ...more });
const E = (id: string) => cat.byId.get(id)!;
const miDruid = { list: ['druid'], cantrips: ['spell/guidance', 'spell/produce-flame'], spell1: ['spell/goodberry'], ab: ['wis'] };
const fromOf = (c: Character, link: string) => ({
  spells: c.spells.filter((x) => x.from === link), grants: c.grants.filter((g) => g.from === link), res: c.res.filter((r) => r.from === link),
  feats: c.feats.filter((f) => f.from === link), senses: c.senses.filter((x) => x.from === link), defenses: c.defenses.filter((x) => x.from === link)
});

describe('addFromCatalog', () => {
  it('adds Magic Initiate with its spells named after the catalog spells, twice without merging', () => {
    const c1 = addFromCatalog(blankCharacter(), cat, E('feat/magic-initiate'), A(miDruid));
    expect(c1.feats).toHaveLength(1);
    const f = c1.feats[0];
    expect(f).toMatchObject({ g: 'feat', name: 'Magic Initiate (Druid)', cid: 'feat/magic-initiate' });
    const got = fromOf(c1, 'feature:' + f.id);
    expect(got.spells.map((x) => x.name)).toEqual(['Guidance', 'Produce Flame', 'Goodberry']);
    expect(got.spells.map((x) => [x.lvl, x.cid, x.castAb])).toEqual([[0, 'spell/guidance', 'wis'], [0, 'spell/produce-flame', 'wis'], [1, 'spell/goodberry', 'wis']]);
    expect(got.spells[0].time).toBe('Action');
    expect(got.spells[0].prep).toBe(false);
    expect(got.spells[2].always).toBe(true);
    expect(got.res).toHaveLength(1);
    expect(got.res[0].casts).toBe(got.spells[2].id);
    const c2 = addFromCatalog(c1, cat, E('feat/magic-initiate'),
      A({ list: ['wizard'], cantrips: ['spell/light', 'spell/fire-bolt'], spell1: ['spell/magic-missile'], ab: ['int'] }));
    expect(c2.feats.map((x) => x.name)).toEqual(['Magic Initiate (Druid)', 'Magic Initiate (Wizard)']);
    expect(c2.spells).toHaveLength(6);
    expect(c2.res.map((r) => r.name)).toEqual(['Goodberry (free cast)', 'Magic Missile (free cast)']);
  });

  it('adds a background with its origin feat preset, and removing it removes both', () => {
    const blank = blankCharacter();
    expect(nestedEntries(cat, E('background/acolyte'), {})).toEqual([{ entry: E('feat/magic-initiate'), preset: { list: ['cleric'] } }]);
    const mi = A({ cantrips: ['spell/guidance', 'spell/sacred-flame'], spell1: ['spell/bless'], ab: ['wis'] });
    const c = addFromCatalog(blank, cat, E('background/acolyte'), A({ abil: ['o2', 'o2', 'o3'] }, { 'feat/magic-initiate': mi }, { equip: 'none' }));
    const bg = c.feats.find((f) => f.g === 'background')!;
    expect(bg).toMatchObject({ name: 'Acolyte', cid: 'background/acolyte' });
    expect(bg.desc).toContain('Equipment: ');
    expect(c.ch).toEqual(blank.ch);
    const g = fromOf(c, 'feature:' + bg.id).grants;
    expect(g.filter((x) => x.kind === 'abil').map((x) => x.ab)).toEqual(['wis', 'wis', 'cha']);
    expect(g.filter((x) => x.kind === 'prof').map((x) => x.target)).toEqual(['insight', 'religion', 'Calligrapher’s Supplies']);
    const feat = c.feats.find((f) => f.cid === 'feat/magic-initiate')!;
    expect(feat).toMatchObject({ name: 'Magic Initiate (Cleric)', from: 'feature:' + bg.id, srcKind: 'background' });
    expect(fromOf(c, 'feature:' + feat.id).spells.map((x) => x.name)).toEqual(['Guidance', 'Sacred Flame', 'Bless']);
    expect(fromOf(c, 'feature:' + feat.id).res).toHaveLength(1);
    expect(() => addFromCatalog(blank, cat, E('background/acolyte'), A({ abil: ['o2', 'o2', 'o3'] }, undefined, { equip: 'none' }))).toThrow();
    expect(() => addFromCatalog(blank, cat, E('background/acolyte'), A({}, { 'feat/magic-initiate': mi }, { equip: 'none' }))).toThrow();
    const gone = removeRef(c, { kind: 'feature', id: bg.id });
    expect(gone.feats).toEqual([]);
    expect(gone.spells).toEqual([]);
    expect(gone.grants).toEqual([]);
  });

  it('adds a subclass picked by a choice as its own feature, without its features', () => {
    const c = addFromCatalog(blankCharacter(), cat, E('feature/ranger/ranger-subclass'), A({ sub: ['subclass/ranger/hunter'] }));
    const top = c.feats.find((f) => f.cid === 'feature/ranger/ranger-subclass')!;
    expect(c.feats.find((f) => f.cid === 'subclass/ranger/hunter')).toMatchObject({ g: 'sub', name: 'Hunter', from: 'feature:' + top.id });
    expect(c.feats).toHaveLength(2);
    expect(addFromCatalog(blankCharacter(), cat, E('feature/fighter/champion/improved-critical'), A()).feats[0].g).toBe('sub');
  });

  it('points Favored Enemy’s resource at its new Hunter’s Mark', () => {
    const c = addFromCatalog(blankCharacter(), cat, E('feature/ranger/favored-enemy'), A());
    const hm = c.spells.find((x) => x.cid === 'spell/hunters-mark')!;
    expect(hm.name).toBe('Hunter’s Mark');
    expect(c.res[0].casts).toBe(hm.id);
  });

  it('adds Ring of Protection with an AC grant that needs it equipped and attuned', () => {
    const c = addFromCatalog(blankCharacter(), cat, E('item/ring-of-protection'), A());
    const ring = c.inv[0];
    expect(ring.acBonus).toBeUndefined();
    expect(c.grants.find((g) => g.kind === 'ac')).toMatchObject({ from: 'item:' + ring.id, needEq: true, needAtt: true });
    const base = armorClass(c).total;
    const worn = { ...c, inv: [{ ...ring, eq: true }] };
    expect(armorClass(worn).total).toBe(base);
    expect(armorClass({ ...worn, attuneIds: [ring.id, '', ''] }).total).toBe(base + 1);
  });

  it('fills a formula charges maximum on adding', () => {
    const rod: ItemEntry = { id: 'item/test-rod', kind: 'item', name: 'Test Rod', src: 'srd', desc: 'Invented.', cat: 'magic', charges: 'pb', recharge: 'long' };
    const c = addFromCatalog(withClass({ ...blankCharacter()}, { lvl: 5 }), cat, rod, A());
    expect(c.inv[0]).toMatchObject({ maxV: 'pb', count: 3 });
  });

  it('adds Shillelagh with its own grant, removed with it', () => {
    const c = addFromCatalog(blankCharacter(), cat, E('spell/shillelagh'), A());
    const sp = c.spells[0];
    expect(c.grants).toEqual([expect.objectContaining({ kind: 'atkAbil', from: 'spell:' + sp.id })]);
    expect(removeRef(c, { kind: 'spell', id: sp.id }).grants).toEqual([]);
  });

  it('gives a spell granted by another entry its own grants, once, also when linked', () => {
    const picks = { ...miDruid, cantrips: ['spell/shillelagh', 'spell/guidance'] };
    const c = addFromCatalog(blankCharacter(), cat, E('feat/magic-initiate'), A(picks));
    const sh = c.spells.find((x) => x.cid === 'spell/shillelagh')!;
    expect(c.grants.filter((g) => g.kind === 'atkAbil')).toEqual([expect.objectContaining({ from: 'spell:' + sh.id })]);
    // Linked to a hand-made Shillelagh with no grants: it gets one.
    const hand: Character = { ...blankCharacter(), spells: [{ id: 'h1', name: 'Shillelagh', lvl: 0, time: 'Bonus Action', range: 'Self' }] };
    const linked = addFromCatalog(hand, cat, E('feat/magic-initiate'), A(picks, undefined, { links: { 'g1-0': 'h1' } }));
    expect(linked.spells.filter((x) => x.name === 'Shillelagh')).toHaveLength(1);
    expect(linked.grants.filter((g) => g.kind === 'atkAbil')).toEqual([expect.objectContaining({ from: 'spell:h1' })]);
    // Linked to one added from the picker, which already has it: still one.
    const picked = addFromCatalog(blankCharacter(), cat, E('spell/shillelagh'), A());
    const pid = picked.spells[0].id;
    const twice = addFromCatalog(picked, cat, E('feat/magic-initiate'), A(picks, undefined, { links: { 'g1-0': pid } }));
    expect(twice.grants.filter((g) => g.kind === 'atkAbil')).toHaveLength(1);
    const feat = twice.feats[0];
    const after = removeRef(twice, { kind: 'feature', id: feat.id });
    expect(after.spells.map((x) => x.id)).toEqual([pid]);
    expect(after.grants.filter((g) => g.kind === 'atkAbil')).toHaveLength(1);
  });

  it('adds a feature above the character’s level with minLvl, its grants inactive until then', () => {
    const r5 = withClass(withSkills(['stealth', 'survival']), { lvl: 5 });
    const c = addFromCatalog(r5, cat, E('feature/ranger/expertise'), A({ exp: ['stealth', 'survival'] }));
    const f = c.feats[0];
    expect(f.minLvl).toBe(9);
    const exp = c.grants.filter((g) => g.cat === 'expertise');
    expect(exp).toHaveLength(2);
    for (const g of exp) expect(inactiveReason(c, g)).toBe('from level 9');
    for (const g of exp) expect(isActive(withClass({ ...c}, { lvl: 9 }), g)).toBe(true);
  });

  it('names a typed spell after the text, at the pool’s level', () => {
    const e: FeatureEntry = { id: 'feature/test/moon', kind: 'feature', name: 'Moon', src: 'srd', desc: 'Invented.', cls: 'test', lvl: 1,
      grants: [{ kind: 'choice', id: 'sp', name: 'Spell', pick: 1, pool: 'spell:list=nope;lvl=1' }, { id: 'g1', kind: 'spell', name: 'Moon spell', spell: '$sp' }] };
    const c = addFromCatalog(blankCharacter(), cat, e, A({ sp: ['Moonbeam Arrow'] }));
    expect(c.spells[0]).toMatchObject({ name: 'Moonbeam Arrow', lvl: 1 });
  });

  it('adds what it can when a pool offers nothing', () => {
    const c = addFromCatalog(blankCharacter(), cat, E('feature/ranger/expertise'), A());
    expect(c.feats).toHaveLength(1);
    expect(c.grants).toEqual([]);
    const d = addFromCatalog(blankCharacter(), cat, E('feature/ranger/deft-explorer'), A({ lang: ['Elvish', 'Dwarvish'] }));
    expect(d.grants.map((g) => [g.cat, g.target])).toEqual([['language', 'Elvish'], ['language', 'Dwarvish']]);
    expect(JSON.stringify(d.grants)).not.toContain('$');
  });

  const goliathAns = A({}, { 'trait/goliath/giant-ancestry': A({ anc: ['trait/goliath/stones-endurance-stone-giant'] }) });
  it('copies a new species’ Speed and size onto the sheet, never over a species already typed', () => {
    const blank = blankCharacter();
    const g = addFromCatalog(blank, cat, E('species/goliath'), goliathAns);
    expect([g.speedBase, g.size, g.ch.species]).toEqual([35, 'medium', 'Goliath']);
    const gnome = addFromCatalog(blank, cat, E('species/gnome'),
      A({}, { 'trait/gnome/gnomish-lineage': A({ lin: ['trait/gnome/rock-gnome'] }, { 'trait/gnome/rock-gnome': A({ ab: ['int'] }) }) }));
    expect(gnome.size).toBe('small');
    const human = addFromCatalog(blank, cat, E('species/human'),
      A({}, { 'trait/human/skillful': A({ c1: ['stealth'] }), 'trait/human/versatile': A({ c1: ['feat/alert'] }) }));
    expect(human.size).toBe('medium');
    const hf = human.feats.find((f) => f.g === 'species' && f.cid === 'species/human')!;
    expect(hf.desc.endsWith('Size: Small or Medium (set it in Edit details)')).toBe(true);
    expect(human.feats.some((f) => f.cid === 'feat/alert')).toBe(true);
    const typed = { ...blank, ch: { ...blank.ch, species: 'Wood Elf' }, speedBase: 30, size: 'small' as const };
    const t = addFromCatalog(typed, cat, E('species/goliath'), goliathAns);
    expect([t.speedBase, t.size, t.ch.species]).toEqual([30, 'small', 'Wood Elf']);
    expect(() => addFromCatalog(blank, cat, E('species/goliath'), A())).toThrow();
  });

  it('adds the Elf species as one feature with every trait under it, answers following the tree', () => {
    const ans = A({}, {
      'trait/elf/elven-lineage': A({ lin: ['trait/elf/wood-elf'] }, { 'trait/elf/wood-elf': A({ ab: ['wis'] }) }),
      'trait/elf/keen-senses': A({ c1: ['o2'] })
    });
    const c = addFromCatalog(blankCharacter(), cat, E('species/elf'), ans);
    expect(c.ch.species).toBe('Elf');
    const elf = c.feats.find((f) => f.cid === 'species/elf')!;
    expect(elf.g).toBe('species');
    const traits = c.feats.filter((f) => f.from === 'feature:' + elf.id);
    expect(traits.map((f) => f.cid).sort()).toEqual(['trait/elf/darkvision', 'trait/elf/elven-lineage', 'trait/elf/fey-ancestry', 'trait/elf/keen-senses', 'trait/elf/trance']);
    const lineage = c.feats.find((f) => f.cid === 'trait/elf/elven-lineage')!;
    const wood = c.feats.find((f) => f.cid === 'trait/elf/wood-elf')!;
    expect(wood.from).toBe('feature:' + lineage.id);
    expect(c.senses.map((x) => x.name)).toEqual(['Darkvision']);
    expect(c.defenses.map((x) => x.name)).toEqual(['vs Charmed']);
    expect(c.grants).toContainEqual(expect.objectContaining({ kind: 'prof', target: 'perception' }));
    const dc = c.spells.find((x) => x.cid === 'spell/druidcraft')!;
    expect(dc.castAb).toBe('wis');
    const ls = c.spells.find((x) => x.cid === 'spell/longstrider')!, pwt = c.spells.find((x) => x.cid === 'spell/pass-without-trace')!;
    expect([ls.minLvl, ls.lvl, pwt.minLvl, pwt.lvl]).toEqual([3, 1, 5, 2]);
    expect(isActive(c, ls)).toBe(false);
    const kept = addFromCatalog({ ...blankCharacter(), ch: { ...blankCharacter().ch, species: 'Wood Elf' } }, cat, E('species/elf'), ans);
    expect(kept.ch.species).toBe('Wood Elf');
    const gone = removeRef(c, { kind: 'feature', id: elf.id });
    expect([gone.feats, gone.spells, gone.senses, gone.defenses, gone.grants, gone.res]).toEqual([[], [], [], [], [], []]);
    const flat = A({}, {
      'trait/elf/elven-lineage': A({ lin: ['trait/elf/wood-elf'] }), 'trait/elf/wood-elf': A({ ab: ['wis'] }), 'trait/elf/keen-senses': A({ c1: ['o2'] })
    });
    expect(() => addFromCatalog(blankCharacter(), cat, E('species/elf'), flat)).toThrow();
  });

  it('stores counted and links answers on the grants', () => {
    const c = addFromCatalog(blankCharacter(), cat, E('background/acolyte'),
      A({ abil: ['o1', 'o2', 'o3'] }, { 'feat/magic-initiate': A({ cantrips: ['spell/guidance', 'spell/sacred-flame'], spell1: ['spell/bless'], ab: ['wis'] }) },
        { counted: { o1: true }, equip: 'none' }));
    expect(c.grants.find((g) => g.ab === 'int')!.counted).toBe(true);
    expect(c.grants.find((g) => g.ab === 'wis')!.counted).toBeUndefined();
    const own: Character = { ...blankCharacter(), res: [{ id: 'r1', name: 'Favored Enemy', count: 2, max: 2, recharge: 'long' }] };
    const fe = addFromCatalog(own, cat, E('feature/ranger/favored-enemy'), A({}, undefined, { links: { g2: 'r1' } }));
    expect(fe.res).toHaveLength(1);
    expect(fe.res[0]).toMatchObject({ id: 'r1', from: 'feature:' + fe.feats[0].id, linked: true });
  });

});

describe('effect grants through the add flow', () => {
  const blank = blankCharacter();
  it('adds a chosen weapon’s rider and a potion’s chosen resistance', () => {
    const tongue = addFromCatalog(blank, cat, cat.byId.get('item/flame-tongue')!, { picks: {}, counted: {}, links: {}, nested: {}, item: { base: 'item/longsword' } });
    expect(tongue.grants.find((g) => g.kind === 'xdmg')).toMatchObject({ dice: '2d6', dtype: 'Fire', when: 'active', needEq: true, needAtt: true });
    const potion = addFromCatalog(blank, cat, cat.byId.get('item/potion-of-resistance')!, { picks: { c1: ['o3'] }, counted: {}, links: {}, nested: {} });
    expect(potion.defenses).toMatchObject([{ kind: 'res', name: 'Fire', when: 'active' }]);
  });
  it('adds both of the Air ring’s grants from one pick', () => {
    const c = addFromCatalog(blank, cat, cat.byId.get('item/ring-of-elemental-command')!, { picks: { c1: ['o1'] }, counted: {}, links: {}, nested: {} });
    expect([c.defenses.map((d) => d.name), c.grants.filter((g) => g.kind === 'speed').map((g) => g.mode)]).toEqual([['Lightning'], ['fly']]);
  });
});

describe('granted spells with prepared tracking on', () => {
  it('Mystic Arcanum adds a spell the player can cast with prepared tracking on', () => {
    const c: Character = withClass({ ...blankCharacter(), usePrep: true }, { name: 'Warlock', lvl: 20 });
    const id = poolOptions(cat, c, 'spell:list=warlock;lvl=6|7|8|9', {})[0].value;
    const sheet = addFromCatalog(c, cat, cat.byId.get('feature/warlock/mystic-arcanum')!, { picks: { arc: [id] }, counted: {}, links: {} });
    const sp = sheet.spells.find((x) => x.cid === id)!;
    expect(spellUsable(sheet, sp)).toBe(true);
    expect(sheet.res.find((r) => r.name.includes('free cast'))!.casts).toBe(sp.id);
  });
});

describe('background starting equipment', () => {
  const bg = { id: 'background/test', kind: 'background', name: 'Test', src: 'srd', desc: '', feat: 'feat/alert', equip: 'A: Dagger, Lucky charm, Parchment; B: 50 GP', grants: [],
    equipA: 'item/dagger;Lucky charm;item/parchment*10', gpA: 15, gpB: 50 } as Entry;
  const bcat = mergeCatalog([...srdEntries, bg], null);
  const add = (equip?: 'A' | 'B' | 'none') => addFromCatalog(blankCharacter(), bcat, bg, { picks: {}, counted: {}, links: {}, ...(equip ? { equip } : {}) });
  const gp = blankCharacter().coins.gp;
  it('package A adds its items and coins', () => {
    const c = add('A');
    expect(c.inv.map((i) => [i.name, i.qty, i.cid])).toEqual([['Dagger', 1, 'item/dagger'], ['Lucky charm', 1, undefined], ['Parchment', 10, 'item/parchment']]);
    expect(c.inv.every((i) => !i.eq)).toBe(true);
    expect(c.coins.gp).toBe(gp + 15);
  });
  it('package B adds its coins only', () => {
    const c = add('B');
    expect(c.inv).toEqual([]);
    expect(c.coins.gp).toBe(gp + 50);
  });
  it('none adds neither', () => expect([add('none').inv, add('none').coins.gp]).toEqual([[], gp]));
  it('asks for it', () => expect(() => add()).toThrow('Test: choose starting equipment'));
});

describe('class levels in the catalog flow', () => {
  it('reads a pickAt table at the class level of the entry', () => {
    const mm: FeatureEntry = { id: 'feature/sorcerer/metamagic', kind: 'feature', name: 'Metamagic', src: 'srd', desc: '', cls: 'sorcerer', lvl: 2,
      grants: [{ kind: 'choice', id: 'mm', name: 'Metamagic', pick: 2, pickAt: '2:2,10:4', pool: 'other:any' }] };
    const c = withClasses(blankCharacter(), [{ clsId: 'class/sorcerer', lvl: 3 }, { clsId: 'class/fighter', lvl: 8 }]);
    expect((atLevel(c, mm).grants[0] as { pick: number }).pick).toBe(2);
  });
  it('gates a class feature above the class level, in the add flow and the picker', () => {
    const x: FeatureEntry = { id: 'feature/ranger/zz-test', kind: 'feature', name: 'Zz', src: 'srd', desc: 'Invented.', cls: 'ranger', lvl: 5, grants: [] };
    const local = mergeCatalog([...srdEntries.filter((e) => e.kind === 'class'), x], null);
    const c = withClasses(blankCharacter(), [{ name: 'Ranger', clsId: 'class/ranger', lvl: 3 }, { name: 'Rogue', clsId: 'class/rogue', lvl: 3 }]);
    expect(addFromCatalog(c, local, x, A()).feats.at(-1)!.minLvl).toBe(5);
    expect(featureCandidates(local, c, 'class').find((r) => r.entry.id === x.id)).toMatchObject({ ok: false });
  });
  it('reads an option’s lvl>= prerequisite at its class level', () => {
    const c = withClasses(blankCharacter(), [{ clsId: 'class/warlock', lvl: 2 }, { clsId: 'class/fighter', lvl: 5 }]);
    expect(prereqMet(c, 'lvl>=5', [], 'warlock').ok).toBe(false);
    expect(prereqMet(c, 'lvl>=5').ok).toBe(true);
  });
});

describe('class features and spells per row', () => {
  const c = withClasses(blankCharacter(), [{ name: 'Ranger', clsId: 'class/ranger', lvl: 3 }, { name: 'Rogue', clsId: 'class/rogue', lvl: 3 }]);
  it('lists a second class’s features for its row', () => {
    const xs = featureCandidates(cat, c, 'class', undefined, c.classes[1]);
    expect(xs.length).toBeGreaterThan(0);
    expect(xs.every((x) => x.entry.id.startsWith('feature/rogue/'))).toBe(true);
  });
  it('tags a spell with the first row whose class list has it', () => {
    const sp: SpellEntry = { ...(cat.byId.get('spell/fire-bolt') as SpellEntry), id: 'spell/zz-test', name: 'Zz', classes: 'rogue' };
    const local = mergeCatalog([...srdEntries.filter((e) => e.kind === 'class'), sp], null);
    expect(addFromCatalog(c, local, sp, A()).spells.at(-1)).toMatchObject({ srcKind: 'class', srcName: 'Rogue' });
  });
});

describe('class proficiencies and starting equipment', () => {
  const barb = () => E('class/barbarian') as ClassEntry;
  it('turns a class’s proficiencies into prof grants, all of them or the multiclass set', () => {
    const g = classProfInputs(barb(), false, { skills: ['athletics', 'survival'] });
    const key = (x: GrantInput) => x.spec.cat + ':' + x.spec.name;
    expect(g.map(key)).toEqual(['save:Strength', 'save:Constitution', 'armor:Light armor', 'armor:Medium armor', 'armor:Shields',
      'weapon:Simple weapons', 'weapon:Martial weapons', 'skill:Athletics', 'skill:Survival']);
    expect(classProfInputs(barb(), true, {}).map(key)).toEqual(['armor:Shields', 'weapon:Martial weapons']);
  });
  it('adds starting equipment A or B, or nothing', () => {
    const c = blankCharacter();
    const a = addPackage(c, cat, barb(), 'A');
    expect(a.inv.map((i) => [i.name, i.qty, i.eq])).toEqual([['Greataxe', 1, false], ['Handaxe', 4, false], ['Explorer’s Pack', 1, false]]);
    expect(a.coins.gp).toBe(15);
    const b = addPackage(c, cat, barb(), 'B');
    expect([b.inv.length, b.coins.gp]).toEqual([0, 75]);
    expect(addPackage(c, cat, barb(), 'none')).toBe(c);
    expect(() => addFromCatalog(c, cat, barb(), A())).toThrow();
  });
});
