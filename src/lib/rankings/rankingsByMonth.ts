import { createModeRecord, modeOptions, type Mode } from "../../constants/matches";
import { fetchLbRows, isoMonthStartFromMonthKey } from "../supabase/supabaseLb";
import type { LbRow } from "../../types/supabase";

export type RankingPlayer = {
  rank: number;
  username: string;
  score: number;
  rd: number;
  games: number | null;
};

export type RankingsByMode = Record<Mode, { players: RankingPlayer[] }>;

const roundToTenth = (value: unknown): number => {
  const numeric = Number(value);
  return Math.round(numeric * 10) / 10;
};

const toPlayers = (players: RankingPlayer[]): RankingPlayer[] => {
  return players
    .sort((a, b) => {
      if (b.score !== a.score) return (b.score ?? -Infinity) - (a.score ?? -Infinity);
      return a.rank - b.rank;
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
};

const parseModeFromTimeControl = (timeControl: unknown): Mode | null => {
  const mode = String(timeControl ?? "").toLowerCase();
  return (modeOptions as readonly string[]).includes(mode) ? (mode as Mode) : null;
};

const normalizeLbRowsForMonth = (rows: LbRow[]): RankingsByMode => {
  const modes: RankingsByMode = createModeRecord(() => ({ players: [] }));

  rows.forEach((row) => {
    const mode = parseModeFromTimeControl(row.tc);
    if (!mode) return;
    modes[mode].players.push({
      rank: Number(row.rank),
      username: String(row.username ?? "Unknown"),
      score: roundToTenth(row.rating),
      rd: roundToTenth(row.rd),
      games: Number(row.games) || null,
    });
  });

  modeOptions.forEach((mode) => {
    modes[mode].players = toPlayers(modes[mode].players);
  });

  return modes;
};

export const loadRankingsForMonth = async (monthKey: string): Promise<RankingsByMode> => {
  const month = isoMonthStartFromMonthKey(monthKey);
  if (!month) {
    throw new Error(`Invalid month selected: ${monthKey}`);
  }

  const rows = await fetchLbRows({ month });
  return normalizeLbRowsForMonth(rows);
};
