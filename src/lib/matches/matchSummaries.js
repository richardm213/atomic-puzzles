import {
  findRatingDataForPlayer,
  normalizedRatingsFromMatch,
  winnerToFullWord,
} from "../../utils/matchTransforms";
import { matchSourceFromValues, sourceValueFromValues } from "../../utils/matchFilters";

export const sourceValueFromMatch = (match, firstGame) => {
  return sourceValueFromValues(
    firstGame?.source,
    firstGame?.match_source,
    firstGame?.queue,
    match?.source,
    match?.match_source,
    match?.queue,
  );
};

export const sourceKeyFromMatch = (match, firstGame) =>
  matchSourceFromValues(
    firstGame?.source,
    firstGame?.match_source,
    firstGame?.queue,
    match?.source,
    match?.match_source,
    match?.queue,
  );

export const summarizeMatchGames = (games, playerA, playerB) => {
  const playerALower = String(playerA).toLowerCase();
  let scoreA = 0;
  let scoreB = 0;
  let playerAWins = 0;
  let playerBWins = 0;
  let draws = 0;

  const mappedGames = games.map((game, index) => {
    const white = String(game?.white || "").toLowerCase();
    const black = String(game?.black || "").toLowerCase();
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
      id: String(game?.id || "—"),
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

export const ratingsForPlayers = (match, players, playerA, playerB) => {
  const ratings = normalizedRatingsFromMatch(match, players);
  const playerARatingData = findRatingDataForPlayer(ratings, playerA);
  const playerBRatingData = findRatingDataForPlayer(ratings, playerB);

  return {
    playerABeforeRating: Number(playerARatingData?.before_rating),
    playerAAfterRating: Number(playerARatingData?.after_rating),
    playerABeforeRd: Number(playerARatingData?.before_rd),
    playerAAfterRd: Number(playerARatingData?.after_rd),
    playerBBeforeRating: Number(playerBRatingData?.before_rating),
    playerBAfterRating: Number(playerBRatingData?.after_rating),
    playerBBeforeRd: Number(playerBRatingData?.before_rd),
    playerBAfterRd: Number(playerBRatingData?.after_rd),
  };
};
