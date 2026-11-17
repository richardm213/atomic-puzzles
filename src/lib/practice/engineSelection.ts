import { attacks } from "chessops/attacks";

import { createAtomicPosition, moveFromUci } from "../../../shared/domain/chess/pgn";
import { classifyPracticeMove, type ReviewScore } from "../../../shared/domain/gameAnalysis";
import { type AtomicDbPosition, getAtomicDbMoveEvaluation } from "../../utils/atomicDb";
import { PRACTICE_PRESETS, type PracticeEngineSettings } from "./engineSettings";

const values = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
type Position = ReturnType<typeof createAtomicPosition>;
const material = (p: Position, color: "white" | "black") => {
  let total = 0;
  for (const square of p.board[color]) total += values[p.board.get(square)!.role];
  return total;
};
const pressure = (p: Position, color: "white" | "black"): number => {
  const king = p.board.kingOf(color === "white" ? "black" : "white");
  if (king === undefined) return 0;
  let total = 0;
  for (const square of p.board[color]) {
    const piece = p.board.get(square)!;
    for (const target of attacks(piece, square, p.board.occupied)) {
      // In atomic a capture beside the king is a threat too.
      if (Math.max(Math.abs((target & 7) - (king & 7)), Math.abs((target >> 3) - (king >> 3))) <= 1)
        total++;
    }
  }
  return Math.min(1, total / 6);
};
const categories = ["best", "inaccuracy", "mistake", "blunder"] as const;
const scoreFor = (move: AtomicDbPosition["moves"][number], fen: string): ReviewScore | null => {
  const evaluation = getAtomicDbMoveEvaluation(move, fen);
  if (evaluation.type === "unknown") return null;
  const rootValue = evaluation.value * (fen.split(/\s+/)[1] === "b" ? -1 : 1);
  return evaluation.type === "mate"
    ? { type: "mate", value: rootValue > 0 ? 1 : -1 }
    : { type: "cp", value: rootValue };
};
const comparable = (s: ReviewScore) => (s.type === "mate" ? s.value * 100000 : s.value);

export const choosePracticeEngineMove = (
  fen: string,
  position: AtomicDbPosition,
  lines: Record<string, string[]>,
  settings: PracticeEngineSettings,
  excluded: ReadonlySet<string> = new Set(),
  random = Math.random,
): string | null => {
  const root = createAtomicPosition(fen);
  const us = root.turn;
  const them = us === "white" ? "black" : "white";
  const legalCandidates = position.moves.flatMap((candidate) => {
    const move = moveFromUci(root, candidate.uci);
    const score = scoreFor(candidate, fen);
    return move && root.isLegal(move) && score ? [{ candidate, move, score }] : [];
  });
  const candidates = legalCandidates.sort(
    (left, right) => comparable(right.score) - comparable(left.score),
  );
  // Strong opponents draw from the engine's top five, including AtomicDB results.
  if (settings.strength >= 8) candidates.splice(5);
  const best = candidates.reduce<(typeof candidates)[number] | null>(
    (best, c) => (!best || comparable(c.score) > comparable(best.score) ? c : best),
    null,
  );
  if (!best) return null;
  const a = settings.advanced;
  const goodMoveGap = 20 + 80 * ((12 - settings.strength) / 11);
  const roll = random() * 100;
  const requested =
    roll < a.blunder
      ? 3
      : roll < a.blunder + a.mistake
        ? 2
        : roll < a.blunder + a.mistake + a.inaccuracy
          ? 1
          : 0;
  // If the requested error is unavailable, choose a BETTER category, never a worse one.
  let pool: typeof candidates = [];
  for (let category = requested; category >= 0 && !pool.length; category--) {
    const suitable = candidates.filter(
      (c) =>
        classifyPracticeMove(best.score, c.score) === categories[category] &&
        (category !== 0 || comparable(best.score) - comparable(c.score) <= goodMoveGap),
    );
    pool = suitable.filter((c) => !excluded.has(c.candidate.uci));
    if (!pool.length && category === 0) pool = suitable;
  }
  pool.sort((left, right) => comparable(right.score) - comparable(left.score));
  const rankWeights = [0.4, 0.25, 0.15, 0.12, 0.08];
  const weighted = pool.map((c) => {
    const after = root.clone();
    after.play(c.move);
    const givesCheck = after.isCheck();
    // Measure the full explosion AND the principal reply, rather than treating every capture as a gain.
    const reply = lines[c.candidate.uci]?.[1];
    if (reply) {
      const move = moveFromUci(after, reply);
      if (move && after.isLegal(move)) after.play(move);
    }
    const gain =
      material(after, us) - material(after, them) - (material(root, us) - material(root, them));
    // Follow the available principal line through four move pairs so material
    // threats count, while later recaptures and explosions offset temporary gains.
    const materialPosition = after.clone();
    for (const uci of lines[c.candidate.uci]?.slice(2, 8) ?? []) {
      const move = moveFromUci(materialPosition, uci);
      if (!move || !materialPosition.isLegal(move)) break;
      materialPosition.play(move);
    }
    const materialGain =
      material(materialPosition, us) -
      material(materialPosition, them) -
      (material(root, us) - material(root, them));
    const ownPressure = pressure(after, us);
    const safety = pressure(root, them) - pressure(after, them);
    const simplification = (root.board.occupied.size() - after.board.occupied.size()) / 4;
    const isCapture =
      root.board.occupied.has(c.move.to) || ("from" in c.move && root.epSquare === c.move.to);
    const counterplay =
      (ownPressure + Math.max(0, gain) / 6) *
      (pressure(root, them) + (comparable(best.score) < 0 ? 0.5 : 0));
    const style =
      a.kingPressure * (ownPressure - pressure(root, us)) +
      0.5 * safety +
      a.material * Math.tanh(materialGain / 3) +
      a.simplification * Math.tanh(simplification) +
      a.counterplay * counterplay;
    // Quiet and Patient differ in activity: Quiet avoids immediate forcing moves; Patient keeps tension.
    const quiet = settings.preset === "quiet" && !isCapture && !givesCheck ? 0.4 : 0;
    const gap = Math.min(1000, Math.max(0, comparable(best.score) - comparable(c.score)));
    const temperature = (12 + 60 * a.variety) * PRACTICE_PRESETS[settings.preset].spread;
    // Preserve the old preference for engine-ranked moves. Equal evaluations
    // share a rank so style can still distinguish equally sound alternatives.
    const rank = pool.findIndex((other) => comparable(other.score) === comparable(c.score));
    return {
      uci: c.candidate.uci,
      weight:
        (rankWeights[rank] ?? 0.05) *
        Math.exp(Math.max(-20, Math.min(1, style * 2 + quiet) - gap / temperature)),
    };
  });
  let choice = random() * weighted.reduce((sum, c) => sum + c.weight, 0);
  for (const c of weighted) {
    choice -= c.weight;
    if (choice < 0) return c.uci;
  }
  return weighted.at(-1)?.uci ?? null;
};
