import type { Character } from './types';

// Sample character: Ilyra Moonbrook, Wood Elf Ranger 5 (Hunter).
export function sampleCharacter(): Character {
  return {
    ch: { name: 'Ilyra Moonbrook', species: 'Wood Elf', cls: 'Ranger', sub: 'Hunter', align: 'Neutral Good', clsId: 'class/ranger', subId: 'subclass/ranger/hunter' },
    speeds: { climb: 0, swim: 0, fly: 0, burrow: 0 }, speedOpen: false,
    acOpen: false, acUnarm: 'none', acOn: [], acMods: [],
    size: 'medium', carryUp: false,
    level: 5, speedBase: 35, initMisc: 0, hdDie: 10, castAb: 'wis',
    abil: { str: 12, dex: 18, con: 14, int: 10, wis: 14, cha: 8 }, abilAdj: {},
    saveProf: { str: true, dex: true },
    skillProf: { stealth: 1, nature: 1, animal: 1, insight: 1, perception: 1, survival: 2 },
    hp: 31, maxHp: 44, origHp: 44, origOn: false, temp: 0, amount: 5, insp: 1, pills: ['hp', 'ac', 'res:favored'], tab: 'actions', prepMax: 6, spellFilter: 'all', spellSort: 'az', usePrep: true,
    hdUsed: 1, ds: 0, df: 0, exh: 0, conds: {}, conc: null, hpUndo: null, concCheck: null, restMsg: null,
    slotMax: [0, 4, 2, 0, 0, 0, 0, 0, 0, 0], slotUsed: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    defenses: [{ id: 'd1', kind: 'adv', name: 'vs Charmed', from: 'feature:f12', srcKind: 'species' }], // Fey Ancestry (PHB p.190)
    senses: [{ id: 'se1', name: 'Darkvision', range: '60 ft', from: 'feature:f11', srcKind: 'species' }],
    res: [
      // Favored Enemy: 2 free casts of Hunter’s Mark, 3 from level 5, 4 from 9, 5 from 13, 6 from 17 (PHB p.119).
      { id: 'favored', name: 'Favored Enemy', note: 'Cast Hunter’s Mark without a slot', count: 2, maxV: '1:2,5:3,9:4,13:5,17:6', recharge: 'long', casts: 'sp4', from: 'feature:f2', srcKind: 'class' },
      // Free casts, once per Long Rest each: Magic Initiate's level 1 spell, Elven Lineage's spells from levels 3 and 5.
      { id: 'fc8', name: 'Goodberry', note: 'Free cast', count: 1, max: 1, recharge: 'long', casts: 'sp8', from: 'feature:f9', srcKind: 'feat' },
      { id: 'fc9', name: 'Longstrider', note: 'Free cast', count: 1, max: 1, recharge: 'long', casts: 'sp9', from: 'feature:f15', srcKind: 'species', minLvl: 3 },
      { id: 'fc12', name: 'Pass without Trace', note: 'Free cast', count: 1, max: 1, recharge: 'long', casts: 'sp12', from: 'feature:f15', srcKind: 'species', minLvl: 5 }
    ],
    // Weapons, Unarmed Strike, Hunter's Mark and Colossus Slayer are computed on the Actions tab (plan 5).
    attacks: [],
    riders: [{ id: 'r3', name: 'Critical hit', dice: 'Roll weapon dice twice' }],
    coins: { cp: 0, sp: 14, ep: 0, gp: 38, pp: 0 },
    attuneIds: ['i9', '', ''],
    notes: { appearance: '', personality: '', backstory: '', session: '' },
    inv: [
      { id: 'i1', name: 'Studded Leather Armor', qty: 1, eq: true, armor: 'light', acBase: 12, wt: 13, cid: 'item/studded-leather-armor', cat: 'armor', cost: '45 GP', sec: 's2' },
      { id: 'i2', name: 'Longbow', qty: 1, eq: true, wt: 2, cid: 'item/longbow', cat: 'weapon', cost: '50 GP', wcat: 'martial', wrange: 'ranged', dmg: '1d8', dtype: 'Piercing', props: 'ammunition,heavy,two-handed', ammo: '150/600;arrow', mastery: 'slow', sec: 's1' },
      { id: 'i3', name: 'Shortsword', qty: 1, eq: true, wt: 2, cid: 'item/shortsword', cat: 'weapon', cost: '10 GP', wcat: 'martial', wrange: 'melee', dmg: '1d6', dtype: 'Piercing', props: 'finesse,light', mastery: 'vex', sec: 's1' },
      { id: 'i4', name: 'Cartographer’s Tools', qty: 1, eq: false, wt: 6, cid: 'item/cartographers-tools', cat: 'tool', cost: '15 GP', sec: 's4' },
      { id: 'i5', name: 'Explorer’s Pack', qty: 1, eq: false, wt: 55, cid: 'item/explorers-pack', cat: 'pack', cost: '10 GP', sec: 's4' },
      { id: 'i6', name: 'Traveler’s Clothes', qty: 1, eq: false, wt: 4, cid: 'item/travelers-clothes', cat: 'gear', cost: '2 GP', sec: 's4' },
      // Arrows weigh 1 lb per 20 (PHB p.222), a Potion of Healing ½ lb (PHB p.223).
      { id: 'i7', name: 'Arrows', qty: 20, eq: false, wt: 0.05, desc: 'Tap − after each Longbow shot', cid: 'item/arrows', cat: 'ammo', cost: '1 GP', sec: 's4' },
      { id: 'i8', name: 'Potion of Healing', qty: 2, eq: false, wt: 0.5, desc: 'Bonus Action · roll 2d4 +2, then Heal', cid: 'item/potion-of-healing', cat: 'gear', cost: '50 GP', sec: 's4' },
      { id: 'i9', name: 'Cloak of Elvenkind', qty: 1, eq: true, cid: 'item/cloak-of-elvenkind', cat: 'magic', rarity: 'Uncommon', attune: true, sec: 's3' }
    ],
    spells: [
      { id: 'sp1', name: 'Druidcraft', lvl: 0, time: 'Action', range: '30 ft', dur: 'Instantaneous', comp: 'V, S', prep: true, from: 'feature:f15', srcKind: 'species', cid: 'spell/druidcraft', school: 'Transmutation', classes: 'druid', fx: 'other' },
      { id: 'sp2', name: 'Guidance', lvl: 0, time: 'Action', range: 'Touch', c: true, dice: '+1d4 to one check', dur: 'Up to 1 minute', comp: 'V, S', prep: true, from: 'feature:f9', srcKind: 'feat', cid: 'spell/guidance', school: 'Divination', classes: 'cleric,druid', fx: 'other' },
      { id: 'sp3', name: 'Produce Flame', lvl: 0, time: 'Bonus Action', range: 'Self · throw 60 ft', dice: 'd20 +5 · 2d8 Fire', dur: '10 minutes', comp: 'V, S', prep: true, from: 'feature:f9', srcKind: 'feat', cid: 'spell/produce-flame', school: 'Conjuration', classes: 'druid', scale: 'cantrip', atk: 'ranged', fx: 'damage', dmg: '1d8', dtype: 'Fire' },
      { id: 'sp4', name: 'Hunter’s Mark', lvl: 1, time: 'Bonus Action', range: '90 ft', c: true, dice: '+1d6 Force per hit', dur: 'Up to 1 hour', comp: 'V', always: true, from: 'feature:f2', srcKind: 'class', cid: 'spell/hunters-mark', school: 'Divination', classes: 'ranger', fx: 'damage', dmg: '1d6', dtype: 'Force' },
      { id: 'sp5', name: 'Cure Wounds', lvl: 1, time: 'Action', range: 'Touch', srcName: 'Ranger', dice: 'Heal 2d8 +2 · +2d8 per slot level above 1', dur: 'Instantaneous', comp: 'V, S', prep: true, cid: 'spell/cure-wounds', school: 'Abjuration', classes: 'bard,cleric,druid,paladin,ranger', scale: '2d8/slot', fx: 'healing', dmg: '2d8', healMod: true },
      { id: 'sp6', name: 'Ensnaring Strike', lvl: 1, time: 'Bonus Action', range: 'Self', srcName: 'Ranger', c: true, dice: 'STR save DC 13 · 1d6 Piercing/turn', dur: 'Up to 1 minute', comp: 'V', prep: true, cid: 'spell/ensnaring-strike', school: 'Conjuration', classes: 'ranger', scale: '1d6/slot', save: 'str', fx: 'damage', dmg: '1d6', dtype: 'Piercing' },
      // PHB-only (not in SRD 5.2.1): structured fields only, no text (PHB p.283).
      { id: 'sp7', name: 'Hail of Thorns', lvl: 1, time: 'Bonus Action', range: 'Self', srcName: 'Ranger', dice: 'DEX save DC 13 · 1d10 Piercing', dur: 'Instantaneous', comp: 'V', prep: true, save: 'dex', fx: 'damage', dmg: '1d10', dtype: 'Piercing', scale: '1d10/slot' },
      { id: 'sp8', name: 'Goodberry', lvl: 1, time: 'Action', range: 'Self', dice: '10 berries · heal 1 each', dur: '24 hours', comp: 'V, S, M (a sprig of mistletoe)', always: true, from: 'feature:f9', srcKind: 'feat', cid: 'spell/goodberry', school: 'Conjuration', classes: 'druid,ranger', fx: 'other' },
      { id: 'sp9', name: 'Longstrider', lvl: 1, time: 'Action', range: 'Touch', dice: '+10 ft Speed', dur: '1 hour', comp: 'V, S, M (a pinch of dirt)', always: true, from: 'feature:f15', srcKind: 'species', minLvl: 3, cid: 'spell/longstrider', school: 'Transmutation', classes: 'bard,druid,ranger,wizard', fx: 'other' },
      { id: 'sp10', name: 'Spike Growth', lvl: 2, time: 'Action', range: '150 ft', srcName: 'Ranger', c: true, dice: '2d4 Piercing per 5 ft', dur: 'Up to 10 minutes', comp: 'V, S, M (seven thorns)', prep: true, cid: 'spell/spike-growth', school: 'Transmutation', classes: 'druid,ranger', fx: 'damage', dmg: '2d4', dtype: 'Piercing' },
      { id: 'sp11', name: 'Aid', lvl: 2, time: 'Action', range: '30 ft', srcName: 'Ranger', dice: '+5 HP max, 3 creatures', dur: '8 hours', comp: 'V, S, M (a strip of white cloth)', prep: true, cid: 'spell/aid', school: 'Abjuration', classes: 'bard,cleric,druid,paladin,ranger', fx: 'other' },
      { id: 'sp12', name: 'Pass without Trace', lvl: 2, time: 'Action', range: 'Self', c: true, dice: '+10 Stealth', dur: 'Up to 1 hour', comp: 'V, S, M (ashes from mistletoe)', always: true, from: 'feature:f15', srcKind: 'species', minLvl: 5, cid: 'spell/pass-without-trace', school: 'Abjuration', classes: 'druid,ranger', fx: 'other' }
    ],
    feats: [
      { id: 'f1', g: 'class', name: 'Spellcasting', desc: 'Wisdom-based; 6 prepared spells.', cid: 'feature/ranger/spellcasting' },
      { id: 'f2', g: 'class', name: 'Favored Enemy', desc: 'Hunter’s Mark always prepared; free casts per Long Rest.', cid: 'feature/ranger/favored-enemy' },
      { id: 'f3', g: 'class', name: 'Weapon Mastery', desc: 'Mastery properties of two weapons.', cid: 'feature/ranger/weapon-mastery' },
      { id: 'f4', g: 'class', name: 'Deft Explorer', desc: 'Expertise in Survival; two extra languages.', cid: 'feature/ranger/deft-explorer' },
      { id: 'f21', g: 'class', name: 'Fighting Style', desc: 'Archery feat.', cid: 'feature/ranger/fighting-style' },
      { id: 'f5', g: 'feat', name: 'Archery', desc: '+2 to attack rolls with Ranged weapons.', from: 'feature:f21', srcKind: 'class', cid: 'feat/archery' },
      { id: 'f6', g: 'class', name: 'Extra Attack', desc: 'Attack twice when you take the Attack action.', cid: 'feature/ranger/extra-attack' },
      { id: 'f7', g: 'sub', name: 'Hunter’s Lore', desc: 'Learn immunities, resistances and vulnerabilities of your marked target.', cid: 'feature/ranger/hunter/hunters-lore' },
      { id: 'f8', g: 'sub', name: 'Hunter’s Prey · Colossus Slayer', desc: '+1d8 damage once per turn to a creature missing Hit Points.', cid: 'feature/ranger/hunter/hunters-prey' },
      { id: 'f9', g: 'feat', name: 'Magic Initiate (Druid)', desc: 'Origin feat from the Guide background.', from: 'feature:f20', srcKind: 'background', cid: 'feat/magic-initiate' },
      { id: 'f10', g: 'feat', name: 'Ability Score Improvement', desc: 'Taken at level 4.', cid: 'feat/ability-score-improvement' },
      { id: 'f11', g: 'species', name: 'Darkvision', desc: '60 ft.', cid: 'trait/elf/darkvision' },
      { id: 'f12', g: 'species', name: 'Fey Ancestry', desc: 'Advantage on saves to avoid or end Charmed.', cid: 'trait/elf/fey-ancestry' },
      { id: 'f13', g: 'species', name: 'Keen Senses', desc: 'Proficiency in Insight.', cid: 'trait/elf/keen-senses' },
      { id: 'f14', g: 'species', name: 'Trance', desc: 'Finish a Long Rest in 4 hours.', cid: 'trait/elf/trance' },
      { id: 'f15', g: 'species', name: 'Elven Lineage', desc: 'Speed 35 ft; Druidcraft, Longstrider, Pass without Trace.', cid: 'trait/elf/elven-lineage' },
      { id: 'f20', g: 'background', name: 'Guide', desc: 'Stealth and Survival, Cartographer’s Tools and the Magic Initiate (Druid) feat.' }
    ],
    // Typed numbers already include the ASI and the lineage's Speed, so those grants are counted.
    grants: [
      { id: 'g1', kind: 'prof', name: 'Stealth', cat: 'skill', target: 'stealth', from: 'feature:f20', srcKind: 'background' },
      { id: 'g2', kind: 'prof', name: 'Survival', cat: 'skill', target: 'survival', from: 'feature:f20', srcKind: 'background' },
      { id: 'g3', kind: 'prof', name: 'Cartographer’s Tools', cat: 'tool', target: 'Cartographer’s Tools', from: 'feature:f20', srcKind: 'background' },
      { id: 'g4', kind: 'prof', name: 'Weapon Mastery: 2 kinds of weapons', cat: 'mastery', val: '2', from: 'feature:f3', srcKind: 'class' },
      { id: 'g5', kind: 'prof', name: 'Survival expertise', cat: 'expertise', target: 'survival', from: 'feature:f4', srcKind: 'class' },
      { id: 'g6', kind: 'atkBonus', name: 'Archery', val: '2', wrange: 'ranged', from: 'feature:f5', srcKind: 'feat' },
      { id: 'g7', kind: 'attacks', name: 'Two attacks', val: '2', from: 'feature:f6', srcKind: 'class' },
      { id: 'g8', kind: 'xdmg', name: 'Colossus Slayer', dice: '1d8', on: 'target missing HP', perTurn: true, from: 'feature:f8', srcKind: 'subclass' },
      { id: 'g9', kind: 'abil', name: 'DEX +2', ab: 'dex', val: '2', cap: 20, counted: true, from: 'feature:f10', srcKind: 'feat' },
      { id: 'g10', kind: 'prof', name: 'Insight', cat: 'skill', target: 'insight', from: 'feature:f13', srcKind: 'species' },
      { id: 'g11', kind: 'speed', name: 'Speed +5 ft', mode: 'walk', val: '5', counted: true, from: 'feature:f15', srcKind: 'species' },
      // Hunter's Mark: 1d6 Force on hits against the marked target while concentrating on it (PHB p.287), as the catalog's.
      { id: 'g-hm', kind: 'xdmg', name: 'Hunter’s Mark', dice: '1d6', dtype: 'Force', on: 'the marked target', when: 'active', from: 'spell:sp4', srcKind: 'spell' }
    ],
    // The Longbow in both hands; Weapon Mastery: Longbow (Slow) and Shortsword (Vex).
    effectsOn: [], hands: ['i2', 'i2'], mastery: ['longbow', 'shortsword'],
    sections: [{ id: 's1', name: 'Weapons' }, { id: 's2', name: 'Armour' }, { id: 's3', name: 'Magic items' }, { id: 's4', name: 'Gear' }],
    profs: [
      { id: 'p1', cat: 'armor', name: 'Light armor' }, { id: 'p2', cat: 'armor', name: 'Medium armor' }, { id: 'p3', cat: 'armor', name: 'Shields' },
      { id: 'p4', cat: 'weapon', name: 'Simple weapons' }, { id: 'p5', cat: 'weapon', name: 'Martial weapons' },
      { id: 'p6', cat: 'language', name: 'Common' }, { id: 'p7', cat: 'language', name: 'Elvish' }, { id: 'p8', cat: 'language', name: 'Sylvan' }, { id: 'p9', cat: 'language', name: 'Draconic' }
    ]
  };
}

// Sample character: Seren Vale, Aasimar Druid 12 (Circle of the Stars), a busy high-level caster for testing.
// Built by the book: standard array + Sage (+2 WIS, +1 CON), ASI at 4 and 8, War Caster at 12 (PHB p.38, p.183, p.209).
// HP uses fixed values: 8 + 11 × 5, plus CON +3 per level = 99 (PHB p.42). No attuned items.
export function druidSample(): Character {
  return {
    ch: { name: 'Seren Vale', species: 'Aasimar', cls: 'Druid', sub: 'Circle of the Stars', align: 'Neutral', clsId: 'class/druid', subId: '' },
    speeds: { climb: 0, swim: 0, fly: 0, burrow: 0 }, speedOpen: false,
    acOpen: false, acUnarm: 'none', acOn: [], acMods: [],
    size: 'medium', carryUp: false,
    level: 12, speedBase: 30, initMisc: 0, hdDie: 8, castAb: 'wis',
    abil: { str: 8, dex: 13, con: 16, int: 13, wis: 20, cha: 10 }, abilAdj: {},
    saveProf: { int: true, wis: true },
    skillProf: { arcana: 1, history: 1, medicine: 1, perception: 1 },
    hp: 71, maxHp: 99, origHp: 99, origOn: false, temp: 12, amount: 8, insp: 1, pills: ['hp', 'ac', 'res:wild'], tab: 'actions', prepMax: 16, spellFilter: 'all', spellSort: 'az', usePrep: true,
    hdUsed: 3, ds: 0, df: 0, exh: 1, conds: { Poisoned: true }, conc: { id: 'ds9', name: 'Moonbeam' },
    hpUndo: null, concCheck: null, restMsg: null,
    slotMax: [0, 4, 3, 3, 3, 2, 1, 0, 0, 0], slotUsed: [0, 2, 1, 1, 0, 1, 0, 0, 0, 0],
    // Celestial Resistance; War Caster
    defenses: [{ id: 'd1', kind: 'res', name: 'Necrotic', from: 'feature:f16', srcKind: 'species' }, { id: 'd2', kind: 'res', name: 'Radiant', from: 'feature:f16', srcKind: 'species' },
      { id: 'd3', kind: 'adv', name: 'Concentration saves', from: 'feature:f15', srcKind: 'feat' }],
    senses: [{ id: 'se1', name: 'Darkvision', range: '60 ft', from: 'feature:f17', srcKind: 'species' }],
    res: [
      // Wild Shape: 2 uses, 3 from level 6, 4 from 17; regain one on a Short Rest, all on a Long Rest (PHB p.80).
      { id: 'wild', name: 'Wild Shape', note: 'Bonus Action · beast form or Starry Form', count: 2, maxV: '2:2,6:3,17:4', recharge: 'long', regain: '1', regainOn: 'short', from: 'feature:f4', srcKind: 'class' },
      { id: 'bolt', name: 'Star Map · Guiding Bolt', note: 'Cast Guiding Bolt without a slot', count: 4, maxV: 'wis>=1', recharge: 'long', casts: 'ds11', from: 'feature:f8', srcKind: 'subclass' },
      { id: 'omen', name: 'Cosmic Omen · Weal', note: 'Reaction · add 1d6 to a D20 Test within 30 ft (re-roll even/odd each Long Rest)', count: 5, maxV: 'wis>=1', recharge: 'long', from: 'feature:f10', srcKind: 'subclass' },
      { id: 'resurge', name: 'Wild Resurgence', note: 'Spend 1 Wild Shape use for a level 1 slot', count: 1, max: 1, recharge: 'long', from: 'feature:f6', srcKind: 'class' },
      { id: 'hands', name: 'Healing Hands', note: 'Magic action · touch, heal 4d4', count: 1, max: 1, recharge: 'long', from: 'feature:f18', srcKind: 'species' },
      { id: 'reveal', name: 'Celestial Revelation', note: 'Bonus Action · 1 minute · wings, radiance or shroud', count: 0, max: 1, recharge: 'long', from: 'feature:f20', srcKind: 'species' },
      { id: 'fc12', name: 'Shield', note: 'Free cast', count: 0, max: 1, recharge: 'long', casts: 'ds12', from: 'feature:f12', srcKind: 'feat' }
    ],
    // Quarterstaff, spells, Unarmed Strike and Primal Strike are computed on the Actions tab (plan 5); Starry Form's
    // Archer stays typed.
    attacks: [
      { id: 'a1', name: 'Starry Form · Archer', hit: '+9', dmg: '2d8 +5 Radiant', info: 'Bonus Action in Starry Form · ranged spell attack, 60 ft', mastery: '', econ: 'bonus', group: 'other' }
    ],
    riders: [
      { id: 'r2', name: 'Celestial Revelation · once per turn', dice: '+4 Radiant or Necrotic' },
      { id: 'r3', name: 'Critical hit', dice: 'Roll damage dice twice' }
    ],
    coins: { cp: 37, sp: 52, ep: 4, gp: 368, pp: 6 },
    attuneIds: ['', '', ''],
    notes: {
      appearance: 'Tall, with silver-flecked dark skin and pale eyes that glint like starlight. Wears a deep blue robe stitched with constellations.',
      personality: 'Patient and curious. Reads omens in everything and quotes old star charts at the worst moments.',
      backstory: 'Raised in a mountain observatory library, Seren left to find the grove where the stars of her map are said to touch the earth.',
      session: 'Fought the blight-wolves at the ruined observatory. Still poisoned from the hag’s bite. Moonbeam is up on the wolf den.'
    },
    inv: [
      { id: 'i1', name: 'Leather Armor', qty: 1, eq: true, armor: 'light', acBase: 11, wt: 10, cid: 'item/leather-armor', cat: 'armor', cost: '10 GP', sec: 's2' },
      { id: 'i2', name: 'Shield', qty: 1, eq: true, armor: 'shield', acBase: 2, wt: 6, cid: 'item/shield', cat: 'shield', cost: '10 GP', sec: 's2' },
      { id: 'i3', name: 'Quarterstaff', qty: 1, eq: true, wt: 4, cid: 'item/quarterstaff', cat: 'weapon', cost: '2 SP', wcat: 'simple', wrange: 'melee', dmg: '1d6', dtype: 'Bludgeoning', props: 'versatile', vers: '1d8', mastery: 'topple', sec: 's1' },
      { id: 'i4', name: 'Star Map (crystal engraved with starry patterns)', qty: 1, eq: true, sec: 's4' },
      { id: 'i5', name: 'Sickle', qty: 1, eq: false, wt: 2, cid: 'item/sickle', cat: 'weapon', cost: '1 GP', wcat: 'simple', wrange: 'melee', dmg: '1d4', dtype: 'Slashing', props: 'light', mastery: 'nick', sec: 's1' },
      { id: 'i6', name: 'Herbalism Kit', qty: 1, eq: false, wt: 3, cid: 'item/herbalism-kit', cat: 'tool', cost: '5 GP', sec: 's4' },
      { id: 'i7', name: 'Calligrapher’s Supplies', qty: 1, eq: false, wt: 5, cid: 'item/calligraphers-supplies', cat: 'tool', cost: '10 GP', sec: 's4' },
      { id: 'i8', name: 'Book (history)', qty: 1, eq: false, wt: 5, sec: 's4', in: 'i14' },
      { id: 'i9', name: 'Parchment', qty: 8, eq: false, cid: 'item/parchment', cat: 'gear', cost: '1 SP', sec: 's4', in: 'i14' },
      { id: 'i10', name: 'Robe', qty: 1, eq: false, wt: 4, cid: 'item/robe', cat: 'gear', cost: '1 GP', sec: 's4' },
      { id: 'i11', name: 'Explorer’s Pack', qty: 1, eq: false, wt: 55, cid: 'item/explorers-pack', cat: 'pack', cost: '10 GP', sec: 's4' },
      { id: 'i12', name: 'Potion of Healing', qty: 3, eq: false, wt: 0.5, desc: 'Bonus Action · roll 2d4 +2, then Heal', cid: 'item/potion-of-healing', cat: 'gear', cost: '50 GP', sec: 's4' },
      { id: 'i13', name: 'Diamond (300 GP)', qty: 1, eq: false, desc: 'Consumed by Revivify', sec: 's4' },
      // The SRD 5.2 Bag of Holding (catalog item/bag-of-holding), holding the Book and the Parchment and 50 GP of her coins.
      { id: 'i14', name: 'Bag of Holding', qty: 1, eq: false, wt: 5, desc: 'Holds up to 500 lb; its contents and coins don’t count toward your load', cid: 'item/bag-of-holding', cat: 'magic', rarity: 'Uncommon', xdim: true, cap: 500, capVol: '64 cubic feet', sec: 's3', gp: 50 }
    ],
    // Cantrips carry prep so migrate() leaves them as they are.
    spells: [
      { id: 'ds1', name: 'Druidcraft', lvl: 0, time: 'Action', range: '30 ft', srcName: 'Druid', dur: 'Instantaneous', comp: 'V, S', prep: true, school: 'Transmutation', classes: 'druid', fx: 'other', cid: 'spell/druidcraft' },
      { id: 'ds2', name: 'Produce Flame', lvl: 0, time: 'Bonus Action', range: 'Self · throw 60 ft', srcName: 'Druid', dice: 'd20 +9 · 3d8 Fire', dur: '10 minutes', comp: 'V, S', prep: true, school: 'Conjuration', classes: 'druid', scale: 'cantrip', atk: 'ranged', fx: 'damage', dmg: '1d8', dtype: 'Fire', cid: 'spell/produce-flame' },
      { id: 'ds3', name: 'Shillelagh', lvl: 0, time: 'Bonus Action', range: 'Self', srcName: 'Druid', dice: 'd20 +9 · 1d12 +5', dur: '1 minute', comp: 'V, S, M (mistletoe)', prep: true, school: 'Transmutation', classes: 'druid', scale: 'cantrip', fx: 'other', cid: 'spell/shillelagh' },
      { id: 'ds4', name: 'Starry Wisp', lvl: 0, time: 'Action', range: '60 ft', srcName: 'Druid', dice: 'd20 +9 · 3d8 Radiant', dur: 'Instantaneous', comp: 'V, S', prep: true, school: 'Evocation', classes: 'bard,druid', scale: 'cantrip', atk: 'ranged', fx: 'damage', dmg: '1d8', dtype: 'Radiant', cid: 'spell/starry-wisp' },
      // PHB-only (not in SRD 5.2.1): structured fields only, no text (PHB p.333).
      { id: 'ds5', name: 'Thorn Whip', lvl: 0, time: 'Action', range: '30 ft', dice: 'd20 +9 · 3d6 Piercing', dur: 'Instantaneous', comp: 'V, S, M (the stem of a thorny plant)', prep: true, from: 'feature:f3', srcKind: 'class', atk: 'melee', fx: 'damage', dmg: '1d6', dtype: 'Piercing', scale: 'cantrip' },
      { id: 'ds6', name: 'Guidance', lvl: 0, time: 'Action', range: 'Touch', c: true, dice: '+1d4 to one skill', dur: 'Up to 1 minute', comp: 'V, S', prep: true, from: 'feature:f8', srcKind: 'subclass', cid: 'spell/guidance', school: 'Divination', classes: 'cleric,druid', fx: 'other' },
      { id: 'ds7', name: 'Light', lvl: 0, time: 'Action', range: 'Touch', dur: '1 hour', comp: 'V, M (a firefly or phosphorescent moss)', prep: true, castAb: 'cha', from: 'feature:f19', srcKind: 'species', cid: 'spell/light', school: 'Evocation', classes: 'bard,cleric,sorcerer,wizard', fx: 'other' },
      { id: 'ds8', name: 'Fire Bolt', lvl: 0, time: 'Action', range: '120 ft', dice: 'd20 +9 · 3d10 Fire', dur: 'Instantaneous', comp: 'V, S', prep: true, from: 'feature:f12', srcKind: 'feat', cid: 'spell/fire-bolt', school: 'Evocation', classes: 'sorcerer,wizard', scale: 'cantrip', atk: 'ranged', fx: 'damage', dmg: '1d10', dtype: 'Fire' },
      { id: 'ds10', name: 'Mage Hand', lvl: 0, time: 'Action', range: '30 ft', dur: '1 minute', comp: 'V, S', prep: true, from: 'feature:f12', srcKind: 'feat', cid: 'spell/mage-hand', school: 'Conjuration', classes: 'bard,sorcerer,warlock,wizard', fx: 'other' },
      { id: 'ds11', name: 'Guiding Bolt', lvl: 1, time: 'Action', range: '120 ft', dice: 'd20 +9 · 4d6 Radiant · +1d6 per slot level above 1', dur: '1 round', comp: 'V, S', always: true, from: 'feature:f8', srcKind: 'subclass', cid: 'spell/guiding-bolt', school: 'Evocation', classes: 'cleric', scale: '1d6/slot', atk: 'ranged', fx: 'damage', dmg: '4d6', dtype: 'Radiant' },
      { id: 'ds12', name: 'Shield', lvl: 1, time: 'Reaction', range: 'Self', dice: '+5 AC', dur: '1 round', comp: 'V, S', always: true, acFx: 'bonus', acVal: 5, from: 'feature:f12', srcKind: 'feat', cid: 'spell/shield', school: 'Abjuration', classes: 'sorcerer,wizard', fx: 'other' },
      { id: 'ds13', name: 'Speak with Animals', lvl: 1, time: 'Action or Ritual', range: 'Self', dur: '10 minutes', comp: 'V, S', always: true, from: 'feature:f2', srcKind: 'class', cid: 'spell/speak-with-animals', school: 'Divination', classes: 'bard,druid,ranger,warlock', fx: 'other' },
      { id: 'ds14', name: 'Cure Wounds', lvl: 1, time: 'Action', range: 'Touch', srcName: 'Druid', dice: 'Heal 2d8 +5 · +2d8 per slot level above 1', dur: 'Instantaneous', comp: 'V, S', prep: true, school: 'Abjuration', classes: 'bard,cleric,druid,paladin,ranger', scale: '2d8/slot', fx: 'healing', dmg: '2d8', cid: 'spell/cure-wounds', healMod: true },
      { id: 'ds15', name: 'Healing Word', lvl: 1, time: 'Bonus Action', range: '60 ft', srcName: 'Druid', dice: 'Heal 2d4 +5 · +2d4 per slot level above 1', dur: 'Instantaneous', comp: 'V', prep: true, school: 'Abjuration', classes: 'bard,cleric,druid', scale: '2d4/slot', fx: 'healing', dmg: '2d4', cid: 'spell/healing-word', healMod: true },
      { id: 'ds16', name: 'Faerie Fire', lvl: 1, time: 'Action', range: '60 ft', srcName: 'Druid', c: true, dice: 'DEX save DC 17 · attacks have Advantage', dur: 'Up to 1 minute', comp: 'V', prep: true, school: 'Evocation', classes: 'bard,druid', save: 'dex', fx: 'other', cid: 'spell/faerie-fire' },
      { id: 'ds17', name: 'Entangle', lvl: 1, time: 'Action', range: '90 ft', srcName: 'Druid', c: true, dice: 'STR save DC 17 · Restrained', dur: 'Up to 1 minute', comp: 'V, S', prep: true, school: 'Conjuration', classes: 'druid,ranger', save: 'str', fx: 'other', cid: 'spell/entangle' },
      { id: 'ds18', name: 'Detect Magic', lvl: 1, time: 'Action or Ritual', range: 'Self', srcName: 'Druid', c: true, dur: 'Up to 10 minutes', comp: 'V, S', prep: true, school: 'Divination', classes: 'bard,cleric,druid,paladin,ranger,sorcerer,warlock,wizard', fx: 'other', cid: 'spell/detect-magic' },
      { id: 'ds9', name: 'Moonbeam', lvl: 2, time: 'Action', range: '120 ft', srcName: 'Druid', c: true, dice: 'CON save DC 17 · 2d10 Radiant · +1d10 per slot level above 2', dur: 'Up to 1 minute', comp: 'V, S, M (a moonseed leaf)', prep: true, school: 'Evocation', classes: 'druid', scale: '1d10/slot', save: 'con', fx: 'damage', dmg: '2d10', dtype: 'Radiant', cid: 'spell/moonbeam' },
      { id: 'ds19', name: 'Pass without Trace', lvl: 2, time: 'Action', range: 'Self', srcName: 'Druid', c: true, dice: '+10 Stealth', dur: 'Up to 1 hour', comp: 'V, S, M (ashes from burned mistletoe)', prep: true, school: 'Abjuration', classes: 'druid,ranger', fx: 'other', cid: 'spell/pass-without-trace' },
      { id: 'ds20', name: 'Lesser Restoration', lvl: 2, time: 'Bonus Action', range: 'Touch', srcName: 'Druid', dice: 'End Blinded, Deafened, Paralyzed or Poisoned', dur: 'Instantaneous', comp: 'V, S', prep: true, school: 'Abjuration', classes: 'bard,cleric,druid,paladin,ranger', fx: 'other', cid: 'spell/lesser-restoration' },
      { id: 'ds21', name: 'Call Lightning', lvl: 3, time: 'Action', range: '120 ft', srcName: 'Druid', c: true, dice: 'DEX save DC 17 · 3d10 Lightning · +1d10 per slot level above 3', dur: 'Up to 10 minutes', comp: 'V, S', prep: true, school: 'Conjuration', classes: 'druid', scale: '1d10/slot', save: 'dex', fx: 'damage', dmg: '3d10', dtype: 'Lightning', cid: 'spell/call-lightning' },
      { id: 'ds22', name: 'Conjure Animals', lvl: 3, time: 'Action', range: '60 ft', srcName: 'Druid', c: true, dice: 'DEX save DC 17 · 3d10 Slashing · +1d10 per slot level above 3', dur: 'Up to 10 minutes', comp: 'V, S', prep: true, school: 'Conjuration', classes: 'druid,ranger', scale: '1d10/slot', save: 'str', fx: 'damage', dmg: '3d10', dtype: 'Slashing', cid: 'spell/conjure-animals' },
      { id: 'ds23', name: 'Dispel Magic', lvl: 3, time: 'Action', range: '120 ft', srcName: 'Druid', dice: 'WIS check DC 10 + spell level for level 4+', dur: 'Instantaneous', comp: 'V, S', prep: true, school: 'Abjuration', classes: 'bard,cleric,druid,paladin,ranger,sorcerer,warlock,wizard', fx: 'other', cid: 'spell/dispel-magic' },
      { id: 'ds24', name: 'Revivify', lvl: 3, time: 'Action', range: 'Touch', srcName: 'Druid', dice: 'Revive with 1 HP', dur: 'Instantaneous', comp: 'V, S, M (a diamond worth 300+ GP, consumed)', prep: true, school: 'Necromancy', classes: 'cleric,druid,paladin,ranger', fx: 'other', cid: 'spell/revivify' },
      { id: 'ds25', name: 'Polymorph', lvl: 4, time: 'Action', range: '60 ft', srcName: 'Druid', c: true, dice: 'WIS save DC 17', dur: 'Up to 1 hour', comp: 'V, S, M (a caterpillar cocoon)', prep: true, school: 'Transmutation', classes: 'bard,druid,sorcerer,wizard', save: 'wis', fx: 'other', cid: 'spell/polymorph' },
      { id: 'ds26', name: 'Freedom of Movement', lvl: 4, time: 'Action', range: 'Touch', srcName: 'Druid', dice: '+1 creature per slot level above 4', dur: '1 hour', comp: 'V, S, M (a leather strap)', prep: true, school: 'Abjuration', classes: 'bard,cleric,druid,ranger', fx: 'other', cid: 'spell/freedom-of-movement' },
      { id: 'ds27', name: 'Mass Cure Wounds', lvl: 5, time: 'Action', range: '60 ft', srcName: 'Druid', dice: 'Heal 5d8 +5, up to six creatures', dur: 'Instantaneous', comp: 'V, S', prep: true, school: 'Abjuration', classes: 'bard,cleric,druid', scale: '1d8/slot', fx: 'healing', dmg: '5d8', cid: 'spell/mass-cure-wounds', healMod: true },
      { id: 'ds28', name: 'Commune with Nature', lvl: 5, time: '1 minute or Ritual', range: 'Self', srcName: 'Druid', dur: 'Instantaneous', comp: 'V, S', prep: false, school: 'Divination', classes: 'druid,ranger', fx: 'other', cid: 'spell/commune-with-nature' },
      { id: 'ds29', name: 'Sunbeam', lvl: 6, time: 'Action', range: 'Self · 60 ft Line', srcName: 'Druid', c: true, dice: 'CON save DC 17 · 6d8 Radiant · Blinded', dur: 'Up to 1 minute', comp: 'V, S, M (a magnifying glass)', prep: true, school: 'Evocation', classes: 'cleric,druid,sorcerer,wizard', save: 'con', fx: 'damage', dmg: '6d8', dtype: 'Radiant', cid: 'spell/sunbeam' }
    ],
    feats: [
      { id: 'f1', g: 'class', name: 'Spellcasting', desc: 'Wisdom-based; 16 prepared spells, changed on a Long Rest.', cid: 'feature/druid/spellcasting' },
      { id: 'f2', g: 'class', name: 'Druidic', desc: 'Know Druidic; Speak with Animals always prepared.', cid: 'feature/druid/druidic' },
      { id: 'f3', g: 'class', name: 'Primal Order · Magician', desc: 'One extra Druid cantrip; +5 to INT (Arcana or Nature) checks.', cid: 'feature/druid/primal-order' },
      { id: 'f4', g: 'class', name: 'Wild Shape', desc: 'Bonus Action; lasts 6 hours; Temp HP 12 on assuming a form. 3 uses: regain 1 on a Short Rest, all on a Long Rest.', cid: 'feature/druid/wild-shape' },
      { id: 'f5', g: 'class', name: 'Wild Companion', desc: 'Spend a slot or a Wild Shape use to cast Find Familiar (Fey) without Material components.', cid: 'feature/druid/wild-companion' },
      { id: 'f6', g: 'class', name: 'Wild Resurgence', desc: 'With no Wild Shape uses left, spend a slot for one (once per turn). Once per Long Rest, trade a use for a level 1 slot.', cid: 'feature/druid/wild-resurgence' },
      { id: 'f7', g: 'class', name: 'Elemental Fury · Primal Strike', desc: 'Once per turn, a weapon or beast attack hit deals +1d8 Cold, Fire, Lightning or Thunder.', cid: 'feature/druid/elemental-fury' },
      { id: 'f8', g: 'sub', name: 'Star Map', desc: 'Spellcasting focus. Guidance and Guiding Bolt prepared; 5 free Guiding Bolts per Long Rest.' },
      { id: 'f9', g: 'sub', name: 'Starry Form', desc: 'Spend a Wild Shape use; 10 minutes; Bright Light 10 ft. Archer: Bonus Action attack. Chalice: slot healing also heals 2d8 +5. Dragon: INT/WIS checks and Concentration saves treat 9 or lower as 10.' },
      { id: 'f10', g: 'sub', name: 'Cosmic Omen', desc: 'Roll on each Long Rest. Even = Weal (+1d6), odd = Woe (−1d6) to a D20 Test within 30 ft. 5 uses.' },
      { id: 'f11', g: 'sub', name: 'Twinkling Constellations', desc: 'Archer and Chalice use 2d8. Dragon grants Fly 20 ft (hover). Change constellation at the start of each turn.' },
      { id: 'f12', g: 'feat', name: 'Magic Initiate (Wizard)', desc: 'Origin feat from the Sage background. Fire Bolt, Mage Hand, Shield (one free cast per Long Rest). WIS is the casting ability.', from: 'feature:f26', srcKind: 'background', cid: 'feat/magic-initiate' },
      { id: 'f13', g: 'feat', name: 'Ability Score Improvement', desc: 'Level 4: WIS +1, CON +1.', cid: 'feat/ability-score-improvement' },
      { id: 'f14', g: 'feat', name: 'Ability Score Improvement', desc: 'Level 8: WIS +2.', cid: 'feat/ability-score-improvement' },
      { id: 'f15', g: 'feat', name: 'War Caster', desc: 'Level 12, INT +1. Advantage on Concentration saves; cast a spell as an Opportunity Attack; Somatic components with full hands.' },
      { id: 'f16', g: 'species', name: 'Celestial Resistance', desc: 'Resistance to Necrotic and Radiant damage.' },
      { id: 'f17', g: 'species', name: 'Darkvision', desc: '60 ft.' },
      { id: 'f18', g: 'species', name: 'Healing Hands', desc: 'Magic action: touch a creature, it regains 4d4 HP. Once per Long Rest.' },
      { id: 'f19', g: 'species', name: 'Light Bearer', desc: 'Light cantrip (CHA).' },
      { id: 'f20', g: 'species', name: 'Celestial Revelation', desc: 'Bonus Action, 1 minute: Heavenly Wings (Fly 30 ft), Inner Radiance (4 Radiant around you) or Necrotic Shroud (CHA save DC 12 or Frightened). +4 damage once per turn. Once per Long Rest.' },
      { id: 'f25', g: 'other', name: 'Wild Shape forms', desc: '8 known, up to CR 1, flying allowed: Brown Bear, Dire Wolf, Giant Spider, Giant Seahorse, Riding Horse, Hawk, Owl, Rat (PHB appendix B).' },
      { id: 'f26', g: 'background', name: 'Sage', desc: 'Arcana and History, Calligrapher’s Supplies and the Magic Initiate (Wizard) feat.', cid: 'background/sage' }
    ],
    // Typed scores already include the ASIs and War Caster, so those grants are counted.
    grants: [
      { id: 'g1', kind: 'prof', name: 'Arcana', cat: 'skill', target: 'arcana', from: 'feature:f26', srcKind: 'background' },
      { id: 'g2', kind: 'prof', name: 'History', cat: 'skill', target: 'history', from: 'feature:f26', srcKind: 'background' },
      { id: 'g3', kind: 'prof', name: 'Calligrapher’s Supplies', cat: 'tool', target: 'Calligrapher’s Supplies', from: 'feature:f26', srcKind: 'background' },
      { id: 'g4', kind: 'prof', name: 'Druidic', cat: 'language', target: 'Druidic', from: 'feature:f2', srcKind: 'class' },
      // Magician: WIS modifier (at least +1) on Arcana and Nature checks (PHB p.80).
      { id: 'g5', kind: 'checkBonus', name: 'Magician: Arcana', target: 'arcana', val: 'wis>=1', from: 'feature:f3', srcKind: 'class' },
      { id: 'g6', kind: 'checkBonus', name: 'Magician: Nature', target: 'nature', val: 'wis>=1', from: 'feature:f3', srcKind: 'class' },
      { id: 'g7', kind: 'action', name: 'Wild Shape', econ: 'bonus', res: 'wild', from: 'feature:f4', srcKind: 'class' },
      { id: 'g8', kind: 'xdmg', name: 'Primal Strike', dice: '1d8', on: 'weapon or Beast form hit', perTurn: true, from: 'feature:f7', srcKind: 'class' },
      { id: 'g9', kind: 'abil', name: 'WIS +1', ab: 'wis', val: '1', cap: 20, counted: true, from: 'feature:f13', srcKind: 'feat' },
      { id: 'g10', kind: 'abil', name: 'CON +1', ab: 'con', val: '1', cap: 20, counted: true, from: 'feature:f13', srcKind: 'feat' },
      { id: 'g11', kind: 'abil', name: 'WIS +2', ab: 'wis', val: '2', cap: 20, counted: true, from: 'feature:f14', srcKind: 'feat' },
      { id: 'g12', kind: 'abil', name: 'INT +1', ab: 'int', val: '1', cap: 20, counted: true, from: 'feature:f15', srcKind: 'feat' },
      { id: 'g13', kind: 'action', name: 'Healing Hands', econ: 'action', res: 'hands', dice: '4d4', from: 'feature:f18', srcKind: 'species' },
      { id: 'g14', kind: 'action', name: 'Celestial Revelation', econ: 'bonus', res: 'reveal', from: 'feature:f20', srcKind: 'species' },
      // Shillelagh, as in the catalog: the spellcasting ability and a bigger die for a club or quarterstaff while on (PHB p.316).
      { id: 'g15', kind: 'atkAbil', name: 'Shillelagh', ab: 'cast', weapons: 'club,quarterstaff', amode: 'melee', die: '1:1d8,5:1d10,11:1d12,17:2d6', when: 'active', from: 'spell:ds3', srcKind: 'spell' }
    ],
    // The Quarterstaff in one hand (the Shield takes the other); Shillelagh off until cast.
    effectsOn: [], hands: ['i3'], mastery: [],
    // Item sections; the Book and the Parchment sit in the Bag of Holding (their Gear section is where they come out).
    sections: [{ id: 's1', name: 'Weapons' }, { id: 's2', name: 'Armour' }, { id: 's3', name: 'Magic items' }, { id: 's4', name: 'Gear' }],
    profs: [
      { id: 'p1', cat: 'armor', name: 'Light armor' }, { id: 'p2', cat: 'armor', name: 'Shields' }, { id: 'p3', cat: 'weapon', name: 'Simple weapons' },
      { id: 'p4', cat: 'tool', name: 'Herbalism Kit' }, { id: 'p5', cat: 'language', name: 'Common' }, { id: 'p6', cat: 'language', name: 'Elvish' }, { id: 'p7', cat: 'language', name: 'Dwarvish' }
    ]
  };
}

export function blankCharacter(): Character {
  return {
    ...sampleCharacter(),
    ch: { name: 'New character', species: '', cls: '', sub: '', align: '', clsId: '', subId: '' },
    size: 'medium', carryUp: false,
    level: 1, speedBase: 30, initMisc: 0, hdDie: 8, castAb: 'none', insp: 0, pills: ['hp', 'ac', ''], spellSort: 'az',
    abil: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, abilAdj: {}, saveProf: {}, skillProf: {},
    hp: 8, maxHp: 8, origHp: 8, hdUsed: 0,
    slotMax: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], slotUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    defenses: [], senses: [], res: [], attacks: [], riders: [],
    coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, attuneIds: ['', '', ''], inv: [], spells: [], feats: [], prepMax: 0,
    grants: [], effectsOn: [], profs: [], hands: [], mastery: [], sections: []
  };
}
