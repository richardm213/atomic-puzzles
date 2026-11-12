import { INITIAL_FEN, makeFen } from "chessops/fen";
import { parseSan } from "chessops/san";
import { describe, expect, it } from "vitest";

import {
  MAX_BLIND_PUZZLE_PLIES,
  puzzleContextFromGameHistory,
  rewindPuzzleLeadIn,
} from "../../../shared/domain/puzzles/gameHistory";
import { createAtomicPosition } from "../chess/pgn";

describe("blind puzzle lead-in", () => {
  it("uses the exact occurrence of a repeated position and excludes later game moves", () => {
    const moves = Array.from({ length: 13 }, () => ["Nf3", "Nf6", "Ng1", "Ng8"]).flat();
    const fen = INITIAL_FEN.replace("0 1", "52 27");
    const { leadIn, intro } = puzzleContextFromGameHistory({
      fen,
      game_moves: [...moves, "e4", "e5"],
    });

    expect(leadIn?.moves).toEqual(moves);
    expect(leadIn && rewindPuzzleLeadIn(leadIn, 1)).toEqual({
      beforeFen: intro?.beforeFen,
      moves: ["Ng8"],
    });
  });

  it("stops at the earliest available position and rejects history that never reaches the puzzle", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    const { leadIn } = puzzleContextFromGameHistory({ fen, position_moves: ["e2e4"] });
    expect(leadIn && rewindPuzzleLeadIn(leadIn, MAX_BLIND_PUZZLE_PLIES)).toEqual({
      beforeFen: INITIAL_FEN,
      moves: ["e4"],
    });
    expect(puzzleContextFromGameHistory({ fen, position_moves: ["d4"] }).leadIn).toBeNull();
  });
  it("rewinds Chess960 castling history past 50 plies to its original starting position", () => {
    const position = createAtomicPosition(
      "bbrqnkrn/pppppppp/8/8/8/8/PPPPPPPP/BBRQNKRN w GCgc - 0 1",
    );
    const initialFen = makeFen(position.toSetup());
    const moves = [
      ...Array.from({ length: 13 }, () => ["Nd3", "Nd6", "Ne1", "Ne8"]).flat(),
      "O-O",
      "O-O",
    ];
    for (const san of moves) {
      const move = parseSan(position, san);
      expect(move && position.isLegal(move)).toBeTruthy();
      position.play(move!);
    }
    const fen = makeFen(position.toSetup());
    const { leadIn, intro } = puzzleContextFromGameHistory({
      fen,
      game_initial_fen: initialFen,
      position_moves: moves,
    });
    expect(leadIn && rewindPuzzleLeadIn(leadIn, "start")).toEqual({
      beforeFen: initialFen,
      moves,
    });
    expect(leadIn && rewindPuzzleLeadIn(leadIn, 1)).toEqual({
      beforeFen: intro?.beforeFen,
      moves: ["O-O"],
    });
    expect(leadIn?.moves).toHaveLength(54);
  });
});
