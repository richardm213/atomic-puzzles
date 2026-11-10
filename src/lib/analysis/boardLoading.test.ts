import { describe, expect, it } from "vitest";

import { buildBoardLoadNavigation, gameHashForPly, gamePlyFromHash } from "./boardLoading";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("analysis board loading", () => {
  it("normalizes archived moves and PGN handoffs into the same navigation command", () => {
    expect(
      buildBoardLoadNavigation({
        fen: STARTING_FEN,
        moves: ["e2e4", "e7e5"],
        ply: 2,
      }),
    ).toMatchObject({
      type: "loadPgn",
      fen: STARTING_FEN,
      pgn: "1. e4 e5",
      ply: 2,
    });
    expect(
      buildBoardLoadNavigation({
        fen: STARTING_FEN,
        pgn: "1. Nf3 f6",
        line: 1,
        ply: 1,
      }),
    ).toEqual({
      type: "loadPgn",
      fen: STARTING_FEN,
      pgn: "1. Nf3 f6",
      line: 1,
      ply: 1,
    });
  });

  it("resets plain positions and resolves game hashes without board-specific state", () => {
    expect(buildBoardLoadNavigation({ fen: STARTING_FEN })).toEqual({
      type: "reset",
      fen: STARTING_FEN,
    });
    expect(gamePlyFromHash("", 20)).toBe(0);
    expect(gamePlyFromHash("#3", 20)).toBe(6);
    expect(gamePlyFromHash(gameHashForPly(5), 20)).toBe(5);
    expect(gameHashForPly(6)).toBe("#3");
    expect(gamePlyFromHash("#30", 20)).toBe(20);
    expect(gamePlyFromHash("#bad", 20)).toBeNull();
  });
});
