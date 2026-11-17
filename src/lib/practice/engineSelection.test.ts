import { describe, expect, it } from "vitest";

import { classifyPracticeMove } from "../../../shared/domain/gameAnalysis";
import type { AtomicDbPosition } from "../../utils/atomicDb";
import { choosePracticeEngineMove } from "./engineSelection";
import {
  handoffApplies,
  normalizePracticeEngineSettings,
  shouldUsePracticeEngine,
  strengthDefaults,
} from "./engineSettings";

const initial = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const position = (
  scores: number[],
  moves = ["e2e4", "d2d4", "g1f3", "b1c3"],
): AtomicDbPosition => ({
  key: null,
  outcome: "UNKNOWN",
  closure: null,
  score: scores[0]!,
  point: null,
  bestMove: moves[0]!,
  moves: scores.map((score, i) => ({
    uci: moves[i]!,
    score,
    mate: null,
    point: null,
    outcome: "UNKNOWN",
    closure: null,
    nodeBackedPlies: null,
  })),
});

describe("practice move selection", () => {
  it("uses the review error categories, including decisive results", () => {
    expect(
      [0, -130, -260, -400].map((value) =>
        classifyPracticeMove({ type: "cp", value: 0 }, { type: "cp", value }),
      ),
    ).toEqual(["best", "inaccuracy", "mistake", "blunder"]);
    expect(classifyPracticeMove({ type: "mate", value: 1 }, { type: "cp", value: 0 })).toBe(
      "blunder",
    );
  });

  it("samples the requested error category, and falls back only toward better categories", () => {
    for (const [category, expected] of [
      ["inaccuracy", "d2d4"],
      ["mistake", "g1f3"],
      ["blunder", "b1c3"],
    ] as const) {
      const settings = normalizePracticeEngineSettings({
        strength: 12,
        advanced: { [category]: 100 },
      });
      expect(
        choosePracticeEngineMove(
          initial,
          position([0, -130, -260, -400]),
          {},
          settings,
          undefined,
          () => 0.5,
        ),
      ).toBe(expected);
    }
    const inaccurate = normalizePracticeEngineSettings({
      strength: 12,
      advanced: { inaccuracy: 100 },
    });
    expect(
      choosePracticeEngineMove(initial, position([0, -400]), {}, inaccurate, undefined, () => 0.9),
    ).toBe("e2e4");
  });

  it("randomizes good moves at level 12 while excluding mistakes for either color", () => {
    const settings = normalizePracticeEngineSettings({ strength: 12 });
    for (const [fen, moves] of [
      [initial, ["e2e4", "d2d4", "g1f3"]],
      [initial.replace(" w ", " b "), ["e7e5", "d7d5", "g8f6"]],
    ] as const) {
      const p = position([0, -10, -400], [...moves]);
      expect(choosePracticeEngineMove(fen, p, {}, settings, undefined, () => 0)).toBe(moves[0]);
      expect(choosePracticeEngineMove(fen, p, {}, settings, undefined, () => 0.9999)).toBe(
        moves[1],
      );
      expect(
        choosePracticeEngineMove(fen, p, {}, settings, new Set([moves[0], moves[1]]), () => 0.9999),
      ).not.toBe(moves[2]);
    }
  });

  it("measures the entire atomic explosion when preferring material", () => {
    // Capturing the pawn on d5 also explodes the adjacent queen, but costs our rook.
    const fen = "7k/8/8/3pq3/8/8/8/K2R4 w - - 0 1";
    const materialist = normalizePracticeEngineSettings({ strength: 12, preset: "materialist" });
    const balanced = normalizePracticeEngineSettings({ strength: 12 });
    const p = position([0, 0], ["a1a2", "d1d5"]);
    expect(choosePracticeEngineMove(fen, p, {}, balanced, undefined, () => 0.4)).toBe("a1a2");
    expect(choosePracticeEngineMove(fen, p, {}, materialist, undefined, () => 0.4)).toBe("d1d5");
    // Style cannot buy material by selecting a substantially weaker move.
    expect(
      choosePracticeEngineMove(
        fen,
        position([0, -100], ["a1a2", "d1d5"]),
        {},
        materialist,
        undefined,
        () => 0.9999,
      ),
    ).toBe("a1a2");
  });

  it("prefers a material threat resolved later in the principal line and includes the opponent’s reply", () => {
    // Rd3 threatens Rxd5, exploding the queen on e5. The gain occurs on ply 3.
    const fen = "7k/8/8/3pq3/8/8/K7/3R4 w - - 0 1";
    const p = position([0, 0], ["a2a3", "d1d3"]);
    const materialist = normalizePracticeEngineSettings({ strength: 12, preset: "materialist" });
    const line = ["d1d3", "h8h7", "d3d5", "h7h6"];
    expect(choosePracticeEngineMove(fen, p, {}, materialist, undefined, () => 0.4)).toBe("a2a3");
    expect(
      choosePracticeEngineMove(fen, p, { d1d3: line }, materialist, undefined, () => 0.4),
    ).toBe("d1d3");

    // When Black saves the queen instead, the threat earns no imaginary material.
    expect(
      choosePracticeEngineMove(
        fen,
        p,
        {
          d1d3: ["d1d3", "e5g5", "a2a3", "h8h7"],
        },
        materialist,
        undefined,
        () => 0.4,
      ),
    ).toBe("a2a3");
    // A later capture of our queen offsets the apparent win of Black’s queen.
    expect(
      choosePracticeEngineMove(
        "7k/8/8/3pq3/8/7b/K5Q1/3R4 w - - 0 1",
        p,
        { d1d3: ["d1d3", "h8h7", "d3d5", "h3g2"] },
        materialist,
        undefined,
        () => 0.4,
      ),
    ).toBe("a2a3");
  });

  it("normalizes persisted controls and keeps error probabilities valid", () => {
    const s = normalizePracticeEngineSettings({
      strength: 100,
      speed: -8,
      preset: "forcing",
      minGames: 0,
      advanced: { blunder: 100, mistake: 100, inaccuracy: 100, variety: 0 },
    });
    expect(s).toMatchObject({ strength: 12, speed: 1, preset: "balanced", minGames: 1 });
    expect(s.advanced.inaccuracy + s.advanced.mistake + s.advanced.blunder).toBeCloseTo(100);
    expect(s.advanced.variety).toBeGreaterThan(0);
    const migrated = normalizePracticeEngineSettings({
      strength: 10,
      advanced: { variety: 0.25 + (2 / 11) * 0.65, inaccuracy: 5, mistake: 2, blunder: 1 },
    });
    expect(migrated.advanced).toMatchObject(strengthDefaults(10));
    expect(
      normalizePracticeEngineSettings({
        strength: 10,
        advanced: { mistake: 20 },
      }).advanced.mistake,
    ).toBe(20);
    expect(strengthDefaults(12)).toMatchObject({ inaccuracy: 0, mistake: 0, blunder: 0 });
  });

  it("switches below the whole-position threshold and retains the handoff only on its branch", () => {
    expect(shouldUsePracticeEngine(5, 5)).toBe(false);
    expect(shouldUsePracticeEngine(4, 5)).toBe(true);
    expect(shouldUsePracticeEngine(0, 1)).toBe(true);
    const handoff = { prefix: ["e4", "e5"] };
    expect(handoffApplies(handoff, ["e4", "e5", "Nf3", "Nc6"])).toBe(true);
    expect(handoffApplies(handoff, ["e4"])).toBe(false);
    expect(handoffApplies(handoff, ["e4", "c5"])).toBe(false);
  });
});

it("ignores illegal and unknown candidates rather than letting them set the quality baseline", () => {
  const p = position([10000, 0, -10], ["e2e8", "e2e4", "d2d4"]);
  p.moves.push({ ...p.moves[0]!, uci: "g1f3", score: null });
  const settings = normalizePracticeEngineSettings({ strength: 12 });
  expect(choosePracticeEngineMove(initial, p, {}, settings, undefined, () => 0.9999)).toBe("d2d4");
  expect(choosePracticeEngineMove(initial, position([0], ["e2e8"]), {}, settings)).toBeNull();
});

it("every strength remains a probability distribution and higher strength reduces deliberate errors", () => {
  let previous = 101;
  for (let strength = 1; strength <= 12; strength++) {
    const defaults = strengthDefaults(strength);
    const errors = defaults.inaccuracy + defaults.mistake + defaults.blunder;
    expect(errors).toBeLessThanOrEqual(previous);
    expect(errors).toBeGreaterThanOrEqual(0);
    expect(defaults.variety).toBeGreaterThan(0);
    previous = errors;
  }
});

it("keeps high-strength variety within sound moves, even when review win chances are saturated", () => {
  for (let strength = 8; strength <= 12; strength++) {
    const settings = normalizePracticeEngineSettings({ strength, preset: "varied" });
    expect(
      settings.advanced.inaccuracy + settings.advanced.mistake + settings.advanced.blunder,
    ).toBeLessThanOrEqual(6);
    for (const fen of [initial, initial.replace(" w ", " b ")]) {
      const moves = fen.includes(" w ") ? ["e2e4", "d2d4"] : ["e7e5", "d7d5"];
      expect(
        choosePracticeEngineMove(
          fen,
          position([2000, 1800], moves),
          {},
          settings,
          undefined,
          () => 0.9999,
        ),
      ).toBe(moves[0]);
    }
  }
});

it("keeps all five close alternatives available at strengths 8–12 but excludes the sixth", () => {
  const moves = ["e2e4", "d2d4", "g1f3", "b1c3", "c2c4", "g2g3"];
  for (let strength = 8; strength <= 12; strength++) {
    const settings = normalizePracticeEngineSettings({ strength });
    const selected = new Set(
      Array.from({ length: 100 }, (_, i) =>
        choosePracticeEngineMove(
          initial,
          position([0, -1, -2, -3, -4, -5], moves),
          {},
          settings,
          undefined,
          () => (i + 0.5) / 100,
        ),
      ),
    );
    expect(selected).toEqual(new Set(moves.slice(0, 5)));
  }
});
