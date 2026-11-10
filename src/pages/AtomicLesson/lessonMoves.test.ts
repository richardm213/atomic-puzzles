import { expect, it } from "vitest";

import { atomicLessons } from "./atomicLessons";
import { lessonPosition, moveKey, prepareLesson, readLessonMove } from "./lessonMoves";

const chapter = (id: string) => {
  const definition = atomicLessons.find((entry) => entry.id === id);
  if (!definition) throw new Error(`Missing chapter ${id}`);
  return prepareLesson(definition);
};

it("plays every authored chapter, including the feedback branches, as legal atomic chess", () => {
  for (const definition of atomicLessons) prepareLesson(definition);
});

it("keeps illegal king explosions separate from wins and stalemate", () => {
  expect(readLessonMove(lessonPosition(chapter("own-king").start.fen), "e2e7")).toBeUndefined();
  const stalemate = lessonPosition(chapter("stalemate").start.fen);
  expect(stalemate.isStalemate()).toBe(true);
  expect(lessonPosition(chapter("en-passant").final.fen).outcome()?.winner).toBe("white");
});

it("accepts all three connections on the rook’s rank", () => {
  const {
    start,
    turns: [turn],
  } = chapter("connected-kings");
  if (!turn) throw new Error("Missing connected-kings turn");
  const position = lessonPosition(start.fen);
  for (const square of ["d3", "e3", "f3"]) {
    const move = readLessonMove(position, `k${square}`);
    const key = move && moveKey(move);
    const answer = key === turn.key ? turn.answer : key && turn.alternateFinishes.get(key)?.frame;
    expect(answer && answer.lastMove).toEqual(["e2", square]);
  }
});

it("accepts normal castling coordinates and uses the actual en passant landing square", () => {
  const castle = chapter("castling");
  const move = readLessonMove(lessonPosition(castle.start.fen), "e1c1");
  expect(move && moveKey(move)).toBe(castle.turns[0]?.key);
  expect(castle.final.lastMove).toEqual(["e1", "c1"]);

  const capture = chapter("en-passant").final;
  expect(capture.center).toBe("d6");
  expect(capture.explosion).toContain("e7");
});
