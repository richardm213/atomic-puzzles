import { describe, expect, it } from "vitest";

import {
  atomicDbWhitePercent,
  buildAtomicDbView,
  formatAtomicDbEvaluation,
  getAtomicDbMoveEvaluation,
  getAtomicDbPositionEvaluation,
  parseAtomicDbResponse,
} from "./atomicDb";

const WHITE_TO_MOVE = "8/8/8/8/8/8/8/K6k w - - 0 1";
const BLACK_TO_MOVE = "8/8/8/8/8/8/8/K6k b - - 0 1";

describe("AtomicDB client", () => {
  it("parses valid fields and preserves the server's ranked move order", () => {
    const result = parseAtomicDbResponse({
      key: "position-key",
      status: "UNKNOWN",
      best_move: "g1f3",
      moves: [
        {
          uci: "g1f3",
          status: "UNKNOWN",
          score: 500,
          point: 541,
          mate: null,
          backed_plies: 48,
          node_backed_plies: 44,
        },
        {
          uci: "g1h3",
          status: "UNKNOWN",
          score: 500,
          backed_plies: 26,
          node_backed_plies: 0,
        },
        { uci: "e2e3", status: "UNKNOWN", score: 500 },
        { uci: "not-a-move", score: 9999 },
      ],
      analysis: {
        lines: [
          { move: "g1f3", depth: 26, pv: ["g1f3"] },
          { move: "g1h3", depth: 25, pv: ["g1h3"] },
        ],
      },
    });

    expect(result.bestMove).toBe("g1f3");
    expect(result.key).toBe("position-key");
    expect(result.moves.map((move) => move.uci)).toEqual(["g1f3", "g1h3", "e2e3"]);
    expect(result.moves[0]).toMatchObject({ score: 500, nodeBackedPlies: 44, searchDepth: 26 });
    expect(result.moves[1]).toMatchObject({ nodeBackedPlies: 0, searchDepth: 25 });
    expect(result.moves[2]).toMatchObject({ nodeBackedPlies: null, searchDepth: null });
  });

  it("restores a solved best move omitted from AtomicDB's move list", () => {
    const position = parseAtomicDbResponse({
      status: "BLACK_WIN",
      closure: "MATE_PV",
      score: -10000,
      point: -9998,
      best_move: "b2a3",
      moves: [
        { uci: "b1a1", status: "UNKNOWN", score: null },
        { uci: "b1c2", status: "UNKNOWN", score: null },
      ],
    });

    expect(position.moves.map((move) => move.uci)).toEqual(["b2a3", "b1a1", "b1c2"]);
    expect(
      formatAtomicDbEvaluation(getAtomicDbMoveEvaluation(position.moves[0]!, WHITE_TO_MOVE)),
    ).toBe("-#2");
  });

  it("converts side-to-move centipawns to White's perspective exactly once", () => {
    const position = parseAtomicDbResponse({
      status: "UNKNOWN",
      score: -564,
      best_move: "e7e6",
      moves: [{ uci: "e7e6", status: "UNKNOWN", score: -564 }],
    });

    const whiteTurnEvaluation = getAtomicDbPositionEvaluation(position, WHITE_TO_MOVE);
    const blackTurnEvaluation = getAtomicDbPositionEvaluation(position, BLACK_TO_MOVE);

    expect(formatAtomicDbEvaluation(whiteTurnEvaluation)).toBe("-5.6");
    expect(formatAtomicDbEvaluation(blackTurnEvaluation)).toBe("+5.6");
    expect(atomicDbWhitePercent(whiteTurnEvaluation)).toBeLessThan(50);
    expect(atomicDbWhitePercent(blackTurnEvaluation)).toBeGreaterThan(50);
  });

  it("uses the best move's real mate distance without inventing M1", () => {
    const position = parseAtomicDbResponse({
      status: "BLACK_WIN",
      score: 10000,
      best_move: "h6g4",
      moves: [
        {
          uci: "h6g4",
          status: "BLACK_WIN",
          score: 10000,
          mate: 3,
          backed_plies: 0,
        },
      ],
    });

    expect(formatAtomicDbEvaluation(getAtomicDbPositionEvaluation(position, BLACK_TO_MOVE))).toBe(
      "-#3",
    );
    expect(
      formatAtomicDbEvaluation(getAtomicDbMoveEvaluation(position.moves[0]!, BLACK_TO_MOVE)),
    ).toBe("-#3");
  });

  it("decodes MATE_PV point values as mate distances for either winner", () => {
    const whiteMate = parseAtomicDbResponse({
      status: "WHITE_WIN",
      closure: "MATE_PV",
      score: -10000,
      point: -9997,
      best_move: "a4b5",
      moves: [],
    });
    const blackMate = parseAtomicDbResponse({
      status: "BLACK_WIN",
      closure: "MATE_PV",
      score: 10000,
      point: 9995,
      best_move: "a1a2",
      moves: [
        {
          uci: "a1a2",
          status: "BLACK_WIN",
          closure: "MATE_PV",
          score: 10000,
          point: 9995,
        },
      ],
    });

    expect(formatAtomicDbEvaluation(getAtomicDbPositionEvaluation(whiteMate, BLACK_TO_MOVE))).toBe(
      "#3",
    );
    expect(formatAtomicDbEvaluation(getAtomicDbPositionEvaluation(blackMate, BLACK_TO_MOVE))).toBe(
      "-#5",
    );
    expect(
      formatAtomicDbEvaluation(getAtomicDbMoveEvaluation(blackMate.moves[0]!, BLACK_TO_MOVE)),
    ).toBe("-#5");
  });

  it("falls back to a decisive numeric evaluation when no mate distance is supplied", () => {
    const position = parseAtomicDbResponse({
      status: "WHITE_WIN",
      score: null,
      best_move: "a1a2",
      moves: [{ uci: "a1a2", status: "WHITE_WIN", score: null, mate: null }],
    });

    expect(formatAtomicDbEvaluation(getAtomicDbPositionEvaluation(position, BLACK_TO_MOVE))).toBe(
      "+100.0",
    );
    expect(
      formatAtomicDbEvaluation(getAtomicDbMoveEvaluation(position.moves[0]!, BLACK_TO_MOVE)),
    ).toBe("+100.0");
  });

  it("builds the label and bar percentage from one retained position", () => {
    const previous = parseAtomicDbResponse({
      status: "UNKNOWN",
      score: 500,
      best_move: "a1a2",
      moves: [{ uci: "a1a2", status: "UNKNOWN", score: 500 }],
    });
    const view = buildAtomicDbView(
      { fen: WHITE_TO_MOVE, position: previous },
      "8/8/8/8/8/8/K7/7k b - - 0 1",
    );

    expect(view.isCurrent).toBe(false);
    expect(view.evaluationLabel).toBe("+5.0");
    expect(view.whitePercent).toBeGreaterThan(50);
    expect(view.fen).toBe(WHITE_TO_MOVE);
  });
});
