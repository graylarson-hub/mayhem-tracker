// Read-only, privacy-limited LCU diagnostic. No names, tokens or chat are saved.
const fs = require("node:fs");
const path = require("node:path");
const { createHttp1Request } = require("league-connect");
let last = "";
async function sample() {
  try {
    const settings = fs.readFileSync(
      "C:/ProgramData/Riot Games/Metadata/league_of_legends.live/league_of_legends.live.product_settings.yaml",
      "utf8",
    );
    const dir = settings.match(/^product_install_full_path:\s*"?([^"\r\n]+?)"?\s*$/m)[1];
    const parts = fs.readFileSync(path.join(dir, "lockfile"), "utf8").trim().split(":");
    const credentials = { port: Number(parts[2]), password: parts[3] };
    const get = async (url) => {
      const response = await createHttp1Request({ url, method: "GET" }, credentials);
      return response.ok ? response.json() : null;
    };
    const flow = await get("/lol-gameflow/v1/session");
    const session =
      flow?.phase === "ChampSelect" ? await get("/lol-champ-select/v1/session") : null;
    const fixture = {
      flow: {
        phase: flow?.phase,
        gameData: { gameId: flow?.gameData?.gameId, queue: { id: flow?.gameData?.queue?.id } },
      },
      session: session && {
        keys: Object.keys(session),
        gameId: session.gameId,
        isSpectating: session.isSpectating,
        localPlayerCellId: session.localPlayerCellId,
        benchEnabled: session.benchEnabled,
        benchChampions: session.benchChampions?.map((p) => ({
          championId: p.championId,
          isPriority: p.isPriority,
        })),
        benchChampionIds: session.benchChampionIds,
        myTeam: session.myTeam?.map((p) => ({ cellId: p.cellId, championId: p.championId })),
      },
    };
    const text = JSON.stringify(fixture);
    if (text !== last) {
      console.log(text);
      last = text;
    }
    if (session)
      fs.writeFileSync("availability-live-fixture.tmp.json", JSON.stringify(fixture, null, 2));
  } catch (error) {
    const message = error.code || "read failed";
    if (last !== message) {
      console.log(message);
      last = message;
    }
  }
}
(async () => {
  for (;;) {
    await sample();
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
})();
