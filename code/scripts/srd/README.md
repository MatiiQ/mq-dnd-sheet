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
