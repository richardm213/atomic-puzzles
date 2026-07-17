import type { Key } from "@lichess-org/chessground/types";
import { makeFen } from "chessops/fen";
import { makeSan, parseSan } from "chessops/san";
import { makeUci } from "chessops/util";
import type { Atomic } from "chessops/variant";

import { moveFromUci, toComparableUci } from "../../lib/puzzles/solutionPgn";
import { appendBoardMove, type BoardHistory, createBoardHistory } from "./boardHistory";
import { tryCreateAtomicPosition } from "./puzzlePlayback";

const mainlineTokens = (pgn: string): string[] => {
  let depth = 0;
  let mainline = "";
  for (const character of pgn) {
    if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) mainline += character;
  }

  return mainline
    .replace(/\[[^\]]*\]|\{[^}]*\}|;[^\n\r]*|\$\d+/g, " ")
    .split(/\s+/)
    .map((token) =>
      token
        .replace(/^\d+\.(\.\.)?/, "")
        .replace(/[!?]+$/g, "")
        .trim(),
    )
    .filter((token) => Boolean(token) && !["*", "1-0", "0-1", "1/2-1/2"].includes(token));
};

export type PgnHistoryResult =
  | { ok: true; history: BoardHistory; position: Atomic }
  | { ok: false; error: string; kind: "fen" | "pgn" };

export const buildPgnHistory = (initialFen: string, pgn: string): PgnHistoryResult => {
  const { position, error } = tryCreateAtomicPosition(initialFen);
  if (!position) return { ok: false, error, kind: "fen" };
  const history = createBoardHistory(initialFen);

  try {
    for (const token of mainlineTokens(pgn)) {
      const move = parseSan(position, token) ?? moveFromUci(position, token.toLowerCase());
      if (!move || !position.isLegal(move)) throw new Error(`Invalid PGN move: ${token}`);
      const uci = makeUci(move).toLowerCase();
      const san = makeSan(position, move);
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
  } catch (loadError) {
    return {
      ok: false,
      error: loadError instanceof Error ? loadError.message : "Invalid PGN",
      kind: "pgn",
    };
  }

  return { ok: true, history, position };
};
