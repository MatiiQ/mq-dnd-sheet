import type { Character } from './types';

// Sample character: Ilyra Moonbrook, Wood Elf Ranger 5 (Hunter).
export function sampleCharacter(): Character {
  return {
    ch: { name: 'Ilyra Moonbrook', species: 'Wood Elf', cls: 'Ranger', sub: 'Hunter', bg: 'Guide', align: 'Neutral Good' },
    speeds: { climb: 0, swim: 0, fly: 0, burrow: 0 }, speedOpen: false,
    level: 5, ac: 16, speedBase: 35, initMisc: 0, hdDie: 10, castAb: 'wis',
    abil: { str: 12, dex: 18, con: 14, int: 10, wis: 14, cha: 8 }, abilAdj: {},
    saveProf: { str: true, dex: true },
    skillProf: { stealth: 1, nature: 1, animal: 1, insight: 1, perception: 1, survival: 2 },
    hp: 31, maxHp: 44, origHp: 44, origOn: false, temp: 0, amount: 5, insp: true, tab: 'actions', prepMax: 6, spellFilter: 'all', usePrep: true,
    hdUsed: 1, ds: 0, df: 0, exh: 0, conds: {}, free: {}, conc: null, hpUndo: null, concCheck: null, restMsg: null,
    slotMax: [0, 4, 2, 0, 0, 0, 0, 0, 0, 0], slotUsed: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    def: { res: [], vul: [], imm: [] }, saveNotes: 'Advantage on saves to avoid or end Charmed (Fey Ancestry).',
    senses: [{ id: 'se1', name: 'Darkvision', range: '60 ft' }],
    res: [
      { id: 'favored', name: 'Favored Enemy', note: 'Cast Hunter’s Mark without a slot', count: 2, max: 3, recharge: 'long' },
      { id: 'arrows', name: 'Arrows', note: 'Tap − after each Longbow shot', count: 20 },
      { id: 'potions', name: 'Potion of Healing', note: 'Bonus Action · roll 2d4 +2, then Heal', count: 2 }
    ],
    attacks: [
      { id: 'a1', name: 'Longbow', hit: '+9', dmg: '1d8 +4 Piercing', info: '150/600 ft · Ammunition, Heavy, Two-Handed · includes Archery +2', mastery: 'Slow: on a hit, target’s Speed drops 10 ft until your next turn' },
      { id: 'a2', name: 'Shortsword', hit: '+7', dmg: '1d6 +4 Piercing', info: 'Melee 5 ft · Finesse, Light', mastery: 'Vex: on a hit, Advantage on your next attack against that target' },
      { id: 'a3', name: 'Unarmed Strike', hit: '+4', dmg: '2 Bludgeoning', info: 'Melee 5 ft · or Grapple / Shove (DC 12)', mastery: '' }
    ],
    riders: [
      { id: 'r1', name: 'Hunter’s Mark · marked target', dice: '+1d6 Force' },
      { id: 'r2', name: 'Colossus Slayer · target missing HP, once per turn', dice: '+1d8' },
      { id: 'r3', name: 'Critical hit', dice: 'Roll weapon dice twice' }
    ],
    coins: { cp: 0, sp: 14, ep: 0, gp: 38, pp: 0 },
    attune: ['Cloak of Elvenkind', '', ''],
    notes: { appearance: '', personality: '', backstory: '', session: '' },
    inv: [
      { id: 'i1', name: 'Studded Leather Armor', qty: 1, eq: true },
      { id: 'i2', name: 'Longbow', qty: 1, eq: true },
      { id: 'i3', name: 'Shortsword', qty: 1, eq: true },
      { id: 'i4', name: 'Cartographer’s Tools', qty: 1, eq: false },
      { id: 'i5', name: 'Explorer’s Pack', qty: 1, eq: false },
      { id: 'i6', name: 'Traveler’s Clothes', qty: 1, eq: false }
    ],
    spells: [
      { id: 'sp1', name: 'Druidcraft', lvl: 0, time: 'Action', range: '30 ft', source: 'Elf', dur: 'Instantaneous', comp: 'V, S' },
      { id: 'sp2', name: 'Guidance', lvl: 0, time: 'Action', range: 'Touch', source: 'Magic Initiate', c: true, dice: '+1d4 to one check', dur: 'Up to 1 minute', comp: 'V, S' },
      { id: 'sp3', name: 'Produce Flame', lvl: 0, time: 'Bonus Action', range: 'Self · throw 60 ft', source: 'Magic Initiate', dice: 'd20 +5 · 2d8 Fire', dur: '10 minutes', comp: 'V, S' },
      { id: 'sp4', name: 'Hunter’s Mark', lvl: 1, time: 'Bonus Action', range: '90 ft', source: 'Ranger · Favored Enemy', c: true, dice: '+1d6 Force per hit', dur: 'Up to 1 hour', comp: 'V', always: true },
      { id: 'sp5', name: 'Cure Wounds', lvl: 1, time: 'Action', range: 'Touch', source: 'Ranger', dice: 'Heal 2d8 +2 · +2d8 per slot level above 1', dur: 'Instantaneous', comp: 'V, S', prep: true },
      { id: 'sp6', name: 'Ensnaring Strike', lvl: 1, time: 'Bonus Action', range: 'Self', source: 'Ranger', c: true, dice: 'STR save DC 13 · 1d6 Piercing/turn', dur: 'Up to 1 minute', comp: 'V', prep: true },
      { id: 'sp7', name: 'Hail of Thorns', lvl: 1, time: 'Bonus Action', range: 'Self', source: 'Ranger', dice: 'DEX save DC 13 · 1d10 Piercing', dur: 'Instantaneous', comp: 'V', prep: true },
      { id: 'sp8', name: 'Goodberry', lvl: 1, time: 'Action', range: 'Self', source: 'Magic Initiate', free: true, dice: '10 berries · heal 1 each', dur: '24 hours', comp: 'V, S, M (a sprig of mistletoe)', always: true },
      { id: 'sp9', name: 'Longstrider', lvl: 1, time: 'Action', range: 'Touch', source: 'Elf', free: true, dice: '+10 ft Speed', dur: '1 hour', comp: 'V, S, M (a pinch of dirt)', always: true },
      { id: 'sp10', name: 'Spike Growth', lvl: 2, time: 'Action', range: '150 ft', source: 'Ranger', c: true, dice: '2d4 Piercing per 5 ft', dur: 'Up to 10 minutes', comp: 'V, S, M (seven thorns)', prep: true },
      { id: 'sp11', name: 'Aid', lvl: 2, time: 'Action', range: '30 ft', source: 'Ranger', dice: '+5 HP max, 3 creatures', dur: '8 hours', comp: 'V, S, M (a strip of white cloth)', prep: true },
      { id: 'sp12', name: 'Pass without Trace', lvl: 2, time: 'Action', range: 'Self', source: 'Elf', c: true, free: true, dice: '+10 Stealth', dur: 'Up to 1 hour', comp: 'V, S, M (ashes from mistletoe)', always: true }
    ],
    feats: [
      { id: 'f1', g: 'class', name: 'Spellcasting', desc: 'Wisdom-based; 6 prepared spells.' },
      { id: 'f2', g: 'class', name: 'Favored Enemy', desc: 'Hunter’s Mark always prepared; free casts per Long Rest.' },
      { id: 'f3', g: 'class', name: 'Weapon Mastery', desc: 'Mastery properties of two weapons.' },
      { id: 'f4', g: 'class', name: 'Deft Explorer', desc: 'Expertise in Survival; two extra languages.' },
      { id: 'f5', g: 'class', name: 'Fighting Style · Archery', desc: '+2 to attack rolls with Ranged weapons.' },
      { id: 'f6', g: 'class', name: 'Extra Attack', desc: 'Attack twice when you take the Attack action.' },
      { id: 'f7', g: 'sub', name: 'Hunter’s Lore', desc: 'Learn immunities, resistances and vulnerabilities of your marked target.' },
      { id: 'f8', g: 'sub', name: 'Hunter’s Prey · Colossus Slayer', desc: '+1d8 damage once per turn to a creature missing Hit Points.' },
      { id: 'f9', g: 'feat', name: 'Magic Initiate (Druid)', desc: 'Origin feat from the Guide background.' },
      { id: 'f10', g: 'feat', name: 'Ability Score Improvement', desc: 'Taken at level 4.' },
      { id: 'f11', g: 'species', name: 'Darkvision', desc: '60 ft.' },
      { id: 'f12', g: 'species', name: 'Fey Ancestry', desc: 'Advantage on saves to avoid or end Charmed.' },
      { id: 'f13', g: 'species', name: 'Keen Senses', desc: 'Proficiency in Insight.' },
      { id: 'f14', g: 'species', name: 'Trance', desc: 'Finish a Long Rest in 4 hours.' },
      { id: 'f15', g: 'species', name: 'Elven Lineage', desc: 'Speed 35 ft; Druidcraft, Longstrider, Pass without Trace.' },
      { id: 'f16', g: 'training', name: 'Armor', desc: 'Light, Medium, Shields' },
      { id: 'f17', g: 'training', name: 'Weapons', desc: 'Simple, Martial' },
      { id: 'f18', g: 'training', name: 'Tools', desc: 'Cartographer’s Tools' },
      { id: 'f19', g: 'training', name: 'Languages', desc: 'Common, Elvish, Sylvan, Draconic' }
    ]
  };
}

export function blankCharacter(): Character {
  return {
    ...sampleCharacter(),
    ch: { name: 'New character', species: '', cls: '', sub: '', bg: '', align: '' },
    level: 1, ac: 10, speedBase: 30, initMisc: 0, hdDie: 8, castAb: 'none', insp: false,
    abil: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, abilAdj: {}, saveProf: {}, skillProf: {},
    hp: 8, maxHp: 8, origHp: 8, hdUsed: 0,
    slotMax: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], slotUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    def: { res: [], vul: [], imm: [] }, saveNotes: '', senses: [], res: [], attacks: [], riders: [],
    coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, attune: ['', '', ''], inv: [], spells: [], feats: [], prepMax: 0
  };
}
