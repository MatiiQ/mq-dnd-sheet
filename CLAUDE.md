# D&D Character Sheet

Interactive D&D 2024 (Player's Handbook 2024) character sheet for iPad. It's a static React web app hosted on GitHub Pages and installed from Safari with "Add to Home Screen". It runs offline, and all character data stays on the device.

- Live: https://matiiq.github.io/mq-dnd-sheet/
- Repo: https://github.com/MatiiQ/mq-dnd-sheet (public, branch `main`)
- Design source: Claude Design canvas https://claude.ai/code/artifact/14f009f2-87d8-4f14-8590-3c89bac0558f (`project/Main.dc.html` = landscape sheet, `project/Portrait.dc.html` = portrait). The app reproduces its look and behaviour; read it with the Artifact tool, not WebFetch.

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
```

Toolchain: Node 22+ (CI uses 22), React 19, Vite 8, TypeScript 7, Vitest 5. The app has no other runtime dependencies besides `@fontsource` (Cinzel and Inter, latin subsets, bundled so they work offline).

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml` (test → build → deploy-pages). Pages source is "GitHub Actions". Vite uses `base: './'`, so the build works under any repo path. Installed Home Screen apps get the new version on their next online launch.

## App architecture (`code/src/`)

| File | Role |
|---|---|
| `types.ts` | `Character` model and its sub-types |
| `defaults.ts` | `sampleCharacter()` (Ilyra Moonbrook, Wood Elf Ranger 5) and `blankCharacter()` |
| `logic.ts` | Pure rules functions (`Character → Character`): modifiers, skills, damage/heal/temp HP, death saves, massive damage, concentration DC, rests, hit dice, conditions, exhaustion, speed. Also holds the skill list and condition rule texts, and `migrate()` for old saves |
| `logic.test.ts` | Tests for `logic.ts`; add one whenever rules behaviour changes |
| `storage.ts` | `useCharacters()` hook: multi-character list, localStorage persistence, JSON backup export/import |
| `sheet.ts` | `Sheet` context (`c`, `update`, `edit`, `form`), `useEntryForm()` for add/edit forms (one open at a time), `saveEntry()` |
| `App.tsx` | Page assembly, UI-only state (edit mode, menu, active section, hit-die prompt), scroll-spy |
| `components/` | `TopBar` (bar, nav, menu with rests/characters/backup), `EditDetails`, `Vitals`, `HitPoints`, `Abilities`, `Senses`, `Defenses`, `Conditions` |
| `components/tabs/` | `ActionsTab`, `ResourcesTab`, `SpellsTab`, `InventoryTab`, `FeaturesTab`, `NotesTab` |
| `components/ui.tsx` | Shared bits: icons, `RemoveButton` (tap twice to confirm), `EntryActions`, `Step`, `UsePips`/`MarkPips`, `ProfDot`, `NumInput`, `EntryForm`, `TextField`, `useArmed` |
| `styles.css` | Colour tokens on `:root` (dark theme, gold `--accent`), layout utilities, component classes |

Conventions:
- State changes go through `update(patch)` from `useSheet()`. A patch is a partial `Character` or a function of the current one. Put rule logic in `logic.ts`, not in components.
- Persisted data is the `Character` object. Transient UI state (open forms, armed buttons, menu) lives in React state and is never saved.
- Styling: CSS classes and tokens in `styles.css`. Inline `style` only for one-off or computed values. Icons are inline stroke SVGs, not emoji.
- Touch targets are at least 44 px. Use real `<button>`/`<a>`/`<input>` elements, with `aria-label` on icon-only buttons.
- Numbers show a real minus sign (`fmt()` → `−1`).

## Storage and offline

- localStorage keys: `dnd-index-v3` (`{active, list:[{id,name,info}]}`) and `dnd-sheet-v3:<id>` (one `Character` per key). These match the design prototype's keys. Changing the `Character` shape needs a step in `migrate()`, because existing saves are merged over `sampleCharacter()`.
- Backup file: `{app:'dnd-character-sheet', version:1, exportedAt, characters:[Character…]}`. Import adds the characters next to the existing ones (new ids). Export uses the share sheet on iPad, or a download elsewhere.
- `vite.config.ts` contains an inline plugin that writes `dist/sw.js`. That service worker precaches every built file plus `public/` files (listed in `PUBLIC_FILES`). Pages load network-first; hashed assets are served cache-first. Add new `public/` files to `PUBLIC_FILES`.

## Rules reference

When implementing or checking a rule, use `reference/` (start at `reference/README.md`) instead of memory.
- Citations use book pages `(PHB p.N)`; **PDF page = book page − 1**.
- `reference/source/phb2024-fulltext.txt` is the raw OCR text, with `===== PHB page N (pdf page M) =====` markers. Grep it for exact wording.
- Spell entries in `07-spells-*.md` use a fixed field layout, so they can be parsed into data later.
