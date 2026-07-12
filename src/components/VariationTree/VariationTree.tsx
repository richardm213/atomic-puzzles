import "./VariationTree.css";

import type { ReactNode } from "react";

import {
  buildSolutionMoveTree,
  compareMoves,
  findMainChild,
  movePrefix,
  orderedChildren,
} from "../../lib/puzzles/solutionPgn";

type MoveTreeNode = import("../../lib/puzzles/solutionPgn").SolutionMoveNode<{
  lineIndexes: Set<number>;
}>;

export type VariationOption = { move: string; lineIndex: number; plyIndex: number };

export const matchingLineIndexes = (lines: string[][] = [], moves: string[] = []): number[] =>
  lines.flatMap((line, index) =>
    moves.every((move, moveIndex) => line[moveIndex] === move) ? [index] : [],
  );

export const sortMatchingLineIndexes = (
  lines: string[][],
  currentPly: number,
  indexes: number[],
): number[] =>
  [...indexes].sort((a, b) =>
    compareMoves(lines[a]?.[currentPly] ?? "", lines[b]?.[currentPly] ?? "", a, b),
  );

export const activeLineIndex = (indexes: number[], pinned: number | null, fallback = 0): number =>
  pinned !== null && indexes.includes(pinned) ? pinned : (indexes[0] ?? fallback);

export const variationOptions = (
  lines: string[][],
  currentPly: number,
  indexes: number[],
): VariationOption[] => {
  const options = new Map<string, VariationOption>();
  indexes.forEach((lineIndex) => {
    const move = lines[lineIndex]?.[currentPly];
    if (move && !options.has(move)) options.set(move, { move, lineIndex, plyIndex: currentPly });
  });
  return [...options.values()].sort((a, b) =>
    compareMoves(a.move, b.move, a.lineIndex, b.lineIndex),
  );
};

const createMoveTree = (lines: string[][]): MoveTreeNode => {
  const tree = buildSolutionMoveTree(lines, () => ({ lineIndexes: new Set<number>() }));
  lines.forEach((line, lineIndex) => {
    let node = tree;
    node.lineIndexes.add(lineIndex);
    line.forEach((move) => {
      const next = node.children.get(move);
      if (next) {
        node = next;
        node.lineIndexes.add(lineIndex);
      }
    });
  });
  return tree;
};

export const VariationTree = ({
  lines,
  activeLine,
  currentPly,
  onMoveClick,
}: {
  lines: string[][];
  activeLine: number;
  currentPly: number;
  onMoveClick: (lineIndex: number, moveIndex: number) => void;
}) => {
  if (!lines.length) return null;
  const tree = createMoveTree(lines);

  const renderNode = (
    node: MoveTreeNode,
    ply: number,
    keyPrefix: string,
    forceMoveNumber = false,
  ): ReactNode[] => {
    const indexes = [...node.lineIndexes].sort((a, b) => a - b);
    const targetLine = node.lineIndexes.has(activeLine) ? activeLine : (indexes[0] ?? 0);
    const content: ReactNode[] = [
      <button
        key={`${keyPrefix}-move-${ply}-${node.move}`}
        type="button"
        className={`moveChip ${node.lineIndexes.has(activeLine) && currentPly === ply + 1 ? "active" : ""}`}
        onClick={() => onMoveClick(targetLine, ply)}
      >
        {movePrefix(ply, forceMoveNumber)}
        {node.move}
      </button>,
    ];
    const children = orderedChildren(node);
    const main = findMainChild(children);
    children
      .filter((child) => child !== main)
      .forEach((variation, index) => {
        const key = `${keyPrefix}-variation-${ply}-${index}`;
        content.push(
          <span key={`${key}-open`} className="variationParen">
            (
          </span>,
        );
        content.push(...renderNode(variation, ply + 1, key, (ply + 1) % 2 === 1));
        content.push(
          <span key={`${key}-close`} className="variationParen">
            )
          </span>,
        );
      });
    if (main) content.push(...renderNode(main, ply + 1, `${keyPrefix}-main`));
    return content;
  };

  const roots = orderedChildren(tree);
  const main = findMainChild(roots);
  const content = main ? renderNode(main, 0, "root-main") : [];
  roots
    .filter((node) => node !== main)
    .forEach((variation, index) => {
      const key = `root-variation-${index}`;
      content.push(
        <span key={`${key}-open`} className="variationParen">
          (
        </span>,
      );
      content.push(...renderNode(variation, 0, key));
      content.push(
        <span key={`${key}-close`} className="variationParen">
          )
        </span>,
      );
    });

  return <>{content}</>;
};
