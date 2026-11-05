import { describe, expect, it } from 'vitest';
import { AC_SPELLS, ARMORS, SKILLS } from '../logic';
import { druidSample, sampleCharacter } from '../defaults';
import classes from '../data/srd/classes.json';
import items from '../data/srd/items.json';
import origins from '../data/srd/origins.json';
import spells from '../data/srd/spells.json';
import { validateEntry, type Entry, type BackgroundEntry, type ChoiceSpec, type ClassEntry, type FeatEntry, type FeatureEntry, type GrantSpec, type ItemEntry, type Spec, type SpellEntry } from './schema';

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
  it('hold no page, abils, skills on a background, tool or short', () => {
    expect(all.filter((e) => 'page' in e).map((e) => e.id)).toEqual([]);
    expect(all.filter((e) => e.kind === 'background' && ('abils' in e || 'skills' in e || 'tool' in e)).map((e) => e.id)).toEqual([]);
    expect(all.filter((e) => 'short' in e).map((e) => e.id)).toEqual([]);
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
  it('give every item with charges a recharge', () => {
    expect(list.filter((e) => e.charges !== undefined && e.recharge === undefined).map((e) => e.id)).toEqual([]);
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
    const TABLE: Record<string, [string, string]> = {
      'background/acolyte': ['int,wis,cha', 'insight,religion'], 'background/criminal': ['dex,con,int', 'sleight,stealth'],
      'background/sage': ['con,int,wis', 'arcana,history'], 'background/soldier': ['str,dex,con', 'athletics,intimidation']
    };
    for (const b of bgs) {
      const abil = specs(b).find((s): s is ChoiceSpec => s.kind === 'choice' && !!s.options?.every((o) => o.kind === 'abil'));
      expect([b.id, abil?.pick, abil?.options?.map((o) => o.ab).join(',')]).toEqual([b.id, 3, TABLE[b.id][0]]);
      expect(ids.has(b.feat.split(':')[0])).toBe(true);
      const skills = specs(b).filter((s): s is GrantSpec => s.kind === 'prof' && s.cat === 'skill').map((s) => s.target);
      expect([b.id, skills.join(',')]).toEqual([b.id, TABLE[b.id][1]]);
      for (const k of skills) expect(keys).toContain(k);
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
  // Blessed Healer (6) and Supreme Healing (17) change healing rolls, which no grant kind describes.
  it('give every subclass a grant at every level it gains features', () => {
    const TEXT_ONLY: Record<string, number[]> = { 'life-domain': [6, 17] };
    const feats = (classes as Entry[]).filter((e): e is FeatureEntry => e.kind === 'feature' && !!e.sub);
    const bare = feats.filter((f) => !feats.some((x) => x.sub === f.sub && x.lvl === f.lvl && specs(x).length) && !TEXT_ONLY[f.sub!]?.includes(f.lvl));
    expect(bare.map((f) => f.id)).toEqual([]);
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

describe('effect grants from the catalog audit', () => {
  const GRANTS: [string, string, string, string][] = [
    ['spell/alter-self', 'speed', 'val', 'walk'], ['spell/fly', 'speed', 'val', '60'], ['spell/freedom-of-movement', 'speed', 'val', 'walk'],
    ['spell/gaseous-form', 'speed', 'val', '10'], ['spell/gaseous-form', 'defense', 'target', 'Slashing'], ['spell/longstrider', 'speed', 'val', '10'],
    ['spell/protection-from-poison', 'defense', 'target', 'Poison'], ['spell/spider-climb', 'speed', 'val', 'walk'],
    ['spell/wind-walk', 'speed', 'val', '300'], ['spell/wind-walk', 'defense', 'target', 'Slashing'],
    ['spell/summon-dragon', 'defense', 'target', 'Chosen when cast: Acid, Cold, Fire, Lightning or Poison'],
    ['spell/divine-favor', 'xdmg', 'dice', '1d4'], ['spell/hex', 'xdmg', 'dice', '1d6'],
    ['feat/boon-of-the-night-spirit', 'defense', 'target', 'All damage except Psychic and Radiant'], ['feature/monk/superior-defense', 'defense', 'target', 'All damage except Force'],
    ['feature/warlock/gift-of-the-depths', 'speed', 'val', 'walk'], ['trait/dragonborn/draconic-flight', 'speed', 'val', 'walk'], ['trait/goliath/large-form', 'speed', 'val', '10'],
    ['item/cloak-of-the-bat', 'speed', 'val', '40'], ['item/helm-of-brilliance', 'defense', 'target', 'Fire'], ['item/shield-of-missile-attraction', 'defense', 'target', 'Ranged weapon attacks'],
    ['item/potion-of-climbing', 'speed', 'val', 'walk'], ['item/potion-of-flying', 'speed', 'val', 'walk'], ['item/potion-of-invulnerability', 'defense', 'target', 'All damage'],
    ['item/potion-of-resistance', 'defense', 'target', 'Thunder'], ['item/ring-of-elemental-command', 'defense', 'target', 'Lightning'], ['item/ring-of-elemental-command', 'speed', 'val', '60'],
    ['item/dragon-slayer', 'xdmg', 'dice', '3d6'], ['item/dwarven-thrower', 'xdmg', 'dice', '1d8'], ['item/flame-tongue', 'xdmg', 'dice', '2d6'], ['item/frost-brand', 'xdmg', 'dice', '1d6'],
    ['item/giant-slayer', 'xdmg', 'dice', '2d6'], ['item/holy-avenger', 'xdmg', 'dice', '2d10'], ['item/mace-of-disruption', 'xdmg', 'dice', '2d6'], ['item/oathbow', 'xdmg', 'dice', '3d6'],
    ['item/rod-of-lordly-might', 'xdmg', 'dice', '2d6'], ['item/staff-of-striking', 'xdmg', 'dice', '1d6'], ['item/staff-of-thunder-and-lightning', 'xdmg', 'dice', '2d6'], ['item/staff-of-withering', 'xdmg', 'dice', '2d10'],
    ['item/sun-blade', 'xdmg', 'dice', '1d8'], ['item/sword-of-wounding', 'xdmg', 'dice', '2d6'], ['item/thunderous-greatclub', 'xdmg', 'dice', '1d8'], ['item/vicious-weapon', 'xdmg', 'dice', '2d6']
  ];
  it.each(GRANTS)('gives %s its %s grant', (id, kind, f, v) => {
    expect(flat(all.find((e) => e.id === id)!).find((g) => g.kind === kind && (g as unknown as Record<string, unknown>)[f] === v), id).toBeTruthy();
  });
  it('keeps Frost Brand’s Fire Resistance beside its new damage', () => {
    expect(flat(all.find((e) => e.id === 'item/frost-brand')!).map((g) => g.kind).sort()).toEqual(['defense', 'xdmg']);
  });
});
