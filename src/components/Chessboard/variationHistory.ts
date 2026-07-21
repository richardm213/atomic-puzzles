import { assertBoardHistory, type BoardHistory, type HistoryPly } from "./boardHistory";

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
