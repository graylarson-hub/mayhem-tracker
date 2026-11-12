import type { ChampionAvailability } from "../shared/api";
import { MAYHEM_QUEUE_IDS } from "../shared/queues";
export const emptyAvailability = (): ChampionAvailability => ({
  state: "inactive",
  currentChampionId: null,
  benchChampionIds: [],
});
const id = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
// Field evidence: AVAILABLE-CHAMPIONS.md. Teammates require consent to trade.
export function readAvailability(flow: any, session: any): ChampionAvailability {
  if (flow?.phase !== "ChampSelect" || !MAYHEM_QUEUE_IDS.includes(flow?.gameData?.queue?.id))
    return emptyAvailability();
  const unavailable: ChampionAvailability = { ...emptyAvailability(), state: "unavailable" };
  if (
    !session ||
    session.isSpectating !== false ||
    !Number.isInteger(session.localPlayerCellId) ||
    session.localPlayerCellId < 0 ||
    !Array.isArray(session.myTeam)
  )
    return unavailable;
  // Champ-select owns its roster. Gameflow is only the phase/queue gate:
  // its game ID is maintained independently and must not invalidate this roster.
  const player = session.myTeam.find((p: any) => p?.cellId === session.localPlayerCellId);
  if (!player) return unavailable;
  let bench: unknown[] = [];
  if (session.benchEnabled === true) {
    if (Array.isArray(session.benchChampions))
      bench = session.benchChampions.map((entry: any) => entry?.championId);
    else if (Array.isArray(session.benchChampionIds)) bench = session.benchChampionIds;
    else return unavailable;
  } else if (session.benchEnabled !== false) return unavailable;
  const held = new Set(session.myTeam.map((p: any) => p?.championId).filter(id));
  return {
    state: "active",
    currentChampionId: id(player.championId) ? player.championId : null,
    benchChampionIds: [...new Set(bench.filter(id))]
      .filter((champion) => !held.has(champion))
      .sort((a, b) => a - b),
  };
}
export class AvailabilityTracker {
  snapshot = emptyAvailability();
  private generation = 0;
  private running = false;
  private dirty = false;
  private lastDiagnostic = "";
  constructor(
    private read: (path: string) => Promise<any>,
    private publish: (snapshot: ChampionAvailability) => void,
    private diagnose: (summary: string) => void = () => {},
  ) {}
  private apply(value: ChampionAvailability) {
    if (JSON.stringify(value) === JSON.stringify(this.snapshot)) return;
    this.snapshot = value;
    this.publish(value);
  }
  clear() {
    this.generation++;
    this.dirty = false;
    this.apply(emptyAvailability());
  }
  refresh() {
    this.generation++;
    this.dirty = true;
    if (!this.running) void this.drain();
  }
  private async drain() {
    this.running = true;
    try {
      while (this.dirty) {
        this.dirty = false;
        const generation = this.generation;
        let value = emptyAvailability();
        try {
          const flow = await this.read("/lol-gameflow/v1/session");
          if (
            flow?.phase === "ChampSelect" &&
            MAYHEM_QUEUE_IDS.includes(flow?.gameData?.queue?.id)
          ) {
            const session = await this.read("/lol-champ-select/v1/session");
            const confirmed = await this.read("/lol-gameflow/v1/session");
            value = readAvailability(confirmed, session);
            if (generation === this.generation && value.state === "unavailable") {
              const summary = JSON.stringify({
                flowGameId: confirmed?.gameData?.gameId,
                sessionGameId: session?.gameId,
                sessionPresent: session != null,
                isSpectating: session?.isSpectating,
                localPlayerCellId: session?.localPlayerCellId,
                teamCells: Array.isArray(session?.myTeam)
                  ? session.myTeam.map((p: any) => p?.cellId)
                  : null,
                benchEnabled: session?.benchEnabled,
                modernBench: Array.isArray(session?.benchChampions),
                legacyBench: Array.isArray(session?.benchChampionIds),
              });
              if (summary !== this.lastDiagnostic) {
                this.lastDiagnostic = summary;
                this.diagnose(summary);
              }
            }
          }
        } catch {
          /* Clear stale state on failure. */
        }
        if (generation === this.generation) this.apply(value);
      }
    } finally {
      this.running = false;
    }
  }
}
