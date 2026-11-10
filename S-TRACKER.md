# S- Tracker fork

## Current local continuation — Riot grades

This source is now **1.15.1-riot-grades.1**, continued from the exact S- Tracker
UI build described below. The existing S- Tracker page remains intact.
See `../START-HERE.md` for the current app ZIP, production data paths,
backup/restore instructions and live acceptance check, and
`../IMPLEMENTATION-NOTES.md` for reconciliation and test evidence.
The version/build locations in the older sections below describe the November 7
delivery, rather than this new grade-capture delivery.

To repeat offline tests from this source directory:

```powershell
node scripts/test-riot-grades.cjs ../backups/working-app-before-grades.db
```

Tests use a disposable copy under the delivery's sibling `work` directory.
The 623-game baseline assertion intentionally verifies this supplied snapshot.
For an offline folder build with the already installed Electron runtime:

```powershell
npm run build
node node_modules/electron-builder/cli.js --win --dir --config.directories.output=../riot-grades-build-local --config.electronDist=node_modules/electron/dist --config.win.signAndEditExecutable=false
```

The ZIP contains that full `win-unpacked` directory. Copy all files together.
The executable is unsigned; this build skips changing its Windows shell metadata,
so app-internal package version is the authoritative version.

This local branch (`feature/s-minus-tracker`) adds **S- Tracker** between
**Challenges** and **Total Stats**. The original Challenges page is unchanged.

## Run

Use Node.js 24 and npm. Open a terminal in this repository:

```powershell
npm ci
npm run dev
```

Start League and sign in, then open **S- Tracker**. Missing champions are shown
alphabetically with portraits and names. Search filters immediately; punctuation
and case are ignored (`kaisa` matches `Kai'Sa`). The right-aligned search works
within **All**, **Needed**, or **Earned**. One view is active at a time; **Needed**
is the default. Earned champions are marked **S- earned**. There are no manual
completion controls. Buttons follow the Augments style, and the count beside
them uses the small summary text from Total Stats.

The page uses the app's existing challenge 101301 snapshot and live update
events. Opening it requests a background refresh; the existing connection and
post-game tracking also refresh progress. Updates depend on when the League
client publishes its challenge data. The timestamp identifies the last successful
reading. Saved progress remains available when disconnected; portraits still
use the app's existing CommunityDragon URLs.

Development stores data in this repository's `data` folder, independently of the
portable release's `%APPDATA%\mayhem-tracker\data`. A first development run must
connect to League to populate challenge progress and fetch champion metadata.

## Check and package

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run dist
```

The final command creates `dist/MayhemTracker.exe`. Development is the easiest
way to test this modification first. The packaged build retains the upstream
app identity, data location, and update mechanism. An upstream update can replace
this custom build; keep this source branch to rebuild it.

## Live acceptance checks

1. Confirm the sidebar order: Challenges, S- Tracker, Total Stats.
2. Compare earned champions against challenge 101301 on the Challenges page.
3. Search a missing champion, then an earned champion; the latter appears when
   **All** or **Earned** is selected. Check each filter, clear search, and check
   alphabetical ordering. Clicking an already active filter keeps that view.
4. Leave the tracker open through a game that earns a first S- or better. Once
   League updates and the existing post-game sync runs, the champion should
   disappear from Needed and appear in Earned and All.
5. Close League and reopen the tracker: saved progress and its timestamp remain.
6. Resize to the existing minimum of 900 × 600 and verify readable cards and
   scrolling. The native window limits and sidebar behavior have not changed.

## Architecture and scope

- Navigation: `src/renderer/components/Sidebar.tsx`; HashRouter route in
  `src/renderer/App.tsx`; new page in `src/renderer/pages/STracker.tsx`.
- Sync: `src/main/challenges.ts` reads the existing League challenge endpoints,
  shapes `completedChampionIds`, saves snapshots, and broadcasts updates through
  the existing preload API. No new endpoint, IPC channel, migration, or polling.
- Roster: existing `useChampionData` loads Data Dragon metadata cached by
  `src/main/dragon.ts`; `ChampionIcon` provides CommunityDragon portraits.
- Champion stats already exist through `getChampionStatsAll` and the Champions
  page. Adding those would require account/queue/season filter decisions and
  represent local match history rather than lifetime challenge completion, so
  they are deferred from this focused MVP.
- Window: `src/main/index.ts` defaults to 1280 × 820 and allows resizing down to
  900 × 600. The new grid adapts to available width. A narrower mini-window would
  require broader layout work, so window management is unchanged.

## Verification of this change

- Typecheck, production build, formatting check, and lint for the three changed
  source files passed.
- Mocked React component checks passed for default filtering, alphabetical
  order, normalized search, the three exclusive completion filters, default
  Needed selection, right-aligned search wrapper, small summary text, live completion updates,
  all-complete and unavailable-data states, offline saved progress, subscription
  cleanup, failed IPC, and a live update arriving before a slow stored response.
- Full-project lint reports existing errors in `useMatches.ts`,
  `SeasonRecapCard.tsx`, and `Trends.tsx`; those files were not modified.
- Live League-client acceptance checks and visual window checks still need to
  be run on the user's machine.

## UI update build and backup

The UI update uses the existing v1.15.0 fork based on commit `209f03a` on
`feature/s-minus-tracker`. Only `STracker.tsx` changes app behavior in this update;
the existing router and sidebar modifications remain intact. No dependencies,
sync logic, database, or other pages were changed. Completion filtering remains
separate from search so additional filters can be added later.

Before editing, source, compiled output, and existing local project data were
archived at `../backups/mayhem-tracker-before-ui-tweaks-20261107.tar.gz`, excluding
dependencies and Git metadata. No existing packaged executable was found in
this project. The new portable build is written separately using:

```powershell
npm run dist -- --config.directories.output=../s-tracker-ui-update
```

The UI update's final deliverable is `../MayhemTracker-S-Tracker-UI.zip`.
Extract it into a new folder and run `Mayhem Tracker.exe`, keeping the other
files alongside it. The Windows app folder built successfully, but this editing
environment rejected the single-file NSIS packager with an "Illegal System DLL
Relocation" error. A ZIP of the built app avoids that packaging-only problem.
No single-file `MayhemTracker.exe` was produced. The database dependency also
passed an in-memory SQLite smoke test. Live League-client and visual checks
remain for the user's machine.

Dependency installation in the editing environment required skipping install
scripts because of Windows folder access and a native build attempt. If that
happens locally, the shipped SQLite prebuilds allow this alternative:

```powershell
npm ci --ignore-scripts
node node_modules/electron/install.js
npm run dev
```

Nothing has been pushed and no upstream pull request has been created. To keep
this in your own GitHub fork later, create the fork on GitHub, point a separate
remote at it, and push this branch when ready. `origin` currently points at the
upstream repository.
