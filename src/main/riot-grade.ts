// Only the root mastery grade belongs to the local player. Never search recursively.
export const RIOT_GRADE_SOURCE = "/lol-end-of-game/v1/champion-mastery-updates";
export const RESULT_PHASES = new Set(["WaitingForStats", "PreEndOfGame", "EndOfGame"]);

export interface RiotGrade {
  game_id: number;
  champion_id: number;
  grade: string;
  source: string;
  captured_at: number;
  puuid: string | null;
  queue_id: number | null;
}

export function normalizeGrade(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const grade = value.trim().toUpperCase();
  return /^(S[+-]?|[ABCD][+-]?|F)$/.test(grade) ? grade : null;
}

function positiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function validateGrade(mastery: any, stats: any, session: any): RiotGrade | null {
  const grade = normalizeGrade(mastery?.grade);
  const gameId = mastery?.gameId;
  const championId = mastery?.championId;
  if (!grade || !positiveId(gameId) || !positiveId(championId)) return null;
  if (stats?.gameId !== gameId || stats?.localPlayer?.championId !== championId) return null;
  const sessionGame = session?.gameData;
  // A newer session must not be paired with stale end-of-game resources.
  if (positiveId(sessionGame?.gameId) && sessionGame.gameId !== gameId) return null;
  const queue = sessionGame?.gameId === gameId ? sessionGame?.queue?.id : stats?.queueId;
  return {
    game_id: gameId,
    champion_id: championId,
    grade,
    source: RIOT_GRADE_SOURCE,
    captured_at: Date.now(),
    puuid:
      typeof stats.localPlayer.puuid === "string" && stats.localPlayer.puuid
        ? stats.localPlayer.puuid
        : null,
    queue_id: positiveId(queue) ? queue : null,
  };
}

// One bounded attempt chain per results window, unaffected by history ingestion.
// Events can prompt an earlier attempt; a noisy resource cannot reset the budget.
export class GradeCapture {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private active = false;
  private attempts = 0;
  private generation = 0;
  private saved = new Set<number>();
  constructor(
    private read: (path: string) => Promise<any>,
    private save: (grade: RiotGrade) => void,
    private delays = [0, 250, 500, 1000, 2000, 3000, 5000, 8000, 15000, 30000, 60000, 60000],
  ) {}

  trigger() {
    if (!this.active) {
      this.active = true;
      this.attempts = 0;
    }
    if (this.busy || this.timer || this.attempts >= this.delays.length) return;
    void this.attempt(this.generation);
  }

  stop() {
    this.generation++;
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.attempts = 0;
  }

  private async attempt(generation: number) {
    this.busy = true;
    this.attempts++;
    try {
      const [mastery, stats, session] = await Promise.all([
        this.read(RIOT_GRADE_SOURCE),
        this.read("/lol-end-of-game/v1/eog-stats-block"),
        this.read("/lol-gameflow/v1/session"),
      ]);
      if (generation !== this.generation) return;
      const grade = validateGrade(mastery, stats, session);
      if (grade && !this.saved.has(grade.game_id)) {
        this.save(grade);
        this.saved.add(grade.game_id);
        if (this.saved.size > 100) this.saved.delete(this.saved.values().next().value!);
      }
      if (grade) {
        this.attempts = this.delays.length;
        return;
      }
    } catch {
      // A missing/transient resource or failed write can be retried within this window.
    } finally {
      this.busy = false;
      if (generation === this.generation && this.active && this.attempts < this.delays.length) {
        this.timer = setTimeout(() => {
          this.timer = null;
          void this.attempt(generation);
        }, this.delays[this.attempts]);
        this.timer.unref?.();
      }
    }
  }
}
