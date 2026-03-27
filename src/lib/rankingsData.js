import { modeOptions } from "../constants/matches";
import { fetchLbRows, isoMonthStartFromMonthKey } from "./supabaseLb";

const monthDateFromKey = (monthKey) => {
  const parsed = new Date(`${monthKey} 01 UTC`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const monthKeyFromDate = (date) =>
  date.toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

const roundToTenth = (value) => {
  const numeric = Number(value);
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
        rank: Number(rankRaw) || index + 1,
        username: String(username || "Unknown"),
        score: roundToTenth(scoreRaw),
        rd: roundToTenth(rdRaw),
        games: Number(gamesRaw) || null,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return (b.score ?? -Infinity) - (a.score ?? -Infinity);
      return a.rank - b.rank;
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
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
      games: Number(row?.games) || null,
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
  const currentMonthKey = monthKeyFromDate(now);
  return loadRankingsForMonth(currentMonthKey).then((data) => ({
    blitz: data.blitz.players,
    bullet: data.bullet.players,
  }));
};

export const findRankForUsernameInLeaderboard = (leaderboardByMode, username, mode) => {
  const players = leaderboardByMode?.[mode] ?? [];
  const playerMatch = players.find(
    (player) => String(player?.username || "").toLowerCase() === username,
  );
  return playerMatch?.rank ?? null;
};

export const findLatestRankForUsername = (rankingsByMonth, username, mode) => {
  if (!rankingsByMonth || typeof rankingsByMonth.entries !== "function") {
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
      (player) => String(player.username || "").toLowerCase() === username,
    );
    if (match) {
      return match.rank;
    }
  }

  return null;
};
