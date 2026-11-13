import { makeFen } from "chessops/fen";
import { makeSan } from "chessops/san";
import { makeUci } from "chessops/util";
import { z } from "zod";

import {
  createAtomicPosition,
  moveFromUci,
  parseAtomicMove,
  parsePgnUciLines,
  serializeSanLinesToPgn,
  stripSolutionMoveAnnotation,
} from "../chess/pgn";

const lineKindSchema = z.enum(["essential", "tertiary", "mate"]);
const movesSchema = z
  .array(z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/))
  .min(1)
  .max(256);

export const openingDocumentSchema = z.object({
  startFen: z.string().min(1).max(200),
  side: z.enum(["white", "black"]),
  branches: z
    .array(
      z.object({
        moves: movesSchema,
        kind: lineKindSchema,
      }),
    )
    .max(1000)
    .default([]),
  lines: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        kind: lineKindSchema,
        moves: movesSchema,
      }),
    )
    .max(1000),
});
export type OpeningDocument = z.infer<typeof openingDocumentSchema>;
export type OpeningLine = OpeningDocument["lines"][number];
export type LineKind = OpeningLine["kind"];
export type Traversal = "depth" | "breadth";
export type OpeningCard = {
  key: string;
  positionKey: string;
  fen: string;
  move: string;
  san: string;
  prefix: string[];
  lineIds: string[];
  kind: LineKind;
  order: number;
};
export type OpeningReview = {
  known: boolean;
  intervalDays: number;
  nextDue: string | null;
  reviewedAt: string | null;
  correct: number;
  wrong: number;
};
export type OpeningProgress = Record<string, OpeningReview>;
export const emptyReview = (): OpeningReview => ({
  known: false,
  intervalDays: 0,
  nextDue: null,
  reviewedAt: null,
  correct: 0,
  wrong: 0,
});
export const openingPositionKey = (fen: string): string =>
  makeFen(createAtomicPosition(fen).toSetup()).split(" ").slice(0, 4).join(" ");

// Validate once at the save boundary. Keeping legal UCI edges makes import, editing and training agree.
export const validateOpeningDocument = (input: unknown): OpeningDocument => {
  const doc = openingDocumentSchema.parse(input);
  if (doc.lines.reduce((sum, line) => sum + line.moves.length, 0) > 20000)
    throw new Error("An opening may contain at most 20,000 moves.");
  const root = createAtomicPosition(doc.startFen);
  const ids = new Set<string>();
  for (const line of doc.lines) {
    if (ids.has(line.id)) throw new Error("Duplicate opening line ID.");
    ids.add(line.id);
    const pos = root.clone();
    for (const token of line.moves) {
      const move = moveFromUci(pos, token);
      if (!move || !pos.isLegal(move)) throw new Error(`Illegal opening move: ${token}`);
      pos.play(move);
    }
  }
  return { ...doc, startFen: makeFen(root.toSetup()) };
};

export const openingKnownMoves = (
  doc: OpeningDocument,
  progress: OpeningProgress,
): Map<string, boolean[]> => {
  const root = createAtomicPosition(doc.startFen);
  return new Map(
    doc.lines.map((line) => {
      const position = root.clone();
      return [
        line.id,
        line.moves.map((uci) => {
          const key = `${makeFen(position.toSetup()).split(" ").slice(0, 4).join(" ")}|${uci}`;
          const known = progress[key]?.known ?? false;
          position.play(moveFromUci(position, uci)!);
          return known;
        }),
      ];
    }),
  );
};

// Prefix rules classify a whole subtree, including future moves, without changing its lead-up.
export const openingLineKinds = (doc: OpeningDocument): Map<string, LineKind[]> => {
  type Rule = { kind?: LineKind; children: Map<string, Rule> };
  const root: Rule = { children: new Map() };
  for (const branch of doc.branches ?? []) {
    let node = root;
    for (const move of branch.moves) {
      if (!node.children.has(move)) node.children.set(move, { children: new Map() });
      node = node.children.get(move)!;
    }
    node.kind = branch.kind;
  }
  return new Map(
    doc.lines.map((line) => {
      let node: Rule | undefined = root;
      let kind = line.kind;
      return [
        line.id,
        line.moves.map((move) => {
          node = node?.children.get(move);
          kind = node?.kind ?? kind;
          return kind;
        }),
      ];
    }),
  );
};

export const markOpeningBranch = (
  doc: OpeningDocument,
  prefix: string[],
  kind: LineKind,
): OpeningDocument => ({
  ...doc,
  branches: [
    ...(doc.branches ?? []).filter(
      (branch) => !prefix.every((move, i) => branch.moves[i] === move),
    ),
    { moves: prefix, kind },
  ],
});

export const visibleOpeningLines = (doc: OpeningDocument, essentialOnly = false): OpeningLine[] => {
  if (!essentialOnly) return doc.lines;
  const kinds = openingLineKinds(doc);
  return doc.lines.flatMap((line) => {
    const end = kinds.get(line.id)!.findIndex((kind) => kind !== "essential");
    const moves = end < 0 ? line.moves : line.moves.slice(0, end);
    return moves.length ? [{ ...line, moves }] : [];
  });
};

export const openingCards = (doc: OpeningDocument, kind?: LineKind): OpeningCard[] => {
  const cards = new Map<string, OpeningCard>();
  type Node = { children: Map<string, Node>; lineIds: Set<string>; kinds: Set<LineKind> };
  const node = (): Node => ({ children: new Map(), lineIds: new Set(), kinds: new Set() });
  const tree = node();
  const kinds = openingLineKinds(doc);
  for (const line of doc.lines) {
    let parent = tree;
    for (const [ply, move] of line.moves.entries()) {
      let child = parent.children.get(move);
      if (!child) {
        child = node();
        parent.children.set(move, child);
      }
      child.lineIds.add(line.id);
      child.kinds.add(kinds.get(line.id)![ply]!);
      parent = child;
    }
  }
  const visit = (parent: Node, pos: ReturnType<typeof createAtomicPosition>, prefix: string[]) => {
    for (const [token, child] of parent.children) {
      const move = moveFromUci(pos, token)!;
      if (pos.turn === doc.side && (!kind || child.kinds.has(kind))) {
        const fen = makeFen(pos.toSetup());
        const positionKey = openingPositionKey(fen);
        const key = `${positionKey}|${token}`;
        const prior = cards.get(key);
        if (prior) prior.lineIds = [...new Set([...prior.lineIds, ...child.lineIds])];
        else
          cards.set(key, {
            key,
            positionKey,
            fen,
            move: token,
            san: makeSan(pos, move),
            prefix,
            lineIds: [...child.lineIds],
            kind:
              kind ??
              (child.kinds.has("essential") ? "essential" : child.kinds.values().next().value!),
            order: cards.size,
          });
      }
      const next = pos.clone();
      next.play(move);
      visit(child, next, [...prefix, token]);
    }
  };
  visit(tree, createAtomicPosition(doc.startFen), []);
  return [...cards.values()];
};

export const openingReviewDue = (review: OpeningReview | undefined, now: number): boolean =>
  !review?.known && (!review?.nextDue || Date.parse(review.nextDue) <= now);

export const dueOpeningCards = (
  doc: OpeningDocument,
  progress: OpeningProgress,
  now: number,
  traversal: Traversal = "depth",
): OpeningCard[] =>
  openingCards(doc, "essential")
    .filter((card) => openingReviewDue(progress[card.key], now))
    .sort((a, b) => {
      const due = (c: OpeningCard) =>
        progress[c.key]?.nextDue ? Date.parse(progress[c.key]!.nextDue!) : Infinity;
      return (
        due(a) - due(b) ||
        (traversal === "breadth" ? a.prefix.length - b.prefix.length : 0) ||
        a.order - b.order
      );
    });

export const scheduleOpeningReview = (
  previous: OpeningReview | undefined,
  correct: boolean,
  now: number,
): OpeningReview => {
  const old = previous ?? emptyReview();
  if (!openingReviewDue(old, now)) return old;
  const intervalDays = correct ? (old.intervalDays > 0 ? old.intervalDays * 2 : 1) : 0;
  const due = new Date(now + (correct ? intervalDays * 86400000 : 60000));
  return {
    known: false,
    intervalDays,
    nextDue: Number.isFinite(due.getTime()) ? due.toISOString() : "infinity",
    reviewedAt: new Date(now).toISOString(),
    correct: old.correct + Number(correct),
    wrong: old.wrong + Number(!correct),
  };
};

export const knownOpeningKeys = (
  doc: OpeningDocument,
  scope: "position" | "line" | "prefix",
  lineId: string,
  ply: number,
): string[] => {
  const line = doc.lines.find((l) => l.id === lineId);
  if (!line) return [];
  const positions = new Set<string>();
  const pos = createAtomicPosition(doc.startFen);
  for (let i = 0; i < line.moves.length; i++) {
    if (pos.turn === doc.side && (scope === "line" || (scope === "prefix" ? i <= ply : i === ply)))
      positions.add(openingPositionKey(makeFen(pos.toSetup())));
    pos.play(moveFromUci(pos, line.moves[i]!)!);
  }
  return openingCards(doc)
    .filter((c) => positions.has(c.positionKey))
    .map((c) => c.key);
};

export const openingLineUcis = (doc: OpeningDocument, moves: string[]): string[] => {
  const pos = createAtomicPosition(doc.startFen);
  return moves.map((notation) => {
    const move = parseAtomicMove(pos, stripSolutionMoveAnnotation(notation));
    if (!move || !pos.isLegal(move)) throw new Error(`Illegal opening move: ${notation}`);
    const uci = makeUci(move);
    pos.play(move);
    return uci;
  });
};

export const openingLineSans = (doc: OpeningDocument, moves: string[]): string[] => {
  const pos = createAtomicPosition(doc.startFen);
  return moves.map((uci) => {
    const move = moveFromUci(pos, uci)!;
    const san = makeSan(pos, move);
    pos.play(move);
    return san;
  });
};
export const openingPgn = (doc: OpeningDocument, essentialOnly = false): string =>
  serializeSanLinesToPgn(
    doc.startFen,
    visibleOpeningLines(doc, essentialOnly).map((line) => openingLineSans(doc, line.moves)),
  );

export const importOpeningPgn = (
  doc: OpeningDocument,
  pgn: string,
  kind: LineKind = "essential",
): OpeningDocument => {
  const parsed = parsePgnUciLines(doc.startFen, pgn);
  if (!parsed?.length) throw new Error("Enter legal atomic PGN from the starting FEN.");
  const existing = new Map(doc.lines.map((l) => [l.moves.join(" "), l]));
  const next = parsed.map((line, i) => {
    const moves = line.map((m) => m.uci);
    return existing.get(moves.join(" ")) ?? { id: `line-${crypto.randomUUID()}-${i}`, kind, moves };
  });
  return validateOpeningDocument({ ...doc, lines: next });
};

export const openingPrefixPgn = (doc: OpeningDocument, prefix: string[]): string =>
  serializeSanLinesToPgn(doc.startFen, [openingLineSans(doc, prefix)]);
export const openingMoveUci = (fen: string, uci: string): string | null => {
  const pos = createAtomicPosition(fen);
  const move = moveFromUci(pos, uci);
  return move && pos.isLegal(move) ? makeUci(move) : null;
};

export const addOpeningLine = (
  doc: OpeningDocument,
  moves: string[],
  kind?: LineKind,
): OpeningDocument => {
  if (!moves.length || doc.lines.some((l) => moves.every((m, i) => l.moves[i] === m))) return doc;
  const parent = doc.lines
    .filter((l) => l.moves.length < moves.length && l.moves.every((m, i) => moves[i] === m))
    .sort((a, b) => b.moves.length - a.moves.length)[0];
  const line: OpeningLine = parent
    ? { ...parent, moves, kind: kind ?? parent.kind }
    : {
        id: crypto.randomUUID(),
        kind: kind ?? "essential",
        moves,
      };
  return {
    ...doc,
    lines: parent ? doc.lines.map((l) => (l.id === parent.id ? line : l)) : [...doc.lines, line],
  };
};
