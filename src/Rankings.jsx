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
        score: Number.isFinite(Number(scoreRaw)) ? Number(scoreRaw) : null,
        rd: Number.isFinite(Number(rdRaw)) ? Number(rdRaw) : null,
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
    const monthsForYear = monthOptions
      .filter((monthKey) => monthKey.endsWith(` ${selectedYear}`))
      .map((monthKey) => monthKey.split(" ")[0]);
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

  return (
    <div className="rankingsPage">
      <div className="panel rankingsPanel">
        <h1>Atomic Monthly Leaderboards</h1>
        <p>Best atomic players for each month since January 2023.</p>

        <div className="controls">
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
                  <th>#</th>
                  <th>Player</th>
                  <th>Score</th>
                  <th>RD</th>
                  <th>Games</th>
                </tr>
              </thead>
              <tbody>
                {players.map((player) => (
                  <tr key={`${selectedMonth}-${player.rank}-${player.username}`}>
                    <td>{player.rank}</td>
                    <td>{player.username}</td>
                    <td>{player.score ?? "—"}</td>
                    <td>{Number.isFinite(player.rd) ? player.rd : "—"}</td>
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
