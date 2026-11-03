import type { Color } from "chessops";
import { INITIAL_FEN } from "chessops/fen";

import type { ArchiveGame } from "../archive/games";
import { decodeGameResult } from "../archive/games";
import { createAtomicPosition, moveFromUci } from "../puzzles/solutionPgn";

const TIMEOUT_THRESHOLD_MS = 100;

const titleCaseColor = (color: Color): "White" | "Black" => (color === "white" ? "White" : "Black");

const finalClockForColor = (clocks: number[] | null, color: Color): number | null => {
  if (!clocks?.length) return null;
  const parity = color === "white" ? 0 : 1;
  for (let index = clocks.length - 1; index >= 0; index -= 1) {
    if (index % 2 === parity) return clocks[index] ?? null;
  }
  return null;
};

const finalAtomicPosition = (moves: string[] | null) => {
  if (!moves?.length) return null;
  try {
    const position = createAtomicPosition(INITIAL_FEN);
    for (const uci of moves) {
      const move = moveFromUci(position, uci);
      if (!move) return null;
      position.play(move);
    }
    return position;
  } catch {
    return null;
  }
};

export const gameTerminationLabel = (game: ArchiveGame): string => {
  const { winner } = decodeGameResult(game);
  if (winner === null) return "Draw";

  const loser: Color = winner === "white" ? "black" : "white";
  const position = finalAtomicPosition(game.moves);
  if (position) {
    if (position.board.kingOf(loser) === undefined) {
      return `${titleCaseColor(winner)} wins by explosion`;
    }
    if (position.isCheckmate() && position.outcome()?.winner === winner) {
      return `${titleCaseColor(winner)} wins by checkmate`;
    }
  }

  const loserClock = finalClockForColor(game.clocks, loser);
  if (loserClock !== null && loserClock <= TIMEOUT_THRESHOLD_MS) {
    return `${titleCaseColor(loser)} timed out`;
  }

  return `${titleCaseColor(loser)} resigned`;
};
