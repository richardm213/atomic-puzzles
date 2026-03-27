import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  fetchLbRows,
  fetchMatchRowsFromSupabase,
  isoMonthStartFromMonthKey,
} from "../lib/supabaseLb";
import {
  modeOptions,
} from "../constants/matches";
import {
  normalizedGamesFromMatch,
  normalizedPlayersFromMatch,
  normalizedRatingsFromMatch,
  parseWinnerFromPerspective,
  winnerToFullWord,
} from "../utils/matchTransforms";

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
      const username = entry?.username ?? entry?.user ?? entry?.player ?? entry?.name ?? "";
      const scoreRaw =
        entry?.score ?? entry?.rating ?? entry?.points ?? entry?.elo ?? entry?.performance;
      const gamesRaw = entry?.games ?? entry?.game_count ?? entry?.played ?? entry?.num_games;
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


const toNullableNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseGamesCompact = (gamesValue) => {
  if (Array.isArray(gamesValue)) return gamesValue;
  const raw = String(gamesValue ?? "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseMatchRows = (rows) => {
  if (!rows.length) return [];
  return rows.map((row, index) => {
    const fallbackMatchId = String(row.match_id || "").trim() || `match_${index + 1}`;
    const p1 = String(row.player_1 || "Unknown");
    const p2 = String(row.player_2 || "Unknown");
    const games = parseGamesCompact(row.games)
      .map((entry, gameOffset) => {
        const [gameId, winnerCodeRaw, winnerPlayerRaw, whitePlayerRaw] = String(entry || "").split(",");
        const winnerCode = String(winnerCodeRaw || "").trim().toLowerCase();
        const winnerPlayer = String(winnerPlayerRaw || "").trim();
        const whiteSlot = String(whitePlayerRaw || "").trim();
        const white = whiteSlot === "2" ? p2 : p1;
        const black = whiteSlot === "2" ? p1 : p2;

        let winner = winnerToFullWord(winnerCode);
        if (!["white", "black", "draw"].includes(winner)) {
          if (winnerPlayer === "0" || winnerCode === "d") winner = "draw";
          else if (winnerPlayer === "1") winner = white === p1 ? "white" : "black";
          else if (winnerPlayer === "2") winner = white === p2 ? "white" : "black";
          else winner = "draw";
        }

        return {
          id: String(gameId || `game_${index + 1}_${gameOffset + 1}`),
          game_index: gameOffset + 1,
          end_ts: toNullableNumber(row.end_ts),
          winner,
          white,
          black,
        };
      })
      .filter((game) => game.id);

    return {
      match_id: fallbackMatchId,
      players: [p1, p2],
      start_ts: toNullableNumber(row.start_ts),
      end_ts: toNullableNumber(row.end_ts),
      time_control: row.time_control,
      source: row.source,
      tournament_id: row.tournament_id,
      games,
      ratings: {
        [p1]: {
          before_rating: toNullableNumber(row.p1_before_rating),
          after_rating: toNullableNumber(row.p1_after_rating),
          before_rd: toNullableNumber(row.p1_before_rd),
          after_rd: toNullableNumber(row.p1_after_rd),
        },
        [p2]: {
          before_rating: toNullableNumber(row.p2_before_rating),
          after_rating: toNullableNumber(row.p2_after_rating),
          before_rd: toNullableNumber(row.p2_before_rd),
          after_rd: toNullableNumber(row.p2_after_rd),
        },
      },
    };
  }).map((match) => {
    const orderedGames = [...match.games].sort((a, b) => {
      const aIndex = Number.isFinite(a.game_index) ? a.game_index : Number.POSITIVE_INFINITY;
      const bIndex = Number.isFinite(b.game_index) ? b.game_index : Number.POSITIVE_INFINITY;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return (a.end_ts ?? 0) - (b.end_ts ?? 0);
    });

    return {
      ...match,
      start_ts: Number.isFinite(match.start_ts) ? match.start_ts : null,
      end_ts: Number.isFinite(match.end_ts) ? match.end_ts : null,
      games: orderedGames,
    };
  });
};

const parseModeFromTimeControl = (timeControl) => {
  const mode = String(timeControl || "").toLowerCase();
  return modeOptions.includes(mode) ? mode : null;
};

const normalizeLbRowsForMonth = (rows) => {
  const modes = {
    blitz: { players: [], qualifiedPlayers: [] },
    bullet: { players: [], qualifiedPlayers: [] },
  };

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const mode = parseModeFromTimeControl(row?.tc);
    if (!mode) return;
    modes[mode].players.push({
      rank: Number(row?.rank),
      username: String(row?.username || "Unknown"),
      score: roundToTenth(row?.rating),
      rd: roundToTenth(row?.rd),
      games: Number.isFinite(Number(row?.games)) ? Number(row.games) : null,
    });
  });

  modeOptions.forEach((mode) => {
    modes[mode].players = toPlayers(modes[mode].players);
  });

  return modes;
};

export const loadRankingsForMonth = async (monthKey) => {
  const month = isoMonthStartFromMonthKey(monthKey);
  if (!month) {
    throw new Error(`Invalid month selected: ${monthKey}`);
  }

  const rows = await fetchLbRows({ month });
  return normalizeLbRowsForMonth(rows);
};

export const loadCurrentLeaderboard = async () => {
  const now = new Date();
  const currentMonthKey = now.toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return loadRankingsForMonth(currentMonthKey).then((data) => ({
    blitz: data.blitz.players,
    bullet: data.bullet.players,
  }));
};

export const findRankForUsernameInLeaderboard = (leaderboardByMode, username, mode) => {
  const usernameLower = String(username || "").toLowerCase();
  const players = leaderboardByMode?.[mode] ?? [];
  const playerMatch = players.find(
    (player) => String(player?.username || "").toLowerCase() === usernameLower,
  );
  return Number.isFinite(playerMatch?.rank) ? playerMatch.rank : null;
};

export const findLatestRankForUsername = (rankingsByMonth, username, mode) => {
  const usernameLower = String(username || "").toLowerCase();
  if (!usernameLower || !rankingsByMonth || typeof rankingsByMonth.entries !== "function") {
    return null;
  }

  const sortedMonths = [...rankingsByMonth.keys()].sort((a, b) => {
    const aDate = monthDateFromKey(a);
    const bDate = monthDateFromKey(b);
    return (bDate?.getTime() ?? -Infinity) - (aDate?.getTime() ?? -Infinity);
  });

  for (const monthKey of sortedMonths) {
    const players = rankingsByMonth.get(monthKey)?.[mode]?.players ?? [];
    const match = players.find(
      (player) => String(player.username || "").toLowerCase() === usernameLower,
    );
    if (match && Number.isFinite(match.rank)) {
      return match.rank;
    }
  }

  return null;
};

export const loadRawMatchesByMode = async (mode, options = {}) => {
  const { filters = {}, page, pageSize } = options;
  if (mode === "all") {
    const [blitzMatches, bulletMatches] = await Promise.all([
      loadRawMatchesByMode("blitz", { filters, page, pageSize }),
      loadRawMatchesByMode("bullet", { filters, page, pageSize }),
    ]);
    if (pageSize) {
      return {
        matches: [...(blitzMatches.matches ?? []), ...(bulletMatches.matches ?? [])],
        total: (blitzMatches.total ?? 0) + (bulletMatches.total ?? 0),
      };
    }
    return [...blitzMatches, ...bulletMatches];
  }
  const result = await fetchMatchRowsFromSupabase(mode, filters, { page, pageSize });
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const matches = parseMatchRows(rows);
  if (pageSize) {
    return {
      matches,
      total: Number.isFinite(Number(result?.total)) ? Number(result.total) : matches.length,
    };
  }
  return matches;
};

export const normalizeMatches = (matches, username) => {
  const usernameLower = username.toLowerCase();

  return (Array.isArray(matches) ? matches : [])
    .filter((match) => {
      const players = normalizedPlayersFromMatch(match);
      return players.some((player) => String(player).toLowerCase() === usernameLower);
    })
    .map((match) => {
      const players = normalizedPlayersFromMatch(match);
      const opponent =
        players.find((player) => String(player).toLowerCase() !== usernameLower) || "Unknown";
      const games = normalizedGamesFromMatch(match, players);
      const score = games.reduce(
        (accumulator, game) => {
          const result = parseWinnerFromPerspective(game, usernameLower);
          if (result === "win") {
            accumulator.player += 1;
          } else if (result === "draw") {
            accumulator.player += 0.5;
            accumulator.opponent += 0.5;
          } else {
            accumulator.opponent += 1;
          }
          return accumulator;
        },
        { player: 0, opponent: 0 },
      );
      let runningPlayerScore = 0;
      let runningOpponentScore = 0;
      const matchGames = games.map((game) => {
        const result = parseWinnerFromPerspective(game, usernameLower);
        if (result === "win") {
          runningPlayerScore += 1;
        } else if (result === "draw") {
          runningPlayerScore += 0.5;
          runningOpponentScore += 0.5;
        } else {
          runningOpponentScore += 1;
        }

        const winnerLabel = result === "win" ? username : result === "loss" ? opponent : "draw";

        return {
          id: String(game?.id || "—"),
          winner: winnerLabel,
          playerScoreAfter: runningPlayerScore,
          opponentScoreAfter: runningOpponentScore,
        };
      });

      const ratings = normalizedRatingsFromMatch(match, players);
      const ratingData = ratings?.[username] || ratings?.[usernameLower] || null;
      const opponentLower = String(opponent).toLowerCase();
      const opponentRatingData = ratings?.[opponent] || ratings?.[opponentLower] || null;
      const beforeRating = Number(ratingData?.before_rating);
      const afterRating = Number(ratingData?.after_rating);
      const beforeRd = Number(ratingData?.before_rd);
      const afterRd = Number(ratingData?.after_rd);
      const opponentAfterRating = Number(opponentRatingData?.after_rating);

      return {
        startTs: Number(match?.start_ts ?? match?.s),
        timeControl: String(match?.time_control ?? match?.t ?? "—"),
        opponent: String(opponent),
        score: `${score.player}-${score.opponent}`,
        playerScore: score.player,
        opponentScore: score.opponent,
        ratingChange:
          Number.isFinite(beforeRating) && Number.isFinite(afterRating)
            ? afterRating - beforeRating
            : null,
        rdChange: Number.isFinite(beforeRd) && Number.isFinite(afterRd) ? afterRd - beforeRd : null,
        beforeRating: Number.isFinite(beforeRating) ? beforeRating : null,
        beforeRd: Number.isFinite(beforeRd) ? beforeRd : null,
        afterRating: Number.isFinite(afterRating) ? afterRating : null,
        afterRd: Number.isFinite(afterRd) ? afterRd : null,
        opponentAfterRating: Number.isFinite(opponentAfterRating) ? opponentAfterRating : null,
        gameCount: games.length,
        firstGameId: String(games[0]?.id || "—"),
        games: matchGames,
      };
    })
    .sort((a, b) => b.startTs - a.startTs);
};

const LeaderboardView = () => {
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

  useEffect(() => {
    if (!selectedMonth) return;
    if (rankingsByMonth.has(selectedMonth)) return;

    const loadRankings = async () => {
      try {
        setError("");
        const monthData = await loadRankingsForMonth(selectedMonth);
        setRankingsByMonth((previous) => {
          const next = new Map(previous);
          next.set(selectedMonth, monthData);
          return next;
        });
      } catch (loadError) {
        setError(loadError.message || "Failed to load leaderboard data");
      }
    };

    loadRankings();
  }, [selectedMonth, rankingsByMonth]);

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
  const selectedModeData = selectedMonthData?.[selectedMode] || {
    players: [],
    qualifiedPlayers: [],
  };
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
          <div className="emptyRankings">No leaderboard entries available for this month.</div>
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
                      <Link
                        className="rankingLink"
                        to="/@/$username"
                        params={{ username: player.username }}
                      >
                        {player.username}
                      </Link>
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

export const RankingsPage = () => <LeaderboardView />;
