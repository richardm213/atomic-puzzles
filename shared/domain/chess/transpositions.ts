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
  const originals = new Map<
    string,
    { node: TranspositionMoveNode; parent: TranspositionMoveNode }
  >();
  const ancestors = new Set([rootKey]);

  const visit = (
    parent: TranspositionMoveNode,
    position: Atomic,
    path: string,
    key: string,
    repeated: boolean,
    retryBranch: boolean,
    linkedOriginal?: TranspositionMoveNode,
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
      let nextOriginal: TranspositionMoveNode | undefined;
      if (displayOnly && !repeats && !nextRetryBranch) {
        const original = originals.get(nextKey);
        if (original?.node.firstOccurrence) {
          nextOriginal = original.node;
          // Both move orders are still following the same sequence. Keep the
          // first jump and leave this branch visible, including any extra moves.
          if (original.parent !== linkedOriginal) {
            child.transposition = {
              ...original.node.firstOccurrence,
              sharedContinuation: containsContinuation(original.node, child),
            };
          }
        } else originals.set(nextKey, { node: child, parent });
      }
      if (child.transposition?.sharedContinuation) continue;
      if (!repeats) ancestors.add(nextKey);
      visit(child, next, nextPath, nextKey, repeats, nextRetryBranch, nextOriginal);
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
const synchronize = (
  fen: string,
  lines: string[][],
  previousLines: string[][],
  shareRetries: boolean,
): string[][] => {
  if (lines.length < 2) return lines;
  const { occurrences, rootKey } = indexLines(fen, lines);
  const graph = new Map<string, Map<string, Edge>>();
  const transposed = new Set<string>();
  for (const occurrence of occurrences.values()) {
    let edges = graph.get(occurrence.position);
    if (edges) transposed.add(occurrence.position);
    else graph.set(occurrence.position, (edges = new Map()));
    for (const [pathMove, edge] of occurrence.children) {
      if ((shareRetries || !pathMove.endsWith("?")) && !edges.has(pathMove))
        edges.set(pathMove, edge);
    }
  }
  if (graph.size === occurrences.size && !previousLines.length) return lines;
  const previous = previousLines.length
    ? indexLines(fen, previousLines).occurrences
    : new Map<string, Occurrence>();
  const reclassified = new Set<string>();
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
      const retry = uci.endsWith("?");
      const alternate = retry ? uci.slice(0, -1) : `${uci}?`;
      if (!occurrence.children.has(uci) && !occurrence.children.has(alternate)) {
        edges.delete(uci);
      }
    }
    for (const [pathMove, edge] of occurrence.children) {
      const retry = pathMove.endsWith("?");
      if ((shareRetries || !retry) && old.children.get(pathMove)?.san !== edge.san) {
        if (shareRetries && transposed.has(occurrence.position)) {
          // An explicit annotation change governs the move in all copies of this position.
          if (retry && old.children.has(pathMove.slice(0, -1))) {
            reclassified.add(occurrence.position);
          }
          edges.delete(retry ? pathMove.slice(0, -1) : `${pathMove}?`);
        }
        edges.set(pathMove, edge);
      }
    }
  }
  if (shareRetries) {
    for (const position of transposed) {
      const edges = graph.get(position)!;
      // Preserve accepted solutions in legacy PGN if both classifications already existed.
      let hasAccepted = false;
      for (const move of edges.keys()) {
        if (move.endsWith("?")) continue;
        hasAccepted = true;
        edges.delete(`${move}?`);
      }
      if (!hasAccepted && reclassified.has(position)) {
        throw new Error("Add an accepted move before marking the last shared move as a retry.");
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
        if (shareRetries) {
          // Keep this branch's explanatory replies. Inherited retries are leaves.
          if (edges.has(pathMove)) edges.set(pathMove, edge);
          continue;
        }
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
      if (shareRetries && uci.endsWith("?") && !explicit?.has(uci)) {
        result.push([...moves]);
      } else {
        visit(edge.position, edge.key, `${path} ${uci}`);
      }
      moves.pop();
    }
    if (!repeated) ancestors.delete(key);
  };
  visit(rootKey, rootKey, "");
  if (shareRetries && !previousLines.length && result.length === lines.length) {
    const branches = new Set(result.map((line) => line.join(" ")));
    if (lines.every((line) => branches.has(line.join(" ")))) return lines;
  }
  return result;
};

export const synchronizeTranspositions = (
  fen: string,
  lines: string[][],
  previousLines: string[][] = [],
): string[][] => synchronize(fen, lines, previousLines, false);

export const synchronizePuzzleTranspositions = (
  fen: string,
  lines: string[][],
  previousLines: string[][] = [],
): string[][] => synchronize(fen, lines, previousLines, true);
