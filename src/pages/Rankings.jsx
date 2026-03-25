import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { fetchLbRows, isoMonthStartFromMonthKey } from "../lib/supabaseLb";

export const modeOptions = ["blitz", "bullet"];
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
export const pageSizeOptions = [10, 25, 50, 100];
export const opponentRatingSliderMin = 1000;
export const opponentRatingSliderMax = 2500;
export const defaultRatingMin = 1000;
export const defaultRatingMax = 2500;
export const defaultMatchLengthMin = 1;
export const defaultMatchLengthMax = 50;
export const matchLengthBoundsByMode = {
  blitz: { min: 1, max: 50 },
  bullet: { min: 1, max: 200 },
};

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

const winnerCodeLookup = {
  w: "white",
  b: "black",
  d: "draw",
};

const winnerToFullWord = (winner) => {
  const winnerValue = String(winner || "").toLowerCase();
  return winnerCodeLookup[winnerValue] || winnerValue;
};

const normalizedPlayersFromMatch = (match) => {
  if (Array.isArray(match?.players)) return match.players;
  if (Array.isArray(match?.p)) return match.p;
  return [];
};

const playerFromRef = (playerRef, players) => {
  if (typeof playerRef === "number" && Number.isInteger(playerRef)) {
    return String(players[playerRef] || "");
  }

  const numericRef = Number(playerRef);
  if (Number.isInteger(numericRef) && String(playerRef).trim() !== "") {
    return String(players[numericRef] || "");
  }

  return String(playerRef || "");
};

const normalizedGamesFromMatch = (match, players) => {
  const gamesRaw = Array.isArray(match?.games)
    ? match.games
    : Array.isArray(match?.g)
      ? match.g
      : [];

  return gamesRaw.map((game) => {
    if (Array.isArray(game)) {
      const [id, whiteRef, blackRef, winnerRef] = game;
      return {
        id: id ?? "—",
        white: playerFromRef(whiteRef, players),
        black: playerFromRef(blackRef, players),
        winner: winnerToFullWord(winnerRef),
      };
    }

    return {
      id: game?.id ?? "—",
      white: playerFromRef(game?.white, players),
      black: playerFromRef(game?.black, players),
      winner: winnerToFullWord(game?.winner),
    };
  });
};

const ratingsFromCompact = (ratingsCompact, players) => {
  if (!Array.isArray(ratingsCompact)) return {};

  const mappedEntries = ratingsCompact
    .map((entry) => {
      if (!Array.isArray(entry) || entry.length < 5) return null;
      const [playerRef, beforeRating, afterRating, beforeRd, afterRd] = entry;
      const username = playerFromRef(playerRef, players);
      if (!username) return null;
      return [
        username,
        {
          before_rating: beforeRating,
          after_rating: afterRating,
          before_rd: beforeRd,
          after_rd: afterRd,
        },
      ];
    })
    .filter(Boolean);

  return Object.fromEntries(mappedEntries);
};

const normalizedRatingsFromMatch = (match, players) => {
  const ratings =
    match?.ratings && typeof match.ratings === "object"
      ? match.ratings
      : match?.ra && typeof match.ra === "object"
        ? match.ra
        : {};
  const ratingsCompact = match?.ratings_compact ?? match?.u;
  return {
    ...ratingsFromCompact(ratingsCompact, players),
    ...ratings,
  };
};

const parseWinnerFromPerspective = (game, usernameLower) => {
  const white = String(game?.white || "").toLowerCase();
  const black = String(game?.black || "").toLowerCase();
  const winner = winnerToFullWord(game?.winner);

  if (winner === "draw") return "draw";
  if (winner === "white") return white === usernameLower ? "win" : "loss";
  if (winner === "black") return black === usernameLower ? "win" : "loss";
  return "draw";
};

export const formatSignedDecimal = (value) => {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  if (rounded > 0) return `+${rounded.toFixed(1)}`;
  return rounded.toFixed(1);
};

export const formatLocalDateTime = (timestamp) => {
  if (!Number.isFinite(timestamp)) return "—";
  const date = new Date(timestamp);
  const now = new Date();
  const includeYear = date.getFullYear() !== now.getFullYear();
  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate();
  const year = date.getFullYear();
  const time = date
    .toLocaleString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase();

  return includeYear ? `${month} ${day}, ${year} ${time}` : `${month} ${day} ${time}`;
};

export const formatScore = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0.0";
  return numeric.toFixed(1);
};

export const formatOpponentWithRating = (opponent, opponentRating) => {
  if (!Number.isFinite(opponentRating)) return opponent;
  return `${opponent} (${opponentRating.toFixed(1)})`;
};

export const parseTimeControlParts = (timeControl) => {
  const [initialRaw, incrementRaw] = String(timeControl || "").split("+");
  const initialSeconds = Number(initialRaw);
  const incrementSeconds = Number(incrementRaw);
  return {
    initial: Number.isFinite(initialSeconds) ? String(initialSeconds) : "",
    increment: Number.isFinite(incrementSeconds) ? String(incrementSeconds) : "",
  };
};

const matchDataUrlCandidates = (mode) => [
  `/private/${mode}_matches.csv`,
  `/data/${mode}_matches.csv`,
  `https://raw.githubusercontent.com/atomicchess/atomic-rankings/main/data/${mode}_matches.csv`,
  `https://raw.githubusercontent.com/atomaire/atomic-rankings/main/data/${mode}_matches.csv`,
  `/private/${mode}_matches.json`,
  `/data/${mode}_matches.json`,
  `https://raw.githubusercontent.com/atomicchess/atomic-rankings/main/data/${mode}_matches.json`,
  `https://raw.githubusercontent.com/atomaire/atomic-rankings/main/data/${mode}_matches.json`,
];

const gameDataUrlCandidates = (mode) => [
  `/private/${mode}_games.csv`,
  `/data/${mode}_games.csv`,
  `https://raw.githubusercontent.com/atomicchess/atomic-rankings/main/data/${mode}_games.csv`,
  `https://raw.githubusercontent.com/atomaire/atomic-rankings/main/data/${mode}_games.csv`,
];

const splitCsvLine = (line) => {
  const values = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (insideQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
};

const parsePostgresTextArray = (value) => {
  if (Array.isArray(value)) return value;
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  if (raw.startsWith("{") && raw.endsWith("}")) {
    const inner = raw.slice(1, -1);
    if (!inner) return [];
    return inner
      .split(",")
      .map((entry) => entry.trim().replace(/^"(.*)"$/, "$1"))
      .filter(Boolean);
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry || "")).filter(Boolean) : [];
  } catch {
    return raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
};

const toNullableNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseCsvRows = (rawCsv) => {
  const text = String(rawCsv || "").trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => String(header || "").trim());

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
};

const parseCsvGamesById = (rawCsv) => {
  const rows = parseCsvRows(rawCsv);
  const lookup = new Map();

  rows.forEach((row) => {
    const gameId = String(row.game_id || "").trim();
    if (!gameId) return;
    lookup.set(gameId, {
      id: gameId,
      game_index: toNullableNumber(row.game_index),
      end_ts: toNullableNumber(row.end_ts),
      winner: winnerToFullWord(row.winner),
      white: String(row.white_player || ""),
      black: String(row.black_player || ""),
      time_control: row.time_control,
      source: row.source,
      ratings: {
        white: {
          before_rating: toNullableNumber(row.white_before_rating),
          after_rating: toNullableNumber(row.white_after_rating),
          before_rd: toNullableNumber(row.white_before_rd),
          after_rd: toNullableNumber(row.white_after_rd),
        },
        black: {
          before_rating: toNullableNumber(row.black_before_rating),
          after_rating: toNullableNumber(row.black_after_rating),
          before_rd: toNullableNumber(row.black_before_rd),
          after_rd: toNullableNumber(row.black_after_rd),
        },
      },
    });
  });

  return lookup;
};

const parseCsvMatches = (rawCsv, gamesById = new Map()) => {
  const rows = parseCsvRows(rawCsv);
  return rows.map((row) => {
    const gameIds = parsePostgresTextArray(row.game_ids);
    const games = gameIds.map((id) => {
      const detailed = gamesById.get(id);
      return (
        detailed || {
          id,
          winner: "draw",
          white: row.player_1,
          black: row.player_2,
          end_ts: toNullableNumber(row.end_ts),
        }
      );
    });
    games.sort((a, b) => {
      const aIndex = Number.isFinite(a.game_index) ? a.game_index : Number.POSITIVE_INFINITY;
      const bIndex = Number.isFinite(b.game_index) ? b.game_index : Number.POSITIVE_INFINITY;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return (a.end_ts ?? 0) - (b.end_ts ?? 0);
    });

    const p1 = String(row.player_1 || "Unknown");
    const p2 = String(row.player_2 || "Unknown");
    return {
      match_id: row.match_id,
      players: [p1, p2],
      start_ts: Number(row.start_ts),
      end_ts: Number(row.end_ts),
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
  });
};

const loadTextFromCandidates = async (candidates) => {
  let lastError = null;
  for (const url of candidates) {
    try {
      const response = await fetch(url, { headers: { Accept: "text/csv,text/plain,*/*" } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return "";
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

export const loadRawMatchesByMode = async (mode) => {
  if (mode === "all") {
    const [blitzMatches, bulletMatches] = await Promise.all([
      loadRawMatchesByMode("blitz"),
      loadRawMatchesByMode("bullet"),
    ]);
    return [...blitzMatches, ...bulletMatches];
  }

  let gamesById = new Map();
  try {
    const gamesCsv = await loadTextFromCandidates(gameDataUrlCandidates(mode));
    gamesById = parseCsvGamesById(gamesCsv);
  } catch {
    gamesById = new Map();
  }

  const candidates = matchDataUrlCandidates(mode);
  let loaded = null;
  let lastError = null;

  for (const url of candidates) {
    try {
      const isCsv = url.endsWith(".csv");
      const response = await fetch(url, {
        headers: { Accept: isCsv ? "text/csv,text/plain,*/*" : "application/json" },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      loaded = isCsv ? parseCsvMatches(await response.text(), gamesById) : await response.json();
      break;
    } catch (fetchError) {
      lastError = fetchError;
    }
  }

  if (!loaded) {
    throw new Error(
      `Could not load ${mode} match history from atomic-rankings sources (${String(lastError)})`,
    );
  }

  return Array.isArray(loaded) ? loaded : [];
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
