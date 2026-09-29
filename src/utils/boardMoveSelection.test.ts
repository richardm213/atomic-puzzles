import { describe, expect, it } from "vitest";

import { type AtomicDbResult, parseAtomicDbResponse } from "./atomicDb";
import { selectSpacebarMove } from "./boardMoveSelection";

const FEN = "8/8/8/8/8/8/8/K6k w - - 0 1";
const engineResult: AtomicDbResult = {
  fen: FEN,
  position: parseAtomicDbResponse({
    status: "UNKNOWN",
    best_move: "a1b2",
    moves: [
      { uci: "a1a2", status: "UNKNOWN", score: 20 },
      { uci: "a1b2", status: "UNKNOWN", score: 30 },
    ],
  }),
};
const databaseMoves = [
  { uci: "a1a2", games: 12 },
  { uci: "a1b1", games: 41 },
  { uci: "a1b2", games: 27 },
];

describe("selectSpacebarMove", () => {
  it("uses AtomicDB's best move while the engine is on", () => {
    expect(
      selectSpacebarMove({
        engineEnabled: true,
        engineResult,
        engineStatus: "ready",
        databaseMoves,
        databaseStatus: "ready",
        fen: FEN,
      }),
    ).toBe("a1b2");
  });

  it("uses the most-played database move while the engine is off", () => {
    expect(
      selectSpacebarMove({
        engineEnabled: false,
        engineResult,
        engineStatus: "ready",
        databaseMoves,
        databaseStatus: "ready",
        fen: FEN,
      }),
    ).toBe("a1b1");
  });

  it("does not use stale engine analysis or fall back to the database", () => {
    expect(
      selectSpacebarMove({
        engineEnabled: true,
        engineResult,
        engineStatus: "loading",
        databaseMoves,
        databaseStatus: "ready",
        fen: `${FEN} stale`,
      }),
    ).toBeNull();
  });
});
