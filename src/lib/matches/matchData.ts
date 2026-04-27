import { modeOptions, type Mode } from "../../constants/matches";
import {
  fetchMatchRowsFromSupabase,
  type MatchFilters,
  type MatchRow,
} from "../supabase/supabaseMatchRows";
import {
  normalizedGamesFromMatch,
  normalizedPlayersFromMatch,
  normalizedRatingsFromMatch,
  parseWinnerFromPerspective,
  winnerToFullWord,
  type NormalizedGame,
  type RatingEntry,
} from "../../utils/matchTransforms";
import {
  matchSourceFromValues,
  sourceValueFromValues,
  type MatchSource,
} from "../../utils/matchFilters";
import { normalizeUsername } from "../../utils/playerNames";

export type ParsedMatchGame = {
  id: string;
  game_index: number;
  winner: string;
  white: string;
  black: string;
};

export type ParsedMatch = {
  match_id: string;
  players: [string, string];
  start_ts: number;
  time_control: string | null;
  source: string | null;
  tournament_id: string | null;
  games: ParsedMatchGame[];
  ratings: Record<string, RatingEntry>;
};

export type LoadMatchesOptions = {
  filters?: MatchFilters;
  page?: number;
  pageSize?: number;
};

export type PaginatedMatches = {
  matches: ParsedMatch[];
  total: number;
};

export type NormalizedMatchGame = {
  id: string;
  winner: string;
  playerScoreAfter: number;
  opponentScoreAfter: number;
};

export type NormalizedMatch = {
  matchId: string;
  startTs: number;
  timeControl: string;
  opponent: string;
  score: string;
  playerScore: number;
  opponentScore: number;
  ratingChange: number;
  rdChange: number;
  beforeRating: number;
  beforeRd: number;
  afterRating: number;
  afterRd: number;
  opponentBeforeRating: number;
  opponentAfterRating: number;
  opponentBeforeRd: number;
  opponentAfterRd: number;
  gameCount: number;
  firstGameId: string;
  clinchingGameId: string;
  games: NormalizedMatchGame[];
  sourceValue: string;
  sourceKey: MatchSource;
};

const parseGamesCompact = (gamesValue: unknown): unknown[] => {
  if (Array.isArray(gamesValue)) return gamesValue;
  const raw = String(gamesValue ?? "").trim();
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseMatchRows = (rows: MatchRow[]): ParsedMatch[] => {
  if (!rows.length) return [];
  return rows.map((row, index): ParsedMatch => {
    const fallbackMatchId = String(row.match_id ?? "").trim() || `match_${index + 1}`;
    const p1 = String(row.player_1 ?? "Unknown");
    const p2 = String(row.player_2 ?? "Unknown");
    const games = parseGamesCompact(row.games)
      .map((entry, gameOffset): ParsedMatchGame => {
        const [gameId, winnerCodeRaw, winnerPlayerRaw, whitePlayerRaw] = String(
          entry ?? "",
        ).split(",");
        const winnerCode = String(winnerCodeRaw ?? "")
          .trim()
          .toLowerCase();
        const winnerPlayer = String(winnerPlayerRaw ?? "").trim();
        const whiteSlot = String(whitePlayerRaw ?? "").trim();
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
          id: String(gameId ?? `game_${index + 1}_${gameOffset + 1}`),
          game_index: gameOffset + 1,
          winner,
          white,
          black,
        };
      })
      .filter((game) => game.id)
      .sort((a, b) => a.game_index - b.game_index);

    return {
      match_id: fallbackMatchId,
      players: [p1, p2],
      start_ts: Number(row.start_ts),
      time_control: row.time_control,
      source: row.source,
      tournament_id: row.tournament_id,
      games,
      ratings: {
        [p1]: {
          before_rating: Number(row.p1_before_rating),
          after_rating: Number(row.p1_after_rating),
          before_rd: Number(row.p1_before_rd),
          after_rd: Number(row.p1_after_rd),
        },
        [p2]: {
          before_rating: Number(row.p2_before_rating),
          after_rating: Number(row.p2_after_rating),
          before_rd: Number(row.p2_before_rd),
          after_rd: Number(row.p2_after_rd),
        },
      },
    };
  });
};

export async function loadRawMatchesByMode(
  mode: "all",
  options: LoadMatchesOptions & { pageSize: number },
): Promise<PaginatedMatches>;
export async function loadRawMatchesByMode(
  mode: "all",
  options?: LoadMatchesOptions,
): Promise<ParsedMatch[]>;
export async function loadRawMatchesByMode(
  mode: Mode,
  options: LoadMatchesOptions & { pageSize: number },
): Promise<PaginatedMatches>;
export async function loadRawMatchesByMode(
  mode: Mode,
  options?: LoadMatchesOptions,
): Promise<ParsedMatch[]>;
export async function loadRawMatchesByMode(
  mode: Mode | "all",
  options: LoadMatchesOptions = {},
): Promise<ParsedMatch[] | PaginatedMatches> {
  const { filters = {}, page, pageSize } = options;
  const subOptionsBase: LoadMatchesOptions = { filters };
  if (page !== undefined) subOptionsBase.page = page;
  if (mode === "all") {
    if (pageSize !== undefined) {
      const matchesByMode = await Promise.all(
        modeOptions.map((modeOption) =>
          loadRawMatchesByMode(modeOption, { ...subOptionsBase, pageSize }),
        ),
      );
      return {
        matches: matchesByMode.flatMap((entry) => entry.matches),
        total: matchesByMode.reduce((sum, entry) => sum + entry.total, 0),
      };
    }
    const matchesByMode = await Promise.all(
      modeOptions.map((modeOption) => loadRawMatchesByMode(modeOption, subOptionsBase)),
    );
    return matchesByMode.flat();
  }

  const result = await fetchMatchRowsFromSupabase(mode, filters, {
    ...(page !== undefined ? { page } : {}),
    ...(pageSize !== undefined ? { pageSize } : {}),
  });
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const matches = parseMatchRows(rows);
  if (pageSize !== undefined) {
    return {
      matches,
      total: Number(result?.total) || matches.length,
    };
  }
  return matches;
}

type MatchLikeForNormalize = {
  match_id?: string | null;
  start_ts?: unknown;
  s?: unknown;
  time_control?: unknown;
  t?: unknown;
  source?: unknown;
  match_source?: unknown;
  queue?: unknown;
  players?: unknown;
  p?: unknown;
  games?: unknown;
  g?: unknown;
  ratings?: unknown;
  ra?: unknown;
  ratings_compact?: unknown;
  u?: unknown;
};

export const normalizeMatches = (
  matches: MatchLikeForNormalize[] | null | undefined,
  username: string,
): NormalizedMatch[] => {
  const normalizedUsername = normalizeUsername(username);
  return (Array.isArray(matches) ? matches : [])
    .filter((match) => {
      const players = normalizedPlayersFromMatch(match);
      return players.some((player) => normalizeUsername(player) === normalizedUsername);
    })
    .map((match): NormalizedMatch => {
      const players = normalizedPlayersFromMatch(match);
      const opponent =
        players.find((player) => normalizeUsername(player) !== normalizedUsername) ?? "Unknown";
      const games: NormalizedGame[] = normalizedGamesFromMatch(match, players);
      const score = games.reduce(
        (accumulator, game) => {
          const result = parseWinnerFromPerspective(game, normalizedUsername);
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
      const matchGames = games.map((game): NormalizedMatchGame => {
        const result = parseWinnerFromPerspective(game, normalizedUsername);
        if (result === "win") {
          runningPlayerScore += 1;
        } else if (result === "draw") {
          runningPlayerScore += 0.5;
          runningOpponentScore += 0.5;
        } else {
          runningOpponentScore += 1;
        }

        const winnerLabel =
          result === "win" ? normalizedUsername : result === "loss" ? opponent : "draw";

        return {
          id: String(game?.id ?? "—"),
          winner: winnerLabel,
          playerScoreAfter: runningPlayerScore,
          opponentScoreAfter: runningOpponentScore,
        };
      });

      const ratings = normalizedRatingsFromMatch(match, players);
      const ratingData = ratings?.[normalizedUsername] ?? null;
      const opponentLower = String(opponent).toLowerCase();
      const opponentRatingData = ratings?.[opponent] ?? ratings?.[opponentLower] ?? null;
      const beforeRating = Number(ratingData?.before_rating);
      const afterRating = Number(ratingData?.after_rating);
      const beforeRd = Number(ratingData?.before_rd);
      const afterRd = Number(ratingData?.after_rd);
      const opponentBeforeRating = Number(opponentRatingData?.before_rating);
      const opponentAfterRating = Number(opponentRatingData?.after_rating);
      const opponentBeforeRd = Number(opponentRatingData?.before_rd);
      const opponentAfterRd = Number(opponentRatingData?.after_rd);
      const clinchingGame = matchGames.find((game, index) => {
        const remainingGames = matchGames.length - index - 1;
        return game.playerScoreAfter > game.opponentScoreAfter + remainingGames;
      });
      return {
        matchId: String(match?.match_id ?? ""),
        startTs: Number(match?.start_ts ?? match?.s),
        timeControl: String(match?.time_control ?? match?.t ?? "—"),
        opponent: String(opponent),
        score: `${score.player}-${score.opponent}`,
        playerScore: score.player,
        opponentScore: score.opponent,
        ratingChange: afterRating - beforeRating,
        rdChange: afterRd - beforeRd,
        beforeRating,
        beforeRd,
        afterRating,
        afterRd,
        opponentBeforeRating,
        opponentAfterRating,
        opponentBeforeRd,
        opponentAfterRd,
        gameCount: games.length,
        firstGameId: String(games[0]?.id ?? "—"),
        clinchingGameId: String(
          (score.player > score.opponent ? clinchingGame?.id : null) ?? games[0]?.id ?? "—",
        ),
        games: matchGames,
        sourceValue: sourceValueFromValues(match?.source, match?.match_source, match?.queue),
        sourceKey: matchSourceFromValues(match?.source, match?.match_source, match?.queue),
      };
    })
    .sort((a, b) => b.startTs - a.startTs);
};
