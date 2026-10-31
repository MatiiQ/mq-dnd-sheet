# D&D Character Sheet

Interactive D&D 2024 (Player's Handbook 2024) character sheet for iPad. It's a static React web app hosted on GitHub Pages and installed from Safari with "Add to Home Screen". It runs offline, and all character data stays on the device.

- Live: https://matiiq.github.io/mq-dnd-sheet/
- Repo: https://github.com/MatiiQ/mq-dnd-sheet (public, branch `main`)
- Design source: Claude Design canvas https://claude.ai/code/artifact/14f009f2-87d8-4f14-8590-3c89bac0558f (`project/Main.dc.html` = landscape sheet, `project/Portrait.dc.html` = portrait). The app reproduces its behaviour; read it with the Artifact tool, not WebFetch. Since the 2026-10-24 restyle the app's look (Tabletop tokens, Midnight & candlelight) no longer follows the canvas, which still documents behaviour.

## Layout

```
.github/workflows/deploy.yml   CI: test, build code/, publish code/dist to Pages (must stay at repo root)
code/                          the web app (run all npm commands here)
reference/                     condensed PHB 2024 rules data (markdown), gitignored
resources/                     PHB 2024 PDF, gitignored
```

`reference/` and `resources/` are copyrighted Player's Handbook material. They are in `.gitignore` and must never be committed, because the repo is public.

## Commands (from `code/`)

```sh
npm run dev      # Vite dev server on :5173, --host so the iPad can open it over Wi-Fi
npm test         # Vitest: rules logic in src/logic.test.ts
npm run build    # tsc --noEmit + vite build into dist/
npm run preview  # serve dist/ with the service worker active
npm run icons    # regenerate public/icons/*.png (dependency-free PNG writer)
npm run srd      # rebuild src/data/srd/*.json and src/catalog/names.ts from the SRD 5.2.1 text (scripts/srd/README.md)
npm run pack     # build reference/build/phb-pack.json (PHB data for the device) and the check phrases, from reference/
npm run check-phb  # build, then fail if dist/ or a tracked file holds PHB description text (needs reference/ and npm run pack)
npm run hooks    # once per clone: install the pre-push hook that runs check-phb on every pushed commit
```

Toolchain: Node 22+ (CI uses 22), React 19, Vite 8, TypeScript 7, Vitest 5. The app has no other runtime dependencies besides `@fontsource` (Fraunces and Figtree, latin subsets, bundled so they work offline).

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml` (test → build → deploy-pages). Push only from the machine that holds `reference/`: the pre-push hook (`npm run hooks`) checks every pushed commit for PHB text, and on a clone without `reference/` it lets the push through unchecked. Pages source is "GitHub Actions". Vite uses `base: './'`, so the build works under any repo path. Installed Home Screen apps get the new version on their next online launch.

## App architecture (`code/src/`)

| File | Role |
|---|---|
| `types.ts` | `Character` model and its sub-types |
| `defaults.ts` | `sampleCharacter()` (Ilyra Moonbrook, Wood Elf Ranger 5) and `blankCharacter()` |
| `logic.ts` | Pure rules functions (`Character → Character`): modifiers, skills, damage/heal/temp HP, death saves, massive damage, concentration DC, rests and Dawn, hit dice, conditions, exhaustion, speed, armor class, resource maxima (`maxOf`), every derived number with its grants. Also `addGrants`, the one removal path `removeRef` (loop-safe cascade, `removalSummary`), `grantChips`, `normalize()` (the single clamp), the container rules (`isContainer` = extradimensional, `fixContainers`: an `in` that names no container goes, an item inside is never equipped, coins on a non-container go to the purse; run by `migrate()` and first in `normalize()`), `carriedWeight` (skips items inside a container), the skill list and condition rule texts, and `migrate()` for old saves |
| `links.ts` | Links between entries: the `from` format (`'feature:<id>' \| 'item:<id>' \| 'spell:<id>'`), `sourceLabel`, `wouldLoop`/`fixLinks`, and when a grant or entry counts (`inactiveReason`, `isActive`, `activeGrants`, `effectsOn`; nothing from an item inside a container counts), `isEquipped` (`eq` and not inside a container: the one test every rule reads, while the row's toggle reads and writes `eq`). Imports types only |
| `hands.ts` | Weapons in hand (plan 5): `weaponKind` (base, catalog id or name slug), `weaponMatches` (kinds and categories such as `martial-melee-light`), `weaponsHeld`, `trimHands` (the hands rules), `setHands` (the only writer of `c.hands`; ends Shillelagh-like effects when their weapon is let go, with a notice), `putInHand`/`putAway`/`equipShield`. Imports types, `links.ts` and `slug` only |
| `inventory.ts` | Item sections and containers (plan 6): `addSection`/`renameSection`/`moveSection`/`removeSection`, `setItemSection` (also takes an item out of its container), `inventoryGroups` (sections in order, then the default list "Other items"; items inside a container are left out), `moveInto`/`takeOut`, `removeContainer` (`'out'` = the plain item removal, `'remove'` = contents too) with `removeContainerSummary`, `containerLoad`. Imports types, `logic.ts` and `hands.ts`; only components and tests import it |
| `actions.ts` | The Actions tab, computed at render time, never stored: `otherWeapons` (not in hand, none inside a container), `weaponAttacks` (per use: melee, thrown, ranged, two-handed; grant filters, Dueling, ability overrides), `unarmedStrike` (with the Grapple/Shove DC), `attacksPerAction`, `lightExtra` (Nick), `masterySlots`/`hasMastery`, `spellActions` (cantrip scaling, `healMod`, effect rows), `featureActions`, `extraDamage`, `diceText` (real minus) |
| `logic.test.ts`, `hands.test.ts`, `actions.test.ts`, `inventory.test.ts` | Tests for the rules; add one whenever rules behaviour changes |
| `storage.ts` | `useCharacters()` hook: multi-character list, localStorage persistence, JSON backup export/import; `applyPatch()` (patch, then `normalize()`) behind `update()` |
| `sheet.ts` | `Sheet` context (`c`, `update`, `edit`, `form`), `useEntryForm()` for add/edit forms (one open at a time), `saveEntry()` |
| `App.tsx` | Page assembly, UI-only state (edit mode, menu, active section, hit-die prompt), scroll-spy |
| `components/` | `TopBar` (bar, nav, menu with rests, Dawn, characters, backup), `RestPrompt` (die-roll regains before a rest), `EditDetails`, `Vitals` (AC and Speed panels), `HitPoints`, `Abilities`, `Senses`, `Defenses`, `Conditions`, `Resources`, `SourcePicker` (link an entry to a feature, item or spell, or name a source), `GrantEditor` (one form for every grant kind, `GRANT_FIELDS`; `LinkOrAdd`), `Chips` (a source's chips and its grant list), `nav.ts` (`jumpTo` a chip's target) |
| `components/pickers/` | Catalog pickers, each an in-place panel opened as a `pick-*` form: `SpellPicker` (list and level, or search by name), `ItemPicker` (categories or search), `FeaturePicker` (type, then class/subclass features, feats by category, species, backgrounds; Custom opens the hand form), `ChoiceFlow` (asks an entry's choices, nested entries' choices, "Already counted" and link-or-add, then hands `AddChoices` to `addFromCatalog`), `PickerResult` (tap to expand, Add), `usePicker` (add flow, catalog-swap message, loading/error frame) |
| `components/tabs/` | `ActionsTab`, `SpellsTab`, `InventoryTab`, `FeaturesTab`, `NotesTab` |
| `components/ui.tsx` | Shared bits: icons, `RemoveButton` (tap twice to confirm), `EntryActions`, `Step`, `UsePips`/`MarkPips`, `ProfDot`, `NumInput`, `EntryForm`, `TextField`, `useArmed` |
| `styles.css` | Colour tokens on `:root` (indigo theme, amber `--accent`), layout utilities, component classes |
| `catalog/` | Rules catalog: `schema.ts` (entry types, grant vocabulary, id rule, `PHB_TO_SRD`), `value.ts` (formulas and level tables), `merge.ts`/`load.ts` (SRD + pack, lazy; `catalogVersion`, `onCatalogReset`), `srd-chunk.ts` (the SRD dynamic import), `useCatalog.ts` (`useCatalog(active)` loads on first use and after a pack change; `entriesOf`), `copy.ts` (catalog entry → character: `spellFromEntry`, `itemFromEntry`, the custom form drafts `itemFromForm`/`spellFromForm`, choices `poolOptions`/`resolveChoices`/`missingPicks`, `prereqMet`, `addFromCatalog`, `matchId`/`classIdOf`/`subclassIdOf`, `featureCandidates`), `pack.ts`/`pack-db.ts` (PHB pack import, IndexedDB), generated `names.ts` |
| `data/srd/` | SRD 5.2.1 data built by `npm run srd` (CC-BY-4.0, see `code/SRD-ATTRIBUTION.md`); loaded as its own chunk |

Conventions:
- State changes go through `update(patch)` from `useSheet()`. A patch is a partial `Character` or a function of the current one. Put rule logic in `logic.ts`, not in components.
- Persisted data is the `Character` object. Transient UI state (open forms, armed buttons, menu) lives in React state and is never saved.
- Styling: CSS classes and tokens in `styles.css`. Inline `style` only for one-off or computed values. Icons are inline stroke SVGs, not emoji.
- Touch targets are at least 44 px. Use real `<button>`/`<a>`/`<input>` elements, with `aria-label` on icon-only buttons.
- Numbers show a real minus sign (`fmt()` → `−1`).

## Storage and offline

- localStorage keys: `dnd-index-v3` (`{active, list:[{id,name,info}]}`) and `dnd-sheet-v3:<id>` (one `Character` per key). These match the design prototype's keys. `dnd-layout` (`auto`/`one`/`two`) holds the menu's layout override per device; it isn't part of a `Character` or the backup. Changing the `Character` shape needs a step in `migrate()`, because existing saves are merged over `sampleCharacter()`. A new top-level key goes into `NEW_FIELDS` and onto `blankCharacter()` and both samples (plan 3 added `grants`, `defenses`, `profs`, `effectsOn`; `def`, `free` and `ch.bg` are gone, read from the raw save by their migration steps). Plan 4 added `ch.clsId`/`ch.subId` (catalog ids matched to the typed class and subclass, `''` from `FIXED_RECORDS` for old saves) and optional catalog fields on `Spell` and `Item`, each checked on load by `SPELL_FIELDS`/`ITEM_FIELDS` in `logic.ts` (a bad value goes, never the entry). Plan 5 added `hands` (item ids in hand, oldest first, one entry per hand; changed only through `setHands`, trimmed by `normalize()`) and `mastery` (Weapon Mastery kinds, oldest first), plus optional `Attack.econ`/`Attack.group` (`ATTACK_FIELDS`) and `Spell.healMod`; a save without `hands` loses its typed "Unarmed Strike" attack once (every character has a computed one). Plan 6 added `sections` (`{id, name}` in display order; an entry list, so a section needs a name, then duplicate ids and blank names go) and flat item fields `sec` (its section; one that is gone clears), `in` (the extradimensional container it sits in, one level deep) and `cp`…`pp` (a container's own coins), checked by `ITEM_FIELDS`; `fixContainers` then fixes the links between items. Item removal (`removeRef`) takes a removed container's contents out and moves its coins to the purse.
- Entries that can be granted carry `from` (and `srcKind`/`srcName`, `when`, `minLvl`, `needEq`/`needAtt`, `linked`); grants that aren't entries of a list live in `c.grants`. Every change runs through `normalize()` (in `update()` and at the end of `migrate()`): resource and item-charge counts at most their maximum, HP at most `maxHpOf`.
- Backup file: `{app:'dnd-character-sheet', version:1, exportedAt, characters:[Character…]}`. Import adds the characters next to the existing ones (new ids). Export uses the share sheet on iPad, or a download elsewhere.
- `vite.config.ts` contains an inline plugin that writes `dist/sw.js`. That service worker precaches every built file plus `public/` files (listed in `PUBLIC_FILES`). Pages load network-first; hashed assets are served cache-first. Add new `public/` files to `PUBLIC_FILES`.

## Rules reference

When implementing or checking a rule, use `reference/` (start at `reference/README.md`) instead of memory.
- **Every new or changed piece of rules logic must be checked against the ruleset in `reference/` before it is committed.** This covers `logic.ts`, rule text shown in the UI (conditions, death saves, rest summaries) and any number the sheet derives (bonuses, DCs, speeds). Cite the page in a comment, as the existing code does (`// ... (PHB p.29)`), and add a test in `logic.test.ts`. If the app deliberately simplifies a rule, say so in the comment.
- Citations use book pages `(PHB p.N)`; **PDF page = book page − 1**.
- `reference/source/phb2024-fulltext.txt` is the raw OCR text, with `===== PHB page N (pdf page M) =====` markers. Grep it for exact wording.
- Spell entries in `07-spells-*.md` use a fixed field layout, so they can be parsed into data later.
