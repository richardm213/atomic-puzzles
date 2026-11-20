import { makeFen } from "chessops/fen";
import { makeUci } from "chessops/util";
import type { Atomic } from "chessops/variant";

import {
  buildIndexedSolutionMoveTree,
  createAtomicPosition,
  type IndexedSolutionMoveNode,
  orderedChildren,
  parseAtomicMove,
  splitSolutionMove,
} from "./pgn";

type MoveLocation = { lineIndex: number; moveIndex: number };
export type TranspositionMoveNode = Omit<IndexedSolutionMoveNode, "children"> & {
  transposition?: MoveLocation & { sharedContinuation: boolean };
  children: Map<string, TranspositionMoveNode>;
};

const containsContinuation = (
  original: TranspositionMoveNode,
  alternate: TranspositionMoveNode,
): boolean => {
  for (const [san, child] of alternate.children) {
    if (splitSolutionMove(san).retry) return false;
    const match = original.children.get(san);
    if (!match || !containsContinuation(match, child)) return false;
  }
  return true;
};

// Counters do not affect legal continuations. Turn, castling and legal en passant do.
const positionKey = (position: Atomic): string => makeFen(position.toSetup(), { epd: true });

const play = (position: Atomic, san: string): string => {
  const move = parseAtomicMove(position, splitSolutionMove(san).san);
  if (!move) throw new Error(`Invalid transposition move: ${san}`);
  const uci = makeUci(move);
  position.play(move);
  return uci;
};

type Edge = { san: string; position: string; key: string };
type Occurrence = { position: string; children: Map<string, Edge> };

const indexLines = (fen: string, lines: string[][], displayOnly = false) => {
  const tree: TranspositionMoveNode = buildIndexedSolutionMoveTree(lines);
  const position = createAtomicPosition(fen);
  const rootKey = positionKey(position);
  const occurrences = new Map<string, Occurrence>();
  const originals = new Map<string, TranspositionMoveNode>();
  const ancestors = new Set([rootKey]);

  const visit = (
    parent: TranspositionMoveNode,
    position: Atomic,
    path: string,
    key: string,
    repeated: boolean,
    retryBranch: boolean,
  ): void => {
    // A repeated position belongs to this move-order prefix only. It must not
    // donate continuations to, or receive continuations from, its earlier self.
    let occurrence = occurrences.get(path);
    if (!displayOnly && !occurrence) {
      occurrence = { position: repeated || retryBranch ? path : key, children: new Map() };
      occurrences.set(path, occurrence);
    }
    const children = displayOnly
      ? (orderedChildren(parent) as TranspositionMoveNode[])
      : parent.children.values();
    for (const child of children) {
      const next = position.clone();
      const san = child.move!;
      const retry = splitSolutionMove(san).retry;
      const nextRetryBranch = retryBranch || retry;
      // A retry move and all its replies belong to their own line.
      const pathMove = `${play(next, san)}${retry ? "?" : ""}`;
      const nextPath = `${path} ${pathMove}`;
      const nextKey = positionKey(next);
      const repeats = ancestors.has(nextKey);
      occurrence?.children.set(pathMove, {
        san,
        position: repeats || nextRetryBranch ? nextPath : nextKey,
        key: nextKey,
      });
      if (displayOnly && !repeats && !nextRetryBranch) {
        const original = originals.get(nextKey);
        if (original?.firstOccurrence) {
          child.transposition = {
            ...original.firstOccurrence,
            sharedContinuation: containsContinuation(original, child),
          };
        } else originals.set(nextKey, child);
      }
      if (child.transposition?.sharedContinuation) continue;
      if (!repeats) ancestors.add(nextKey);
      visit(child, next, nextPath, nextKey, repeats, nextRetryBranch);
      if (!repeats) ancestors.delete(nextKey);
    }
  };
  visit(tree, position, "", rootKey, false, false);
  return { tree, occurrences, rootKey };
};

export const buildTranspositionMoveTree = (
  fen: string,
  lines: string[][],
): TranspositionMoveNode => {
  if (lines.length > 1) {
    try {
      return indexLines(fen, lines, true).tree;
    } catch {
      // Keep notation navigable while a position or move list is being edited or loaded.
    }
  }
  return buildIndexedSolutionMoveTree(lines);
};

/** Materialize shared continuations as ordinary PGN branches. Compare surviving
 * move-order prefixes with the previous edit so deletions/annotations override
 * the stale copies, rather than being resurrected by their union. */
export const synchronizeTranspositions = (
  fen: string,
  lines: string[][],
  previousLines: string[][] = [],
): string[][] => {
  if (lines.length < 2) return lines;
  const { occurrences, rootKey } = indexLines(fen, lines);
  const graph = new Map<string, Map<string, Edge>>();
  for (const occurrence of occurrences.values()) {
    let edges = graph.get(occurrence.position);
    if (!edges) graph.set(occurrence.position, (edges = new Map()));
    for (const [pathMove, edge] of occurrence.children) {
      if (!pathMove.endsWith("?") && !edges.has(pathMove)) edges.set(pathMove, edge);
    }
  }
  if (graph.size === occurrences.size && !previousLines.length) return lines;
  const previous = previousLines.length
    ? indexLines(fen, previousLines).occurrences
    : new Map<string, Occurrence>();
  // Boards may report the newly played branch first. Preserve the established
  // move order so reaching a transposition cannot swap its original occurrence.
  const ordered = new Set<string>();
  for (const occurrence of previous.values()) {
    if (ordered.has(occurrence.position)) continue;
    ordered.add(occurrence.position);
    const edges = graph.get(occurrence.position);
    if (!edges) continue;
    graph.set(
      occurrence.position,
      new Map([
        ...[...occurrence.children.keys()].flatMap((uci) =>
          edges.has(uci) ? [[uci, edges.get(uci)!] as const] : [],
        ),
        ...edges,
      ]),
    );
  }
  for (const [path, occurrence] of occurrences) {
    const old = previous.get(path);
    if (!old) continue;
    const edges = graph.get(occurrence.position)!;
    for (const uci of old.children.keys()) {
      // Marking this copy as a retry must not remove the move from other
      // move orders that still explicitly accept it.
      if (!occurrence.children.has(uci) && !occurrence.children.has(`${uci}?`)) {
        edges.delete(uci);
      }
    }
    for (const [pathMove, edge] of occurrence.children) {
      if (!pathMove.endsWith("?") && old.children.get(pathMove)?.san !== edge.san) {
        edges.set(pathMove, edge);
      }
    }
  }

  const result: string[][] = [];
  const ancestors = new Set<string>();
  const moves: string[] = [];
  const visit = (position: string, key: string, path: string): void => {
    // A continuation copied from another branch may meet an ancestor here.
    // Keep only explicitly entered moves at that repetition, then resume normal
    // sharing if the line subsequently reaches a new position.
    const repeated = ancestors.has(key);
    const explicit = occurrences.get(path)?.children;
    let edges = explicit;
    if (!repeated) {
      edges = new Map(graph.get(position));
      for (const [pathMove, edge] of explicit ?? []) {
        if (!pathMove.endsWith("?")) continue;
        // An explicit retry shadows the inherited accepted move on this line.
        const acceptedMove = pathMove.slice(0, -1);
        if (!explicit?.has(acceptedMove)) edges.delete(acceptedMove);
        edges.set(pathMove, edge);
      }
    }
    if (!edges?.size) {
      if (moves.length) result.push([...moves]);
      return;
    }
    if (!repeated) ancestors.add(key);
    for (const [uci, edge] of edges) {
      moves.push(edge.san);
      visit(edge.position, edge.key, `${path} ${uci}`);
      moves.pop();
    }
    if (!repeated) ancestors.delete(key);
  };
  visit(rootKey, rootKey, "");
  return result;
};
