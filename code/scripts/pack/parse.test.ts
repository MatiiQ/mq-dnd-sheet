import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogId, PHB_TO_SRD, validateEntry } from '../../src/catalog/schema.ts';
import { parseSpells } from '../srd/spells.ts';
import { parseBackgroundFields, parseClassMd, parseEquipmentMd, parseFeatsMd, parseOriginsMd, parseSpellsMd } from './parse.ts';

const fx = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

describe('spells', () => {
  const spellMd = (title: string, effect: string, higher = '') => `### ${title}\n- **Level/School:** 5 Evocation\n- **Classes:** Wizard\n- **Casting Time:** Action\n- **Range:** 60 feet\n- **Components:** V\n- **Duration:** Instantaneous\n- **Effect:** ${effect}\n${higher && `- **Higher Levels:** ${higher}\n`}`;
  it('reads a named spell’s damage die when a per-slot line lists several', () => {
    expect(parseSpellsMd(spellMd("Bigby's Hand", 'Melee spell attack; 5d8 Force damage.', 'Fist +2d8 and Grip +2d6 per slot level above 5.'))[0].scale).toBe('2d8/slot');
  });
  it('reads the damage of a spell the table lists as damage first', () => {
    expect(parseSpellsMd(spellMd('Conjure Celestial', 'One regains 4d12 HP or takes 6d12 Radiant damage.'))[0]).toMatchObject({ fx: 'damage', dice: '6d12', dtype: 'Radiant' });
  });
  it('reads a named spell’s damage save over the first save in its text', () => {
    expect(parseSpellsMd(spellMd('Prismatic Wall', 'Con save or Blinded. 12d6 Fire damage.'))[0].save).toBe('dex');
  });
  const list = parseSpellsMd(fx('spells.md'));
  it('reads the fixed field layout', () => {
    expect(list.map((e) => e.id)).toEqual(['spell/hunters-mark', catalogId('spell', 'Acid Arrow'), 'spell/glimmer-pulse']);
    expect(list[0]).toMatchObject({ kind: 'spell', src: 'phb', lvl: 1, school: 'Divination', classes: 'ranger', time: 'Bonus Action',
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
    expect(subs).toEqual([expect.objectContaining({ id: 'subclass/lamplighter/order-of-the-wick', cls: 'lamplighter' })]);
    expect(feats[4].desc).toBe('Allies within 10 ft see in dim light.');
    for (const e of [...subs, ...feats]) expect(validateEntry(e)).toEqual([]);
  });
});

describe('source notes', () => {
  it('leaves a PHB page citation out of a feature description', () => {
    const [, , feats] = parseClassMd(fx('class.md').replace('### Level 1: Kindle (PHB p.902)\n', '### Level 1: Kindle (PHB p.902)\n##### Kindle Table (PHB p.97)\nSee page (PHB p.98-99).\n'));
    const desc = feats.find((f) => f.name === 'Kindle')!.desc;
    expect(desc).toContain('Kindle Table\nSee page.');
    expect(desc).not.toContain('PHB p.');
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
    expect(list.find((e) => e.id === 'background/wanderer')).toMatchObject({ feat: 'feat/magic-initiate:druid' });
    expect(list[0]).not.toHaveProperty('page');
    expect(parseBackgroundFields(fx('origins.md'))).toEqual([{ id: 'background/wanderer', abils: 'dex,con,wis', skills: 'stealth,animal', tool: 'cartographers-tools' }]);
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
  it('reads ammunition and focus rows, naming a focus after its table', () => {
    const list = parseEquipmentMd(fx('equipment.md'));
    expect(list.find((e) => e.id === 'item/wax-pellets')).toMatchObject({ name: 'Wax Pellets', cat: 'ammo', wt: 1.5, cost: '4 CP' });
    expect(list.find((e) => e.id === 'item/arcane-focus-wick')).toMatchObject({ name: 'Arcane Focus (Wick)', cat: 'focus', wt: 1, cost: '10 GP' });
    const sprig = list.find((e) => e.id === 'item/druidic-focus-sprig-of-tallow');
    expect(sprig).toMatchObject({ name: 'Druidic Focus (Sprig of Tallow)', cat: 'focus', cost: '1 GP' });
    expect(sprig?.wt).toBeUndefined();
    expect(list.find((e) => e.id === 'item/holy-symbol-sconce')).toMatchObject({ name: 'Holy Symbol (Sconce)', cat: 'focus', wt: 2, cost: '5 GP' });
    for (const e of list) expect(validateEntry(e)).toEqual([]);
  });
});

describe('text the parser used to drop', () => {
  const spellMd = (rest: string) => '### Summon Thing (PHB p.322)\n- **Level/School:** 2 Conjuration\n- **Classes:** Druid\n- **Casting Time:** Action\n- **Range:** 90 feet\n' +
    `- **Components:** V, S\n- **Duration:** 1 hour\n- **Effect:** A spirit manifests.\n${rest}`;
  it('keeps what follows a spell\'s Effect line, such as a stat block', () => {
    const e = parseSpellsMd(spellMd('\n  **THING SPIRIT** — Small Beast\n  - AC 11; HP 20\n  | d4 | Result |\n  |---|---|\n  | 1 | Good |\n- **Higher Levels:** More.\n'))[0];
    expect(e.desc).toBe('A spirit manifests.\nTHING SPIRIT — Small Beast\nAC 11; HP 20\nd4 — Result\n1 — Good\nHigher Levels: More.');
  });
  it('reads a feat whose benefit is on the Benefits line', () => {
    const md = '### Tough (PHB p.202)\n- **Category:** Origin\n- **Prerequisite:** —\n- **Repeatable:** No\n- **ASI:** —\n- **Benefits:** HP max increases.\n';
    expect(parseFeatsMd(md)[0].desc).toBe('HP max increases.');
  });
  it('keeps a table under a feat\'s heading, as plain lines', () => {
    const md = '### Crafter (PHB p.200)\n- **Category:** Origin\n- **Prerequisite:** —\n- **Repeatable:** No\n- **ASI:** —\n- **Benefits:**\n  - **Tool.** Three tools.\n\n#### Fast Crafting\n\n| Tools | Gear |\n|---|---|\n| Mason | Block |\n\n### Next (PHB p.201)\n';
    expect(parseFeatsMd(md).find((e) => e.name === 'Crafter')!.desc).toBe('Tool. Three tools.\nFast Crafting\nTools — Gear\nMason — Block');
  });
  const classMd = (body: string) => `# Warlock (PHB 2024)\n\n## Core Traits (PHB p.153)\n\n| Trait | Value |\n|---|---|\n| Primary Ability | Charisma |\n| Hit Point Die | d8 per level |\n| Saving Throw Proficiencies | Wisdom, Charisma |\n| Skill Proficiencies | Choose 2: Arcana, History |\n| Weapon Proficiencies | Simple weapons |\n| Tool Proficiencies | None |\n| Armor Training | Light armor |\n\n## Warlock Features Table (PHB p.154)\n\n| Level | Class Features |\n|---|---|\n| 1 | Pact |\n\n## Class Features\n\n### Level 1: Pact (PHB p.153)\n| A | B |\n|---|---|\n| 1 | Two |\n\n${body}`;
  it('writes a feature\'s table rows as plain lines', () => {
    const feats = parseClassMd(classMd(''))[2];
    expect(feats.find((f) => f.name === 'Pact')!.desc).toBe('A — B\n1 — Two');
  });
  it('reads Eldritch Invocations as option features with their prerequisites', () => {
    const md = classMd('## Eldritch Invocation Options (PHB p.155-157)\n\n| Invocation | Prerequisite | Repeatable | Effect |\n|---|---|---|---|\n| Armor of Shadows | None | No | Cast Mage Armor. |\n| Devouring Blade | Level 12+ Warlock; Thirsting Blade invocation | No | Two attacks. |\n| Agonizing Blast | Level 2+ Warlock; a Warlock cantrip that deals damage | Yes (different eligible cantrip) | Add Cha. |\n');
    const opts = parseClassMd(md)[2].filter((f) => f.of);
    expect(opts.map((f) => f.id)).toEqual(['feature/warlock/armor-of-shadows', 'feature/warlock/devouring-blade', 'feature/warlock/agonizing-blast']);
    expect(opts[0]).toMatchObject({ of: 'invocation', cls: 'warlock', lvl: 1, desc: 'Cast Mage Armor.' });
    expect(opts[0].prereq).toBeUndefined();
    expect(opts[1]).toMatchObject({ lvl: 12, prereq: 'lvl>=12;feature=thirsting-blade', desc: 'Prerequisite: Level 12+ Warlock; Thirsting Blade invocation\nTwo attacks.' });
    expect(opts[2]).toMatchObject({ repeat: true, prereq: 'lvl>=2' });
  });
  it('reads Maneuvers into their subclass and joins the trigger to the effect', () => {
    const md = classMd('## Subclasses (PHB p.1)\n\n### Battle Master (PHB p.93)\nTheme.\n\n#### Level 3: Combat Superiority (PHB p.93)\nDice.\n\n#### Maneuver Options (PHB p.94-95)\nSD means die.\n\n| Maneuver | Trigger / Action | Effect |\n|---|---|---|\n| Ambush | On a Stealth check | Add the die. |\n');
    const m = parseClassMd(md)[2].find((f) => f.of)!;
    expect(m).toMatchObject({ id: 'feature/warlock/battle-master/ambush', of: 'maneuver', sub: 'battle-master', lvl: 3, desc: 'On a Stealth check: Add the die.' });
  });
  it('moves a named table onto the feature that uses it', () => {
    const md = classMd('## Subclasses (PHB p.1)\n\n### Wild Magic Sorcery (PHB p.149)\nTheme.\n\n#### Level 3: Wild Magic Surge (PHB p.149)\nRoll.\n\n#### Level 18: Tamed Surge (PHB p.149)\nChoose.\n\n#### Wild Magic Surge Table (PHB p.150-151)\n\n| d100 | Effect |\n|---|---|\n| 01-04 | Again. |\n');
    const feats = parseClassMd(md)[2];
    expect(feats.find((f) => f.name === 'Wild Magic Surge')!.desc).toBe('Roll.\nWild Magic Surge Table\nd100 — Effect\n01-04 — Again.');
    expect(feats.find((f) => f.name === 'Tamed Surge')!.desc).toBe('Choose.');
  });
});
