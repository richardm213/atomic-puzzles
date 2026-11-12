import type { Key } from "@lichess-org/chessground/types";
import { makeFen } from "chessops/fen";
import { makeSan } from "chessops/san";
import { makeUci } from "chessops/util";
import type { Atomic } from "chessops/variant";

import {
  formatSolutionMove,
  moveFromUci,
  parsePgnUciLines,
  toComparableUci,
  type UciSolutionLine,
} from "../../lib/chess/pgn";
import { getErrorMessage } from "../../utils/errors";
import { appendBoardMove, type BoardHistory, createBoardHistory } from "./boardHistory";
import { tryCreateAtomicPosition } from "./puzzlePlayback";

export type PgnHistoryResult =
  | { ok: true; history: BoardHistory; histories: BoardHistory[]; position: Atomic }
  | { ok: false; error: string; kind: "fen" | "pgn" };

const historyFromUciLine = (initialFen: string, line: UciSolutionLine): BoardHistory => {
  const position = tryCreateAtomicPosition(initialFen).position;
  if (!position) throw new Error("Invalid position");
  const history = createBoardHistory(initialFen);

  for (const entry of line) {
    const move = moveFromUci(position, entry.uci);
    if (!move) throw new Error(`Invalid PGN move: ${entry.uci}`);
    const uci = makeUci(move).toLowerCase();
    const san = formatSolutionMove(makeSan(position, move), entry.annotation);
    const key = toComparableUci(position, uci, move);
    position.play(move);
    appendBoardMove(history, {
      fen: makeFen(position.toSetup()),
      lastMove: [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key],
      uci,
      key,
      san,
    });
  }

  return history;
};

export const buildPgnHistory = (initialFen: string, pgn: string): PgnHistoryResult => {
  const { position, error } = tryCreateAtomicPosition(initialFen);
  if (!position) return { ok: false, error, kind: "fen" };
  const history = createBoardHistory(initialFen);

  try {
    const lines = parsePgnUciLines(initialFen, pgn);
    if (lines === null) throw new Error("Invalid PGN");
    if (lines.length) {
      const histories = lines.map((line) => historyFromUciLine(initialFen, line));
      const mainHistory = histories[0]!;
      const mainPosition = tryCreateAtomicPosition(
        mainHistory.plies[mainHistory.index]!.fen,
      ).position;
      if (!mainPosition) throw new Error("Invalid PGN position");
      return { ok: true, history: mainHistory, histories, position: mainPosition };
    }
  } catch (loadError) {
    return {
      ok: false,
      error: getErrorMessage(loadError, "Invalid PGN"),
      kind: "pgn",
    };
  }

  return { ok: true, history, histories: [history], position };
};
