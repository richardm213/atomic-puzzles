import { INITIAL_FEN } from "chessops/fen";
import { expect, it } from "vitest";

import { buildPgnHistory } from "../../components/Chessboard/pgnHistory";
import { tryCreateAtomicPosition } from "../../components/Chessboard/puzzlePlayback";
import { atomicOpenings, getOpeningTag, getOpeningVariations } from "../../utils/openings";
import { atomicChessExamples } from "./atomicChessExamples";

it("replays the guide examples as legal atomic chess", () => {
  for (const [id, example] of Object.entries(atomicChessExamples)) {
    const replay = buildPgnHistory(example.fen, example.pgn);
    if (!replay.ok) throw new Error(`${id}: ${replay.error}`);
    expect(replay.history.plies.length, id).toBeGreaterThan(1);
  }
});

it("replays every opening line through its final move under atomic rules", () => {
  for (const opening of atomicOpenings) {
    const lines = [
      { name: opening.name, pgn: opening.setup },
      ...(opening.branches?.flatMap((branch) => [
        ...(branch.setup ? [{ name: branch.reply, pgn: branch.setup }] : []),
        ...(branch.groups?.map((group) => ({ name: group.name, pgn: group.setup })) ?? []),
      ]) ?? []),
      ...getOpeningVariations(opening),
    ];
    for (const { name, pgn } of lines) {
      const label = `${opening.name}: ${name}`;
      const replay = buildPgnHistory(INITIAL_FEN, pgn);
      if (!replay.ok) throw new Error(`${label}: ${replay.error}`);
      const san = pgn
        .replace(/\d+\.\s*/g, "")
        .trim()
        .split(/\s+/);
      expect(
        replay.history.plies.slice(1).map((ply) => ply.san),
        label,
      ).toEqual(san);
    }
  }
});

it("resolves profile tags to their setup or variation without turning categories into lines", () => {
  expect(getOpeningTag(" Nf3 e3 ")).toMatchObject({ anchor: "nf3-e3", pgn: "1. Nf3 f6 2. e3" });
  expect(getOpeningTag("2n h3")).toMatchObject({
    anchor: "two-knights-nh6-h3",
    pgn: expect.stringContaining("Nh6 3. h3"),
  });
  expect(getOpeningTag("all around")?.anchor).toBeUndefined();
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
