import { matchSourceFromValues, sourceValueFromValues } from "./filters";
import {
  findRatingDataForPlayer,
  normalizedRatingsFromMatch,
  optionalRatingNumber,
} from "./transforms";
import type { RawMatchLike, RawMatchSourceFields } from "./types";

export { type MatchGameSummary, summarizeMatchGames } from "../../../shared/domain/matchScores";
export type { MappedGameSummary } from "./types";

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
