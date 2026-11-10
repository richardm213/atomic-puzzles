import { kingAttacks } from "chessops/attacks";
import { normalizeMove } from "chessops/chess";
import { chessgroundMove } from "chessops/compat";
import { makeFen, parseFen } from "chessops/fen";
import { makeSan, parseSan } from "chessops/san";
import { isNormal, type NormalMove, type SquareName } from "chessops/types";
import { kingCastlesTo, makeSquare, makeUci, parseUci } from "chessops/util";
import { Atomic } from "chessops/variant";

import type { LessonDefinition } from "./atomicLessons";

export type LessonFrame = {
  fen: string;
  san?: string;
  lastMove: SquareName[];
  explosion: SquareName[];
  center?: SquareName | undefined;
};

export const lessonPosition = (fen: string) => Atomic.fromSetup(parseFen(fen).unwrap()).unwrap();

export const readLessonMove = (position: Atomic, value: string): NormalMove | undefined => {
  const text = value.trim().replace(/^0-0(-0)?/, (castle) => castle.replaceAll("0", "O"));
  const coordinate = text.toLowerCase().replace(/[-\s]/g, "");
  const move =
    parseUci(coordinate) ??
    parseSan(position, text) ??
    parseSan(
      position,
      text.replace(/^[kqrbn]/, (piece) => piece.toUpperCase()),
    );
  return move && isNormal(move) && position.isLegal(move)
    ? (normalizeMove(position, move) as NormalMove)
    : undefined;
};

export const moveKey = (move: NormalMove) => makeUci(move);

export const playLessonMove = (position: Atomic, move: NormalMove): LessonFrame => {
  const san = makeSan(position, move);
  const lastMove = chessgroundMove(move);
  if (san.startsWith("O-O")) {
    lastMove[1] = makeSquare(kingCastlesTo(position.turn, san.startsWith("O-O-O") ? "a" : "h"));
  }
  const center = san.includes("x") ? makeSquare(move.to) : undefined;
  const explosion = center ? Array.from(kingAttacks(move.to).with(move.to), makeSquare) : [];
  position.play(move);
  return { fen: makeFen(position.toSetup()), san, lastMove, explosion, center };
};

const playAuthoredMove = (position: Atomic, san: string, id: string) => {
  const move = readLessonMove(position, san);
  if (!move) throw new Error(`Illegal move ${san} in atomic lesson ${id}`);
  const frame = playLessonMove(position, move);
  if (frame.san !== san) throw new Error(`Expected ${frame.san} instead of ${san} in lesson ${id}`);
  return { key: moveKey(move), frame };
};

export const prepareLesson = (definition: LessonDefinition) => {
  const position = definition.fen ? lessonPosition(definition.fen) : Atomic.default();
  let frame: LessonFrame = { fen: makeFen(position.toSetup()), lastMove: [], explosion: [] };
  for (const san of definition.setup?.split(" ") ?? []) {
    frame = playAuthoredMove(position, san, definition.id).frame;
  }
  const start = frame;
  const color = position.turn;
  const turns = (definition.turns ?? []).map((turn, index, allTurns) => {
    if (position.turn !== color) throw new Error(`Wrong player to move in ${definition.id}`);
    const before = frame;
    const alternateFinishes = new Map<string, { frame: LessonFrame; note: string }>();
    for (const [san, note] of Object.entries(turn.alternateFinishes ?? {})) {
      if (index !== allTurns.length - 1 || turn.reply) {
        throw new Error(`Alternate finishes must end the lesson: ${definition.id}`);
      }
      const { key, frame: finish } = playAuthoredMove(position.clone(), san, definition.id);
      alternateFinishes.set(key, { frame: finish, note });
    }
    const alternatives = new Map<string, { note: string; reply?: LessonFrame | undefined }>();
    for (const [san, alternative] of Object.entries(turn.alternatives ?? {})) {
      const branch = position.clone();
      const { key } = playAuthoredMove(branch, san, definition.id);
      const reply = alternative.reply
        ? playAuthoredMove(branch, alternative.reply, definition.id).frame
        : undefined;
      alternatives.set(key, { note: alternative.note, reply });
    }
    const { key, frame: answer } = playAuthoredMove(position, turn.san, definition.id);
    const reply = turn.reply
      ? playAuthoredMove(position, turn.reply.san, definition.id).frame
      : undefined;
    frame = reply ?? answer;
    return { before, answer, reply, key, alternatives, alternateFinishes, turn };
  });
  return { start, final: frame, color, turns, length: definition.question ? 1 : turns.length };
};
