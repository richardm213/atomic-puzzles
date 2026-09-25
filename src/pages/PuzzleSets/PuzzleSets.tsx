import "./PuzzleSets.css";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { formatPuzzleSetDate } from "../../../shared/domain/puzzles/puzzleSetMetadata";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { matchupToSlug } from "../../lib/matches/h2hRoutes";
import type { Puzzle } from "../../lib/puzzles/puzzleLibrary";
import {
  puzzleCatalogQueryOptions,
  puzzlePlayerNicknamesQueryOptions,
  puzzleProgressForUserQueryOptions,
} from "../../lib/puzzles/puzzleQueries";
import {
  groupPuzzlesByEvent,
  isAwcPuzzleEvent,
  isEndgamePuzzleEvent,
  type PuzzleEventGroup,
} from "../../lib/puzzles/puzzleSets";
import { normalizeUsername } from "../../utils/playerNames";

const EVENT_FILTERS = [
  { id: "all", label: "All" },
  { id: "awc", label: "AWC" },
  { id: "acl", label: "ACL" },
  { id: "blitz", label: "Blitz" },
  { id: "wolfarena", label: "Wolfarena" },
  { id: "wolfrandom", label: "Wolfrandom" },
  { id: "swiss960", label: "960 Swiss" },
  { id: "chess960", label: "960" },
  { id: "endgames", label: "Endgames" },
];
const FEATURED_SET_MATCHERS: Array<(group: PuzzleEventGroup) => boolean> = [
  (group) =>
    group.eventName.toLocaleLowerCase() === "wolfrandom" &&
    group.eventDate === "2026-09" &&
    group.players.includes("quasabianth") &&
    group.players.includes("rabbier"),
  (group) => group.eventName.toLocaleLowerCase() === "awc 2018 finals",
  (group) => group.eventName.toLocaleLowerCase() === "tipau endgames",
  (group) =>
    group.eventName.toLocaleLowerCase() === "blitz 6-game match" &&
    group.eventDate === "2026-09" &&
    group.players.includes("maxwellssilvrhammer") &&
    group.players.includes("wolfram_ep"),
  (group) =>
    group.eventName.toLocaleLowerCase() === "blitz 10-game match" &&
    group.eventDate === "2026-09" &&
    group.players.includes("rechesster") &&
    group.players.includes("wolfram_ep"),
];
const emptyPuzzles: Puzzle[] = [];

export const getFeaturedPuzzleSetRank = (group: PuzzleEventGroup): number =>
  FEATURED_SET_MATCHERS.findIndex((matches) => matches(group));

const getShuffledSetRank = (setId: number, seed: number): number => {
  let value = Math.imul(setId ^ seed, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
};

export const orderPuzzleSetGroups = (
  groups: PuzzleEventGroup[],
  seed: number,
): PuzzleEventGroup[] =>
  [...groups].sort((left, right) => {
    const leftFeaturedRank = getFeaturedPuzzleSetRank(left);
    const rightFeaturedRank = getFeaturedPuzzleSetRank(right);

    if (leftFeaturedRank >= 0 || rightFeaturedRank >= 0) {
      if (leftFeaturedRank < 0) return 1;
      if (rightFeaturedRank < 0) return -1;
      return leftFeaturedRank - rightFeaturedRank;
    }

    return getShuffledSetRank(left.setId, seed) - getShuffledSetRank(right.setId, seed);
  });

export const matchesEventFilter = (
  group: { eventName?: string | null | undefined },
  filterId: string,
): boolean => {
  if (filterId === "all") return true;

  const normalizedEvent = String(group?.eventName ?? "")
    .trim()
    .toLocaleLowerCase();
  if (!normalizedEvent) return false;

  if (filterId === "acl") {
    return normalizedEvent.includes("acl") || normalizedEvent.includes("atomic chess league");
  }

  if (filterId === "swiss960") {
    return normalizedEvent.includes("960 swiss") || normalizedEvent.includes("atomic960 swiss");
  }

  if (filterId === "chess960") {
    return normalizedEvent.includes("960") && !matchesEventFilter(group, "swiss960");
  }

  if (filterId === "awc") {
    return normalizedEvent.includes("awc") || normalizedEvent.includes("atomic wc");
  }

  if (filterId === "blitz") {
    return normalizedEvent.includes("blitz");
  }

  if (filterId === "wolfarena") {
    return normalizedEvent.includes("wolfarena");
  }

  if (filterId === "wolfrandom") {
    const compactEvent = normalizedEvent.replace(/[^a-z0-9]/g, "");
    return compactEvent.includes("wolfrandom") || compactEvent.includes("wolframrandom");
  }

  if (filterId === "endgames") {
    return isEndgamePuzzleEvent(normalizedEvent);
  }

  return true;
};

export const PuzzleSetsPage = () => {
  const { user } = useAuth();
  const username = normalizeUsername(user?.username);
  const [activeFilterId, setActiveFilterId] = useState("all");
  const [shuffleSeed] = useState(() => Math.floor(Math.random() * 0x1_0000_0000));
  const puzzleCatalogQuery = useQuery(puzzleCatalogQueryOptions());
  const playerNicknamesQuery = useQuery(puzzlePlayerNicknamesQueryOptions());
  const progressQuery = useQuery({
    ...puzzleProgressForUserQueryOptions(username),
    enabled: Boolean(username),
  });
  const puzzles = puzzleCatalogQuery.data ?? emptyPuzzles;
  const isLoading = puzzleCatalogQuery.isPending;
  const error = puzzleCatalogQuery.error
    ? puzzleCatalogQuery.error instanceof Error
      ? puzzleCatalogQuery.error.message
      : "Failed to load puzzle sets."
    : "";

  const puzzleGroups = useMemo(() => groupPuzzlesByEvent(puzzles), [puzzles]);
  const filteredPuzzleGroups = useMemo(
    () =>
      orderPuzzleSetGroups(
        puzzleGroups.filter((group) => matchesEventFilter(group, activeFilterId)),
        shuffleSeed,
      ),
    [activeFilterId, puzzleGroups, shuffleSeed],
  );
  const completedPuzzleIds = useMemo(
    () => new Set((progressQuery.data ?? []).map((row) => String(row.puzzle_id).trim())),
    [progressQuery.data],
  );
  const playerNicknames = useMemo(
    () =>
      new Map(
        (playerNicknamesQuery.data ?? []).map((row) => [
          row.username.trim().toLocaleLowerCase(),
          row.nickname.trim().toLocaleLowerCase(),
        ]),
      ),
    [playerNicknamesQuery.data],
  );
  const formatSetPlayers = (players: string[]): string => {
    const labels = players.map((player) => {
      const nickname = playerNicknames.get(player.toLocaleLowerCase());
      return nickname || player;
    });
    return labels.length === 2 ? `${labels[0]} vs ${labels[1]}` : labels.join(" · ");
  };

  const renderPuzzleSetGrid = (groups: PuzzleEventGroup[], ariaLabel: string) => (
    <div className="puzzleSetGrid" role="list" aria-label={ariaLabel}>
      {groups.map((group) => {
        const completedPuzzleCount = group.puzzles.reduce(
          (count, puzzle) =>
            completedPuzzleIds.has(String(puzzle.puzzleId).trim()) ? count + 1 : count,
          0,
        );
        const puzzleCount = group.puzzles.length;
        const progressPercent = puzzleCount
          ? Math.round((completedPuzzleCount / puzzleCount) * 100)
          : 0;

        return (
          <article key={group.eventKey} className="puzzleSetCard" role="listitem">
            <div className="puzzleSetCardContent">
              <span className="puzzleSetCardHeading">
                <strong>
                  {group.sourceId ? (
                    <Link
                      className="puzzleSetCardTitleLink"
                      to="/matches/$matchId"
                      params={{ matchId: group.sourceId }}
                    >
                      {group.eventName}
                    </Link>
                  ) : (
                    group.eventName
                  )}
                </strong>
                {group.eventDate && !isAwcPuzzleEvent(group.eventName) ? (
                  <time dateTime={group.eventDate}>{formatPuzzleSetDate(group.eventDate)}</time>
                ) : null}
              </span>
              {group.players.length === 2 ? (
                <Link
                  className="puzzleSetCardPlayers"
                  to="/h2h/$matchup"
                  params={{ matchup: matchupToSlug(group.players[0]!, group.players[1]!) }}
                >
                  {formatSetPlayers(group.players)}
                </Link>
              ) : group.players.length > 0 ? (
                <span className="puzzleSetCardPlayers">{formatSetPlayers(group.players)}</span>
              ) : null}
              <span className="puzzleSetProgress">
                <span className="puzzleSetProgressLabel">
                  <strong>
                    {completedPuzzleCount} / {puzzleCount}
                  </strong>
                </span>
                <span
                  className="puzzleSetProgressTrack"
                  role="progressbar"
                  aria-label={`${group.eventName}: ${completedPuzzleCount} of ${puzzleCount} puzzles completed`}
                  aria-valuemin={0}
                  aria-valuemax={puzzleCount}
                  aria-valuenow={completedPuzzleCount}
                >
                  <span style={{ width: `${progressPercent}%` }} />
                </span>
              </span>
            </div>
            <div className="puzzleSetCardActions">
              <Link
                className="puzzleSetCardStartLink"
                to="/solve/set/$setKey/$puzzleId"
                params={{
                  setKey: group.eventKey,
                  puzzleId: String(group.puzzles[0]?.puzzleId ?? ""),
                }}
              >
                Start set
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );

  if (isLoading && puzzles.length === 0) return <RouteLoadingFallback />;

  return (
    <div className="puzzleSetsPage">
      <Seo
        title="Puzzle Sets"
        description="Browse atomic puzzle events and open every puzzle from a selected set."
        path="/solve/sets"
      />
      <div className="puzzleSetsShell">
        <section className="puzzleSetsSection" aria-label="Puzzle set filters and results">
          <header className="puzzleSetsHero">
            <h1>Puzzle sets</h1>
            <label className="puzzleSetsFilterControl">
              <span>Category</span>
              <select
                aria-label="Filter puzzle sets"
                value={activeFilterId}
                onChange={(event) => setActiveFilterId(event.target.value)}
              >
                {EVENT_FILTERS.map((filter) => (
                  <option key={filter.id} value={filter.id}>
                    {filter.label}
                  </option>
                ))}
              </select>
            </label>
          </header>

          {error ? <div className="puzzleSetsStateCard">{error}</div> : null}

          {filteredPuzzleGroups.length > 0 ? (
            renderPuzzleSetGrid(filteredPuzzleGroups, "Puzzle sets")
          ) : (
            <div className="puzzleSetsStateCard">
              {puzzleGroups.length > 0
                ? "No puzzle sets match this filter yet."
                : "No puzzle sets are available yet."}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
