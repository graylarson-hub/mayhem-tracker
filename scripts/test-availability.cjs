const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mayhem-availability-"));
try {
  require("esbuild").buildSync({
    entryPoints: ["src/main/champion-availability.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: path.join(dir, "test.cjs"),
  });
  const { readAvailability, AvailabilityTracker } = require(path.join(dir, "test.cjs"));
  const flow = { phase: "ChampSelect", gameData: { gameId: 10, queue: { id: 2400 } } };
  const session = {
    gameId: 10,
    isSpectating: false,
    localPlayerCellId: 0,
    benchEnabled: true,
    myTeam: [
      { cellId: 0, championId: 1 },
      { cellId: 1, championId: 2 },
    ],
    benchChampions: [
      { championId: 3 },
      { championId: 3 },
      { championId: 2 },
      { championId: -1 },
      { championId: "4" },
    ],
  };
  assert.deepEqual(readAvailability(flow, session), {
    state: "active",
    currentChampionId: 1,
    benchChampionIds: [3],
  });
  // Independent gameflow IDs must not suppress a valid champ-select roster.
  assert.deepEqual(
    readAvailability(flow, { ...session, gameId: 11 }),
    readAvailability(flow, session),
  );
  // Sanitized reproduction from the live Mayhem lobby on November 11:
  // gameflow retains the previous game ID throughout selection, then catches up.
  const liveFlow = { phase: "ChampSelect", gameData: { gameId: 101, queue: { id: 2400 } } };
  const liveSession = {
    gameId: 102,
    isSpectating: false,
    localPlayerCellId: 2,
    benchEnabled: true,
    benchChampions: [163, 777, 75, 432, 85, 48, 134].map((championId) => ({
      championId,
      isPriority: false,
    })),
    myTeam: [876, 888, 68, 222, 21].map((championId, cellId) => ({ cellId, championId })),
  };
  assert.deepEqual(readAvailability(liveFlow, liveSession), {
    state: "active",
    currentChampionId: 68,
    benchChampionIds: [48, 75, 85, 134, 163, 432, 777],
  });
  assert.equal(
    readAvailability({ ...liveFlow, phase: "InProgress" }, liveSession).state,
    "inactive",
  );
  const legacy = { ...session, benchChampions: undefined, benchChampionIds: [4, 5, 0] };
  assert.deepEqual(readAvailability(flow, legacy).benchChampionIds, [4, 5]);
  assert.deepEqual(
    readAvailability(flow, { ...session, benchEnabled: false }).benchChampionIds,
    [],
  );
  for (const invalid of [
    null,
    {},
    { ...session, isSpectating: true },
    { ...session, localPlayerCellId: -1 },
    { ...session, benchChampions: undefined },
  ])
    assert.equal(readAvailability(flow, invalid).state, "unavailable");
  for (const phase of ["Lobby", "GameStart", "InProgress", "None"])
    assert.equal(readAvailability({ ...flow, phase }, session).state, "inactive");
  assert.equal(
    readAvailability({ ...flow, gameData: { queue: { id: 450 } } }, session).state,
    "inactive",
  );
  assert.equal(
    readAvailability({ ...flow, gameData: { queue: { id: 2450 } } }, session).state,
    "active",
  );
  const turn = () => new Promise((resolve) => setImmediate(resolve));
  (async () => {
    let currentSession = session;
    let currentFlow = flow;
    let fail = false;
    const updates = [];
    const tracker = new AvailabilityTracker(
      async (p) => {
        if (fail) throw Error("offline");
        return p.includes("champ-select") ? currentSession : currentFlow;
      },
      (v) => updates.push(v),
    );
    tracker.refresh();
    await turn();
    assert.equal(tracker.snapshot.currentChampionId, 1);
    tracker.refresh();
    await turn();
    assert.equal(updates.length, 1);
    currentSession = {
      ...session,
      myTeam: [{ cellId: 0, championId: 3 }],
      benchChampions: [{ championId: 1 }],
    };
    tracker.refresh();
    await turn();
    assert.deepEqual(tracker.snapshot.benchChampionIds, [1]);
    currentFlow = { ...flow, phase: "GameStart" };
    tracker.refresh();
    await turn();
    assert.equal(tracker.snapshot.state, "inactive");
    currentFlow = flow;
    tracker.refresh();
    await turn();
    fail = true;
    tracker.refresh();
    await turn();
    assert.equal(tracker.snapshot.state, "inactive");
    let release;
    const delayed = new AvailabilityTracker(
      (p) =>
        p.includes("champ-select") ? new Promise((r) => (release = r)) : Promise.resolve(flow),
      () => {},
    );
    delayed.refresh();
    await turn();
    delayed.clear();
    release(session);
    await turn();
    assert.equal(delayed.snapshot.state, "inactive");
    delayed.refresh();
    await turn();
    delayed.refresh();
    release(session);
    await turn();
    release(currentSession);
    await turn();
    assert.equal(delayed.snapshot.currentChampionId, 3);
    console.log(
      "Availability tests passed: parsing, queues, lifecycle, failures, deduplication and stale reads.",
    );
  })()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => fs.rmSync(dir, { recursive: true, force: true }));
} catch (e) {
  fs.rmSync(dir, { recursive: true, force: true });
  throw e;
}
