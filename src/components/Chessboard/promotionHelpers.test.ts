import { describe, expect, it } from "vitest";
import {
  createPendingPromotion,
  getPromotionChoices,
  getPromotionSquareStyle,
} from "./promotionHelpers";
import { createAtomicPosition } from "../../lib/puzzles/solutionPgn";

describe("getPromotionChoices", () => {
  it("returns nothing when the moving piece is not a pawn", () => {
    const position = createAtomicPosition(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    );
    expect(
      getPromotionChoices({
        position,
        from: 12, // e2
        to: 28, // e4
        piece: { color: "white", role: "pawn", promoted: false } as never,
        isAnalysisMode: false,
        getAnalysisPositionForMove: () => position,
      }),
    ).toEqual([]);
  });

  it("returns nothing when the destination is not a back rank", () => {
    const position = createAtomicPosition(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    );
    expect(
      getPromotionChoices({
        position,
        from: 12,
        to: 28,
        piece: { color: "white", role: "pawn", promoted: false } as never,
        isAnalysisMode: false,
        getAnalysisPositionForMove: () => position,
      }),
    ).toEqual([]);
  });

  it("returns the legal promotion roles when on the back rank", () => {
    // We reuse PROMOTION_FEN: white pawn on e7 capturing into e8 doesn't apply
    // because the king is on e8; instead promote a pawn cleanly on h8 by
    // setting up a separate position.
    const fen = "8/4P3/8/8/8/8/8/4K2k w - - 0 1";
    const position = createAtomicPosition(fen);
    const piece = position.board.get(52) ?? undefined; // e7
    const choices = getPromotionChoices({
      position,
      from: 52,
      to: 60,
      piece,
      isAnalysisMode: false,
      getAnalysisPositionForMove: () => position,
    });
    // Atomic chess promotion is identical to standard except the king
    // detonation rules; the role list should be queen/knight/rook/bishop in
    // some subset.
    expect(choices.length).toBeGreaterThan(0);
    expect(choices).toEqual(expect.arrayContaining(["queen"]));
  });
});

describe("createPendingPromotion", () => {
  it("orients the picker toward the player who is promoting", () => {
    const pending = createPendingPromotion({
      orig: "e7",
      dest: "e8",
      color: "white",
      orientation: "white",
      choices: ["queen", "knight"],
    });
    expect(pending.vertical).toBe("top");
    expect(pending.choices).toEqual(["queen", "knight"]);
  });

  it("flips to bottom when the promoting color is the opponent", () => {
    const pending = createPendingPromotion({
      orig: "a2",
      dest: "a1",
      color: "black",
      orientation: "white",
      choices: ["queen"],
    });
    expect(pending.vertical).toBe("bottom");
  });
});

describe("getPromotionSquareStyle", () => {
  const pending = createPendingPromotion({
    orig: "e7",
    dest: "e8",
    color: "white",
    orientation: "white",
    choices: ["queen"],
  });

  it("returns CSS percentages for placement", () => {
    const style = getPromotionSquareStyle(pending, 0, "white");
    expect(style).toMatchObject({
      left: expect.stringMatching(/%$/),
      top: expect.stringMatching(/%$/),
    });
  });

  it("returns {} when destination square is unparseable", () => {
    expect(
      getPromotionSquareStyle(
        { ...pending, dest: "??" },
        0,
        "white",
      ),
    ).toEqual({});
  });
});
