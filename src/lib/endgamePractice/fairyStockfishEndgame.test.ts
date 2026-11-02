import { describe, expect, it } from "vitest";

import type { EngineCandidate } from "../practice/fairyStockfish";
import {
  classifyEndgameEngineEvaluation,
  engineStartIsLongerThanMateInFour,
} from "./fairyStockfishEndgame";

const evaluation = (scoreType: "cp" | "mate", score: number, depth = 15): EngineCandidate => ({
  move: "d1d5",
  multipv: 1,
  scoreType,
  score,
  depth,
});

describe("Fairy-Stockfish endgame evaluation", () => {
  it("accepts only reliable winning starts longer than mate in four", () => {
    expect(engineStartIsLongerThanMateInFour([evaluation("mate", 5)])).toBe(true);
    expect(engineStartIsLongerThanMateInFour([evaluation("mate", 4)])).toBe(false);
    expect(engineStartIsLongerThanMateInFour([evaluation("cp", 450)])).toBe(true);
    expect(engineStartIsLongerThanMateInFour([evaluation("cp", 450, 14)])).toBe(false);
  });

  it("classifies only depth-15 evaluations as decisive", () => {
    expect(classifyEndgameEngineEvaluation([evaluation("cp", 0)])).toBe("draw");
    expect(classifyEndgameEngineEvaluation([evaluation("mate", -3)])).toBe("lost");
    expect(classifyEndgameEngineEvaluation([evaluation("mate", 6)])).toBe("winning");
    expect(classifyEndgameEngineEvaluation([evaluation("cp", 0, 14)])).toBe("unknown");
  });
});
