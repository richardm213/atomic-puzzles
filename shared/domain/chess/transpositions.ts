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
  transposition?: MoveLocation;
  children: Map<string, TranspositionMoveNode>;
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
  const originals = new Map<string, MoveLocation>();
  const ancestors = new Set([rootKey]);

  const visit = (
    parent: TranspositionMoveNode,
    position: Atomic,
    path: string,
    key: string,
    repeated: boolean,
  ): void => {
    // A repeated position belongs to this move-order prefix only. It must not
    // donate continuations to, or receive continuations from, its earlier self.
    let occurrence = occurrences.get(path);
    if (!displayOnly && !occurrence) {
      occurrence = { position: repeated ? path : key, children: new Map() };
      occurrences.set(path, occurrence);
    }
    const children = displayOnly
      ? (orderedChildren(parent) as TranspositionMoveNode[])
      : parent.children.values();
    for (const child of children) {
      const next = position.clone();
      const uci = play(next, child.move!);
      const nextPath = `${path} ${uci}`;
      const nextKey = positionKey(next);
      const repeats = ancestors.has(nextKey);
      occurrence?.children.set(uci, {
        san: child.move!,
        position: repeats ? nextPath : nextKey,
        key: nextKey,
      });
      if (displayOnly && !repeats) {
        const original = originals.get(nextKey);
        if (original) child.transposition = original;
        else originals.set(nextKey, child.firstOccurrence!);
      }
      if (displayOnly && child.transposition) continue;
      if (!repeats) ancestors.add(nextKey);
      visit(child, next, nextPath, nextKey, repeats);
      if (!repeats) ancestors.delete(nextKey);
    }
  };
  visit(tree, position, "", rootKey, false);
  return { tree, occurrences, rootKey };
};

export const buildTranspositionMoveTree = (
  fen: string,
  lines: string[][],
): TranspositionMoveNode =>
  lines.length < 2 ? buildIndexedSolutionMoveTree(lines) : indexLines(fen, lines, true).tree;

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
    for (const [uci, edge] of occurrence.children) {
      if (!edges.has(uci)) edges.set(uci, edge);
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
      if (!occurrence.children.has(uci)) edges.delete(uci);
    }
    for (const [uci, edge] of occurrence.children) {
      if (old.children.get(uci)?.san !== edge.san) edges.set(uci, edge);
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
    const edges = repeated ? occurrences.get(path)?.children : graph.get(position);
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
