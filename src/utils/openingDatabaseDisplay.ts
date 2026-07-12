import type {
  OpeningDatabaseGame,
  OpeningDatabaseMove,
} from "../components/OpeningDatabaseDisplay/OpeningDatabaseDisplay";
import { sanFromUci } from "./chessNotation";
import type { ExplorerApiGame, ExplorerApiMove } from "./openingExplorer";

export const performanceFromScore = (
  avgOpponentRating: number | null,
  score: number,
  games: number,
): number | null => {
  if (!avgOpponentRating || games <= 0) return null;

  const scoreRate = Math.min(0.99, Math.max(0.01, score / games));
  const ratingDiff = -400 * Math.log10(1 / scoreRate - 1);
  return Math.round(avgOpponentRating + ratingDiff);
};

export const toOpeningDatabaseMove = (
  row: ExplorerApiMove,
  fen: string,
  options: { showPerformance: boolean; playerColor: "white" | "black" },
): OpeningDatabaseMove => {
  const resultCount = row.whiteWins + row.draws + row.blackWins;
  const games = resultCount > 0 ? resultCount : row.games;
  const white = games > 0 ? Math.round((row.whiteWins / games) * 100) : 0;
  const draw = games > 0 ? Math.round((row.draws / games) * 100) : 0;
  const black = Math.max(0, 100 - white - draw);
  const playerScore =
    options.playerColor === "white" ? row.whiteWins + row.draws / 2 : row.blackWins + row.draws / 2;

  return {
    ...row,
    move: sanFromUci(fen, row.uci),
    white,
    draw,
    black,
    performanceRating: options.showPerformance
      ? performanceFromScore(row.avgOpponentRating, playerScore, games)
      : null,
  };
};

const formatEncodedDate = (date: number): string => {
  const raw = String(date);
  if (!/^\d{8}$/.test(raw)) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
};

export const toOpeningDatabaseGame = (row: ExplorerApiGame, fen: string): OpeningDatabaseGame => ({
  uci: row.uci,
  move: sanFromUci(fen, row.uci),
  gameId: row.gameId,
  playedOn: formatEncodedDate(row.playedOn),
  whiteName: row.white ?? "?",
  blackName: row.black ?? "?",
  whiteRating: row.whiteRating,
  blackRating: row.blackRating,
  result: row.winner === 1 ? "1-0" : row.winner === 2 ? "0-1" : "1/2-1/2",
  resultClass: row.winner === 1 ? "white" : row.winner === 2 ? "black" : "draw",
});
