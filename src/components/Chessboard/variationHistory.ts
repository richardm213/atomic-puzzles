import { sameSolutionMove, serializeSanLinesToPgn } from "../../lib/chess/pgn";
import { synchronizeTranspositions } from "../../lib/chess/transpositions";
import {
  assertBoardHistory,
  type BoardHistory,
  historyMoveSans,
  type HistoryPly,
} from "./boardHistory";
import { buildPgnHistory } from "./pgnHistory";

type VariationNode = {
  ply: HistoryPly;
  parent: VariationNode | null;
  children: Map<string, VariationNode>;
};

export type VariationHistory = {
  root: VariationNode | null;
  leaves: VariationNode[];
};

export const createVariationHistory = (): VariationHistory => ({ root: null, leaves: [] });

const nodeKey = (ply: HistoryPly): string => `${ply.key ?? "root"}:${ply.fen}`;

export const saveVariation = (
  tree: VariationHistory,
  history: BoardHistory,
  existingIndex?: number,
): number => {
  assertBoardHistory(history);
  const rootPly = history.plies[0]!;
  if (!tree.root) tree.root = { ply: { ...rootPly }, parent: null, children: new Map() };

  let node = tree.root;
  for (let index = 1; index < history.plies.length; index += 1) {
    const ply = history.plies[index]!;
    const key = nodeKey(ply);
    let child = node.children.get(key);
    if (!child) {
      child = { ply: { ...ply }, parent: node, children: new Map() };
      node.children.set(key, child);
    }
    node = child;
  }

  if (existingIndex !== undefined) {
    tree.leaves[existingIndex] = node;
    return existingIndex;
  }
  const existingLeafIndex = tree.leaves.indexOf(node);
  if (existingLeafIndex >= 0) return existingLeafIndex;
  tree.leaves.push(node);
  return tree.leaves.length - 1;
};

export const variationHistoryAt = (tree: VariationHistory, index: number): BoardHistory | null => {
  let node = tree.leaves[index];
  if (!node) return null;
  const plies: HistoryPly[] = [];
  while (node) {
    plies.push({ ...node.ply });
    node = node.parent!;
  }
  plies.reverse();
  return { plies, index: plies.length - 1 };
};

const variationValues = (
  leaf: VariationNode,
  valueFromPly: (ply: HistoryPly) => string | undefined,
): string[] => {
  const values: string[] = [];
  let node: VariationNode | null = leaf;
  while (node) {
    const value = valueFromPly(node.ply);
    if (value) values.push(value);
    node = node.parent;
  }
  values.reverse();
  return values;
};

export const variationMoveKeys = (tree: VariationHistory): string[][] =>
  tree.leaves.map((leaf) => variationValues(leaf, (ply) => ply.key));

export const variationMoveSans = (tree: VariationHistory): string[][] =>
  tree.leaves.map((leaf) => variationValues(leaf, (ply) => ply.san));

export const annotateVariationMove = (
  tree: VariationHistory,
  lineIndex: number,
  plyIndex: number,
  san: string,
): boolean => {
  let node = tree.leaves[lineIndex];
  if (!node || plyIndex < 1) return false;

  const line: VariationNode[] = [];
  while (node) {
    line.push(node);
    node = node.parent!;
  }
  line.reverse();

  const target = line[plyIndex];
  if (!target) return false;
  target.ply.san = san;
  return true;
};

export type TranspositionHistorySnapshot = { fen: string; lines: string[][]; signature: string };

// Commit synchronized histories together, before publishing board state. Navigation
// can then use the updated tree immediately, without scheduling a PGN reload.
export const synchronizeVariationHistory = (
  history: BoardHistory,
  variations: VariationHistory,
  previous: TranspositionHistorySnapshot | null,
) => {
  const fen = history.plies[0]!.fen;
  const played = historyMoveSans(history);
  const lines = variationMoveSans(variations);
  if (
    played.length &&
    !lines.some((line) => played.every((move, ply) => sameSolutionMove(move, line[ply])))
  ) {
    lines.push(played);
  }
  const signature = JSON.stringify(lines);
  if (previous?.fen === fen && previous.signature === signature) return null;
  const nextLines = synchronizeTranspositions(
    fen,
    lines,
    previous?.fen === fen ? previous.lines : [],
  );
  const snapshot = { fen, lines: nextLines, signature: JSON.stringify(nextLines) };
  if (snapshot.signature === signature) return { history, variations, snapshot };

  const result = buildPgnHistory(fen, serializeSanLinesToPgn(fen, nextLines));
  if (!result.ok) throw new Error(result.error);
  const prefix = played.slice(0, history.index);
  const lineIndex = Math.max(
    0,
    result.histories.findIndex((candidate) =>
      prefix.every((move, ply) => sameSolutionMove(move, candidate.plies[ply + 1]?.san)),
    ),
  );
  const nextHistory = result.histories[lineIndex]!;
  nextHistory.index = Math.min(history.index, nextHistory.plies.length - 1);
  const nextVariations = createVariationHistory();
  result.histories.forEach((candidate) => saveVariation(nextVariations, candidate));
  snapshot.lines = result.histories.map(historyMoveSans);
  snapshot.signature = JSON.stringify(snapshot.lines);
  return { history: nextHistory, variations: nextVariations, snapshot, lineIndex };
};
