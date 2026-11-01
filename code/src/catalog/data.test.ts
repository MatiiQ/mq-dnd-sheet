import { describe, expect, it } from 'vitest';
import { AC_SPELLS, ARMORS, SKILLS } from '../logic';
import { druidSample, sampleCharacter } from '../defaults';
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

describe('SRD spell damage (plan 7)', () => {
  const sp = (id: string) => (spells as SpellEntry[]).find((e) => e.id === id)!;
  const pick = (e: SpellEntry) => ({ fx: e.fx, dice: e.dice, dtype: e.dtype, dtypes: e.dtypes, dmgMod: e.dmgMod, save: e.save, atk: e.atk });
  it('reads damage plus the spellcasting ability modifier', () => {
    for (const [id, dice, dtype] of [['spell/spiritual-weapon', '1d8', 'Force'], ['spell/flame-blade', '3d6', 'Fire'], ['spell/arcane-sword', '4d12', 'Force'], ['spell/conjure-fey', '3d12', 'Psychic']])
      expect([id, pick(sp(id))]).toEqual([id, { fx: 'damage', dice, dtype, dtypes: undefined, dmgMod: true, save: undefined, atk: 'melee' }]);
  });
  it('reads a chosen damage type as its list of types', () => {
    const want: Record<string, [string, string]> = {
      'spell/chromatic-orb': ['3d8', 'Acid,Cold,Fire,Lightning,Poison,Thunder'], 'spell/dragons-breath': ['3d6', 'Acid,Cold,Fire,Lightning,Poison'],
      'spell/sorcerous-burst': ['1d8', 'Acid,Cold,Fire,Lightning,Poison,Psychic,Thunder'], 'spell/conjure-elemental': ['8d8', 'Lightning,Thunder,Fire,Cold'],
      'spell/forbiddance': ['5d10', 'Radiant,Necrotic'], 'spell/glyph-of-warding': ['5d8', 'Acid,Cold,Fire,Lightning,Thunder'],
      'spell/spirit-guardians': ['3d8', 'Radiant,Necrotic'], 'spell/fire-shield': ['2d8', 'Fire,Cold']
    };
    for (const [id, [dice, dtypes]] of Object.entries(want)) expect([id, sp(id).fx, sp(id).dice, sp(id).dtypes, sp(id).dtype]).toEqual([id, 'damage', dice, dtypes, undefined]);
    expect([sp('spell/fire-shield').save, sp('spell/fire-shield').atk]).toEqual([undefined, undefined]);
  });
  it('reads Delayed Blast Fireball’s base damage, and no damage from Animate Objects’ stat block', () => {
    expect(pick(sp('spell/delayed-blast-fireball'))).toMatchObject({ fx: 'damage', dice: '12d6', dtype: 'Fire', save: 'dex' });
    expect(pick(sp('spell/animate-objects'))).toMatchObject({ fx: 'other', dice: undefined, dtype: undefined });
  });
  it('gives Conjure Minor Elementals an extra-damage grant while it is on, and no damage of its own', () => {
    const e = sp('spell/conjure-minor-elementals');
    expect([e.fx, e.dice]).toEqual(['other', undefined]);
    expect(e.grants).toEqual([expect.objectContaining({ kind: 'xdmg', dice: '2d8', dtype: 'Acid/Cold/Fire/Lightning', when: 'active' })]);
  });
});

describe('SRD spells with false or missing damage and healing (plan 7, Task 5)', () => {
  const sp = (id: string) => (spells as SpellEntry[]).find((e) => e.id === id)!;
  it('give no damage to spells whose dice are a mishap, a stat block or one of several glyphs', () => {
    for (const id of ['spell/teleport', 'spell/dimension-door', 'spell/meld-into-stone', 'spell/giant-insect', 'spell/symbol'])
      expect([id, sp(id).fx, sp(id).dice, sp(id).dtype, sp(id).save]).toEqual([id, 'other', undefined, undefined, undefined]);
  });
  it('give the prismatic rays their damage types as a list, with the Dexterity save', () => {
    for (const id of ['spell/prismatic-spray', 'spell/prismatic-wall'])
      expect([id, sp(id).fx, sp(id).dice, sp(id).dtypes, sp(id).dtype, sp(id).save]).toEqual([id, 'damage', '12d6', 'Fire,Acid,Lightning,Poison,Cold', undefined, 'dex']);
  });
  it('give fixed healing as its amount, and no healing row to spells that only mention it', () => {
    expect([sp('spell/heal').fx, sp('spell/heal').dice]).toEqual(['healing', '70']);
    expect([sp('spell/mass-heal').fx, sp('spell/mass-heal').dice]).toEqual(['healing', '700']);
    expect([sp('spell/power-word-heal').fx, sp('spell/power-word-heal').dice]).toEqual(['healing', 'all HP']);
    expect([sp('spell/wish').fx, sp('spell/find-steed').fx]).toEqual(['other', 'other']);
  });
});

describe('SRD spell saves (plan 7, Task 6)', () => {
  const sp = (id: string) => (spells as SpellEntry[]).find((e) => e.id === id)!;
  it('never read a save the spell gives Advantage on as the spell’s save', () => {
    expect(sp('spell/conjure-animals').save).toBe('dex');
    for (const id of ['spell/haste', 'spell/gaseous-form', 'spell/beacon-of-hope']) expect([id, sp(id).save]).toEqual([id, undefined]);
    expect(sp('spell/beacon-of-hope').fx).toBe('other');
  });
  it('keep the saves that are the spell’s own', () => {
    expect([sp('spell/vicious-mockery').save, sp('spell/holy-aura').save]).toEqual(['wis', 'con']);
  });
});

describe('SRD spell upcast data (plan 7, Task 7)', () => {
  const sp = (id: string) => (spells as SpellEntry[]).find((e) => e.id === id)!;
  it('reads Spiritual Weapon’s upcast die and keeps the dice SRD 5.2.1 prints for the conjure spells', () => {
    expect(sp('spell/spiritual-weapon').scale).toBe('1d8/slot');
    // SRD 5.2.1 prints 1d8/1d12/1d8 where the PHB prints 2d8/2d12/2d8 (README).
    expect(['spell/conjure-elemental', 'spell/conjure-fey', 'spell/conjure-minor-elementals'].map((id) => sp(id).scale)).toEqual(['1d8/slot', '1d12/slot', '1d8/slot']);
  });
});

describe('SRD items', () => {
  const list = items as ItemEntry[];
  const by = (name: string) => list.find((e) => e.name === name);
  it('match the sheet’s armor table (ARMORS)', () => {
    const armor = list.filter((e) => e.cat === 'armor' || e.cat === 'shield').map((e) => [e.name, e.armor, e.acBase]);
    expect(armor.sort()).toEqual(ARMORS.map((a) => [...a]).sort());
  });
  it('read item charges and how they come back (plan 7, Task 8)', () => {
    const it = (id: string) => (items as ItemEntry[]).find((e) => e.id === id)!;
    const ch = (id: string) => [it(id).charges, it(id).recharge, it(id).regain];
    expect(ch('item/luck-blade')).toEqual(['1d3', 'none', undefined]);
    expect(ch('item/nine-lives-stealer')).toEqual(['1d8+1', 'none', undefined]);
    expect(ch('item/ring-of-three-wishes')).toEqual(['3', 'none', undefined]);
    expect(ch('item/cube-of-force')).toEqual(['10', 'dawn', '1d6']);
    expect(ch('item/rod-of-resurrection')).toEqual(['5', 'dawn', '1']);
    for (const id of ['item/figurine-of-wondrous-power', 'item/gem-of-brightness', 'item/scarab-of-protection', 'item/talisman-of-pure-good', 'item/talisman-of-ultimate-evil'])
      expect([id, it(id).recharge]).toEqual([id, 'none']);
    expect((items as ItemEntry[]).filter((e) => e.charges !== undefined && e.recharge === undefined).map((e) => e.id)).toEqual([]);
  });
  it('give the 22 weapons with a fixed +N bonus their magic (plan 7, Task 9)', () => {
    const want: Record<string, number> = {
      'berserker-axe': 1, 'dagger-of-venom': 1, defender: 3, 'dragon-slayer': 1, 'dwarven-thrower': 3, 'energy-bow': 1, 'giant-slayer': 1,
      'hammer-of-thunderbolts': 1, 'holy-avenger': 3, 'luck-blade': 1, 'mace-of-smiting': 1, 'nine-lives-stealer': 2, 'quarterstaff-of-the-acrobat': 2,
      'rod-of-lordly-might': 3, 'scimitar-of-speed': 2, 'staff-of-power': 2, 'staff-of-striking': 3, 'staff-of-the-magi': 2, 'staff-of-the-woodlands': 2,
      'staff-of-thunder-and-lightning': 2, 'sun-blade': 2, 'vorpal-sword': 3
    };
    const got = Object.fromEntries((items as ItemEntry[]).filter((e) => e.magic !== undefined).map((e) => [e.id.slice(5), e.magic]));
    expect(got).toEqual(want);
    expect((items as ItemEntry[]).find((e) => e.id === 'item/rod-of-lordly-might')).toMatchObject({ base: 'item/mace', dmg: '1d6' });
  });
  it('make only the staffs wielded as a magic Quarterstaff weapons', () => {
    const staffs = (items as ItemEntry[]).filter((e) => e.base === 'item/quarterstaff' && e.name.startsWith('Staff')).map((e) => e.id).sort();
    expect(staffs).toEqual(['item/staff-of-power', 'item/staff-of-striking', 'item/staff-of-the-magi', 'item/staff-of-the-woodlands', 'item/staff-of-thunder-and-lightning', 'item/staff-of-withering']);
  });
  it('narrow a base of the player’s choice to what its type line names, and mark the +1/+2/+3 picks', () => {
    const it = (id: string) => (items as ItemEntry[]).find((e) => e.id === 'item/' + id)!;
    const swords6 = 'item/glaive,item/greatsword,item/longsword,item/rapier,item/scimitar,item/shortsword';
    expect(it('frost-brand').baseOf).toBe(swords6);
    expect(it('hammer-of-thunderbolts').baseOf).toBe('item/maul,item/warhammer');
    expect(it('energy-bow').baseOf).toBe('item/longbow,item/shortbow');
    expect(it('mithral-armor').baseOf!.split(',')).not.toContain('item/hide-armor');
    expect(it('mithral-armor')).toMatchObject({ strReq: 0, stealthDis: false });
    expect(it('defender').baseOf!.split(',')).toHaveLength(28);
    expect((items as ItemEntry[]).filter((e) => e.magicPick).map((e) => e.id).sort()).toEqual(['item/ammunition-1-2-or-3', 'item/armor-1-2-or-3', 'item/shield-1-2-or-3', 'item/wand-of-the-war-mage-1-2-or-3', 'item/weapon-1-2-or-3']);
  });
  it('give the items that raise spell attack or save DC their grants (plan 7, Task 9a)', () => {
    const g = (id: string) => (items as ItemEntry[]).find((e) => e.id === 'item/' + id)!.grants ?? [];
    const of = (id: string, kind: string) => g(id).filter((x) => x.kind === kind).map((x) => [(x as GrantSpec).val, (x as GrantSpec).needEq, (x as GrantSpec).needAtt]);
    expect(of('wand-of-the-war-mage-1-2-or-3', 'spellAtk')).toEqual([['magic', true, true]]);
    expect([of('robe-of-the-archmagi', 'spellAtk'), of('robe-of-the-archmagi', 'spellDc')]).toEqual([[['2', true, true]], [['2', true, true]]]);
    for (const id of ['staff-of-power', 'staff-of-the-magi', 'staff-of-the-woodlands', 'talisman-of-pure-good', 'talisman-of-ultimate-evil'])
      expect([id, of(id, 'spellAtk')]).toEqual([id, [['2', true, true]]]);
    expect(g('staff-of-power').map((x) => x.kind)).toEqual(['ac', 'saveBonus', 'spellAtk']);
    expect(g('robe-of-the-archmagi').map((x) => x.kind).slice(0, 2)).toEqual(['ac', 'defense']);
  });
  it('give mundane containers the volume or count they hold, and the scrolls their text (plan 7, Task 10)', () => {
    const it = (id: string) => (items as ItemEntry[]).find((e) => e.id === 'item/' + id)!;
    for (const id of ['chest', 'barrel', 'bucket', 'quiver', 'crossbow-bolt-case', 'map-or-scroll-case', 'flask', 'jug', 'iron-pot', 'glass-bottle', 'vial', 'waterskin'])
      expect([id, typeof it(id).capVol, it(id).cap, it(id).xdim]).toEqual([id, 'string', undefined, undefined]);
    expect(it('glass-bottle')).toMatchObject({ capVol: '1½ pints', desc: 'A Glass Bottle holds up to 1½ pints.' });
    expect(it('quiver').capVol).toBe('20 Arrows');
    expect(it('signal-whistle').desc).not.toContain('Spell Scroll');
    for (const id of ['spell-scroll-cantrip', 'spell-scroll-level-1']) expect(it(id).desc).toMatch(/^A Spell Scroll \(Cantrip\) or Spell Scroll \(Level 1\)/);
  });
  it('read Bag of Holding’s capacity from its SRD text', () => {
    expect(by('Bag of Holding')).toMatchObject({ xdim: true, cap: 500, capVol: '64 cubic feet', wt: 5 });
  });
  it('give magic weapons and armor built on a named base item that base’s fields', () => {
    const ids = new Map(list.map((e) => [e.id, e]));
    const based = list.filter((e) => e.base?.startsWith('item/'));
    expect(based.length).toBeGreaterThan(10);
    for (const e of based) {
      const b = ids.get(e.base!)!;
      expect([e.id, b.dmg ?? b.armor]).toEqual([e.id, e.dmg ?? e.armor]);
    }
    expect(by('Armor, +1, +2, or +3')!.base).toBe('armor');
    expect(by('Weapon, +1, +2, or +3')!.base).toBe('weapon');
    expect(by('Ring of Protection')!.base).toBeUndefined();
    expect(by('Cloak of Protection')!.base).toBeUndefined();
  });
  it('end Armor of Resistance’s description at its damage type table', () => {
    const d = by('Armor of Resistance')!.desc;
    expect(d.trimEnd()).toMatch(/10 Thunder$/);
    for (const junk of ['Legs retract', 'window shutter', 'rear hatch']) expect(d).not.toContain(junk);
    expect(by('Apparatus of the Crab')).toBeDefined();
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
        if (g.kind === 'prof' && g.cat === 'skill' && g.target && !g.target.startsWith('$')) expect(SKILLS.map(([k]) => k)).toContain(g.target);
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
  it('name every Fighting Style choice after its pool', () => {
    const styles = (classes as Entry[]).filter((e) => /^feature\/[a-z]+\/fighting-style$/.test(e.id));
    expect(styles.length).toBeGreaterThanOrEqual(3);
    for (const f of styles) expect([f.id, specs(f).filter((s) => s.kind === 'choice').map((s) => s.name)]).toEqual([f.id, ['Fighting Style feat']]);
  });
  it('give each Signature Spell one free cast', () => {
    const g2 = flat((classes as Entry[]).find((e) => e.id === 'feature/wizard/signature-spells')!).find((g) => g.kind === 'resource');
    expect(g2!.max).toBe('1');
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

// The audit's pattern checks (plan 7, Task 12): a rebuild can't bring a fixed problem back. Each allow-list names the
// entries that are right by design, with the reason.
describe('SRD data patterns (plan 7)', () => {
  const sps = spells as SpellEntry[], its = items as ItemEntry[];
  const T = 'Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder';
  const ABIL = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'];
  it('give every weapon whose text gives "+N bonus to attack and damage rolls" its magic', () => {
    for (const e of its) {
      const m = /\+(\d) bonus to attack (?:rolls )?and damage rolls/.exec(e.desc);
      if (m) expect([e.id, e.magic]).toEqual([e.id, Number(m[1])]);
    }
  });
  it('never take a save the spell gives Advantage or Disadvantage on as its save', () => {
    for (const e of sps.filter((x) => x.save)) {
      const name = ABIL[['str', 'dex', 'con', 'int', 'wis', 'cha'].indexOf(e.save!)];
      const own = [...e.desc.matchAll(new RegExp(`${name} saving throw`, 'g'))].some((m) => !/(?:Advantage|Disadvantage) on (?:the )?$/.test(e.desc.slice(0, m.index)));
      expect([e.id, own]).toEqual([e.id, true]);
    }
  });
  it('give a part to a spell whose text has "NdM <Type> damage and (another) NdM <Type> damage"', () => {
    const re = new RegExp(`(\\d+d\\d+) (${T}) damage and (?:another )?(\\d+d\\d+) (${T}) damage`);
    for (const e of sps) {
      const m = re.exec(e.desc);
      if (m) expect([e.id, e.parts?.some((p) => p.dice === m[3] && p.dtype === m[4])]).toEqual([e.id, true]);
    }
  });
  it('give every spell with two damage rolls of different dice or type a part or a type list, or name it here', () => {
    const ALLOW: Record<string, string> = {
      'spell/weird': 'repeated damage each turn, text by design',
      'spell/tsunami': 'damage that drops each round, text by design',
      'spell/storm-of-vengeance': 'a different effect each round, text by design'
    };
    for (const e of sps) {
      const effect = e.desc.split(/\n(?:Using a Higher-Level Spell Slot|Cantrip Upgrade)\./)[0];
      const rolls = new Set([...effect.matchAll(new RegExp(`(\\d+d\\d+) (${T}) damage`, 'g'))].map((m) => m[1] + ' ' + m[2]));
      if (rolls.size > 1) expect([e.id, !!e.parts?.length || !!e.dtypes || e.id in ALLOW]).toEqual([e.id, true]);
    }
  });
  it('give dtypes to a spell whose text has "NdM <Type> damage (…) or NdM <Type> damage"', () => {
    const re = new RegExp(`(\\d+d\\d+) (${T}) damage \\([^)]*\\) or \\1 (${T}) damage`);
    for (const e of sps) {
      const m = re.exec(e.desc);
      if (m) expect([e.id, e.dtypes]).toEqual([e.id, `${m[2]},${m[3]}`]);
    }
  });
  it('give a base of the player’s choice a baseOf list, unless its type line allows any', () => {
    // "Weapon (Any Simple or Martial)" and "Armor (Any Light, Medium, or Heavy)": every weapon or armor is a base.
    const ANY = ['item/dragon-slayer', 'item/giant-slayer', 'item/holy-avenger', 'item/nine-lives-stealer', 'item/vicious-weapon', 'item/weapon-of-warning',
      'item/weapon-1-2-or-3', 'item/armor-1-2-or-3', 'item/armor-of-resistance', 'item/armor-of-vulnerability'];
    for (const e of its.filter((x) => x.base === 'weapon' || x.base === 'armor')) expect([e.id, !!e.baseOf || ANY.includes(e.id)]).toEqual([e.id, true]);
  });
  it('point every base and baseOf at a mundane item of the kind the entry allows', () => {
    const byId = new Map(its.map((e) => [e.id, e]));
    for (const e of its) {
      if (e.base?.startsWith('item/')) expect([e.id, ['weapon', 'armor', 'shield'].includes(byId.get(e.base)?.cat ?? '')]).toEqual([e.id, true]);
      for (const id of e.baseOf?.split(',') ?? []) expect([e.id, id, byId.get(id)?.cat]).toEqual([e.id, id, e.base]);
    }
  });
  it('make only a staff "wielded as a magic Quarterstaff" one', () => {
    for (const e of its.filter((x) => x.name.startsWith('Staff')))
      expect([e.id, e.base === 'item/quarterstaff']).toEqual([e.id, /wielded as a magic Quarterstaff/.test(e.desc)]);
  });
});

// The examples are rebuilt from defaults.ts on every open, so their copied catalog fields don't follow a rebuild
// (plan 7, Task 13). The entry's dice is the spell's dmg; an item's charges are its max (or maxV). The spell's `dice`
// is a hand-written row summary in the examples, left out.
describe('the examples match the catalog in the fields plan 7 changed', () => {
  const byId = new Map(all.map((e) => [e.id, e]));
  const SPELL_KEYS = ['fx', 'save', 'dtype', 'dtypes', 'dmgMod', 'parts'] as const;
  const ITEM_KEYS = ['magic', 'recharge', 'cap', 'capVol'] as const;
  for (const [who, c] of [['Ilyra', sampleCharacter()], ['Seren', druidSample()]] as const) {
    it(`keeps ${who}'s catalog spells and items in step`, () => {
      for (const sp of c.spells.filter((x) => x.cid)) {
        const e = byId.get(sp.cid!) as SpellEntry | undefined;
        if (!e) continue;
        const want = Object.fromEntries([...SPELL_KEYS.map((k) => [k, e[k]]), ['dmg', e.dice]]);
        const got = Object.fromEntries([...SPELL_KEYS.map((k) => [k, sp[k]]), ['dmg', sp.dmg]]);
        expect([sp.cid, got]).toEqual([sp.cid, want]);
      }
      for (const it of c.inv.filter((x) => x.cid)) {
        const e = byId.get(it.cid!) as ItemEntry | undefined;
        if (!e || e.base === 'weapon' || e.base === 'armor' || e.base === 'ammo' || e.magicPick) continue;
        const want = Object.fromEntries([...ITEM_KEYS.map((k) => [k, e[k]]), ['charges', e.charges]]);
        const got = Object.fromEntries([...ITEM_KEYS.map((k) => [k, it[k]]), ['charges', it.maxV ?? (it.max === undefined ? undefined : String(it.max))]]);
        expect([it.cid, got]).toEqual([it.cid, want]);
      }
    });
  }
});
