export type ScoreGame = {
  id: string | number;
  white: string;
  black: string;
  winner: string;
  timeControl?: string;
};

export type MappedGameSummary = {
  id: string;
  index: number;
  resultLabel: string;
  scoreAAfter: number;
  scoreBAfter: number;
  timeControl?: string;
};

export type MatchGameSummary = {
  scoreA: number;
  scoreB: number;
  playerAWins: number;
  playerBWins: number;
  draws: number;
  mappedGames: MappedGameSummary[];
};

const winnerCodeLookup: Record<string, string> = {
  w: "white",
  b: "black",
  d: "draw",
};

export const winnerToFullWord = (winner: unknown): string => {
  const winnerValue = String(winner ?? "").toLowerCase();
  return winnerCodeLookup[winnerValue] ?? winnerValue;
};

export const summarizeMatchGames = (
  games: readonly ScoreGame[],
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
      ...(game.timeControl ? { timeControl: game.timeControl } : {}),
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
