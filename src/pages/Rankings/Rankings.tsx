import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  defaultMode,
  type Mode,
  modeLabels,
  modeOptions,
  rankingEligibilityByMode,
} from "../../constants/matches";

const isMode = (value: unknown): value is Mode =>
  typeof value === "string" && (modeOptions as readonly string[]).includes(value);
import "./Rankings.css";

import { Seo } from "../../components/Seo/Seo";
import { useAppSettings } from "../../context/AppSettings";
import { useRankingsByMonth } from "../../hooks/useRankingsByMonth";
import { monthDateFromMonthKey } from "../../lib/supabase/supabaseLb";
import { type AliasLookup, loadAliasesLookup } from "../../lib/users/aliasesLookup";
import { getOpeningDisplayLabel, normalizeOpeningKey } from "../../utils/openings";
import { normalizeUsername } from "../../utils/playerNames";

const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const rankingColumns = [
  { key: "rank", label: "#" },
  { key: "username", label: "Player" },
  { key: "score", label: "Rating" },
  { key: "rd", label: "RD" },
  { key: "games", label: "Games" },
];

const getOpeningsForPlayer = (aliasesLookup: AliasLookup, username: string): string[] => {
  const entry = aliasesLookup.get(username) ?? aliasesLookup.get(normalizeUsername(username));
  if (!Array.isArray(entry?.openings)) return [];

  return [
    ...new Set(entry.openings.map((opening) => normalizeOpeningKey(opening)).filter(Boolean)),
  ];
};

const monthLabelFromDate = (date: Date): string =>
  date.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

const monthKeyFromDate = (date: Date): string =>
  date.toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

const monthNameFromDate = (date: Date): string =>
  date.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });

const readableMonthLabel = (monthKey: string): string => {
  const date = monthDateFromMonthKey(monthKey);
  if (!date) return monthKey || "Unknown month";
  return monthLabelFromDate(date);
};

const sortIndicator = (
  sortKey: string,
  sortDirection: "asc" | "desc",
  columnKey: string,
): string => {
  if (sortKey !== columnKey) return "";
  return sortDirection === "asc" ? "↑" : "↓";
};

const isEligibleForRankings = (
  player: import("../../lib/rankings/rankingsByMonth").RankingPlayer,
  mode: import("../../constants/matches").Mode,
): boolean => {
  const requirement = rankingEligibilityByMode[mode];
  if (!requirement) return true;

  const games = Number(player?.games);
  const rd = Number(player?.rd);
  const meetsRdRequirement = requirement.maxRd === null || rd < requirement.maxRd;
  return games >= requirement.minGames && meetsRdRequirement;
};

const earliestLeaderboardMonth = new Date(Date.UTC(2021, 8, 1));
const earliestWolfrandomLeaderboardMonth = new Date(Date.UTC(2026, 6, 1));

const supportsWolfrandomLeaderboard = (monthKey: string): boolean => {
  const month = monthDateFromMonthKey(monthKey);
  return Boolean(month && month >= earliestWolfrandomLeaderboardMonth);
};

const allLeaderboardMonths = (): string[] => {
  const months: string[] = [];
  const cursor = new Date(earliestLeaderboardMonth);
  const now = new Date();
  const nowUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  while (cursor <= nowUtc) {
    months.push(monthKeyFromDate(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
};

const allLeaderboardYears = (): string[] => {
  const now = new Date();
  const years: string[] = [];
  for (
    let year = now.getUTCFullYear();
    year >= earliestLeaderboardMonth.getUTCFullYear();
    year -= 1
  ) {
    years.push(String(year));
  }
  return years;
};

const getInitialRankingsFilters = () => {
  if (typeof window === "undefined") {
    return {
      selectedYear: "",
      selectedMonthName: "",
      selectedMode: defaultMode,
    };
  }

  const searchParams = new window.URLSearchParams(window.location.search);
  const selectedYear = String(searchParams.get("year") || "").trim();
  const selectedMonthName = String(searchParams.get("month") || "").trim();
  const requestedMode = String(searchParams.get("mode") || "")
    .trim()
    .toLowerCase();

  return {
    selectedYear,
    selectedMonthName,
    selectedMode: isMode(requestedMode) ? requestedMode : defaultMode,
  };
};

const updateRankingsUrl = (
  selectedYear: string,
  selectedMonthName: string,
  selectedMode: string,
): void => {
  if (typeof window === "undefined" || !selectedYear || !selectedMonthName || !selectedMode) return;

  const searchParams = new window.URLSearchParams(window.location.search);
  searchParams.set("year", selectedYear);
  searchParams.set("month", selectedMonthName);
  searchParams.set("mode", selectedMode);
  const nextSearch = searchParams.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
  window.history.replaceState({}, "", nextUrl);
};

const LeaderboardView = () => {
  const { hideRankingsOpenings } = useAppSettings();
  const initialFilters = useMemo(() => getInitialRankingsFilters(), []);
  const [selectedYear, setSelectedYear] = useState(initialFilters.selectedYear);
  const [selectedMonthName, setSelectedMonthName] = useState(initialFilters.selectedMonthName);
  const [selectedMode, setSelectedMode] = useState<Mode>(initialFilters.selectedMode);
  const [sortKey, setSortKey] = useState("rank");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [activeOpeningFilter, setActiveOpeningFilter] = useState("");
  const [aliasesLookup, setAliasesLookup] = useState<AliasLookup>(() => new Map());
  const hasInitializedFiltersRef = useRef(false);

  const allMonthKeys = useMemo(() => allLeaderboardMonths(), []);
  const monthOptions = useMemo(() => [...allMonthKeys].reverse(), [allMonthKeys]);
  const yearOptions = useMemo(() => allLeaderboardYears(), []);

  const selectedMonth = useMemo(() => {
    if (!selectedMonthName || !selectedYear) return "";
    return `${selectedMonthName} ${selectedYear}`;
  }, [selectedMonthName, selectedYear]);
  const availableModeOptions = useMemo(
    () =>
      modeOptions.filter(
        (mode) => mode !== "wolfrandom" || supportsWolfrandomLeaderboard(selectedMonth),
      ),
    [selectedMonth],
  );

  const { rankingsByMonth, error } = useRankingsByMonth(selectedMonth);

  useEffect(() => {
    if (aliasesLookup.size > 0) return;

    let isCurrent = true;

    const loadOpenings = async () => {
      try {
        const lookup = await loadAliasesLookup();
        if (isCurrent) setAliasesLookup(lookup);
      } catch {
        if (isCurrent) setAliasesLookup(new Map());
      }
    };

    void loadOpenings();

    return () => {
      isCurrent = false;
    };
  }, [aliasesLookup.size]);

  useEffect(() => {
    const firstWithData =
      monthOptions.find((month) => rankingsByMonth.has(month)) || monthOptions[0] || "";
    const firstDate = monthDateFromMonthKey(firstWithData);
    if (!firstDate) return;

    if (hasInitializedFiltersRef.current) return;

    const fallbackYear = String(firstDate.getUTCFullYear());
    const fallbackMonthName = monthNameFromDate(firstDate);
    const requestedMonthKey =
      initialFilters.selectedYear && initialFilters.selectedMonthName
        ? `${initialFilters.selectedMonthName} ${initialFilters.selectedYear}`
        : "";
    const hasRequestedMonth = requestedMonthKey && monthOptions.includes(requestedMonthKey);

    setSelectedYear(hasRequestedMonth ? initialFilters.selectedYear : fallbackYear);
    setSelectedMonthName(hasRequestedMonth ? initialFilters.selectedMonthName : fallbackMonthName);
    hasInitializedFiltersRef.current = true;
  }, [
    initialFilters.selectedMonthName,
    initialFilters.selectedYear,
    monthOptions,
    rankingsByMonth,
  ]);

  const availableMonthsForYear = useMemo(() => {
    if (!selectedYear) return monthNames;
    const availableSet = new Set(
      monthOptions
        .filter((monthKey) => monthKey.endsWith(` ${selectedYear}`))
        .map((monthKey) => monthKey.split(" ")[0]),
    );
    const monthsForYear = monthNames.filter((monthName) => availableSet.has(monthName));
    return monthsForYear.length > 0 ? monthsForYear : monthNames;
  }, [monthOptions, selectedYear]);

  useEffect(() => {
    if (!selectedMonthName || !selectedYear) return;
    if (availableMonthsForYear.includes(selectedMonthName)) return;
    setSelectedMonthName(availableMonthsForYear[0] ?? monthNames[0] ?? "");
  }, [availableMonthsForYear, selectedMonthName, selectedYear]);

  useEffect(() => {
    if (availableModeOptions.includes(selectedMode)) return;
    setSelectedMode(defaultMode);
  }, [availableModeOptions, selectedMode]);

  useEffect(() => {
    updateRankingsUrl(selectedYear, selectedMonthName, selectedMode);
  }, [selectedMonthName, selectedMode, selectedYear]);

  const selectedMonthData = rankingsByMonth.get(selectedMonth);
  const selectedModeData = selectedMonthData?.[selectedMode] ?? {
    players: [] as import("../../lib/rankings/rankingsByMonth").RankingPlayer[],
  };
  const selectedMonthIndex = allMonthKeys.indexOf(selectedMonth);
  const hasPreviousMonth = selectedMonthIndex > 0;
  const hasNextMonth = selectedMonthIndex >= 0 && selectedMonthIndex < allMonthKeys.length - 1;
  const eligibilityRequirement = rankingEligibilityByMode[selectedMode];
  const players = useMemo(
    () => selectedModeData.players.filter((player) => isEligibleForRankings(player, selectedMode)),
    [selectedMode, selectedModeData.players],
  );
  const activeModeOpeningFilter =
    selectedMode === "wolfrandom" || hideRankingsOpenings ? "" : activeOpeningFilter;
  const filteredPlayers = useMemo(() => {
    if (!activeModeOpeningFilter) return players;

    return players.filter((player) =>
      getOpeningsForPlayer(aliasesLookup, player.username).includes(activeModeOpeningFilter),
    );
  }, [activeModeOpeningFilter, aliasesLookup, players]);

  const selectMonthKey = (monthKey: string): void => {
    const monthDate = monthDateFromMonthKey(monthKey);
    if (!monthDate) return;
    setSelectedYear(String(monthDate.getUTCFullYear()));
    setSelectedMonthName(monthNameFromDate(monthDate));
  };

  const handlePreviousMonth = () => {
    if (!hasPreviousMonth) return;
    const prev = allMonthKeys[selectedMonthIndex - 1];
    if (prev) selectMonthKey(prev);
  };

  const handleNextMonth = () => {
    if (!hasNextMonth) return;
    const next = allMonthKeys[selectedMonthIndex + 1];
    if (next) selectMonthKey(next);
  };

  const handleSort = (nextKey: string): void => {
    if (sortKey === nextKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "rank" ? "asc" : "desc");
  };

  const sortedPlayers = useMemo(() => {
    const directionMultiplier = sortDirection === "asc" ? 1 : -1;
    const sorted = [...filteredPlayers].sort((a, b) => {
      if (sortKey === "username") {
        return directionMultiplier * a.username.localeCompare(b.username);
      }

      const aValue = (a as unknown as Record<string, number | null>)[sortKey] ?? 0;
      const bValue = (b as unknown as Record<string, number | null>)[sortKey] ?? 0;
      const aNumber = aValue;
      const bNumber = bValue;
      if (aNumber === bNumber) return a.rank - b.rank;
      return directionMultiplier * (aNumber - bNumber);
    });

    return sorted;
  }, [filteredPlayers, sortDirection, sortKey]);

  return (
    <div className="rankingsPage">
      <Seo
        title="Atomic rankings"
        description="Browse monthly atomic chess rankings for blitz, bullet, and hyperbullet, with merged aliases and rating eligibility rules."
        path="/rankings"
      />
      <div className="panel rankingsPanel">
        <h1>Monthly Player Rankings</h1>
        <div className="controls rankingsControls">
          <label htmlFor="year-select">
            Year
            <select
              id="year-select"
              value={selectedYear}
              onChange={(event) => setSelectedYear(event.target.value)}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>

          <label htmlFor="month-select">
            Month
            <select
              id="month-select"
              value={selectedMonthName}
              onChange={(event) => setSelectedMonthName(event.target.value)}
            >
              {availableMonthsForYear.map((monthName) => (
                <option key={monthName} value={monthName}>
                  {monthName}
                </option>
              ))}
            </select>
          </label>

          <label htmlFor="mode-select">
            Mode
            <select
              id="mode-select"
              value={selectedMode}
              onChange={(event) => {
                if (isMode(event.target.value)) setSelectedMode(event.target.value);
              }}
            >
              {availableModeOptions.map((mode) => (
                <option key={mode} value={mode}>
                  {modeLabels[mode] ?? mode}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? <div className="errorText">{error}</div> : null}

        <div className="rankingsMeta">
          <div className="monthStepControls" aria-label="Month navigation">
            <button
              type="button"
              className="monthStepButton"
              aria-label="Previous month"
              onClick={handlePreviousMonth}
              disabled={!hasPreviousMonth}
            >
              <span aria-hidden="true">←</span>
            </button>
            <span className="currentMonthLabel">
              {readableMonthLabel(selectedMonth || monthOptions[0] || "")}
            </span>
            <button
              type="button"
              className="monthStepButton"
              aria-label="Next month"
              onClick={handleNextMonth}
              disabled={!hasNextMonth}
            >
              <span aria-hidden="true">→</span>
            </button>
          </div>
          <div className="rankingsMetaDetails">
            <div className="rankingsMetaSummary">
              <span className="rankedCount">
                {activeModeOpeningFilter
                  ? `${filteredPlayers.length} of ${players.length} ranked`
                  : `${players.length} ranked`}
                {selectedMode !== "wolfrandom" ? (
                  <Link className="rankingsMetaLink" to="/rankings/how-ratings-work">
                    <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
                    How are ratings calculated?
                  </Link>
                ) : null}
              </span>
              {selectedMode === "wolfrandom" ? (
                <span className="rankingsWolfrandomHelp">
                  <button type="button" className="rankingsWolfrandomTrigger">
                    <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
                    What is Wolfrandom?
                  </button>
                  <span className="rankingsWolfrandomTooltip" role="tooltip">
                    Wolfrandom is a new atomic variant designed to shift the focus away from opening
                    theory. For more information, check out the
                    <a
                      href="https://lichess.org/team/wolfrandom-atomic-game"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Wolfrandom Lichess team
                    </a>
                    .
                  </span>
                </span>
              ) : null}
            </div>
            {eligibilityRequirement ? (
              <p
                className="rankingsEligibilityNote"
                aria-label={`${modeLabels[selectedMode]} eligibility`}
              >
                Requirements: {eligibilityRequirement.minGames}+ games this month
                {eligibilityRequirement.maxRd === null
                  ? "."
                  : ` and RD < ${eligibilityRequirement.maxRd}.`}
              </p>
            ) : null}
          </div>
        </div>

        {filteredPlayers.length === 0 ? (
          <div className="emptyRankings">
            {activeModeOpeningFilter
              ? `No ranked players found for ${getOpeningDisplayLabel(activeModeOpeningFilter)}.`
              : "No leaderboard entries available for this month."}
          </div>
        ) : (
          <div className="rankingsTableWrap">
            <table className="rankingsTable">
              <thead>
                <tr>
                  {rankingColumns.map((column) => (
                    <th key={column.key}>
                      <button
                        type="button"
                        className="sortButton"
                        onClick={() => handleSort(column.key)}
                      >
                        {column.label} {sortIndicator(sortKey, sortDirection, column.key)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((player) => (
                  <tr key={`${selectedMonth}-${player.rank}-${player.username}`}>
                    <td>{player.rank}</td>
                    <td>
                      <div className="rankingPlayerCell">
                        <Link
                          className="rankingLink"
                          to="/@/$username"
                          params={{ username: player.username }}
                        >
                          {player.username}
                        </Link>
                        {selectedMode !== "wolfrandom" && !hideRankingsOpenings ? (
                          <div
                            className="rankingOpeningTags"
                            aria-label={`${player.username} openings`}
                          >
                            {getOpeningsForPlayer(aliasesLookup, player.username).map((opening) => (
                              <button
                                type="button"
                                key={`${player.username}-${opening}`}
                                className={`rankingOpeningTag${
                                  activeOpeningFilter === opening ? " active" : ""
                                }`}
                                aria-pressed={activeOpeningFilter === opening}
                                onClick={() =>
                                  setActiveOpeningFilter((current) =>
                                    current === opening ? "" : opening,
                                  )
                                }
                              >
                                {getOpeningDisplayLabel(opening)}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td>{player.score}</td>
                    <td>{player.rd}</td>
                    <td>{player.games ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export const RankingsPage = () => <LeaderboardView />;
