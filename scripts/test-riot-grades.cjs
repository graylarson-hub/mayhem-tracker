// Offline integration tests use synthetic match data, never a user database.
const fs = require("fs");
const path = require("path");
const os = require("os");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "..");
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "mayhem-grade-tests-"));
process.on("exit", () => fs.rmSync(testDir, { recursive: true, force: true }));
esbuild.buildSync({
  stdin: {
    contents: `export * from './src/main/riot-grade';
    export * from './src/main/db';
    export * from './src/main/backup';
    export * from './src/main/import';`,
    resolveDir: root,
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: path.join(testDir, "modules.cjs"),
  external: ["better-sqlite3", "electron"],
});
// The bundle's only environment boundary is Electron's app/IPC objects.
const Module = require("module");
const original = Module._load;
Module._load = function (name, ...args) {
  if (name === "better-sqlite3") return require(path.join(root, "node_modules/better-sqlite3"));
  if (name === "electron")
    return { app: { isPackaged: true, getPath: () => testDir }, ipcMain: {} };
  return original.call(this, name, ...args);
};
// paths.ts uses a data subdirectory for packaged apps.
fs.mkdirSync(path.join(testDir, "data"), { recursive: true });
const m = require(path.join(testDir, "modules.cjs"));
const assert = require("assert/strict");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  // Build a synthetic v4 database without accessing anyone's match history.
  m.initDatabase();
  let db = m.getDatabase();
  const syntheticGame = {
    gameId: 90000000000,
    queueId: 450,
    gameMode: "ARAM",
    gameCreation: 1760000000000,
    gameDuration: 900,
    gameVersion: "16.22.1",
    participants: [
      { participantId: 1, puuid: "fixture-owner", championId: 150, teamId: 100,
        stats: { win: true, kills: 7, deaths: 3, assists: 15,
          totalDamageDealtToChampions: 14000, totalDamageTaken: 18000, goldEarned: 12000 } },
      { participantId: 2, puuid: "fixture-opponent", championId: 17, teamId: 200,
        stats: { win: false, kills: 3, deaths: 7, assists: 5 } },
    ],
  };
  assert.equal(m.insertGameFull(syntheticGame, "fixture-owner"), true);
  m.closeDatabase();
  const D = require(path.join(root, "node_modules/better-sqlite3"));
  const databasePath = path.join(testDir, "data", "matches.db");
  const v4 = new D(databasePath);
  v4.exec("DROP TABLE riot_grades");
  v4.pragma("user_version = 4");
  v4.close();
  const fixture = path.join(testDir, "fixture-v4.db");
  fs.copyFileSync(databasePath, fixture);
  m.initDatabase();
  db = m.getDatabase();
  assert.equal(db.pragma("user_version", { simple: true }), 5);
  assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
  const count = db.prepare("SELECT COUNT(*) n FROM games").get().n;
  assert.equal(count, 1);
  const before = db.prepare("SELECT * FROM player_stats ORDER BY game_id").all();
  const originalDb = new D(fixture, { readonly: true });
  assert.deepEqual(before, originalDb.prepare("SELECT * FROM player_stats ORDER BY game_id").all());
  originalDb.close();
  m.closeDatabase();
  m.initDatabase();
  db = m.getDatabase();
  assert.deepEqual(db.prepare("SELECT * FROM player_stats ORDER BY game_id").all(), before);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM riot_grades").get().n, 0);
  console.log("PASS v4 -> v5 migration, synthetic game preserved, idempotent reopen");

  const mastery = { gameId: 90000000001, championId: 150, grade: " a+ ", other: { grade: "S" } };
  const stats = {
    gameId: mastery.gameId,
    localPlayer: { championId: 150, puuid: "fixture-owner" },
  };
  const session = { gameData: { gameId: mastery.gameId, queue: { id: 450 } } };
  const row = m.validateGrade(mastery, stats, session);
  assert.equal(row.grade, "A+");
  assert.equal(row.queue_id, 450);
  assert.equal(m.validateGrade({ ...mastery, grade: null }, stats, session), null);
  assert.equal(m.validateGrade(mastery, { ...stats, gameId: 1 }, session), null);
  assert.equal(
    m.validateGrade(mastery, { ...stats, localPlayer: { championId: 17 } }, session),
    null,
  );
  assert.equal(m.validateGrade(mastery, stats, { gameData: { gameId: 1 } }), null);
  for (const x of ["S+", "S-", "B", "C-", "F"]) assert.equal(m.normalizeGrade(x), x);
  for (const x of ["S++", "E", "", 5, "A plus"]) assert.equal(m.normalizeGrade(x), null);
  assert.equal(m.saveRiotGrade(row), true);
  assert.equal(m.saveRiotGrade({ ...row, grade: "S" }), false);
  assert.equal(m.getMatchDetail(row.game_id), null);
  console.log(
    "PASS root-only validation, game/champion/session mismatch, normalization, dedup, ARAM without history",
  );

  // Delayed ingestion: reuse the synthetic payload under another ID.
  const zlib = require("zlib");
  const originalGame = db.prepare("SELECT * FROM games WHERE raw_gz IS NOT NULL LIMIT 1").get();
  const payload = JSON.parse(zlib.gunzipSync(originalGame.raw_gz));
  payload.gameId = row.game_id;
  const owner = originalGame.puuid;
  // Use the payload's real owner champion to test the exact join.
  const ownStats = db
    .prepare("SELECT champion_id FROM player_stats WHERE game_id=?")
    .get(originalGame.game_id);
  db.prepare("UPDATE riot_grades SET champion_id=?, puuid=? WHERE game_id=?").run(
    ownStats.champion_id,
    owner,
    row.game_id,
  );
  assert.equal(m.insertGameFull(payload, owner), true);
  assert.equal(m.getMatchDetail(row.game_id).stats.riot_grade, "A+");
  assert.equal(
    m.getMatchHistory(1000, 0).matches.find((x) => x.game_id === row.game_id).riot_grade,
    "A+",
  );
  db.prepare("UPDATE riot_grades SET champion_id=9999 WHERE game_id=?").run(row.game_id);
  assert.equal(m.getMatchDetail(row.game_id).stats.riot_grade, null);
  db.prepare("UPDATE riot_grades SET champion_id=?, puuid=? WHERE game_id=?").run(
    ownStats.champion_id,
    "wrong-owner",
    row.game_id,
  );
  assert.equal(m.getMatchDetail(row.game_id).stats.riot_grade, null);
  db.prepare("UPDATE riot_grades SET puuid=? WHERE game_id=?").run(owner, row.game_id);
  m.saveRiotGrade({ ...row, game_id: row.game_id + 1 });
  console.log("PASS delayed ingestion joins, champion/owner mismatch hidden");

  const saved = db.prepare("SELECT * FROM riot_grades ORDER BY game_id").all();
  const json = path.join(testDir, "transfer.json");
  await m.writeExportTo(json);
  assert.deepEqual(JSON.parse(fs.readFileSync(json)).riot_grades, saved);
  const backup = await m.createBackup("manual");
  db.exec("DELETE FROM riot_grades");
  await m.importBackupFile(json, null);
  assert.deepEqual(
    m.getDatabase().prepare("SELECT * FROM riot_grades ORDER BY game_id").all(),
    saved,
  );
  m.getDatabase().exec("DELETE FROM riot_grades");
  await m.restoreBackup(backup.file);
  assert.deepEqual(
    m.getDatabase().prepare("SELECT * FROM riot_grades ORDER BY game_id").all(),
    saved,
  );
  console.log("PASS JSON export/import and SQLite backup/restore, including grade-only record");

  let reads = 0,
    saves = 0;
  const capture = new m.GradeCapture(
    async (p) => {
      reads++;
      if (reads <= 3) return null;
      return p.includes("mastery") ? mastery : p.includes("eog-stats") ? stats : session;
    },
    () => saves++,
    [0, 2, 2],
  );
  capture.trigger();
  capture.trigger();
  await wait(40);
  assert.equal(saves, 1);
  capture.trigger();
  await wait(10);
  assert.equal(saves, 1);
  capture.stop();
  let n = 0;
  const bounded = new m.GradeCapture(
    async () => {
      n++;
      return null;
    },
    () => assert.fail(),
    [0, 2, 2],
  );
  bounded.trigger();
  await wait(40);
  bounded.trigger();
  await wait(10);
  assert.equal(n, 9);
  bounded.stop();
  let release;
  const dismissed = new m.GradeCapture(
    (p) =>
      new Promise((r) => {
        if (p.includes("mastery")) release = () => r(mastery);
        else r(p.includes("eog-stats") ? stats : session);
      }),
    () => assert.fail("dismissed sample saved"),
    [0],
  );
  dismissed.trigger();
  dismissed.stop();
  release();
  await wait(10);
  assert.deepEqual([...m.RESULT_PHASES], ["WaitingForStats", "PreEndOfGame", "EndOfGame"]);
  console.log(
    "PASS retries, repeated events, budget exhaustion, dismissal during request, all results phases",
  );
  m.closeDatabase();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
