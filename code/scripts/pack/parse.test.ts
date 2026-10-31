import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogId, PHB_TO_SRD, validateEntry } from '../../src/catalog/schema.ts';
import { parseSpells } from '../srd/spells.ts';
import { parseClassMd, parseEquipmentMd, parseFeatsMd, parseOriginsMd, parseSpellsMd } from './parse.ts';

const fx = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

describe('spells', () => {
  const list = parseSpellsMd(fx('spells.md'));
  it('reads the fixed field layout', () => {
    expect(list.map((e) => e.id)).toEqual(['spell/hunters-mark', catalogId('spell', 'Acid Arrow'), 'spell/glimmer-pulse']);
    expect(list[0]).toMatchObject({ kind: 'spell', src: 'phb', page: 901, lvl: 1, school: 'Divination', classes: 'ranger', time: 'Bonus Action',
      range: '90 feet', comp: 'V', dur: 'Concentration, up to 1 hour', conc: true, ritual: false, fx: 'damage', dice: '1d6', dtype: 'Force' });
    expect(list[1]).toMatchObject({ atk: 'ranged', dice: '4d4', dtype: 'Acid', scale: '1d4/slot' });
    expect(list[2]).toMatchObject({ lvl: 0, school: 'Evocation', classes: 'sorcerer,wizard', time: 'Action', ritual: true, save: 'con', scale: 'cantrip' });
    expect(list[2].desc).toBe('A pulse of light washes over a 10-foot cube; each creature in it makes a Con save or takes 1d8 Radiant damage.\nCantrip Upgrade: Damage +1d8 at levels 5, 11 and 17.');
    for (const e of list) expect(validateEntry(e)).toEqual([]);
  });
  it('flags healing that adds the spellcasting ability modifier', () => {
    const md = (effect: string) => `### Mend Light (PHB p.904)\n- **Level/School:** 1 Abjuration\n- **Classes:** Cleric\n- **Casting Time:** Action\n- **Range:** Touch\n- **Components:** V\n- **Duration:** Instantaneous\n- **Effect:** ${effect}\n`;
    expect(parseSpellsMd(md('A creature you touch regains 2d8 + your spellcasting ability modifier Hit Points.'))[0]).toMatchObject({ fx: 'healing', healMod: true });
    expect(parseSpellsMd(md('A creature you touch regains 2d8 Hit Points.'))[0].healMod).toBeUndefined();
    expect(parseSpellsMd(md('Make a melee spell attack: 1d8 + your spellcasting ability modifier Force damage.'))[0].healMod).toBeUndefined();
  });
  it('reads the dice and type of a condensed damage line (the damage regex is built from the type list)', () => {
    const md = '### Spark (PHB p.904)\n- **Level/School:** 1 Evocation\n- **Classes:** Wizard\n- **Casting Time:** Action\n- **Range:** 60 feet\n' +
      '- **Components:** V\n- **Duration:** Instantaneous\n- **Effect:** One creature makes a Dex save or takes 2d10 Lightning damage.\n';
    expect(parseSpellsMd(md)[0]).toMatchObject({ fx: 'damage', dice: '2d10', dtype: 'Lightning', save: 'dex' });
  });
  it('skips a save the spell gives Advantage or Disadvantage on, and keeps one with a Disadvantage after it', () => {
    const md = (effect: string) => `### Test Spell (PHB p.904)\n- **Level/School:** 3 Transmutation\n- **Classes:** Wizard\n- **Casting Time:** Action\n- **Range:** Touch\n- **Components:** V\n- **Duration:** 1 minute\n- **Effect:** ${effect}\n`;
    expect(parseSpellsMd(md('Willing creature: Speed doubled, +2 bonus to AC, Advantage on Dex saving throws.'))[0].save).toBeUndefined();
    expect(parseSpellsMd(md('A misty cloud: Resistance to damage; Advantage on Str, Dex, and Con saving throws.'))[0].save).toBeUndefined();
    expect(parseSpellsMd(md('You have Advantage on Strength saving throws near them. Each creature in the area makes a Dex save or takes 3d10 Slashing damage.'))[0].save).toBe('dex');
    expect(parseSpellsMd(md('A creature makes a Wis save or takes 1d6 Psychic damage and has Disadvantage on its next attack roll.'))[0].save).toBe('wis');
  });
  it('reads a ritual marked on the level line', () => {
    const [bell] = parseSpellsMd('### Quiet Bell (PHB p.904)\n- **Level/School:** 1 Divination (Ritual)\n- **Classes:** Wizard\n- **Casting Time:** 1 minute\n' +
      '- **Range:** Self\n- **Components:** V\n- **Duration:** 1 hour\n- **Effect:** A soundless chime rings.\n');
    expect(bell).toMatchObject({ lvl: 1, school: 'Divination', time: '1 minute', ritual: true });
  });
  it('gives an entry both builders read the same id, curly or straight apostrophe, renamed or not', () => {
    const srd = parseSpells(readFileSync(new URL('../srd/fixtures/spells.txt', import.meta.url), 'utf8'));
    expect(list[0].id).toBe(srd.find((e) => e.name === 'Hunter’s Mark')!.id);
    expect(PHB_TO_SRD["Melf's Acid Arrow"]).toBe('Acid Arrow');
    expect(list[1].id).toBe('spell/acid-arrow');
  });
});

describe('a class with a subclass', () => {
  const [cls, subs, feats] = parseClassMd(fx('class.md'));
  it('reads core traits and the features table', () => {
    expect(cls).toMatchObject({ id: 'class/lamplighter', src: 'phb', hd: 8, saves: 'wis,cha', castAb: 'wis', weapons: 'Simple weapons', armor: 'Light armor',
      skills: { pick: 2, pool: 'skill:insight|medicine|religion' }, cantrips: '1:2,4:3,10:4' });
    expect(cls.slots![4]).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
    expect(validateEntry(cls)).toEqual([]);
  });
  it('reads features with repeats, and the subclass with its features', () => {
    expect(feats.map((f) => [f.id, f.lvl, f.again])).toEqual([
      ['feature/lamplighter/spellcasting', 1, undefined], ['feature/lamplighter/kindle', 1, '5'], ['feature/lamplighter/ability-score-improvement', 4, '8,12,16'],
      ['feature/lamplighter/order-of-the-wick/steady-flame', 3, undefined], ['feature/lamplighter/order-of-the-wick/shared-glow', 3, undefined]]);
    expect(subs).toEqual([expect.objectContaining({ id: 'subclass/lamplighter/order-of-the-wick', cls: 'lamplighter', page: 904 })]);
    expect(feats[4].desc).toBe('Allies within 10 ft see in dim light.');
    for (const e of [...subs, ...feats]) expect(validateEntry(e)).toEqual([]);
  });
});

describe('feats, backgrounds, species, equipment', () => {
  it('reads feats with their prerequisites', () => {
    const [ward, bearer] = parseFeatsMd(fx('feats.md'));
    expect(ward).toMatchObject({ id: 'feat/lantern-ward', cat: 'general', prereq: 'lvl>=4;int|wis|cha>=13', grants: [] });
    expect(ward.desc).toBe('ASI: Int, Wis, or Cha +1\nGlow. You shed a little light.\nWard. Advantage on saves against darkness.');
    expect(bearer).toMatchObject({ prereq: 'lvl>=4;feature=spellcasting|pact-magic', repeat: true });
    for (const e of [ward, bearer]) expect(validateEntry(e)).toEqual([]);
  });
  it('reads a background and a species with a lineage table', () => {
    const list = parseOriginsMd(fx('origins.md'));
    expect(list.find((e) => e.id === 'background/wanderer')).toMatchObject({ abils: 'dex,con,wis', feat: 'feat/magic-initiate:druid', skills: 'stealth,animal',
      tool: 'cartographers-tools' });
    expect(list.find((e) => e.id === 'species/mothfolk')).toMatchObject({ sizes: 'small,medium', speed: 30 });
    expect(list.filter((e) => e.kind === 'trait').map((e) => [e.id, 'lvl' in e && e.lvl, 'of' in e ? e.of : undefined])).toEqual([
      ['trait/mothfolk/darkvision', 1, undefined], ['trait/mothfolk/moth-lineage', 1, undefined], ['trait/mothfolk/dusty-wings', 3, undefined],
      ['trait/mothfolk/luna', 1, 'trait/mothfolk/moth-lineage']]);
    expect(list.find((e) => e.id === 'trait/mothfolk/dusty-wings')!.desc).toBe('Bonus Action: glide for 1 minute. 1/LR.\nWhile gliding, you fall slowly.');
    for (const e of list) expect(validateEntry(e)).toEqual([]);
  });
  it('reads weapons and gear rows', () => {
    const list = parseEquipmentMd(fx('equipment.md'));
    expect(list.find((e) => e.name === 'Candle Pike')).toMatchObject({ cat: 'weapon', wcat: 'martial', wrange: 'melee', dmg: '1d10', props: 'heavy,reach,two-handed', mastery: 'push', wt: 18, cost: '5 GP' });
    expect(list.find((e) => e.name === 'Wick Sling')).toMatchObject({ ammo: '30/120;bullet' });
    expect(list.find((e) => e.name === 'Taper Knife')).toMatchObject({ thrown: '20/60' });
    expect(list.find((e) => e.id === 'item/lamplighters-clothes')).toMatchObject({ name: 'Lamplighter’s Clothes', cat: 'gear', wt: 4, cost: '2 GP', desc: 'Smells of wax.' });
    expect(list.find((e) => e.name === 'Ammunition')).toBeUndefined(); // a row that only points to its own table
    for (const e of list) expect(validateEntry(e)).toEqual([]);
  });
});
