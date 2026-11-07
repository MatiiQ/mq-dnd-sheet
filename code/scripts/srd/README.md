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

Items the sample characters or later plans name, looked up in `code/src/data/srd/items.json` (2026-10-30; rechecked
after plan 7, 2026-11-01):

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
proficiencies, score settings, spell attack and spell save DC), weapon riders as `xdmg` with the condition in `on`
(the staffs and the Rod of Lordly Might's flame blade included; the cost is named there and nothing is spent
automatically; the Rod's 4d6 Necrotic stays text), and potions' effects while switched on. Advantage on ability checks
is a `checkAdv` grant (Boots and Cloak of Elvenkind, Eyes of the Eagle and of Minute Seeing; the Cloak's Disadvantage on
Perception against you stays text). Advantage on Initiative and spells cast from an item stay as text. Text
by design: Defender (moving part of its bonus to AC until your next turn), Rod of Alertness (+1 AC and saves inside its
light), Arrow-Catching Shield (+2 only against ranged attacks), Ioun Stone (a choice option must be a grant and only
Protection has one: add its +1 AC as a custom AC bonus), and Rod of Lordly Might's other forms and buttons (it is a Mace
with its +3; switch the form in Edit).

A magic weapon's "+N bonus to attack and damage rolls" is its `magic`, read by the builder (22 items, Rod of Lordly
Might included). A staff that "can be wielded as a magic Quarterstaff" gets `base: 'item/quarterstaff'` from that
phrase (Power, Striking, the Magi, the Woodlands, Thunder and Lightning, Withering); no other staff is a weapon.

Charges: "has 7 charges", rolled ones ("has 1d3 charges", Luck Blade; "1d8 + 1", Nine Lives Stealer), "starts with 10
charges" (Cube of Force) and "1 of its 3 charges" (Ring of Three Wishes) are read, and so is a singular "regains 1
expended charge". Charges the text never gives back get `recharge: 'none'` (the player resets them). Rolled starting
charges are asked when the item is added.

Spell attack and DC bonuses (`spellAtk`, `spellDc` grants, `needEq` and `needAtt`): Wand of the War Mage (its chosen +N,
`val: 'magic'`), Robe of the Archmagi (+2 to both), Staffs of Power, the Magi and the Woodlands, and the Talismans of
Pure Good and Ultimate Evil (+2 spell attack). "While holding" is read as equipped: `c.hands` tracks weapons only.

Mundane containers hold a volume or a count, not pounds: Chest, Barrel, Bucket, Quiver, Crossbow Bolt Case, Map or
Scroll Case, Flask, Jug, Iron Pot, Glass Bottle, Vial and Waterskin get it as `capVol` ("12 cubic feet of contents", "20
Arrows"). Nothing is tracked inside them (they aren't extradimensional). The Glass Bottle's extracted "11/2 pints" is
read as 1½ pints (`text.ts`, that pattern only). Both Spell Scrolls take the gear chapter's Spell Scroll text (its
heading spans two lines). Weapons and armor have no SRD prose, so the picker and the inventory show a line built from
their fields; the ammunition rows (Arrows, Bolts, Firearm Bullets, Needles, Sling Bullets) have none either and stay
empty.

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
- `ammo` (the player chooses): Ammunition +1/+2/+3, from Arrows, Bolts, Firearm Bullets, Needles or Sling Bullets. It
  copies no fields; its base id gives its ammunition type, so a weapon of that type can load it.
- No `base`: items that already carry their armor fields in the overlay (Demon Armor, Dragon Scale Mail, Dwarven Plate,
  Elven Chain, Glamoured Studded Leather and the Shields with `armor: 'shield'`) and Ammunition of Slaying (text).

A base of the player's choice is asked when the item is added ("Which weapon?", "Which armor?", "Which ammunition?"),
from the catalog's mundane items of that kind, narrowed by `baseOf` where the type line names fewer than "any" (read off
SRD 5.2.1: Berserker Axe, Dancing Sword, Defender and Flame Tongue (any Melee weapon), Energy Bow, Oathbow, Frost
Brand, Hammer of Thunderbolts, Luck Blade, the Swords of Life Stealing, Sharpness and Wounding, Vorpal Sword,
Adamantine and Mithral Armor (Medium or Heavy, not Hide)). "Any Simple or Martial" and "Any Light, Medium, or Heavy"
items have no list. The build fails on a `baseOf` id that names no item of the right kind. The base's fields come in
through `withBase` (`src/catalog/base.ts`, shared with the builder); Mithral Armor's overlay writes its removals as
values (`strReq: 0`, `stealthDis: false`), which `withBase` drops. The +1/+2/+3 items (`magicPick`) ask the bonus too,
which sets `magic` (weapon, ammunition, wand) or `acBonus` (armor, Shield). The item is named after the answers
("Longsword +2", "Holy Avenger (Longsword)") with the rarity of its bonus.

Ammunition: a weapon's `load` names the ammunition it shoots (picked on its Actions row), and a ranged attack adds that
ammunition's `magic` next to the weapon's own. Only ammunition with a type (from the catalog) can be loaded: ammunition
typed by hand is never offered; add it from the catalog.

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
| `feat:cat=origin`, `feat:any` | a feat of a category, or any feat ("or another feat you qualify for") |
| `spell:list=druid;lvl=0`, `spell:list=$list;lvl=1` | spells of a class list and level; `$list` names another choice |
| `list:cleric\|druid\|wizard` | one of the named class spell lists (Magic Initiate) |
| `list:feat\|blessed-warrior` | a way to take the feature (Fighting Style); later choices name it in `ifPick`, and the feature isn't named after it |
| `spell:lvl=0`, `spell:lvl=1;ritual=true` | spells of any class list (Book of Shadows) |
| `ability:int\|wis\|cha` | one ability, usually the spellcasting ability for the entry's spells (`castAb: '$ab'`) |
| `trait:of=<trait id>` | one of the lineage options that name that trait in `of` |
| `skill:proficient` | a skill the character is proficient in (Expertise), or one the entry itself grants |
| `subclass:cls=ranger` | a subclass of the class |
| `tool:artisan` | one kind of Artisan’s Tools |
| `feature:of=maneuver`, `feature:of=metamagic`, `feature:of=invocation` | Battle Master maneuvers, Metamagic options, Eldritch Invocations: `feature` entries with `of`, each added as its own feature |
| `spell:list=wizard;school=evocation;lvl<=2`, `spell:list=warlock;lvl=6\|7\|8\|9` | spells filtered by school and a level range or set |

`repeat: true` on a choice means one option may be picked more than once: Ability Score Improvement picks two `+1`
options (the same one twice gives `+2`), a background picks three (`+2`/`+1` or `+1` to all three).

## Schema changes found while authoring

- `TraitEntry.of` (Task 6): a lineage or ancestry option (Wood Elf, Forest Gnome, Cloud’s Jaunt) is a trait of its own,
  because one option carries several grants; `of` names the trait that offers it, and that trait holds a choice with
  the pool `trait:of=<its id>`. Adding the option adds its grants.

## Vocabulary changes found by the slice

Authoring every entry the sample characters use (Task 10) added three optional fields; existing kinds keep their shape.
The app applies all three.

- `opt` on a grant inside a choice's `options`: grants with the same `opt` are one pick. Primal Order's Warden gives
  Martial weapons and Medium armor training together.
- `cantrip` on `dmgBonus`: the bonus applies to the damage of the entry's class cantrips (Elemental Fury's Potent
  Spellcasting adds WIS to Druid cantrips).
- `dice` on `action`: the action's die as a Value (Cosmic Omen's Weal `1d6` and Woe `-1d6`, Starry Form's Archer
  `1:1d8,10:2d8`, Healing Hands `pb` d4s).

## Vocabulary changes found by the class batches

The app applies all of these; of `casting`, only `ab` and the name.

- `when: 'active'` (Task 14): the grant counts only while the entry's effect is switched on, like an AC spell in
  `acOn`: Rage's resistances, Frenzy, Rage of the Gods' flight. A new value of the existing condition field.
- `cap: 25` on `abil` (Task 14): Primal Champion raises STR and CON by 4 to a maximum of 25.
- New kind `casting` (Task 15): a subclass that casts from a class list with its own table (Eldritch Knight, Arcane
  Trickster): `ab`, `list`, `cantrips`, `prepared` and the slots of each spell level `s1`…`s5`, each a level-table Value
  by class level. Adding it sets the casting ability when the sheet has none, and its chip says to set slots by hand;
  nothing reads its tables.
- New kind `crit` (Task 15): Critical Hit on a d20 roll of `val` or higher with weapons and Unarmed Strikes (Champion),
  shown on those rows of the Actions tab.
- `atkAbil.weapons` may name categories as well as weapons: `simple-melee`, `martial-melee-light` (Monk weapons).

Features without grants: the class Spellcasting and Pact Magic features (the class entry holds the slots and counts)
and effects no kind describes, such as Advantage on Initiative (Feral Instinct), the Monk's Evasion, Indomitable Might.
Invocations have none either, except Gift of the Depths' swim speed.

Effects that stay text: changes to another feature's numbers (Foe Slayer's d10 for Hunter's Mark),
rerolls and minimum rolls (Supreme Healing), damage that adds half a level (Divine Fury's dice carry only the 1d6).

## Vocabulary changes found by the Actions tab (plan 5)

- `dtype` on `unarmed`: the damage type when it isn't Bludgeoning (Demon Armor's Slashing).
- `healMod` on spells: the healing adds the spellcasting ability modifier. Both builders set it from the description
  ("plus your spellcasting ability modifier" in the SRD, "+ your spellcasting ability modifier" in `reference/`): Cure
  Wounds, Healing Word, Mass Cure Wounds, Mass Healing Word, and Conjure Celestial's Healing Light part.
- Hunter's Mark's overlay grant: an `xdmg` of 1d6 Force on the marked target while the spell is on.

## Vocabulary and data changes from the data audit (plan 7)

- An overlay field set to `null` removes the parsed field (both builders).
- `dmgMod` on spells and parts: "damage equal to NdM plus your spellcasting ability modifier" (Spiritual Weapon, Flame
  Blade, Arcane Sword, Conjure Fey, Arcane Hand's Grasping Hand).
- `dtypes` on spells and parts: a damage type chosen from a list, `dtype` left out (Chromatic Orb, Dragon's Breath,
  Sorcerous Burst, Conjure Elemental, Forbiddance, Glyph of Warding, Spirit Guardians, Fire Shield, the prismatic rays,
  Destructive Wave's second damage). The row shows `Acid/Cold/Fire`. A type typed in the custom form replaces the list.
- `parts` on spells: more damage or healing rows, each `<spell> · <label>` on the Actions tab with numbers only (the
  spell's own row casts). A part inherits nothing from the spell. The SRD builder reads a second "and (another) NdM
  <Type> damage" of the same sentence as a part; an overlay's `parts` replaces that list whole, so an overlay that
  changes one part writes them all. Parts: Conjure Celestial, Ice Knife, Wall of Ice, Flame Strike, Ice Storm, Meteor
  Swarm, Acid Arrow, Arcane Hand, Vitriolic Sphere, Wall of Thorns; in the pack Toll the Dead, Destructive Wave,
  Lightning Arrow, Hunger of Hadar (its upcast die applies to one of the two damages, the player's choice), Jallarzi's
  Storm of Radiance, Witch Bolt. Text by design: Weird (damage repeated each turn), Tsunami (damage that drops each
  round), Storm of Vengeance (a different effect each round).
- Fixed healing is its amount as dice text: Heal `70`, Mass Heal `700`, Power Word Heal `all HP` ("heals 70 HP").
- No damage from a mishap, a stat block or one glyph of many: Teleport, Dimension Door, Meld into Stone, Giant Insect,
  Symbol, Animate Objects. Wish and Find Steed aren't healing rows; Beacon of Hope is no healing row and has no save.
- Saves: both builders skip an ability, or a list of them, after "Advantage on" / "Disadvantage on" (Conjure Animals
  saves on Dexterity; Haste and Gaseous Form have no save). Prismatic Wall's damage save is Dexterity.
- Upcast data (`scale`), closed: the Actions tab states the dice a higher slot adds (the printed text, or from `scale` when a
  spell has none) and doesn't compute a total, by choice. "for every slot level above" is read (Spiritual Weapon). SRD 5.2.1 prints 1d8,
  1d12 and 1d8 per slot for Conjure Elemental, Conjure Fey and Conjure Minor Elementals where the PHB prints 2d8, 2d12
  and 2d8 (PHB pp.254-255); the SRD data keeps what the SRD prints, and the pack replaces the three spells with the PHB's
  dice (`replace`). So only an app without the pack shows the lower die.
- Conjure Minor Elementals and Elemental Weapon (pack) add damage to your attacks as `xdmg` grants while the spell is on,
  with no Actions row of their own. Elemental Weapon is simplified to the lowest slot: 1d4 and +1 to attack rolls with
  any weapon; the chosen weapon, the chosen type and a higher slot's bonus are the player's to apply.
- AC spells (`acFx`/`acVal` in `overlay/spells.json`): Shield (`bonus` 5), Shield of Faith (`bonus` 2), Haste (`bonus` 2),
  Mage Armor (`base` 13), Barkskin (`floor` 17). Warding Bond has none: its +1 goes to another creature (PHB p.340). Cast
  on another creature (`Spell.acOther`), any of them runs but adds no AC.
- Items: `magic` (1–3), `magicPick`, `baseOf`, `base: 'ammo'` (see above).
- Grants: `spellAtk` and `spellDc` (`val`), and the grant-only value term `magic` (the +N of the item the grant comes
  from; 0 without one; a counter's maximum never reads it).
- Pools: `spell:…;ritual=true` (Ritual Caster) and `tool:artisan` (the 17 Artisan's Tools).
- PHB pack (`reference/authored/`, local): the 12 backgrounds' ability, skill and tool grants; the feats' ability score
  increases (cap from each feat's own ASI line), armor and weapon training, senses, speeds, spells with free casts and
  resources; Resilient pairs each ability with its saving throw. Text there: Unarmed Fighting's d8 with no weapon or
  Shield (a 1d6 grant), Healer, Interception, Protection, Heavy Armor Master, War God's Blessing and Bewitching Magic
  (their spells are already prepared), Blessing of the Trickster and Bastion of Law (no uses per rest). The catalog
  audit's known list says which of these are still to do.

Source text cut short and other notes stay under "Items checked" above. The audit's plan was a local working note
(`docs/superpowers/plans/2026-10-31-07-catalog-data-fixes.md`, gitignored), so it isn't in the repo or on every machine.

## Data changes from the catalog audit (2026-11-05)

- Removed fields nothing read: `page` on every entry; `abils`, `skills` and `tool` on backgrounds; `short` on `prof`
  (kept in `names.ts` for migrate()'s Training match). A pack built earlier still loads: `validateEntry` ignores
  unknown fields. Each background's grants are checked against the PHB table through `parseBackgroundFields`.
- Rule categories `property` and `mastery` (`parseWeaponRules`, 17 entries), shown under an open weapon row by
  `RuleNotes`; senses show theirs the same way.
- `Spell.acOther` also marks a Touch Concentration spell with a speed or defense grant (Fly, Gaseous Form, Spider
  Climb) as cast on someone else: its `when: 'active'` grants, an `xdmg` included, don't count on you. No catalog spell
  mixes them.
- A grant with `when: 'active'` and no `needEq` keeps counting at quantity 0 while switched on, so a drunk potion lasts
  until it is switched off or a Long Rest. The rule can't tell a potion from another item; in the catalog only potions
  have such a grant.
- A Long Rest switches off every switched-on effect, items' included (Cloak of Elvenkind's hood, Winged Boots, Wings of
  Flying): the player switches it on again. Winged Boots' charges are spent by hand.
- The smites have no `xdmg`: the damage is a one-time rider on the hit that triggers the casting. Their row says so.
- Simplifications: Alter Self's swim counts while you concentrate, whichever option you chose. Gaseous Form's other
  speeds aren't turned off. A rider counts while the weapon is equipped, not only while it is in hand. Casting
  Longstrider, Freedom of Movement, Protection from Poison or Wind Walk switches the effect on, even on an ally, until
  the player taps Off. Summon Dragon's resistance is one row with the type unnamed.

## Data changes from the catalog feature gaps (2026-11-05)

- `ifPick: '<choiceId>=<value>'` on a choice asks it only while that earlier choice holds the value (an option group's
  label, or a pool pick): Divine Order's Thaumaturge and Primal Order's Magician cantrip, the Paladin's Blessed Warrior
  and the Ranger's Druidic Warrior cantrips.
- Ability Score Improvement and Epic Boon offer `feat:any`. Mystic Arcanum's spell is always prepared.
- Rows that spend another feature's counter name it in `uses` (Channel Divinity, Focus Points, Bardic Inspiration,
  Wild Shape, Sorcery Points); `regainTo` adds a Regain button for the roll-Initiative refills (Persistent Rage,
  Superior Inspiration, Archdruid, Perfect Focus, Uncanny Metabolism). The "when you roll Initiative" condition stays
  the player's tap.
- Save DCs on rows (`dc: '8+pb'`, `dcAb`): Monk's Focus has its own Focus Save DC row. Poisoner's ability increase is a
  pool, so its DC can follow it.
- Rage adds its damage bonus to Strength attacks only (`useAb`). Innate Sorcery `spellDc`, Sacred Weapon `atkBonus`
  (Melee weapons), Unarmed Fighting's d8 (`when: 'empty'`), Foe Slayer's `swap` of Hunter's Mark.
- Invocations: at-will spells are always prepared (the sheet has no slot-free cast state); Pact of the Blade's
  Charisma attacks and proficiency apply to any weapon while its switch is on; Thirsting and Devouring Blade too.
- Every background has packages A and B as data.
- Simplifications: Agonizing Blast's pool lists every Warlock cantrip, damaging or not; ritual-only spells are always
  prepared; Arcane Ward HP refills on a Long Rest rather than when the ward is made.

## What check-phb does not catch

`npm run check-phb` and the pre-push hook look for phrases taken from the condensed `reference/` descriptions, which
are what the pack holds. Wording pasted straight from the PDF or `reference/source/phb2024-fulltext.txt` is not
detected. Never paste from those files into tracked files. Pushes from a clone without `reference/` (another machine,
a cloud session) are not checked at all; the hook says so.

## Entry counts (rechecked 2026-11-05; SRD counts match `src/data/srd/*.json`)

| Kind | SRD 5.2.1 (committed) | PHB pack (local) |
|---|---|---|
| spell | 339 | 56 |
| item | 455 | 0 |
| feat | 17 | 58 |
| background | 4 | 12 |
| species | 9 | 1 |
| trait | 47 | 5 |
| class | 12 | 0 |
| subclass | 12 | 36 |
| feature | 269 | 203 |
| prof | 102 | 0 |
| rule | 34 | 0 |

The pack holds only entries the SRD lacks (`npm run pack` prints parsed, dropped and written counts per kind).
