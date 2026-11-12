# Persistent database

Both `npm run dev` and packaged builds use `%APPDATA%\mayhem-tracker\data\matches.db`. The profile name is pinned before the single-instance lock, independent of the source folder and portable executable location. Backups and logs are siblings of `data`. An explicit `--user-data-dir` selects an isolated profile for testing.

On the first updated development launch, an existing project-local `data\matches.db` is reconciled into the shared database. SQLite online backups of both inputs are kept in `backups\reconcile-*` before a transaction inserts missing records. Incompatible schemas stop startup. Existing values win when two populated fields differ; missing values and selected favorites can be filled. Both complete differing rows are retained in `reconciliation_conflicts` and the JSON report. Completion and the full report are stored in `reconciliation_sources`, so a repeated launch does not re-import the legacy file. The legacy database is never deleted. Retire old development builds after switching; they still write to the old location.

Run `npm run test:reconciliation` for synthetic WAL, backup, grade-conflict, union, schema, repeat-run, and path checks. `npm run test:grades` and `npm run test:availability` cover the existing features.

Build with `npm run dist`. For an existing local Electron distribution, use `npm run build` followed by `npx electron-builder --win --config.electronDist=node_modules/electron/dist`. Fully quit the tracker using its tray menu, back up the old portable executable, and replace it with `dist\MayhemTracker.exe`. Keep AppData in place; no database import is needed. Development changes and executable replacement must never remove that profile.
