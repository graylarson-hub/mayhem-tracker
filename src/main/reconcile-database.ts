import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

type Row = Record<string, any>;
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const encode = (value: unknown) => JSON.stringify(value);

// Snapshot through SQLite so committed WAL records are included. Never remove
// legacy files. Conflicting values stay active in the destination and both
// complete rows remain in a durable audit table and JSON report.
export async function reconcileDatabase(source: string, destination: string, backupDir: string) {
  if (path.resolve(source).toLowerCase() === path.resolve(destination).toLowerCase()) return null;
  if (!fs.existsSync(source)) return null;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
  const target = new Database(destination);
  let legacy: Database.Database | undefined;
  const sourceKey = path.resolve(source).toLowerCase();
  try {
    const marker = target
      .prepare("SELECT name FROM sqlite_master WHERE name='reconciliation_sources'")
      .get();
    if (
      marker &&
      target.prepare("SELECT 1 FROM reconciliation_sources WHERE source=?").get(sourceKey)
    )
      return null;
    legacy = new Database(source, { readonly: true, fileMustExist: true });
    for (const db of [target, legacy]) {
      if (db.pragma("integrity_check", { simple: true }) !== "ok")
        throw new Error("Reconciliation refused: integrity check failed");
    }
    const tables = legacy
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'reconciliation_%'",
      )
      .all() as { name: string; sql: string }[];
    const destinationTables = target
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all();
    const empty = destinationTables.length === 0;
    if (
      !empty &&
      target.pragma("user_version", { simple: true }) !==
        legacy.pragma("user_version", { simple: true })
    )
      throw new Error(
        "Reconciliation refused: schema versions differ; upgrade each database first",
      );
    for (const { name } of tables) {
      const columns = legacy.prepare(`PRAGMA table_info(${quote(name)})`).all();
      if (!(columns as Row[]).some((c) => c.pk)) throw new Error(`No primary key: ${name}`);
      if (
        !empty &&
        encode(columns) !== encode(target.prepare(`PRAGMA table_info(${quote(name)})`).all())
      )
        throw new Error(`Reconciliation refused: schema differs in ${name}`);
    }
    const folder = fs.mkdtempSync(path.join(backupDir, "reconcile-"));
    await legacy.backup(path.join(folder, "source.db"));
    await target.backup(path.join(folder, "destination-before.db"));
    legacy.close();
    legacy = new Database(path.join(folder, "source.db"), { readonly: true });
    const snapshot = legacy;
    const report = {
      source,
      destination,
      folder,
      tables: {} as Record<string, { inserted: number; filled: number; conflicts: number }>,
      conflicts: [] as Row[],
    };
    target.pragma("foreign_keys = ON");
    target
      .transaction(() => {
        if (empty) {
          for (const { sql } of tables) target.exec(sql);
          for (const { sql } of snapshot
            .prepare(
              "SELECT sql FROM sqlite_master WHERE type IN ('index','trigger') AND sql IS NOT NULL",
            )
            .all() as { sql: string }[])
            target.exec(sql);
          target.pragma(`user_version = ${snapshot.pragma("user_version", { simple: true })}`);
        }
        target.exec(`CREATE TABLE IF NOT EXISTS reconciliation_sources (source TEXT PRIMARY KEY, completed_at TEXT NOT NULL, report TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS reconciliation_conflicts (source TEXT NOT NULL, table_name TEXT NOT NULL, row_key TEXT NOT NULL, destination_json TEXT NOT NULL, source_json TEXT NOT NULL, PRIMARY KEY(source,table_name,row_key));`);
        for (const { name } of tables) {
          const cols = snapshot.prepare(`PRAGMA table_info(${quote(name)})`).all() as Row[];
          const keys = cols
            .filter((c) => c.pk)
            .sort((a, b) => a.pk - b.pk)
            .map((c) => c.name as string);
          const names = cols.map((c) => c.name as string);
          const where = keys.map((k) => `${quote(k)} IS ?`).join(" AND ");
          const find = target.prepare(`SELECT * FROM ${quote(name)} WHERE ${where}`);
          const insert = target.prepare(
            `INSERT INTO ${quote(name)} (${names.map(quote)}) VALUES (${names.map(() => "?")})`,
          );
          const counts = (report.tables[name] = { inserted: 0, filled: 0, conflicts: 0 });
          for (const row of snapshot
            .prepare(`SELECT * FROM ${quote(name)}`)
            .iterate() as Iterable<Row>) {
            const key = keys.map((k) => row[k]);
            const current = find.get(...key) as Row | undefined;
            if (!current) {
              insert.run(...names.map((n) => row[n]));
              counts.inserted++;
              continue;
            }
            const differences = names.filter((n) => encode(current[n]) !== encode(row[n]));
            if (!differences.length) continue;
            const conflict = {
              table: name,
              key,
              columns: differences,
              destination: current,
              source: row,
            };
            report.conflicts.push(conflict);
            counts.conflicts++;
            target
              .prepare("INSERT INTO reconciliation_conflicts VALUES (?,?,?,?,?)")
              .run(sourceKey, name, encode(key), encode(current), encode(row));
            // Fill absent values and retain a favorite selected in either copy.
            const fill = differences.filter(
              (n) =>
                (current[n] == null && row[n] != null) ||
                (name === "games" && n === "favorite" && row[n] === 1),
            );
            if (fill.length) {
              target
                .prepare(
                  `UPDATE ${quote(name)} SET ${fill.map((n) => `${quote(n)}=?`)} WHERE ${where}`,
                )
                .run(...fill.map((n) => row[n]), ...key);
              counts.filled++;
            }
          }
        }
        const violations = target.pragma("foreign_key_check") as Row[];
        if (violations.length) throw new Error(`Foreign key check failed: ${encode(violations)}`);
        target
          .prepare("INSERT INTO reconciliation_sources VALUES (?,?,?)")
          .run(sourceKey, new Date().toISOString(), encode(report));
      })
      .immediate();
    if (target.pragma("integrity_check", { simple: true }) !== "ok")
      throw new Error("Post-merge integrity check failed");
    fs.writeFileSync(path.join(folder, "report.json"), JSON.stringify(report, null, 2), {
      flag: "wx",
    });
    console.log(
      `Database reconciliation: ${path.join(folder, "report.json")}; ${report.conflicts.length} differing rows archived; destination values retained unless absent or favorite selected`,
    );
    return report;
  } finally {
    legacy?.close();
    target.close();
  }
}
