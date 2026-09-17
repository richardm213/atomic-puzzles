import { matchSourceFromValues, sourceValueFromValues } from "./filters";
import {
  findRatingDataForPlayer,
  type NormalizedGame,
  normalizedRatingsFromMatch,
  optionalRatingNumber,
  winnerToFullWord,
} from "./transforms";
import type { MappedGameSummary, RawMatchLike, RawMatchSourceFields } from "./types";

export type { MappedGameSummary } from "./types";

export type MatchGameSummary = {
  scoreA: number;
  scoreB: number;
  playerAWins: number;
  playerBWins: number;
  draws: number;
  mappedGames: MappedGameSummary[];
};

export type PlayerRatingsForMatch = {
  playerABeforeRating: number | null;
  playerAAfterRating: number | null;
  playerABeforeRd: number | null;
  playerAAfterRd: number | null;
  playerBBeforeRating: number | null;
  playerBAfterRating: number | null;
  playerBBeforeRd: number | null;
  playerBAfterRd: number | null;
};

export const sourceValueFromMatch = (match: RawMatchSourceFields | null | undefined): string =>
  sourceValueFromValues(match?.source);

export const sourceKeyFromMatch = (match: RawMatchSourceFields | null | undefined) =>
  matchSourceFromValues(match?.source);

export const summarizeMatchGames = (
  games: NormalizedGame[],
  playerA: string,
  playerB: string,
): MatchGameSummary => {
  const playerALower = String(playerA).toLowerCase();
  let scoreA = 0;
  let scoreB = 0;
  let playerAWins = 0;
  let playerBWins = 0;
  let draws = 0;

  const mappedGames = games.map((game, index): MappedGameSummary => {
    const white = String(game?.white ?? "").toLowerCase();
    const black = String(game?.black ?? "").toLowerCase();
    const winner = winnerToFullWord(game?.winner);
    let resultLabel = "draw";

    if (winner === "white") {
      if (white === playerALower) {
        scoreA += 1;
        playerAWins += 1;
        resultLabel = playerA;
      } else {
        scoreB += 1;
        playerBWins += 1;
        resultLabel = playerB;
      }
    } else if (winner === "black") {
      if (black === playerALower) {
        scoreA += 1;
        playerAWins += 1;
        resultLabel = playerA;
      } else {
        scoreB += 1;
        playerBWins += 1;
        resultLabel = playerB;
      }
    } else {
      scoreA += 0.5;
      scoreB += 0.5;
      draws += 1;
    }

    return {
      id: String(game?.id ?? "—"),
      index,
      resultLabel,
      scoreAAfter: scoreA,
      scoreBAfter: scoreB,
    };
  });

  return {
    scoreA,
    scoreB,
    playerAWins,
    playerBWins,
    draws,
    mappedGames,
  };
};

export const ratingsForPlayers = (
  match: RawMatchLike | null | undefined,
  playerA: string,
  playerB: string,
): PlayerRatingsForMatch => {
  const ratings = normalizedRatingsFromMatch(match);
  const playerARatingData = findRatingDataForPlayer(ratings, playerA);
  const playerBRatingData = findRatingDataForPlayer(ratings, playerB);

  return {
    playerABeforeRating: optionalRatingNumber(playerARatingData?.before_rating),
    playerAAfterRating: optionalRatingNumber(playerARatingData?.after_rating),
    playerABeforeRd: optionalRatingNumber(playerARatingData?.before_rd),
    playerAAfterRd: optionalRatingNumber(playerARatingData?.after_rd),
    playerBBeforeRating: optionalRatingNumber(playerBRatingData?.before_rating),
    playerBAfterRating: optionalRatingNumber(playerBRatingData?.after_rating),
    playerBBeforeRd: optionalRatingNumber(playerBRatingData?.before_rd),
    playerBAfterRd: optionalRatingNumber(playerBRatingData?.after_rd),
  };
};
