import { type Mode, modeOptions } from "../../constants/matches";
import { normalizeUsername } from "../../utils/playerNames";
import { fetchMatchRowsFromArchive, type MatchFilters, type MatchRow } from "../archive/matches";
import { type MatchSource, matchSourceFromValues, sourceValueFromValues } from "./filters";
import {
  ratingsForPlayers,
  sourceKeyFromMatch,
  sourceValueFromMatch,
  summarizeMatchGames,
} from "./summaries";
import {
  type NormalizedGame,
  normalizedGamesFromMatch,
  normalizedPlayersFromMatch,
  normalizedRatingsFromMatch,
  parseWinnerFromPerspective,
  winnerToFullWord,
} from "./transforms";
import type { MatchCardData, RawMatchLike, RawRatingsByPlayer, WinnerCode } from "./types";

export type ParsedMatchGame = {
  id: string;
  game_index: number;
  winner: WinnerCode;
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
  ratings: RawRatingsByPlayer;
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

export type NormalizedMatchCard = MatchCardData & { sourceKey: MatchSource };

export const toMatchCardData = (match: RawMatchLike, mode: Mode | ""): NormalizedMatchCard => {
  const rawPlayers = normalizedPlayersFromMatch(match);
  const players = rawPlayers.length
    ? rawPlayers.slice(0, 2).map((player) => String(player || "Unknown"))
    : ["Unknown", "Unknown"];
  const playerA = players[0] ?? "Unknown";
  const playerB = players[1] ?? "Unknown";
  const games = normalizedGamesFromMatch(match);
  const firstGame = games[0];
  const { mappedGames, ...summary } = summarizeMatchGames(games, playerA, playerB);

  return {
    matchId: String(match.match_id ?? ""),
    mode,
    startTs: Number(match.start_ts),
    timeControl: String(match.time_control ?? "—"),
    playerA,
    playerB,
    ...summary,
    ...ratingsForPlayers(match, playerA, playerB),
    gameCount: games.length,
    firstGameId: String(firstGame?.id || "—"),
    games: mappedGames,
    sourceValue: sourceValueFromMatch(match),
    sourceKey: sourceKeyFromMatch(match),
  };
};

const archiveGameEntries = (games: string[]): string[] =>
  Array.isArray(games) ? games.filter((entry) => typeof entry === "string" && entry.trim()) : [];

const parseMatchRows = (rows: MatchRow[]): ParsedMatch[] => {
  if (!rows.length) return [];
  return rows.map((row): ParsedMatch => {
    const p1 = row.player_1;
    const p2 = row.player_2;
    const games = archiveGameEntries(row.games)
      .map((entry, gameOffset): ParsedMatchGame => {
        const [gameId, winnerCodeRaw, winnerPlayerRaw, whitePlayerRaw] = String(entry ?? "").split(
          ",",
        );
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
          id: String(gameId ?? "").trim(),
          game_index: gameOffset + 1,
          winner,
          white,
          black,
        };
      })
      .filter((game) => game.id)
      .sort((a, b) => a.game_index - b.game_index);

    return {
      match_id: row.match_id,
      players: [p1, p2],
      start_ts: row.start_ts,
      time_control: row.time_control,
      source: row.source,
      tournament_id: row.tournament_id,
      games,
      ratings: {
        [p1]: {
          before_rating: row.p1_before_rating,
          after_rating: row.p1_after_rating,
          before_rd: row.p1_before_rd,
          after_rd: row.p1_after_rd,
        },
        [p2]: {
          before_rating: row.p2_before_rating,
          after_rating: row.p2_after_rating,
          before_rd: row.p2_before_rd,
          after_rd: row.p2_after_rd,
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

  const result = await fetchMatchRowsFromArchive(mode, filters, {
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

export const normalizeMatches = (
  matches: RawMatchLike[] | null | undefined,
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
      const games: NormalizedGame[] = normalizedGamesFromMatch(match);
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

      const ratings = normalizedRatingsFromMatch(match);
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
        startTs: Number(match?.start_ts),
        timeControl: String(match?.time_control ?? "—"),
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
        sourceValue: sourceValueFromValues(match?.source),
        sourceKey: matchSourceFromValues(match?.source),
      };
    })
    .sort((a, b) => b.startTs - a.startTs);
};
