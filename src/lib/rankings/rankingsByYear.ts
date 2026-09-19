import { createModeRecord, isMode, type Mode, modeOptions } from "../../constants/matches";
import { fetchYearlyLeaderboardRows } from "../archive/leaderboard";
import type { YearlyLeaderboardRow } from "../archive/types";
import type { RankingPlayer, RankingsByMode } from "./rankingsByMonth";

const yearlyModes = new Set<Mode>(["blitz", "bullet", "hyperbullet"]);

export const normalizeYearlyLeaderboardRows = (rows: YearlyLeaderboardRow[]): RankingsByMode => {
  const modes: RankingsByMode = createModeRecord(() => ({ players: [] }));
  rows.forEach((row) => {
    const mode = String(row.tc ?? "").toLowerCase();
    if (!isMode(mode) || !yearlyModes.has(mode)) return;
    modes[mode].players.push({
      rank: Number(row.rank),
      username: String(row.username ?? "Unknown"),
      score: Math.round(Number(row.rating) * 10) / 10,
      rd: null,
      games: Number(row.games) || null,
    });
  });
  modeOptions.forEach((mode) => {
    modes[mode].players = modes[mode].players
      .sort((a: RankingPlayer, b: RankingPlayer) => b.score - a.score || a.rank - b.rank)
      .map((entry: RankingPlayer, index: number) => ({ ...entry, rank: index + 1 }));
  });
  return modes;
};

export const loadRankingsForYear = async (year: number): Promise<RankingsByMode> => {
  if (!Number.isInteger(year) || year < 2016) throw new Error(`Invalid year selected: ${year}`);
  return normalizeYearlyLeaderboardRows(await fetchYearlyLeaderboardRows(year));
};
