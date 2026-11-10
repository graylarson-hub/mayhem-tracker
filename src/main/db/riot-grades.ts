import { db } from "./connection";
import { normalizeGrade, RIOT_GRADE_SOURCE, type RiotGrade } from "../riot-grade";

// Deliberately no games foreign key: results can precede history, or be regular ARAM.
export const RIOT_GRADES_SCHEMA = `CREATE TABLE IF NOT EXISTS riot_grades (
  game_id INTEGER PRIMARY KEY,
  champion_id INTEGER NOT NULL CHECK(champion_id > 0),
  grade TEXT NOT NULL CHECK(grade IN ('S+','S','S-','A+','A','A-','B+','B','B-','C+','C','C-','D+','D','D-','F')),
  source TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  puuid TEXT,
  queue_id INTEGER
)`;

export function saveRiotGrade(row: RiotGrade): boolean {
  if (
    !Number.isSafeInteger(row?.game_id) ||
    row.game_id <= 0 ||
    !Number.isSafeInteger(row.champion_id) ||
    row.champion_id <= 0 ||
    normalizeGrade(row.grade) !== row.grade ||
    row.source !== RIOT_GRADE_SOURCE ||
    !Number.isSafeInteger(row.captured_at) ||
    row.captured_at <= 0 ||
    !(row.puuid === null || typeof row.puuid === "string") ||
    !(row.queue_id === null || (Number.isSafeInteger(row.queue_id) && row.queue_id > 0))
  ) {
    throw new Error("Invalid Riot grade record");
  }
  // Preserve the first validated observation, including its original capture time.
  return (
    db
      .prepare(`INSERT OR IGNORE INTO riot_grades
    (game_id, champion_id, grade, source, captured_at, puuid, queue_id)
    VALUES (@game_id, @champion_id, @grade, @source, @captured_at, @puuid, @queue_id)`)
      .run(row).changes > 0
  );
}

// A stored grade is only shown beside matching own-player stats. If identity
// was supplied in EOG, it must also match the game's owner.
export const RIOT_GRADE_MATCH_SQL = `(SELECT rg.grade FROM riot_grades rg
  WHERE rg.game_id = g.game_id AND rg.champion_id = ps.champion_id
  AND (rg.puuid IS NULL OR rg.puuid = g.puuid))`;
