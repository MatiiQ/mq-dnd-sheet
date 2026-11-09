# D&D Character Sheet

An interactive character sheet for **D&D 2024** (Player's Handbook 2024), built for the iPad and
other tablets. It is a static web app: you open it once in the browser, add it to the Home Screen, and from
then on it works offline like a native app. Everything is saved on the device. There is no account, no server and no tracking.

**Live:** https://matiiq.github.io/mq-dnd-sheet/

## How it works

The sheet is one page. A bar at the top shows the name, a few pills (HP, Hit Dice, Inspiration or any
resource, you pick them in Edit mode), and two buttons: **Rest · More** (menu) and **Edit**. Below it sit the
core blocks (Hit Points, Abilities, Senses, Defenses, Conditions, Resources) and five tabs: **Actions, Spells,
Inventory, Features & Traits, Notes**. On a wide screen the core sits on the left and the tabs on the right;
on a narrow one everything scrolls in one column. Menu › Layout forces 1 or 2 columns.

- **Play mode** (default) is for use at the table: tap to damage, heal, spend a slot, tick a resource. Nothing
  can be changed by accident.
- **Edit mode** (pencil) unlocks the setup: name, classes (one row per class, for a multiclass character), ability scores, proficiencies, max HP, speeds,
  spell slots, and the add, edit and remove buttons on every list. Tap **Done** to go back. Changes save as you
  type.
- **Everything derived shows its working.** Tap AC, Speed, an ability modifier or a spell DC to see the parts
  that make it up.
- **Sources and grants.** A feature, item or spell can *give* things: a bonus, a speed, a resistance, a sense,
  a resource, a spell, extra damage. The thing it gives shows a "Source" and a chip you can tap to jump to
  it. Unequip the item or remove the feature and what it gave goes too (the remove button lists what else
  will go before you confirm).
- **Destructive buttons ask twice.** Remove, Delete character, Long Rest and Clear need a second tap.
- **Rules data** comes from a built-in catalog. Pick from it (spells, items, features, feats, species,
  backgrounds), or type your own with **Custom**.

## Features

### Hit Points, Hit Dice and death saves
- Type an **Amount**, then tap **Damage**, **Heal** or **Set Temp**. Damage takes temporary HP first, applies
  massive damage and, when it hits 0, starts death saves. **Undo** shows for a few seconds after each.
- Damage while concentrating shows the Constitution save DC to roll.
- **Hit Dice** are counted per die size, so a multiclass character has a pool per die (a d10 pool and a d8
  pool). **Spend Hit Die** uses a die (pick the size when you have several) and tells you what to roll; type the
  total in Amount, then tap Heal. Undo gives back that die.
- At 0 HP the **death saves** appear (successes, failures, Stable and Dead notices).
- Edit mode: base max HP, and an optional "original max" so a reduced maximum shows how far it is from normal.
- HP per level from feats like Tough is added to the maximum; tap the max to see why.
- When your Constitution modifier changes, the maximum follows it: 1 HP per level for each point.

### Characters
- With no character of your own, the app opens on the **Characters** screen: your characters (name, class and levels,
  an HP bar), **+ New character** (**Step by step** or **Blank sheet**, which opens in edit mode), **Import backup**, and
  the two examples. An example opens on launch only next to a character of your own. **Menu › Characters** shows it any
  time, with "Back to" the open sheet; the menu has no new-character button. Delete and duplicate stay in the menu.

### Creating a character
- **Menu › Characters › + New character › Step by step** opens the guided creator: one question per screen, with a
  stage stepper on top (Class, Origin, Abilities, Equipment, Details, one stage per level, Summary; above starting level 3
  the levels share one stage). Class tiles show the hit die, primary abilities, saves and, with the PHB data imported,
  what the class likes and how complex it is; a starting level from 1 to 20. Origin: background, its choices, species,
  two languages besides Common, the class skills. Abilities: Standard Array (filled with your class's suggestion), Point
  Buy (27 points) or rolled totals, then the background bonus (+2 and +1, or +1 to all three). Equipment: your class's
  and your background's packages. Then details, each level from 1 to the starting level (what it gives, its choices,
  multiclassing through "Change class"), and one summary with **Create character**.
- Your answers are saved as a draft after every change: reopening the app offers to continue or discard it.

### Levels and classes
- **Menu › Level up** (or tap the class line in the header) opens a full-screen wizard: pick which class gets the level
  (or add a class: the multiclass prerequisite is checked, with "Do it anyway"), then HP (the fixed value or your roll),
  the new features and their choices, a subclass, an Ability Score Improvement or feat, new cantrips and spells to
  prepare, and Weapon Mastery picks. A summary shows every change before Finish. Spell slots, the Pact Magic pool and
  your prepared count follow the class tables, unless you edited them by hand (the summary offers the table).
- **Undo level** takes the last level back, listing what goes first. Levels set by hand (before the first level-up) are
  the baseline and can't be undone.
- Without the rules data (offline before it ever loaded), level-up still adds the HP and the class level; features are
  then added by hand.

### Armor Class, Initiative, Speed, Proficiency
- AC comes from armor and shield in Inventory, an unarmored formula (Edit), AC spells and your own
  custom bonuses. Armor you aren't trained in is flagged.
- Speed panel: walk, climb, swim, fly, burrow, with exhaustion, armor Strength requirements and conditions
  that set speed to 0 applied for you.

### Abilities and skills
- Six ability cards with modifier, saving throw and the skills under each (2024 layout). Tap the modifier for the
  breakdown.
- In Edit mode: set the original score, use **− / +** for temporary changes (with Reset), tap *Saving Throw*
  to toggle proficiency, and tap a skill to cycle Not proficient → Proficient → Expertise. Proficiency or
  expertise given by a feature shows "from <source>".
- Passive Perception, Investigation and Insight sit in **Senses**, where you can add senses such as Darkvision.

### Defenses and conditions
- **Defenses:** resistances, vulnerabilities, immunities (damage or conditions) and advantage on saves,
  picked from lists. Advantage on saves also takes free text.
- **Conditions:** tap a condition to switch it on and read its rule. Exhaustion goes 0 to 6 and applies its
  penalties.

### Resources and rests
- Counters with a maximum (a number, or a formula such as `pb` or `wis>=1`) that refill on a **Short Rest**,
  **Long Rest**, **Dawn**, or by hand, with optional partial regains such as "1d6+1 at dawn".
- Inspiration is a separate counter.
- **Rest · More › Short Rest / Long Rest / Dawn** apply the 2024 rules in one tap (a rest needs at least 1 HP).
  - *Short Rest* refills what recharges on one and the Pact Magic slots. Then you spend Hit Dice yourself:
    **Spend Hit Die** tells you what to roll.
  - *Long Rest* sets HP to max, clears temp HP, restores all spell slots and Hit Dice, resets death saves, lowers
    exhaustion by 1, restores a reduced HP maximum or ability scores, refills long-rest resources, and ends
    concentration and spell effects such as Mage Armor.
  - *Dawn* refills what recharges at dawn (many magic items).
  - If a counter regains a die roll, the app asks for the roll first. A notice at the top of Hit Points lists
    what changed.

### Actions tab
- Filters: All, Action, Bonus, Reaction.
- **Weapon attacks:** only the weapons you hold are listed. Mark a weapon **In hand**, or **1 hand / 2 hands**
  for Versatile ones. The two-hand rules and Shield are handled, and weapons are put away when you pick up
  others. Each row shows the to-hit and damage, expands to show where each number comes from, and covers
  thrown and ranged uses, ammunition, critical range, Dueling, Nick (the extra light attack), and attacks per
  action. **Unarmed Strike** is always there, with the Grapple and Shove DC.
- **Weapon Mastery:** choose your mastery weapons (the limit comes from your features).
- **Spells** that deal damage, force saves or heal appear with their numbers and cast buttons, and cantrips
  scale with level.
- **Other** lists feature actions, with their uses.
- **+ Add attack** and **+ Add extra damage** (such as Sneak Attack) for anything the catalog doesn't know.

### Spells tab
- Spellcasting ability, save DC, spell attack and prepared count (tap DC or attack for the breakdown). A
  multiclass caster has one prepared count per casting class ("Ranger 3/5 · Sorcerer 4/6"); Edit mode sets each
  class's maximum and spellcasting ability.
- **Spell slots:** tap a circle to mark one used. Edit mode sets the maximums. **Pact slots** (Warlock) are their
  own pool, at one slot level, refilled by a Short Rest; either kind of slot casts any of your spells.
- **+ Add spell** searches the catalog by list and level or by name; **Custom spell** is the hand form.
- **Prepared spells:** turn on *Track prepared spells*, tap **P** to prepare. Always-prepared spells don't
  count towards the limit. Show all or prepared only, and sort the list.
- On a spell: **Cast** (spends a slot), **Upcast** (a higher one), and a **concentration** toggle that shows in
  the top bar. Spells that raise AC have a switch to turn them on.

### Inventory tab
- Items in **sections** you name and order, plus the default "Other items".
- Each item: **Equipped / Carried**, quantity or charges, and an *Add grant* form for magic effects.
- Containers: tick *Extradimensional* for a Bag of Holding or similar. Use **Move to** to put items in. What is
  inside doesn't count toward your load.
- **Attunement:** three slots for equipped items.
- **Coins** with weight, and **Carried** against your carrying capacity, drag, lift and push limits (from
  Strength and size).
- **+ Add item** searches the catalog, and asks for the base, bonus or charges where a magic item needs it.

### Features & Traits tab
- Class and subclass features, feats, species and background traits. **+ Add feature or trait** walks you
  through the choices (such as a Fighting Style), and asks which of the numbers on your sheet already include it.
- Each entry can *give* things (the grant kinds cover senses, resources, defenses, spells, AC, speed, ability
  scores, proficiencies, bonuses, extra damage, actions and more).
- Proficiencies (armor, weapons, tools, languages and so on) are listed and added here.

### Notes
Appearance, Personality, Backstory and Session notes.

### Characters and backup (Rest · More menu)
- Several characters; **Characters › + New character** gives the guided creator or a blank sheet, and the two examples
  (Ilyra, Ranger 5, and Seren, Druid 12) open from the Characters screen. **Duplicate** and **Delete** are in the menu.
- **Backup:** *Export this*, *Export all* (a JSON file, shared to Files or iCloud Drive from the iPad, downloaded elsewhere) and
  *Import* (adds the characters next to your own; it never overwrites).
- If the device refuses to store a change, a red banner at the top tells you to export a backup.

### Offline
The app caches itself the first time you open it, then works with no connection. Open it online now and then
and it picks up new versions.

## Install on iPad

1. Open https://matiiq.github.io/mq-dnd-sheet/ in Safari.
2. Share › **Add to Home Screen** (keep "Open as Web App" on).
3. Launch it from the Home Screen icon. It updates itself on the next online launch.

Data lives only in that Home Screen app. Deleting the icon deletes the characters, so use
Menu › Backup › **Export all** now and then (it saves a JSON file to Files or iCloud Drive).

Use the Home Screen app, not a Safari tab: Safari may delete a website's saved data after 7 days without a
visit, and a tab and the Home Screen app keep separate data.

## Install on an Android tablet or a computer

1. Open https://matiiq.github.io/mq-dnd-sheet/ in Chrome or Edge.
2. Android: browser menu › **Add to Home screen** › Install. Computer: the install icon in the address bar,
   or browser menu › **Install**.
3. Launch it from the icon. It updates itself on the next online launch.

Here the installed app and the browser tabs of that site share the same data, and removing the icon keeps it;
clearing the browser's site data deletes it. Export a backup now and then (Menu › Backup › **Export all**
downloads a JSON file). Firefox on Android installs it the same way; Firefox on a computer can't install it,
but the sheet works in a tab, offline too.

On a wide screen (from about 1060 × 700 points) the sheet shows two columns; Menu › Layout changes that.

## Development

Needs Node 22 or newer. Run every command from `code/`.

```sh
cd code
npm install
npm run dev
```

### Commands

| Command | What it does |
|---|---|
| `npm install` | Installs the dependencies. |
| `npm run dev` | Starts the Vite dev server on port 5173, reachable from the iPad at `http://<your-computer's-IP>:5173` on the same Wi-Fi. No service worker, so changes show on reload. |
| `npm test` | Runs Vitest once: the rules logic (`logic*.test.ts`, `hands.test.ts`, `actions.test.ts`, `inventory.test.ts`), the catalog, the data parsers, the service worker and the component tests. Add a test whenever rules behaviour changes. |
| `npm run build` | Type-checks the app (`tsc --noEmit`) and the scripts (`tsc -p scripts`), then builds the production app into `dist/`, including the service worker `dist/sw.js`. |
| `npm run preview` | Serves `dist/` with the service worker active, to test the offline behaviour and installing as a Home Screen app. Run `npm run build` first. |
| `npm run icons` | Redraws the app icons into `public/icons/*.png` (a gold d20 on a dark ground). A new file in `public/` must also be added to `PUBLIC_FILES` in `vite.config.ts`, or the service worker won't cache it. |
| `npm run srd` | Rebuilds the SRD rules data (`src/data/srd/*.json`) and `src/catalog/names.ts` from the SRD 5.2.1 text. Needs the SRD PDF, see [code/scripts/srd/README.md](code/scripts/srd/README.md). |
| `npm run pack` | Builds the private PHB data pack from `reference/`. See below. |
| `npm run audit-catalog` | Rebuilds the PHB pack, then checks the catalog against the SRD text, `reference/` and the app's code. Needs `reference/` and `resources/srd/srd.txt`, and fails without them. |
| `npm run check-phb` | Builds the app, then fails if `dist/` or any tracked file contains Player's Handbook text. See below. |
| `npm run hooks` | Once per clone: points git at `code/scripts/hooks/`, so the pre-push hook runs `audit-catalog` (when `reference/` exists) and `check-phb` before every push. |

Stack: React 19, Vite 8, TypeScript 7, Vitest 5. The only other runtime dependency is `@fontsource`
(Fraunces and Figtree, bundled so they work offline).

### How the code is organised

- `code/src/logic.ts` and its neighbours (`hands.ts`, `inventory.ts`, `actions.ts`, `links.ts`, `migrate.ts`) are
  the rules: pure functions from a character to a character. Components call them through `update()`.
- `code/src/components/` is the UI: the top bar, the core blocks, the tabs and the catalog pickers.
- `code/src/catalog/` is the rules catalog (spells, items, features and so on) and how an entry becomes part of
  a character.
- Characters are saved in `localStorage`; a service worker (`dist/sw.js`, generated at build time) caches the app
  for offline use.
- `CLAUDE.md` has the full architecture, the storage format and the conventions.

## Deploy

`.github/workflows/deploy.yml` runs the tests, builds, and publishes to GitHub Pages on every push to `main`.
One-time setup: in the GitHub repo, Settings › Pages › Source: **GitHub Actions**.

## Rules data and the Player's Handbook

The app has two sources of rules data (spells, items, feats, species, class features and so on).

**SRD 5.2.1: built in and public.** `code/src/data/srd/` holds data from the System Reference Document 5.2.1
(CC-BY-4.0), made by `npm run srd`. It ships in the app, loads as its own chunk the first time a picker opens, and
is what everyone gets. See [code/SRD-ATTRIBUTION.md](code/SRD-ATTRIBUTION.md) and `code/scripts/srd/README.md`.

**Player's Handbook 2024: private and optional.** The Handbook is copyrighted, so its text must never reach this
public repo. `reference/` (a condensed, page-cited copy of the book used to check the rules) and `resources/`
(the PDF) are in `.gitignore`. The PHB data lives only on the device, as follows:

1. `npm run pack` reads `reference/` (spells, feats, origins, equipment, the twelve classes, and the hand-written
   overlays in `reference/authored/` that add grants and choices the parser can't read). It checks every entry
   and writes two files into `reference/build/`:
   - `phb-pack.json`: the PHB entries the SRD doesn't have, plus those that replace an SRD entry. It prints how many
     entries of each kind were parsed, dropped (already in the SRD) and written.
   - `check-phrases.json`: short phrases (8 words) taken from the start and middle of every PHB description, used
     by the check below.
2. Get `phb-pack.json` onto the iPad (AirDrop or Files) and import it **inside the installed Home Screen app**:
   Rest · More › **PHB data** › *Import PHB data*. Safari tabs and the Home Screen app keep separate storage,
   so importing in a tab does nothing for the installed app. The file is checked before it is stored; a bad
   file leaves the current data alone.
3. The data is kept in the device's IndexedDB, never in the repo and never in the deployed app. **Remove** in the
   same place takes it out. Without it the pickers show SRD entries only.

`reference/` is not in the repo, so `npm run pack` works only on a machine that has it. Anyone else can use the
app with the SRD data and type the rest by hand.

### Keeping the Handbook out of the repo

- `npm run check-phb` builds the app, then searches `dist/` and every tracked file for the check phrases. It
  prints each hit and exits with an error, or prints `No PHB text found.` It needs `reference/build/check-phrases.json`,
  so run `npm run pack` first. Phrases that the SRD data or the app's own text also contain are skipped, so shared
  wording never blocks.
- `npm run hooks` (once per clone) installs the pre-push hook. Before a push it runs the same check on `dist/`
  and the tracked files, and also on **every commit being pushed**: its added lines, its message, and its file
  names. Text added and later removed still counts, because it would stay public in the history. It also refuses
  any file under `reference/`, `resources/` or `code/scripts/local/`, and any binary file other than the app icons.
- On a clone without `reference/` the hook says the push is **unchecked** and lets it through. Push only from the
  machine that holds `reference/`.
- Tests that need PHB data live in `code/scripts/local/` (gitignored) and never run in CI.

