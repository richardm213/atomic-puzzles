import { expect, it } from "vitest";

import { buildPgnHistory } from "../../components/Chessboard/pgnHistory";
import { tryCreateAtomicPosition } from "../../components/Chessboard/puzzlePlayback";
import { atomicChessExamples } from "./atomicChessExamples";

it("replays the guide examples as legal atomic chess", () => {
  for (const [id, example] of Object.entries(atomicChessExamples)) {
    const replay = buildPgnHistory(example.fen, example.pgn);
    if (!replay.ok) throw new Error(`${id}: ${replay.error}`);
    expect(replay.history.plies.length, id).toBeGreaterThan(1);
  }
});

it("forces separation and then mates in the two-queen lesson", () => {
  const { fen, pgn } = atomicChessExamples.twoQueens;
  const replay = buildPgnHistory(fen, pgn);
  if (!replay.ok) throw new Error(replay.error);

  const trapFen = replay.history.plies[1]?.fen;
  if (!trapFen) throw new Error("Missing the position before separation");
  const { position: trap } = tryCreateAtomicPosition(trapFen);
  if (!trap) throw new Error("Invalid separation position");
  expect(trap.isCheck()).toBe(false);
  expect([...trap.allDests()].flatMap(([, squares]) => [...squares])).toHaveLength(1);
  expect(replay.position.isCheckmate()).toBe(true);
});
