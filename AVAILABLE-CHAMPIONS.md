# Available champions in S- Tracker

Available sits directly after Earned. It shows both needed and earned champions, with the existing completion labels and search. It includes the local player's current champion and the shared bench, labelled separately. Teammates' assigned champions are excluded because they require an accepted trade. This is a read-only view of LCU session availability, not a promise a bench swap will succeed (ownership, disabled champions, timing and other players can affect that). It does not show the entire owned/free champion pool or hypothetical reroll outcomes.

## API evidence

Validated against the extracted LCU schema: https://raw.githubusercontent.com/MingweiSamuel/lcu-schema/gh-pages/lcu/openapi.json
The GET /lol-champ-select/v1/session response references LolChampSelectChampSelectSession; its fields include benchChampionIds (integer array), benchEnabled, isSpectating, localPlayerCellId, myTeam and gameId. Player selections have cellId and championId. Gameflow uses phase and gameData.queue.id, also already used in this repository.

Modern benchChampions is documented in Overwolf's raw League launcher champ-select payload: https://dev.overwolf.com/ow-electron/live-game-data-gep/supported-games/league-of-legends-launcher/
The object array's championId shape is also used by this source implementation: https://github.com/WordlessMeteor/LoL-DIY-Programs/blob/main/Customized%20Program%2022%20-%20ARAM%20Champ%20Select%20Probability%20Test.py
Modern benchChampions takes precedence over legacy benchChampionIds. Only positive integer champion IDs are accepted, with deduplication and team-held champions removed from the bench. Unknown shapes produce an unavailable state rather than guessing field names. No recursive scan of session data.

## Lifecycle and storage

Uses the existing authenticated LCU HTTP connection and shared event socket. Session/gameflow changes refresh availability; phase exit, session Delete, socket loss and disconnect clear it immediately. A two-second fallback recovers missed events and covers startup into an existing lobby. Reads are serialized; generation checks prevent stale replies after exit or newer events. Gameflow is checked again after reading champ select. Only queues 2400 and 2450 qualify. Nothing writes to SQLite, grades or challenge completion records.

## Run and build

From C:\Users\grayl\Projects\mayhem-tracker:

- npm run dev starts the development app.
- npm run build compiles the app; npm run preview opens that build.
- npm run dist creates the portable Windows executable in dist/MayhemTracker.exe (may require download access for packaging tools).
- npm run test:availability runs offline lifecycle/parser tests.
- npm run test:grades runs the existing isolated SQLite grade regression suite.
- npm run typecheck, npm run lint and npm run format:check validate source.

If dependencies are absent, run npm ci first. The installed dependencies were used for this change.

## Live acceptance

Start League and sign in, open S- Tracker and select Available. Enter Mayhem champion select; compare Current champion and On bench against the client. Take a bench champion and confirm both labels update. Teammate selections should not appear as directly available. Search and S- completion labels should still work. Dodge or start the match and confirm the list clears; repeat after restarting the tracker mid-lobby and after closing League. Live acceptance requires a running Mayhem lobby; offline fixtures cannot validate a particular Riot client version.

## Champion-select rejection follow-up

The live client was inspected using GET /help?target=TeamBuilderDirect-ChampSelectSession and GET /help?target=TeamBuilderDirect-BenchChampion. These confirm benchChampions is an array of objects containing championId and isPriority, with localPlayerCellId, myTeam, benchEnabled and isSpectating on the session. The parser no longer requires the independent gameflow and champ-select game IDs to agree; phase and queue still gate the result, with serialized reads and generation invalidation protecting exit/disconnect races. A regression covers differing IDs. Unsupported readings now emit a deduplicated diagnostic containing only IDs, flags, cell IDs and shape booleans, never chat, credentials or player identities.

Run node scripts/diagnose-availability.cjs for a read-only live check. It watches for a lobby and saves only the champion/phase fields in availability-live-fixture.tmp.json for reproduction. Stop it with Ctrl+C.

## Confirmed live result — November 11, 2026

Captured a real queue-2400 lobby. Gameflow retained the preceding match ID throughout ChampSelect, while the champion-select session already identified the new match. The original equality check rejected every valid reading. The repaired parser correctly returned the local champion and seven bench entries, including live bench and selection changes. The user confirmed that Available populated and updated in the app. After the phase advanced to InProgress, the tracker window showed an empty availability list, as intended. The offline suite now includes a sanitized reproduction of the final Rumble selection; real game IDs and player identities are excluded. The temporary live diagnostic was stopped after validation.
