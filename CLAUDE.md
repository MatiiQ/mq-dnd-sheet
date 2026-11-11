# D&D Character Sheet

Interactive D&D 2024 (Player's Handbook 2024) character sheet for iPad. It's a static React web app hosted on GitHub Pages and installed from Safari with "Add to Home Screen". It runs offline, and all character data stays on the device.

- Live: https://matiiq.github.io/mq-dnd-sheet/
- Repo: https://github.com/MatiiQ/mq-dnd-sheet (public, branch `main`)
- Design source: Claude Design canvas https://claude.ai/code/artifact/14f009f2-87d8-4f14-8590-3c89bac0558f (`project/Main.dc.html` = landscape sheet, `project/Portrait.dc.html` = portrait). The app reproduces its behaviour; read it with the Artifact tool, not WebFetch. Since the 2026-10-24 restyle the app's look (Tabletop tokens, Midnight & candlelight) no longer follows the canvas, which still documents behaviour.

## Layout

```
.github/workflows/deploy.yml   CI: test, build code/, publish code/dist to Pages (must stay at repo root)
code/                          the web app (run all npm commands here)
README.md                      user-facing overview and setup (root, not code/)
docs/                          local plans and audits, gitignored (the "plan N" references point here)
reference/                     condensed PHB 2024 rules data (markdown), gitignored
resources/                     PHB 2024 PDF, gitignored
```

`reference/` and `resources/` are copyrighted Player's Handbook material. They are in `.gitignore` and must never be committed, because the repo is public.

## Commands (from `code/`)

```sh
npm run dev      # Vite dev server on :5173, --host so the iPad can open it over Wi-Fi
npm test         # Vitest, every *.test.ts(x) under code/ (rules, catalog, storage, UI, scripts)
npm run build    # tsc --noEmit, tsc -p scripts (typechecks scripts/), then vite build into dist/
npm run preview  # serve dist/ with the service worker active
npm run icons    # regenerate public/icons/*.png (dependency-free PNG writer)
npm run srd      # rebuild src/data/srd/*.json and src/catalog/names.ts from the SRD 5.2.1 text (scripts/srd/README.md)
npm run pack     # build reference/build/phb-pack.json (PHB data for the device) and the check phrases, from reference/
npm run audit-catalog  # rebuild the pack, then catalog against the SRD text, reference/ and the app's code; fails on a missing input, a discrepancy not in reference/audit-known.json, a known one whose note changed or that is gone, or a changed grant hash
npm run check-phb  # build, then fail if dist/ or a tracked file holds PHB description text (needs reference/ and npm run pack)
npm run hooks    # once per clone: install the pre-push hook that runs audit-catalog (when reference/ exists) and check-phb on every pushed commit
```

`code/scripts/audit/` holds that audit: `catalog-audit.test.ts` also runs in `npm test`, and is skipped without the built pack and `resources/srd/srd.txt`, so CI runs only its fixture tests (`checks.test.ts`). After `npm run srd` or `npm run pack`, run `npm run audit-catalog`, then read `reference/build/audit-report.txt`. `AUDIT_UPDATE=1 npm run audit-catalog` accepts the current findings and grant hashes (prints keys added, removed and changed, backs up the old list to `audit-known.json.bak`, puts new keys in `todo`). The known list `reference/audit-known.json` holds `accepted` (fine as they are), `todo` (real defects still to fix), each key with its note and a reason, and `grants` (a hash per entry). A green audit means nothing new, not a clean catalog: read `todo`. It is gitignored with the rest of `reference/` (it can quote PHB content), so it is not on GitHub or in CI. The README's "The catalog audit" and "How `npm run check-phb` works" sections describe both checks for the user.

`code/scripts/local/` (gitignored) holds PHB-side tests that need `reference/`; they don't exist in CI or on a clone without it, so a green CI says nothing about them.

Toolchain: Node 22+ (CI uses 22), React 19, Vite 8, TypeScript 7, Vitest 5. The app has no other runtime dependencies besides `@fontsource` (Fraunces and Figtree, latin subsets, bundled so they work offline).

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml` (test → build → deploy-pages). Push only from the machine that holds `reference/`: the pre-push hook (`npm run hooks`) checks every pushed commit for PHB text, and on a clone without `reference/` it lets the push through unchecked. Pages source is "GitHub Actions". Vite uses `base: './'`, so the build works under any repo path. Installed Home Screen apps get the new version on their next online launch.

## App architecture (`code/src/`)

| File | Role |
|---|---|
| `types.ts`, `defaults.ts` | `Character` model; `sampleCharacter()` (Ilyra Moonbrook, Wood Elf Ranger 5), `blankCharacter()`, `SAVE_VERSION` |
| `logic.ts` | Pure rules (`Character → Character`) and every derived number with its grants. Owns `normalize()` (the single clamp: runs in `update()` and at the end of `migrate()`; resources and item charges at most their maximum, HP at most `maxHpOf`, and first `fixContainers`), `removeRef` (the one removal path, loop-safe cascade), `addGrants`, `maxOf`, the cast functions (`castSpell`…), `castFx` cleanup. A value reads the class level of what it belongs to, the Proficiency Bonus the total character level |
| `migrate.ts` | `migrate()`: a full, valid character from any save or backup. Version steps (`STEPS`) first, then one cleaner per entry list with its field tables (`SPELL_FIELDS`, `ITEM_FIELDS`, `ATTACK_FIELDS`, `FEATURE_FIELDS`, `CREATURE_FIELDS`) and `isEntry`. Never changes the object it reads. Imports `logic.ts`, never the reverse |
| `links.ts` | The `from` format (`'feature:<id>' \| 'item:<id>' \| 'spell:<id>' \| 'class:<row id>'`; a class row's grants are always on and a row ends a loop chain) and when a grant or entry counts (`inactiveReason`, `isActive`, `activeGrants`). Nothing from an item inside a container counts; at quantity 0 only a switched-on grant without `needEq` does, so a drunk potion lasts. An aura's `incap` and `needAura` run last in `inactiveReason`. `isEquipped` (`eq` and not inside a container) is the one test every rule reads. Imports types only |
| `hands.ts` | Weapons in hand. `setHands` is the only writer of `c.hands` (`normalize()` trims it); it ends Shillelagh-like effects when their weapon is let go. Imports types, `links.ts` and `slug` only |
| `inventory.ts` | Item sections and containers (`isContainer` = extradimensional, one level deep; `removeContainer` `'out'` vs `'remove'`). Imports types, `logic.ts` and `hands.ts`; only components and tests import it |
| `creatures.ts` | Companions and forms (`Character.creatures`). `assumeForm` is the only way a form turns on. `fixCreatures` runs in `normalize()` before `fixCastFx`. `logic.ts` calls only `fixCreatures`; `longRest` and `removeRef` handle cards inline (unlink, never delete) |
| `actions.ts` | The Actions tab, computed at render time, never stored (weapon/unarmed/spell/feature rows, masteries, `diceText` with a real minus) |
| `levelup.ts` | The level engine: `levelPlan`, `applyLevel` (the class level rises only through `withLevel`; pushes a `LevelRecord`), `undoLevel`, `levelScreens`/`levelStepReady`. Step keys are built from catalog ids and the class level only, so stored answers replay on a fresh sheet. `applyLevel(…, { noLinks })` is the creator's no-questions mode. A short option list never strands a level (`levelStepReady` needs `min(owed, offered)`) |
| `creator.ts` | The creator's answers (`CreatorAnswers`: catalog ids and step keys only, never a generated id), `replaySteps`/`replay` (what Create builds; `replay` never throws, what no longer fits goes in `dropped`; `fill` is the creator's temporary answers, not used by Create), `creatorScreens` (each `Screen` has `ready` and `missing` from the same rules as Next), `stepperModel`, the pure answer writers, and the draft (`readDraft`/`writeDraft`/`clearDraft`). Writers that recreate levels drop their ticks (`dropLevelTicks`) |
| `layout.ts` | Layout mode (`auto`/`one`/`two`, `dnd-layout`) and the wide-screen query; `styles.css` keys two-column rules on `.sheet.wide` |
| `storage.ts` | `useCharacters()`: multi-character list, localStorage, JSON backup; `applyPatch()` (patch, then `normalize()`) behind `update()`. `savedIds()` reads only the index and key names, never a sheet, because the crash screen calls it |
| `sheet.ts` | `Sheet` context (`c`, `update`, `edit`, `form`, transient `focus`/`reveal`) and `useEntryForm()` (one add/edit form open at a time) |
| `App.tsx` | `App`: the store, the welcome screen, the creator and the draft prompt. `SheetApp`: page assembly and UI-only state (edit mode, menu, active section, level-up), scroll-spy |
| `components/` | One file per panel or screen (`TopBar`, `Vitals`, `HitPoints`, `Abilities`, `Conditions`, `Resources`, `Companions`, `Welcome`, `CreatorWizard`/`CreatorScreens`, `LevelUpWizard`, `GrantEditor`, `SourcePicker`, `CrashScreen`…). `LevelScreen` is shared by the level-up wizard and the creator. `nav.ts`: `jumpTo`, `revealOf` |
| `components/pickers/` | Catalog pickers, each an in-place panel opened as a `pick-*` form. `ChoiceFlow` asks an entry's choices, then hands `AddChoices` to `addFromCatalog`; it is controlled when `at` (a step's `choiceKey`) is given, which the creator and level-up screens use. The creator's `OriginChoice` is such a controlled flow |
| `components/tabs/` | `ActionsTab`, `SpellsTab`, `InventoryTab`, `FeaturesTab` (features waiting for a later level sit in a folded "Later levels" group), `NotesTab` |
| `components/ui.tsx` | Shared bits: icons, `RemoveButton` (tap twice to confirm), `ChoiceTile` (select button plus a sibling More button, both 44 px; `held` struck through, tapped out never in), `Stepper`, `applyCast`, form fields |
| `styles.css` | Colour tokens on `:root` (Tabletop tokens, Midnight & candlelight), layout utilities, component classes |
| `catalog/` | Rules catalog: `schema.ts` (entry types, grant vocabulary, id rule, `PHB_TO_SRD`, the one `DAMAGE_TYPES` list), `value.ts` (formulas and level tables), `merge.ts`/`load.ts` (SRD + PHB pack; a pack class whose id the SRD has gives the SRD class only `likes`, `complexity` and `stdArray`), `useCatalog.ts`, `flow.ts` (ChoiceFlow's answers as pure functions; `noCounts`/`noLinks` are the creator's modes), `copy.ts` (catalog entry → character: `addFromCatalog`, `blocksPick`, `resolveChoices`, `prereqMet`), `pack.ts`/`pack-db.ts` (PHB pack import, IndexedDB), generated `names.ts`. Options a pool offers (Eldritch Invocations, Maneuvers, Metamagic) are `feature` entries with `of`, offered by `feature:of=<kind>` pools |
| `data/srd/` | SRD 5.2.1 data built by `npm run srd` (CC-BY-4.0, see `code/SRD-ATTRIBUTION.md`); loaded as its own chunk |

Tests: `*.test.ts` sit next to the code (`logic.test.ts`, `logic.hp.test.ts`, `logic.spells.test.ts`, `logic.ac.test.ts`, `logic.grants.test.ts`, `hands.test.ts`, `actions.test.ts`, `inventory.test.ts`, `levelup.test.ts`, `migrate.test.ts`). Add one whenever rules behaviour changes, in the file of its topic. Shared helpers: `test-fixtures.ts` (items, `withClass`, the `make`/`sp`/`ac` shorthands, `noIds`) and `test-dom.ts` (happy-dom: `mount`, `tap`, `btn`, `label`, `type`). `fixtures/save-v<N>-*.json` are frozen saves: never regenerate or edit one.

Conventions:
- State changes go through `update(patch)` from `useSheet()`. A patch is a partial `Character` or a function of the current one. Put rule logic in `logic.ts`, not in components.
- Persisted data is the `Character` object. Transient UI state (open forms, armed buttons, menu) lives in React state and is never saved.
- Styling: CSS classes and tokens in `styles.css`. Inline `style` only for one-off or computed values. Icons are inline stroke SVGs, not emoji.
- Touch targets are at least 44 px. Use real `<button>`/`<a>`/`<input>` elements, with `aria-label` on icon-only buttons.
- Numbers show a real minus sign (`fmt()` → `−1`).

## Storage and offline

- localStorage keys: `dnd-index-v3` (`{active, list:[{id,name,info}]}`) and `dnd-sheet-v3:<id>` (one `Character` per key). `dnd-layout` (`auto`/`one`/`two`) is a per-device layout override, not part of a `Character` or the backup. `dnd-draft` (`{ v, step, answers, passed? }`, `DRAFT_VERSION` 1) holds the creator's one unfinished draft; not a `Character`, never in a backup; a draft that doesn't parse or has another `v` is dropped with a notice. `step` is a screen key (`'origin/background'`). `DRAFT_VERSION` stayed 1 for the string step, so an older offline copy discards a new draft as damaged (accepted).
- Existing saves are merged over `blankCharacter()`, so a missing or damaged field reads as blank. Real saves exist, and the app writes `migrate()`'s result back on launch, so anything it drops is gone.
- Adding a field: a new top-level key every save must have needs `blankCharacter()`, both samples, a type and a version step (the frozen v2 fixture lacks it and must load unchanged). A later key is optional instead: absent by default, copied by `migrate()`, cleaned by `normalize()`, read as `c.castFx ?? {}`; `castFx` and `creatures` are not in `blankCharacter()` or the samples (an older offline copy drops them, accepted). A new optional field needs no version, but add it to its field table (`SPELL_FIELDS`, `ITEM_FIELDS`, `ATTACK_FIELDS`, `FEATURE_FIELDS`, `CREATURE_FIELDS`) so `migrate()` checks it (a bad value goes, never the entry).
- Version bump: reshaping, renaming or removing a saved field, or changing a value list `migrate()` checks (grant kinds and fields, `PROF_CATS`, defense kinds…), needs: bump `SAVE_VERSION` in `defaults.ts`, add `STEPS[old]` in `migrate.ts` (old save → new, before the repair), add a fixture of the new format in `src/fixtures/`, and keep every old fixture passing. A save without `v` is version 1. Save v2 (`SAVE_VERSION` 2, fixture `save-v2-multiclass.json`) replaced `ch.cls/sub/level/hdDie/prepMax` with `classes` (`ClassRow`; the first row is the starting class, the character level is their sum), `levels` (`LevelRecord` history, oldest first; `base` records cannot be undone; records that don't add up to the rows collapse to one base record with a notice), `conBase` (the CON modifier already inside `maxHp`/`origHp`), `hdUsed` per die size and the Pact pool (`pactMax`/`pactLvl`/`pactUsed`). Grants from a class row use `from: 'class:<row id>'`.
- `load()` keeps the raw text of a v1 save in `<key>:unreadable` before its first (one-way) upgrade, and does the same for a save with a `v` above `SAVE_VERSION` (a newer app's, opened by an older offline copy), with a notice.
- Entries that can be granted carry `from` (and `srcKind`/`srcName`, `when`, `minLvl`, `needEq`/`needAtt`, `linked`); grants that aren't entries of a list live in `c.grants`.
- Backup file: `{app:'dnd-character-sheet', version:1, exportedAt, characters:[Character…], unreadable?:[{key,text}…]}`. A sheet key holding anything but a character opens blank with a notice, after its raw text is copied once to `dnd-sheet-v3:<id>:unreadable` (never listed as a character, kept when the character is deleted; a backup carries it, import ignores it). `initialStore()` lists every sheet key, so a damaged index loses no character. Launch: with no character of your own the welcome screen opens (`Store.c` null, `EMPTY_STORE`; `persistStore` then writes only the index with `active: ''`, and `update` does nothing); else an open example reopens, else the last character of your own. Import adds characters next to the existing ones (new ids). Export uses the share sheet on iPad, or a download elsewhere.
- Cast results (spec 2026-11-07): `castSpell`, `castFree`, `castFromItem`, `castRitual` return `null` when the rules refuse the cast and a patch (possibly `{}`) when it happened; `castFromScroll` returns `null` instead of `c`. `refundFree` is the free-cast give-back at 0. A caller that acts on success (the summon step) computes the cast from the render's `c` in the click handler and applies it as a plain patch (`applyCast` in `ui.tsx`), never inside an `update` function.
- An inline plugin in `vite.config.ts` writes `dist/sw.js` from `scripts/sw-source.ts` (tested in `sw-source.test.ts`). That service worker precaches every built file plus `public/` files (listed in `PUBLIC_FILES`). Pages load network-first, and an error page or a failed fetch falls back to the cached page; only a worker's install writes the offline copy, so it always matches its files. Hashed assets are served cache-first. Add new `public/` files to `PUBLIC_FILES`.

## Rules reference

When implementing or checking a rule, use `reference/` (start at `reference/README.md`) instead of memory.
- **Every new or changed piece of rules logic must be checked against the ruleset in `reference/` before it is committed.** This covers `logic.ts`, rule text shown in the UI (conditions, death saves, rest summaries) and any number the sheet derives (bonuses, DCs, speeds). Cite the page in a comment, as the existing code does (`// ... (PHB p.29)`), and add a test in the matching `logic*.test.ts`. If the app deliberately simplifies a rule, say so in the comment.
- Citations use book pages `(PHB p.N)`; **PDF page = book page − 1**.
- `reference/source/phb2024-fulltext.txt` is the raw OCR text, with `===== PHB page N (pdf page M) =====` markers. Grep it for exact wording.
- Spell entries in `07-spells-*.md` use a fixed field layout, so they can be parsed into data later.
