import { useEffect, useMemo, useState } from "react";

const modeOptions = ["blitz", "bullet"];
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

const monthDateFromKey = (monthKey) => {
  const parsed = new Date(`${monthKey} 01 UTC`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const readableMonthLabel = (monthKey) => {
  const date = monthDateFromKey(monthKey);
  if (!date) return monthKey || "Unknown month";
  return monthLabelFromDate(date);
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

const roundToTenth = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * 10) / 10;
};

const toPlayers = (value) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry, index) => {
      const username =
        entry?.username ?? entry?.user ?? entry?.player ?? entry?.name ?? "";
      const scoreRaw =
        entry?.score ??
        entry?.rating ??
        entry?.points ??
        entry?.elo ??
        entry?.performance;
      const gamesRaw =
        entry?.games ?? entry?.game_count ?? entry?.played ?? entry?.num_games;
      const rankRaw = entry?.rank ?? entry?.position;
      const rdRaw = entry?.rd;

      return {
        rank: Number.isFinite(Number(rankRaw)) ? Number(rankRaw) : index + 1,
        username: String(username || "Unknown"),
        score: roundToTenth(scoreRaw),
        rd: roundToTenth(rdRaw),
        games: Number.isFinite(Number(gamesRaw)) ? Number(gamesRaw) : null,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return (b.score ?? -Infinity) - (a.score ?? -Infinity);
      return a.rank - b.rank;
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
};

const normalizeLeaderboardData = (rawData) => {
  const monthMap = new Map();
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) {
    return monthMap;
  }

  Object.entries(rawData).forEach(([monthKey, monthData]) => {
    if (!monthData || typeof monthData !== "object") return;

    const modes = {};
    modeOptions.forEach((mode) => {
      const modeData = monthData?.[mode];
      if (!modeData || typeof modeData !== "object") {
        modes[mode] = { players: [], qualifiedPlayers: [] };
        return;
      }

      modes[mode] = {
        players: toPlayers(modeData.rankings),
        qualifiedPlayers: Array.isArray(modeData.qualified_players)
          ? modeData.qualified_players
          : [],
      };
    });

    monthMap.set(monthKey, modes);
  });

  return monthMap;
};

export const RankingsPage = () => {
  const [rankingsByMonth, setRankingsByMonth] = useState(new Map());
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedMonthName, setSelectedMonthName] = useState("");
  const [selectedMode, setSelectedMode] = useState("blitz");
  const [sortKey, setSortKey] = useState("rank");
  const [sortDirection, setSortDirection] = useState("asc");
  const [error, setError] = useState("");

  const monthOptions = useMemo(() => allMonthsFromJan2023().reverse(), []);
  const yearOptions = useMemo(() => allYearsFromJan2023(), []);

  useEffect(() => {
    const loadRankings = async () => {
      try {
        setError("");
        const response = await fetch("/private/lb.json", {
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`Could not load /private/lb.json (HTTP ${response.status})`);
        }

        const data = await response.json();
        const normalized = normalizeLeaderboardData(data);
        setRankingsByMonth(normalized);
      } catch (loadError) {
        setError(loadError.message || "Failed to load leaderboard data");
        setRankingsByMonth(new Map());
      }
    };

    loadRankings();
  }, []);

  useEffect(() => {
    const firstWithData =
      monthOptions.find((month) => rankingsByMonth.has(month)) || monthOptions[0] || "";
    const firstDate = monthDateFromKey(firstWithData);
    if (!firstDate) return;

    setSelectedYear((previous) => previous || String(firstDate.getUTCFullYear()));
    setSelectedMonthName((previous) => previous || monthNameFromDate(firstDate));
  }, [monthOptions, rankingsByMonth]);

  const selectedMonth = useMemo(() => {
    if (!selectedMonthName || !selectedYear) return "";
    return `${selectedMonthName} ${selectedYear}`;
  }, [selectedMonthName, selectedYear]);

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

  const selectedMonthData = rankingsByMonth.get(selectedMonth);
  const selectedModeData =
    selectedMonthData?.[selectedMode] || { players: [], qualifiedPlayers: [] };
  const players = selectedModeData.players;
  const qualifiedCount = selectedModeData.qualifiedPlayers.length;

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
      const aNumber = Number.isFinite(aValue) ? aValue : -Infinity;
      const bNumber = Number.isFinite(bValue) ? bValue : -Infinity;
      if (aNumber === bNumber) return a.rank - b.rank;
      return directionMultiplier * (aNumber - bNumber);
    });

    return sorted;
  }, [players, sortDirection, sortKey]);

  return (
    <div className="rankingsPage">
      <div className="panel rankingsPanel">
        <h1>Atomic Monthly Leaderboards</h1>
        <p>Best atomic players for each month since January 2023.</p>

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
                  {mode}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? <div className="errorText">{error}</div> : null}

        <div className="rankingsMeta">
          <span>{readableMonthLabel(selectedMonth || monthOptions[0])}</span>
          <span>
            {players.length} ranked • {qualifiedCount} qualified
          </span>
        </div>

        {players.length === 0 ? (
          <div className="emptyRankings">
            No leaderboard entries available for this month.
          </div>
        ) : (
          <div className="rankingsTableWrap">
            <table className="rankingsTable">
              <thead>
                <tr>
                  <th>
                    <button type="button" className="sortButton" onClick={() => handleSort("rank")}>
                      # {sortKey === "rank" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="sortButton"
                      onClick={() => handleSort("username")}
                    >
                      Player {sortKey === "username" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="sortButton"
                      onClick={() => handleSort("score")}
                    >
                      Score {sortKey === "score" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="sortButton" onClick={() => handleSort("rd")}>
                      RD {sortKey === "rd" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="sortButton"
                      onClick={() => handleSort("games")}
                    >
                      Games {sortKey === "games" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((player) => (
                  <tr key={`${selectedMonth}-${player.rank}-${player.username}`}>
                    <td>{player.rank}</td>
                    <td>
                      <a
                        className="rankingLink"
                        href={`/rankings/${encodeURIComponent(player.username)}`}
                      >
                        {player.username}
                      </a>
                    </td>
                    <td>{Number.isFinite(player.score) ? player.score.toFixed(1) : "—"}</td>
                    <td>{Number.isFinite(player.rd) ? player.rd.toFixed(1) : "—"}</td>
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
