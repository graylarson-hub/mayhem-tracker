const fs = require("fs"),
  path = require("path"),
  os = require("os"),
  assert = require("assert/strict"),
  Module = require("module");
const root = path.resolve(__dirname, ".."),
  esbuild = require("esbuild"),
  Database = require("better-sqlite3");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mayhem-reconcile-test-"));
const output = path.join(dir, "module.cjs");
esbuild.buildSync({
  entryPoints: [path.join(root, "src/main/reconcile-database.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["better-sqlite3"],
  outfile: output,
});
const original = Module._load;
Module._load = function (name, ...rest) {
  if (name === "better-sqlite3") return Database;
  return original.call(this, name, ...rest);
};
const { reconcileDatabase } = require(output);
(async () => {
  const source = path.join(dir, "source.db"),
    target = path.join(dir, "target.db"),
    backups = path.join(dir, "backups");
  const schema = `CREATE TABLE games(game_id INTEGER PRIMARY KEY, favorite INTEGER NOT NULL, note TEXT);CREATE TABLE riot_grades(game_id INTEGER PRIMARY KEY REFERENCES games(game_id),grade TEXT NOT NULL); PRAGMA user_version=5;`;
  const a = new Database(source),
    b = new Database(target);
  a.exec(schema);
  b.exec(schema);
  a.pragma("journal_mode=WAL");
  a.exec(
    `INSERT INTO games VALUES(1,1,'source'),(2,0,'unique'),(3,0,'fill');INSERT INTO riot_grades VALUES(1,'A'),(2,'S+');`,
  );
  b.exec(
    `INSERT INTO games VALUES(1,0,'destination'),(3,0,NULL);INSERT INTO riot_grades VALUES(1,'B');`,
  );
  b.close();
  const r = await reconcileDatabase(source, target, backups);
  assert.equal(r.tables.games.inserted, 1);
  assert.equal(r.tables.riot_grades.inserted, 1);
  const d = new Database(target);
  assert.deepEqual(d.prepare("SELECT * FROM games WHERE game_id=1").get(), {
    game_id: 1,
    favorite: 1,
    note: "destination",
  });
  assert.equal(d.prepare("SELECT grade FROM riot_grades WHERE game_id=1").get().grade, "B");
  assert.equal(d.prepare("SELECT note FROM games WHERE game_id=3").get().note, "fill");
  assert.equal(d.prepare("SELECT count(*) n FROM reconciliation_conflicts").get().n, 3);
  assert.equal(d.pragma("integrity_check", { simple: true }), "ok");
  assert.deepEqual(d.pragma("foreign_key_check"), []);
  d.close();
  const snap = new Database(path.join(r.folder, "source.db"), { readonly: true });
  assert.equal(snap.prepare("SELECT count(*) n FROM games").get().n, 3);
  snap.close();
  a.close();
  assert.equal(await reconcileDatabase(source, target, backups), null);
  const fresh = path.join(dir, "fresh.db");
  await reconcileDatabase(source, fresh, backups);
  const f = new Database(fresh);
  assert.equal(f.prepare("SELECT count(*) n FROM games").get().n, 3);
  assert.equal(f.pragma("user_version", { simple: true }), 5);
  f.close();
  const wrong = path.join(dir, "wrong.db");
  const w = new Database(wrong);
  w.exec(schema);
  w.pragma("user_version=4");
  w.close();
  await assert.rejects(reconcileDatabase(source, wrong, backups), /schema versions differ/);
  // The same profile is selected for both development and packaged path helpers.
  esbuild.buildSync({
    entryPoints: [path.join(root, "src/main/paths.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    outfile: path.join(dir, "paths.cjs"),
  });
  for (const isPackaged of [false, true]) {
    Module._load = function (name, ...rest) {
      if (name === "electron") return { app: { isPackaged, getPath: () => dir } };
      return original.call(this, name, ...rest);
    };
    delete require.cache[path.join(dir, "paths.cjs")];
    assert.equal(require(path.join(dir, "paths.cjs")).getDataDir(), path.join(dir, "data"));
  }
  console.log(
    "PASS: WAL-aware backups, union, conflicting grades archived, destination retained, null filling, favorites, empty destination, schema refusal, integrity, foreign keys, repeat runs, dev/package paths",
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    Module._load = original;
    fs.rmSync(dir, { recursive: true, force: true });
  });
