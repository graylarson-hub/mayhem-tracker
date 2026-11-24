# Mayhem Tracker

Desktop app for tracking ARAM Mayhem match history in League of Legends. Connects to the League Client (LCU) to automatically record matches and display stats.

## About this fork

This fork builds on [Yhprum’s Mayhem Tracker](https://github.com/Yhprum/mayhem-tracker) for players working toward an S− or better on every champion.

- **S-Tracker** shows which champions still need an S− and which have earned one, using challenge progress from the League client.
- **Available Champions** shows your current champion and the shared bench during Mayhem champion select. Open the **Available** tab in S-Tracker to see which picks still need an S−.
- **Riot grade history** saves the letter Riot awards on the post-game screen, including plus and minus grades. Leave the tracker running through the end of the game to capture the grade. Grades can also be captured in regular ARAM.

<img width="1280" height="820" alt="image" src="https://github.com/user-attachments/assets/cdce7dae-d96e-4be0-8d0a-bf9c7ee245d3" />

## Features

- Automatic match detection via League Client API
- Supports the limited-time ARAM Mayhem Classic-ish game mode
- Match history with detailed game breakdowns
- Live scoreboard while a game is running, and a post-game recap when it ends
- Export any game as a shareable PNG from the recap or the match list
- Season recaps for each Mayhem set (or all time), shareable as an image the same way
- Champion, augment, and friend stats with win rates
- Aggregate statistics from all players in your games
- Local SQLite database

## Download

To use the fork features on Windows, follow [Development](#development) to install the dependencies, then run `npm run dist`. The portable executable is written to `dist\MayhemTracker.exe`.

The original tracker is available from [Yhprum’s releases](https://github.com/Yhprum/mayhem-tracker/releases/latest).

## Usage

1. Start the League client and sign in. The app talks to the client's local API, so the client has to be running for it to detect your account, import history, or record new games.
2. Launch Mayhem Tracker. The dot beside Settings at the top of the window turns green once it finds the client.
3. The first time an account connects it automatically imports your past Mayhem games. Riot only serves an account's last 1000 matches across all queues, so that window is how far back the import can reach. A large one takes a few minutes and fills the app in as it runs.
4. After that it records each game as you finish it, so leave it running while you play.

You can re-run the import at any time from **Settings → Backfill match history**, which is also how you finish one you cancelled. Games already stored stay readable with the client closed; only importing and recording need it open.

Development and portable builds share `%APPDATA%\mayhem-tracker\data\matches.db`. The fork displays upstream release notes. Install updated fork builds manually. See [persistent data and backups](PERSISTENT-DATA.md).

## Support

Questions, bug reports, and feature ideas are welcome on the [Discord server](https://discord.gg/ezZbpVefFH). For a bug, attach `main.log` from **Settings → Log file → Open folder** if you can.

## Tech Stack

Electron + React + TypeScript, built with electron-vite. Uses Tailwind CSS for styling, better-sqlite3 for local storage, and league-connect for LCU integration.

## Development

```bash
npm install
npm run dev       # start in dev mode
```

better-sqlite3 ships prebuilt Node-API binaries, so there is no native module to rebuild for Electron. The Electron runtime is installed by the Electron dependency setup. If `npm run dev` reports `Error: Electron uninstall`, run `node node_modules/electron/install.js` to install the missing runtime, then run `npm run dev` again.

These run on pull requests, again before a tagged release, and locally via
`preversion`, so `npm version` will not tag a tree that fails them:

```bash
npm run typecheck
npm run lint
npm run format    # rewrites in place; format:check only reports
```

## Build

```bash
npm run dist      # build Windows portable executable
```

## Disclaimer

Mayhem Tracker was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.
