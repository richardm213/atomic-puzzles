import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  defaultMode,
  modeLabels,
  modeOptions,
  rankingEligibilityByMode,
} from "../../constants/matches";
import { useRankingsByMonth } from "../../hooks/useRankingsByMonth";
import { monthDateFromMonthKey } from "../../lib/supabaseLb";
import { Seo } from "../../components/Seo/Seo";
import "./Rankings.css";

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

const monthLabelFromDate = (date) =>
  date.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

const monthKeyFromDate = (date) =>
  date.toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

const monthNameFromDate = (date) =>
  date.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });

const readableMonthLabel = (monthKey) => {
  const date = monthDateFromMonthKey(monthKey);
  if (!date) return monthKey || "Unknown month";
  return monthLabelFromDate(date);
};

const sortIndicator = (sortKey, sortDirection, columnKey) => {
  if (sortKey !== columnKey) return "";
  return sortDirection === "asc" ? "↑" : "↓";
};

const isEligibleForRankings = (player, mode) => {
  const requirement = rankingEligibilityByMode[mode];
  if (!requirement) return true;

  const games = Number(player?.games);
  const rd = Number(player?.rd);
  return games >= requirement.minGames && rd < requirement.maxRd;
};

const allMonthsFromJan2023 = () => {
  const months = [];
  const cursor = new Date(Date.UTC(2023, 0, 1));
  const now = new Date();
  const nowUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  while (cursor <= nowUtc) {
    months.push(monthKeyFromDate(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
};

const allYearsFromJan2023 = () => {
  const now = new Date();
  const years = [];
  for (let year = now.getUTCFullYear(); year >= 2023; year -= 1) {
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
  const requestedMode = String(searchParams.get("mode") || "").trim().toLowerCase();

  return {
    selectedYear,
    selectedMonthName,
    selectedMode: modeOptions.includes(requestedMode) ? requestedMode : defaultMode,
  };
};

const updateRankingsUrl = (selectedYear, selectedMonthName, selectedMode) => {
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
  const initialFilters = useMemo(() => getInitialRankingsFilters(), []);
  const [selectedYear, setSelectedYear] = useState(initialFilters.selectedYear);
  const [selectedMonthName, setSelectedMonthName] = useState(initialFilters.selectedMonthName);
  const [selectedMode, setSelectedMode] = useState(initialFilters.selectedMode);
  const [sortKey, setSortKey] = useState("rank");
  const [sortDirection, setSortDirection] = useState("asc");
  const hasInitializedFiltersRef = useRef(false);

  const monthOptions = useMemo(() => allMonthsFromJan2023().reverse(), []);
  const yearOptions = useMemo(() => allYearsFromJan2023(), []);

  const selectedMonth = useMemo(() => {
    if (!selectedMonthName || !selectedYear) return "";
    return `${selectedMonthName} ${selectedYear}`;
  }, [selectedMonthName, selectedYear]);

  const { rankingsByMonth, error } = useRankingsByMonth(selectedMonth);

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
  }, [initialFilters.selectedMonthName, initialFilters.selectedYear, monthOptions, rankingsByMonth]);

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
    setSelectedMonthName(availableMonthsForYear[0] || monthNames[0]);
  }, [availableMonthsForYear, selectedMonthName, selectedYear]);

  useEffect(() => {
    updateRankingsUrl(selectedYear, selectedMonthName, selectedMode);
  }, [selectedMonthName, selectedMode, selectedYear]);

  const selectedMonthData = rankingsByMonth.get(selectedMonth);
  const selectedModeData = selectedMonthData?.[selectedMode] || {
    players: [],
  };
  const eligibilityRequirement = rankingEligibilityByMode[selectedMode];
  const players = useMemo(
    () => selectedModeData.players.filter((player) => isEligibleForRankings(player, selectedMode)),
    [selectedMode, selectedModeData.players],
  );

  const handleSort = (nextKey) => {
    if (sortKey === nextKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "rank" ? "asc" : "desc");
  };

  const sortedPlayers = useMemo(() => {
    const directionMultiplier = sortDirection === "asc" ? 1 : -1;
    const sorted = [...players].sort((a, b) => {
      if (sortKey === "username") {
        return directionMultiplier * a.username.localeCompare(b.username);
      }

      const aValue = a[sortKey];
      const bValue = b[sortKey];
      const aNumber = aValue;
      const bNumber = bValue;
      if (aNumber === bNumber) return a.rank - b.rank;
      return directionMultiplier * (aNumber - bNumber);
    });

    return sorted;
  }, [players, sortDirection, sortKey]);

  return (
    <div className="rankingsPage">
      <Seo
        title="Atomic Chess Rankings"
        description="Browse monthly atomic chess rankings for blitz, bullet, and hyperbullet, with merged aliases and rating eligibility rules."
        path="/rankings"
      />
      <div className="panel rankingsPanel">
        <h1>Atomic Monthly Leaderboards</h1>
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
              onChange={(event) => setSelectedMode(event.target.value)}
            >
              {modeOptions.map((mode) => (
                <option key={mode} value={mode}>
                  {modeLabels[mode] ?? mode}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? <div className="errorText">{error}</div> : null}

        <div className="rankingsMeta">
          <span>{readableMonthLabel(selectedMonth || monthOptions[0])}</span>
          <div className="rankingsMetaDetails">
            <span className="rankedCount">
              {players.length} ranked
              <Link className="rankingsMetaLink" to="/users">
                Full user list
              </Link>
              <Link className="rankingsMetaLink" to="/rankings/how-ratings-work">
                <i className="fa-solid fa-circle-info" aria-hidden="true" />
                How are ratings calculated?
              </Link>
            </span>
            {eligibilityRequirement ? (
              <p className="rankingsEligibilityNote" aria-label={`${modeLabels[selectedMode]} eligibility`}>
                Note: {modeLabels[selectedMode]} requires {eligibilityRequirement.minGames}+ games
                this month and RD {"<"} {eligibilityRequirement.maxRd}.
              </p>
            ) : null}
          </div>
        </div>

        {players.length === 0 ? (
          <div className="emptyRankings">No leaderboard entries available for this month.</div>
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
                      <Link
                        className="rankingLink"
                        to="/@/$username"
                        params={{ username: player.username }}
                      >
                        {player.username}
                      </Link>
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
