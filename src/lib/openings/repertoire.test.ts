import { INITIAL_FEN } from "chessops/fen";
import { describe, expect, it } from "vitest";

import {
  addOpeningLine,
  dueOpeningCards,
  emptyReview,
  importOpeningPgn,
  knownOpeningKeys,
  markOpeningBranch,
  openingCards,
  type OpeningDocument,
  openingLineSans,
  openingLineUcis,
  openingPgn,
  scheduleOpeningReview,
  validateOpeningDocument,
} from "../../../shared/domain/openings/repertoire";

const repertoire = (): OpeningDocument =>
  validateOpeningDocument({
    startFen: INITIAL_FEN,
    side: "white",
    lines: [
      { id: "main", kind: "essential", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"] },
      { id: "side", kind: "essential", moves: ["e2e4", "c7c5", "g1f3"] },
      { id: "alternative", kind: "essential", moves: ["d2d4", "d7d5", "c2c4"] },
      { id: "optional", kind: "tertiary", moves: ["g1f3", "d7d5"] },
      { id: "mate", kind: "mate", moves: ["b1c3", "e7e5"] },
    ],
  });

describe("opening training", () => {
  it("covers every accepted alternative and shared edge once with depth or breadth ordering", () => {
    const doc = repertoire();
    const depth = dueOpeningCards(doc, {}, 0);
    expect(depth.map((c) => c.move)).toEqual(["e2e4", "g1f3", "f1b5", "g1f3", "d2d4", "c2c4"]);
    expect(depth.filter((c) => c.move === "e2e4")).toHaveLength(1);
    expect(dueOpeningCards(doc, {}, 0, "breadth").map((c) => c.move)).toEqual([
      "e2e4",
      "d2d4",
      "g1f3",
      "g1f3",
      "c2c4",
      "f1b5",
    ]);
    expect(openingCards(doc, "tertiary").map((c) => c.move)).toEqual(["g1f3"]);
    expect(openingCards(doc, "mate").map((c) => c.move)).toEqual(["b1c3"]);
  });

  it("uses oldest due first, never schedules known moves, and keeps nonessential quizzes out of SRS", () => {
    const doc = repertoire();
    const cards = openingCards(doc, "essential");
    const progress = {
      [cards[0]!.key]: { ...emptyReview(), known: true },
      [cards[1]!.key]: { ...emptyReview(), nextDue: new Date(200).toISOString() },
      [cards[2]!.key]: { ...emptyReview(), nextDue: new Date(100).toISOString() },
    };
    expect(dueOpeningCards(doc, progress, 300).filter((c) => c.key === cards[0]!.key)).toEqual([]);
    // New cards are introduced first only when there are no previously scheduled overdue reviews.
    const scheduled = dueOpeningCards(doc, progress, 300).slice(0, 2);
    expect(scheduled.map((c) => c.key)).toEqual([cards[2]!.key, cards[1]!.key]);
    expect(dueOpeningCards(doc, progress, 50).some((c) => c.key === cards[1]!.key)).toBe(false);
  });

  it("doubles correct intervals, resets mistakes to one minute, and gives no early progress", () => {
    const now = Date.UTC(2026, 10, 12);
    const day = 86400000;
    const first = scheduleOpeningReview(undefined, true, now);
    expect(first).toMatchObject({
      intervalDays: 1,
      nextDue: new Date(now + day).toISOString(),
      correct: 1,
    });
    expect(scheduleOpeningReview(first, true, now + 1000)).toEqual(first);
    expect(scheduleOpeningReview(first, false, now + 1000)).toEqual(first);
    const next = scheduleOpeningReview(first, true, now + day);
    expect(next.intervalDays).toBe(2);
    const failed = scheduleOpeningReview(next, false, now + day * 3);
    expect(failed).toMatchObject({
      intervalDays: 0,
      nextDue: new Date(now + day * 3 + 60000).toISOString(),
      wrong: 1,
    });
    expect(scheduleOpeningReview(failed, true, now + day * 3 + 60000).intervalDays).toBe(1);
    const known = { ...first, known: true };
    expect(scheduleOpeningReview(known, true, now + day * 20)).toEqual(known);
  });

  it("shares transposition progress and marks complete paths as known without changing move identities", () => {
    const doc = validateOpeningDocument({
      startFen: INITIAL_FEN,
      side: "white",
      lines: [
        { id: "a", kind: "essential", moves: ["g1f3", "g8f6", "b1c3", "b8c6", "e2e3"] },
        { id: "b", kind: "essential", moves: ["b1c3", "b8c6", "g1f3", "g8f6", "e2e3"] },
      ],
    });
    expect(openingCards(doc).filter((c) => c.move === "e2e3")).toHaveLength(1);
    const keys = knownOpeningKeys(doc, "prefix", "a", 4);
    expect(keys).toHaveLength(4);
    const before = openingCards(doc).find((c) => c.move === "e2e3")!.key;
    const edited = { ...doc, lines: doc.lines.map((l) => ({ ...l, id: `new-${l.id}` })) };
    expect(openingCards(edited).find((c) => c.move === "e2e3")!.key).toBe(before);
  });

  it("imports PGN, keeps optional labels, hides them in essential-only PGN, and rejects illegal edits", () => {
    const doc = repertoire();
    const imported = importOpeningPgn(doc, openingPgn(doc));
    expect(openingLineUcis(doc, openingLineSans(doc, doc.lines[0]!.moves))).toEqual(
      doc.lines[0]!.moves,
    );
    expect(imported.lines.map((l) => l.kind).sort()).toEqual(doc.lines.map((l) => l.kind).sort());
    expect(openingPgn(doc, true)).not.toContain("Nc3");
    expect(addOpeningLine(doc, ["e2e4"]).lines).toEqual(doc.lines);
    expect(() =>
      validateOpeningDocument({
        ...doc,
        lines: [{ id: "bad", kind: "essential", moves: ["e2e8"] }],
      }),
    ).toThrow(/Illegal/);
  });
  it("classifies continuations without reclassifying lead-up moves or sibling branches", () => {
    const doc = repertoire();
    const prefix = ["e2e4", "e7e5"];
    const optional = markOpeningBranch(doc, prefix, "tertiary");
    expect(
      openingCards(optional, "essential").filter((card) => card.prefix[1] === "e7e5"),
    ).toHaveLength(0);
    expect(openingCards(optional, "essential").some((card) => card.move === "e2e4")).toBe(true);
    expect(openingCards(optional, "essential").some((card) => card.prefix[1] === "c7c5")).toBe(
      true,
    );
    const extended = addOpeningLine(optional, [...prefix, "b1c3"]);
    expect(
      openingCards(extended, "tertiary").some(
        (card) => card.move === "b1c3" && card.prefix[1] === "e7e5",
      ),
    ).toBe(true);
    const mating = markOpeningBranch(optional, [...prefix, "g1f3"], "mate");
    expect(openingCards(mating, "mate").some((card) => card.move === "f1b5")).toBe(true);
    expect(openingPgn(optional, true)).not.toContain("e5");
    const restored = markOpeningBranch(mating, prefix, "essential");
    expect(restored.branches).toHaveLength(1);
    expect(openingCards(restored, "essential").map((card) => card.key)).toEqual(
      openingCards(doc, "essential").map((card) => card.key),
    );
  });
});
