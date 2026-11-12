import { useEffect, useMemo, useState } from "react";
import { ARAM_S_GRADE_CHALLENGE_ID } from "../../shared/challenges";
import ChampionIcon from "../components/ChampionIcon";
import SearchInput from "../components/SearchInput";
import { getChampionName, useChampionData } from "../hooks/useChampions";
import { useLcuStatus } from "../hooks/useLcuStatus";
import { LOCALE } from "../lib/format";
import { matchesSearch } from "../lib/search";
import type { ChampionAvailability, ChallengesResult } from "../lib/types";

type CompletionFilter = "all" | "needed" | "earned" | "available";

const completionFilters: {
  key: CompletionFilter;
  label: string;
  color: string;
  activeColor: string;
}[] = [
  {
    key: "all",
    label: "All",
    color: "text-lol-text",
    activeColor: "bg-lol-gold/20 text-lol-gold border-lol-gold/50",
  },
  {
    key: "needed",
    label: "Needed",
    color: "text-sky-400",
    activeColor: "bg-sky-500/20 text-sky-300 border-sky-400/50",
  },
  {
    key: "earned",
    label: "Earned",
    color: "text-yellow-400",
    activeColor: "bg-yellow-500/20 text-yellow-300 border-yellow-500/50",
  },
  {
    key: "available",
    label: "Available",
    color: "text-emerald-400",
    activeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-400/50",
  },
];

export default function STracker() {
  const status = useLcuStatus();
  const champions = useChampionData();
  const [result, setResult] = useState<ChallengesResult | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>("needed");

  useEffect(() => {
    let active = true;
    let receivedLive = false;
    // Subscribe before requesting the snapshot. A slower stored reply must not
    // overwrite a newer live reading.
    const unsubscribe = window.api.onChallengesChanged((live) => {
      receivedLive = true;
      if (active) {
        setError(false);
        setResult(live);
      }
    });
    window.api.getChallenges().then(
      (stored) => {
        if (active && !receivedLive) {
          setError(false);
          setResult(stored);
        }
      },
      () => {
        if (active && !receivedLive) setError(true);
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [status]);

  const [availability, setAvailability] = useState<ChampionAvailability>({
    state: "inactive",
    currentChampionId: null,
    benchChampionIds: [],
  });
  useEffect(() => {
    let active = true;
    let receivedLive = false;
    const unsubscribe = window.api.onChampionAvailability((value) => {
      receivedLive = true;
      if (active) setAvailability(value);
    });
    window.api
      .getChampionAvailability()
      .then((value) => {
        if (active && !receivedLive) setAvailability(value);
      })
      .catch(() => {});
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const availableIds = useMemo(
    () =>
      new Set(
        availability.state === "active"
          ? [availability.currentChampionId, ...availability.benchChampionIds].filter(
              (id): id is number => id !== null,
            )
          : [],
      ),
    [availability],
  );
  const data = result?.data;
  const challenge = data
    ? [
        ...(data.capstone ? [data.capstone] : []),
        ...data.groups.flatMap((group) => [group.summary, ...group.challenges]),
        ...data.seasonal,
        ...data.equipped,
      ].find((entry) => entry.id === ARAM_S_GRADE_CHALLENGE_ID)
    : undefined;
  const completedIds = challenge?.completedChampionIds;
  const { roster, remaining, completed, visible } = useMemo(() => {
    const done = new Set(completedIds ?? []);
    // Keep newly released completed champions visible even with older metadata.
    const roster = [...new Set([...Object.keys(champions).map(Number), ...done, ...availableIds])]
      .filter((id) => Number.isInteger(id) && id > 0)
      .sort((a, b) => getChampionName(champions, a).localeCompare(getChampionName(champions, b)));
    const remaining = roster.filter((id) => !done.has(id));
    return {
      roster,
      remaining,
      completed: done,
      visible: roster.filter(
        (id) =>
          (completionFilter === "all" ||
            (completionFilter === "available"
              ? availableIds.has(id)
              : completionFilter === "earned"
                ? done.has(id)
                : !done.has(id))) &&
          matchesSearch(getChampionName(champions, id), search),
      ),
    };
  }, [champions, completedIds, search, completionFilter, availableIds]);

  let message: string | null = null;
  if (error) message = "Could not read challenge progress. Reopen this page to try again.";
  else if (!result || (result.pending && !data)) message = "Loading challenge progress...";
  else if (!data)
    message =
      "Start the League client and sign in to sync your S- progress. The last synced reading stays available afterward.";
  else if (completedIds == null)
    message =
      "Champion progress for All Random All Champions is unavailable in the latest reading. It will update automatically when the League client supplies it.";
  else if (Object.keys(champions).length === 0)
    message =
      "Champion names are unavailable. Connect to the internet and restart the app to load the roster.";

  return (
    <div className="max-w-7xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-lol-text-bright">S- Tracker</h1>
        <p className="mt-1 text-sm text-lol-text">
          All Random All Champions · Earn an S- or better on each champion.
        </p>
      </div>
      {message ? (
        <div
          className="bg-lol-card rounded-xl border border-lol-border/60 p-8 text-center text-sm text-lol-text"
          role="status"
        >
          {message}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2" role="group" aria-label="Champion completion">
              {completionFilters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  aria-pressed={completionFilter === filter.key}
                  onClick={() => setCompletionFilter(filter.key)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
                    completionFilter === filter.key
                      ? filter.activeColor
                      : `${filter.color} border-lol-border hover:border-lol-border/80 bg-lol-card`
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-lol-text self-center ml-2" role="status">
              {remaining.length} remaining · {roster.length - remaining.length} / {roster.length}{" "}
              completed
            </span>
            <div className="ml-auto">
              <SearchInput value={search} onChange={setSearch} placeholder="Search champions..." />
            </div>
          </div>
          <p className="text-xs text-lol-text">
            Auto-synced from the League client. Last synced{" "}
            {new Date(data!.fetchedAt).toLocaleString(LOCALE)}.
            {status === "disconnected" && " Client disconnected; showing saved progress."}
          </p>
          {completionFilter === "available" && (
            <p className="text-xs text-lol-text" role="status">
              {availability.state === "inactive"
                ? "Join an ARAM Mayhem champion-select lobby to see available champions."
                : availability.state === "unavailable"
                  ? "The client has not supplied a supported champion-select reading. Retrying automatically."
                  : "Live: your current champion and the shared bench. Teammate champions require a trade and are excluded. Bench availability can change before you select."}
            </p>
          )}
          {visible.length ? (
            <ul
              className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2"
              aria-label="Champions"
            >
              {visible.map((id) => (
                <li
                  key={id}
                  className="flex items-center gap-3 min-w-0 p-3 bg-lol-card rounded-lg border border-lol-border/60"
                >
                  <ChampionIcon championId={id} size={40} rounded={false} className="shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-lol-text-bright break-words">
                      {getChampionName(champions, id)}
                    </div>
                    <div
                      className={`text-xs ${completed.has(id) ? "text-lol-gold" : "text-lol-text"}`}
                    >
                      {completed.has(id) ? "S- earned" : "S- needed"}
                      {completionFilter === "available" &&
                        (id === availability.currentChampionId
                          ? " · Current champion"
                          : " · On bench")}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-lol-text py-8 text-center" role="status">
              {search.trim()
                ? "No champions match your search in this view. Try All to search every champion."
                : completionFilter === "available"
                  ? "No available champions in the current reading."
                  : completionFilter === "needed"
                    ? "Every champion completed. Select All or Earned to see them."
                    : completionFilter === "earned"
                      ? "No champions earned yet. Select Needed to see champions to work on."
                      : "No champions available."}
            </p>
          )}
        </>
      )}
    </div>
  );
}
