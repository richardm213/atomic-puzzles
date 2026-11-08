import { expect, it } from "vitest";

import { buildPgnHistory } from "../../components/Chessboard/pgnHistory";
import { isPuzzleMotifTag } from "../../lib/puzzles/puzzleMotifs";
import { motifExamples } from "./motifExamples";

it("stores a playable Atomic line from its starting position for each curated motif", () => {
  for (const [tag, example] of Object.entries(motifExamples)) {
    expect(isPuzzleMotifTag(tag), tag).toBe(true);
    if (!example) throw new Error(`Missing example for ${tag}`);
    const replay = buildPgnHistory(example.fen, example.pgn);
    if (!replay.ok) throw new Error(`${tag}: ${replay.error}`);
    expect(replay.history.plies.length, tag).toBeGreaterThan(1);
    expect(replay.history.plies[0]?.fen, tag).toBe(example.fen);
  }
});
