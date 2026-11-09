import { expect, it } from "vitest";

import { buildPgnHistory } from "../../components/Chessboard/pgnHistory";
import { atomicChessExamples } from "./atomicChessExamples";

it("replays the introductory study lines as legal atomic chess", () => {
  for (const [id, example] of Object.entries(atomicChessExamples)) {
    const replay = buildPgnHistory(example.fen, example.pgn);
    if (!replay.ok) throw new Error(`${id}: ${replay.error}`);
    expect(replay.history.plies.length, id).toBeGreaterThan(1);
  }
});
