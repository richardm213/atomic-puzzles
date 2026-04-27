import { createModeRecord, modeOptions, type Mode } from "../../constants/matches";
import { fetchLbRows, isoMonthStartFromMonthKey } from "../supabase/supabaseLb";

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

const toPlayers = (value: unknown): RankingPlayer[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry, index): RankingPlayer => {
      const e = entry as Record<string, unknown> | null | undefined;
      const username = e?.username ?? e?.user ?? e?.player ?? e?.name ?? "";
      const scoreRaw = e?.score ?? e?.rating ?? e?.points ?? e?.elo ?? e?.performance;
      const gamesRaw = e?.games ?? e?.game_count ?? e?.played ?? e?.num_games;
      const rankRaw = e?.rank ?? e?.position;
      const rdRaw = e?.rd;

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

const parseModeFromTimeControl = (timeControl: unknown): Mode | null => {
  const mode = String(timeControl ?? "").toLowerCase();
  return (modeOptions as readonly string[]).includes(mode) ? (mode as Mode) : null;
};

const normalizeLbRowsForMonth = (rows: unknown): RankingsByMode => {
  const modes: RankingsByMode = createModeRecord(() => ({ players: [] }));

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const r = row as Record<string, unknown> | null | undefined;
    const mode = parseModeFromTimeControl(r?.tc);
    if (!mode) return;
    modes[mode].players.push({
      rank: Number(r?.rank),
      username: String(r?.username ?? "Unknown"),
      score: roundToTenth(r?.rating),
      rd: roundToTenth(r?.rd),
      games: Number(r?.games) || null,
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
