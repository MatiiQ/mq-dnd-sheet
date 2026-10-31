# SRD catalog data

`code/src/data/srd/*.json` is built from the **System Reference Document 5.2.1** (SRD 5.2.1), the current 5.2.x
release on <https://www.dndbeyond.com/srd> as of 2026-10-30. The PDF is
<https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf>.

## Attribution

The SRD is licensed under CC-BY-4.0. Its legal page asks for this statement, word for word:

> This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

The same statement covers the SRD text in the parser fixtures under `code/scripts/srd/fixtures/`.

## Rebuilding

1. Save the PDF as `resources/srd/SRD_CC_v5.2.1.pdf` (gitignored).
2. `code/scripts/srd/extract.sh` writes `resources/srd/srd.txt` (reading order, for prose) and
   `resources/srd/srd-layout.txt` (`pdftotext -layout`, for tables). Needs poppler's `pdftotext`.
3. In `code/`: `npm run srd` parses the text, applies the hand-authored overlays in `code/scripts/srd/overlay/*.json`
   (grants, choices and fields the parser can't read) and writes `code/src/data/srd/*.json`. Every entry is checked
   with `validateEntry` before it is written.

## Items checked against the SRD

Items the sample characters or later plans name, looked up in `code/src/data/srd/items.json` (2026-10-30):

- In SRD 5.2.1: Studded Leather Armor, Leather Armor, Shield, Longbow, Shortsword, Quarterstaff, Sickle, Arrows,
  Explorer’s Pack, Traveler’s Clothes (the table lists it as "Clothes, Traveler’s"; the builder uses the name players
  use), Robe, Book, Parchment, Cartographer’s Tools, Herbalism Kit, Calligrapher’s Supplies, Potion of Healing
  (adventuring gear, `item/potion-of-healing`; the magic item table entry is "Potions of Healing"), Cloak of Elvenkind,
  Bag of Holding, Ring of Protection, Cloak of Protection, Handy Haversack, Portable Hole.
- Not in SRD 5.2.1: Diamond (only priced inside spell components). It stays a custom item.

Extradimensional containers: Bag of Holding's capacity (500 lb, 64 cubic feet) and weight (5 lb) are parsed from its
text. Handy Haversack (900 lb across its three pouches) and Portable Hole (no weight limit) come from
`overlay/items.json`, read off their SRD text.

Items that set an ability score ("your score is 19", the `abilSet` grant): Amulet of Health (CON 19), Gauntlets of Ogre
Power (STR 19), Headband of Intellect (INT 19) and Belt of Giant Strength (STR 21–29, a choice by giant type). Manuals
and tomes raise a score permanently when read; they stay text, because a grant counts only while the item is equipped.

Weapons: all 38 rows match `reference/06-equipment.md` (PHB p.215) in category, type, damage, properties, mastery and
cost.

Magic item grants cover lasting effects of worn or held items (AC, saving throws, resistances, senses, speeds,
proficiencies, score settings). Effects that are conditional (only against ranged attacks, only in Dim Light), Advantage
on ability checks or Initiative, spells cast from an item and a magic weapon's own attack bonus stay as text.

Magic weapons and armor (`base`, set in `overlay/items.json`, read off each item's SRD type line). The builder copies
the base item's weapon fields (category, range kind, damage, properties, ranges, mastery) or armor fields (kind, base
AC, Strength, Stealth), and its weight when the magic item has none; the magic item's own fields win.

- A base item id where the type line names one item: Dagger of Venom (Dagger), Mace of Disruption, Mace of Smiting and
  Mace of Terror (Mace), Javelin of Lightning (Javelin), Trident of Fish Command (Trident), Dwarven Thrower (Warhammer),
  Quarterstaff of the Acrobat (Quarterstaff), Thunderous Greatclub (Greatclub), Scimitar of Speed (Scimitar), Sun Blade
  (Longsword: SRD 5.2.1 names only the Longsword), Armor of Invulnerability (Plate Armor), Animated Shield (Shield).
  Plate Armor of Etherealness names "Half Plate Armor or Plate Armor"; it gets Plate Armor, the armor of its name, and
  the player switches it to Half Plate in Edit.
- `armor` (the player chooses): Armor +1/+2/+3, Adamantine Armor, Armor of Resistance, Armor of Vulnerability, Mithral
  Armor.
- `weapon` (the player chooses): Weapon +1/+2/+3, Berserker Axe, Dancing Sword, Defender, Dragon Slayer, Energy Bow,
  Flame Tongue, Frost Brand, Giant Slayer, Hammer of Thunderbolts, Holy Avenger, Luck Blade, Nine Lives Stealer,
  Oathbow, Sword of Life Stealing, Sword of Sharpness, Sword of Wounding, Vicious Weapon, Vorpal Sword, Weapon of
  Warning.
- No `base`: items that already carry their armor fields in the overlay (Demon Armor, Dragon Scale Mail, Dwarven Plate,
  Elven Chain, Glamoured Studded Leather and the Shields with `armor: 'shield'`), ammunition (Ammunition +1/+2/+3,
  Ammunition of Slaying: not a weapon the sheet attacks with), and items only used like a weapon (staffs).

Source text cut short: SRD 5.2.1 itself stops mid-sentence in Telekinesis (after "a simple tool,"), and Greater
Restoration and Guards and Wards end without a full stop. The builder can't recover the missing words; the data keeps
the text as printed.

Armor of Resistance: `pdftotext` puts the Lever Down column of the Apparatus of the Crab Levers table (the page
before) after Armor of Resistance's damage type table, so the parsed description ran on into it. The overlay sets its
`desc` to the text up to the end of the table. The Apparatus of the Crab keeps its Lever Up column; its Lever Down
column is garbled in the extracted text and is not recovered.

## Choices

A choice offers `options` (grants) or a `pool` (`<kind>:<filter>`) the app generates. Pools used so far:

| Pool | Means |
|---|---|
| `skill:any`, `skill:athletics\|survival` | any skill, or one of the listed skill keys |
| `tool:any`, `tool:gaming-set` | any tool, or a variant of the named tool |
| `prof:skill\|tool` | any skill or tool (Skilled) |
| `language:any`, `weapon:any` | any language; any weapon kind (Weapon Mastery) |
| `feat:cat=origin` | a feat of a category |
| `spell:list=druid;lvl=0`, `spell:list=$list;lvl=1` | spells of a class list and level; `$list` names another choice |
| `list:cleric\|druid\|wizard` | one of the named class spell lists (Magic Initiate) |
| `ability:int\|wis\|cha` | one ability, usually the spellcasting ability for the entry's spells (`castAb: '$ab'`) |
| `trait:of=<trait id>` | one of the lineage options that name that trait in `of` |
| `skill:proficient` | a skill the character is proficient in (Expertise) |
| `subclass:cls=ranger` | a subclass of the class |
| `tool:artisan` | one kind of Artisan’s Tools |
| `maneuver:any`, `metamagic:any`, `invocation:any` | Battle Master maneuvers, Metamagic options, Eldritch Invocations (named in the descriptions; not catalog entries yet) |
| `spell:list=wizard;school=evocation;lvl<=2`, `spell:list=warlock;lvl=6\|7\|8\|9` | spells filtered by school and a level range or set |

`repeat: true` on a choice means one option may be picked more than once: Ability Score Improvement picks two `+1`
options (the same one twice gives `+2`), a background picks three (`+2`/`+1` or `+1` to all three).

## Schema changes found while authoring

- `TraitEntry.of` (Task 6): a lineage or ancestry option (Wood Elf, Forest Gnome, Cloud’s Jaunt) is a trait of its own,
  because one option carries several grants; `of` names the trait that offers it, and that trait holds a choice with
  the pool `trait:of=<its id>`. Plan 3 follow-up: apply the chosen option's grants as the trait's.

## Vocabulary changes found by the slice

Authoring every entry the sample characters use (Task 10) added three optional fields; existing kinds keep their shape.
Each needs a small plan 3 follow-up to apply it.

- `opt` on a grant inside a choice's `options`: grants with the same `opt` are one pick. Primal Order's Warden gives
  Martial weapons and Medium armor training together.
- `cantrip` on `dmgBonus`: the bonus applies to the damage of the entry's class cantrips (Elemental Fury's Potent
  Spellcasting adds WIS to Druid cantrips).
- `dice` on `action`: the action's die as a Value (Cosmic Omen's Weal `1d6` and Woe `-1d6`, Starry Form's Archer
  `1:1d8,10:2d8`, Healing Hands `pb` d4s).

## Vocabulary changes found by the class batches

Each needs a small plan 3 follow-up to apply it.

- `when: 'active'` (Task 14): the grant counts only while the entry's effect is switched on, like an AC spell in
  `acOn`: Rage's resistances, Frenzy, Rage of the Gods' flight. A new value of the existing condition field.
- `cap: 25` on `abil` (Task 14): Primal Champion raises STR and CON by 4 to a maximum of 25.
- New kind `casting` (Task 15): a subclass that casts from a class list with its own table (Eldritch Knight, Arcane
  Trickster): `ab`, `list`, `cantrips`, `prepared` and the slots of each spell level `s1`…`s5`, each a level-table Value
  by class level.
- New kind `crit` (Task 15): Critical Hit on a d20 roll of `val` or higher with weapons and Unarmed Strikes (Champion).
- `atkAbil.weapons` may name categories as well as weapons: `simple-melee`, `martial-melee-light` (Monk weapons).

Features without grants: the class Spellcasting and Pact Magic features (the class entry holds the slots and counts)
and effects no kind describes, such as Advantage on Initiative (Feral Instinct), Evasion, Indomitable Might.

Effects that stay text: changes to another feature's numbers or recharge (Font of Inspiration, Improved Warding Flare),
rerolls and minimum rolls (Supreme Healing), damage that adds half a level (Divine Fury's dice carry only the 1d6).

## Vocabulary changes found by the Actions tab (plan 5)

- `dtype` on `unarmed`: the damage type when it isn't Bludgeoning (Demon Armor's Slashing).
- `healMod` on spells: the healing adds the spellcasting ability modifier. Both builders set it from the description
  ("plus your spellcasting ability modifier" in the SRD, "+ your spellcasting ability modifier" in `reference/`): Cure
  Wounds, Healing Word, Mass Cure Wounds, Mass Healing Word, and Conjure Celestial (its healing light).
- Hunter's Mark's overlay grant: an `xdmg` of 1d6 Force on the marked target while the spell is on.

Data gaps found after plan 5 and by the 2026-10-31 data audit (spells, items, PHB pack backgrounds and feats) are
listed, with their fixes, in `docs/superpowers/plans/2026-10-31-07-catalog-data-fixes.md`.

## What check-phb does not catch

`npm run check-phb` and the pre-push hook look for phrases taken from the condensed `reference/` descriptions, which
are what the pack holds. Wording pasted straight from the PDF or `reference/source/phb2024-fulltext.txt` is not
detected. Never paste from those files into tracked files. Pushes from a clone without `reference/` (another machine,
a cloud session) are not checked at all; the hook says so.

## Entry counts (2026-10-30)

| Kind | SRD 5.2.1 (committed) | PHB pack (local) |
|---|---|---|
| spell | 339 | 52 |
| item | 420 | 0 |
| feat | 17 | 58 |
| background | 4 | 12 |
| species | 9 | 1 |
| trait | 47 | 5 |
| class | 12 | 0 |
| subclass | 12 | 36 |
| feature | 231 | 183 |
| prof | 102 | 0 |
| rule | 17 | 0 |

The pack holds only entries the SRD lacks (`npm run pack` prints parsed, dropped and written counts per kind).
