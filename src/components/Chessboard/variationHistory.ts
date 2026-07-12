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
  for (const ply of history.plies.slice(1)) {
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

export const variationHistories = (tree: VariationHistory): BoardHistory[] =>
  tree.leaves.flatMap((_, index) => {
    const history = variationHistoryAt(tree, index);
    return history ? [history] : [];
  });
