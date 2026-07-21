import { appendBoardMove, createBoardHistory } from "./boardHistory";
import {
  createVariationHistory,
  saveVariation,
  variationMoveKeys,
  variationMoveSans,
} from "./variationHistory";

const line = (...moves: string[]) => {
  const history = createBoardHistory("root");
  moves.forEach((san, index) =>
    appendBoardMove(history, {
      fen: `fen-${index}-${san}`,
      lastMove: ["e2", "e4"],
      uci: san,
      key: san,
      san,
    }),
  );
  return history;
};

describe("variation history", () => {
  it("stores branches with shared prefixes and stable indexes", () => {
    const tree = createVariationHistory();
    const first = saveVariation(tree, line("e4", "e5"));
    const second = saveVariation(tree, line("e4", "c5"));
    saveVariation(tree, line("e4", "e5", "Nf3"), first);

    expect([first, second]).toEqual([0, 1]);
    expect(variationMoveSans(tree)).toEqual([
      ["e4", "e5", "Nf3"],
      ["e4", "c5"],
    ]);
    expect(variationMoveKeys(tree)).toEqual([
      ["e4", "e5", "Nf3"],
      ["e4", "c5"],
    ]);
  });
});
