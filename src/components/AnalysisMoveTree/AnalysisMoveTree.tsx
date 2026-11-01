import "./AnalysisMoveTree.css";

import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ReactNode } from "react";

import {
  buildSolutionMoveTree,
  findMainChild,
  movePrefix,
  orderedChildren,
} from "../../lib/puzzles/solutionPgn";
import type { PlaybackCommand } from "../../types/chessboard";
import {
  activeLineIndex,
  matchingLineIndexes,
  variationOptions,
} from "../VariationTree/VariationTree";

type MoveTreeNode = import("../../lib/puzzles/solutionPgn").SolutionMoveNode<{
  lineIndexes: Set<number>;
}>;

const createMoveTree = (lines: string[][]): MoveTreeNode => {
  const tree = buildSolutionMoveTree(lines, () => ({ lineIndexes: new Set<number>() }));
  lines.forEach((line, lineIndex) => {
    let node = tree;
    node.lineIndexes.add(lineIndex);
    line.forEach((move) => {
      const next = node.children.get(move);
      if (!next) return;
      node = next;
      node.lineIndexes.add(lineIndex);
    });
  });
  return tree;
};

export const AnalysisMoveTree = ({
  lines,
  moves,
  currentPly,
  pinnedLineIndex,
  inline = true,
  onSelect,
  onCycleOptions,
}: {
  lines: string[][];
  moves: string[];
  currentPly: number;
  pinnedLineIndex?: number | undefined;
  inline?: boolean;
  onSelect: (lineIndex: number, moveIndex: number) => void;
  onCycleOptions: (command: Extract<PlaybackCommand, "previousOption" | "nextOption">) => void;
}) => {
  if (!lines.length) return null;

  const currentMoves = moves.slice(0, currentPly);
  const matchingLines = matchingLineIndexes(lines, currentMoves);
  const activeLine = activeLineIndex(matchingLines, pinnedLineIndex ?? null);
  const options = variationOptions(lines, currentPly, matchingLines);
  const activeMove =
    options.find((option) => option.lineIndex === activeLine)?.move ?? options[0]?.move;
  const tree = createMoveTree(lines);

  const renderNode = (
    node: MoveTreeNode,
    ply: number,
    keyPrefix: string,
    forceMoveNumber = false,
  ): ReactNode[] => {
    const indexes = [...node.lineIndexes].sort((left, right) => left - right);
    const targetLine = node.lineIndexes.has(activeLine) ? activeLine : (indexes[0] ?? 0);
    const content: ReactNode[] = [
      <button
        key={`${keyPrefix}-move-${ply}-${node.move}`}
        type="button"
        className={`analysisTreeMove ${node.lineIndexes.has(activeLine) && currentPly === ply + 1 ? "active" : ""}`}
        aria-current={
          node.lineIndexes.has(activeLine) && currentPly === ply + 1 ? "step" : undefined
        }
        onClick={() => onSelect(targetLine, ply)}
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
          <span key={key} className="analysisTreeVariation">
            <span className="analysisTreeParen" aria-hidden="true">
              (
            </span>
            {renderNode(variation, ply + 1, key, (ply + 1) % 2 === 1)}
            <span className="analysisTreeParen" aria-hidden="true">
              )
            </span>
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
        <span key={key} className="analysisTreeVariation">
          <span className="analysisTreeParen" aria-hidden="true">
            (
          </span>
          {renderNode(variation, 0, key)}
          <span className="analysisTreeParen" aria-hidden="true">
            )
          </span>
        </span>,
      );
    });

  return (
    <>
      {options.length >= 2 ? (
        <div className="analysisContinuationChoices" aria-label="Choose continuation">
          <span>{options.length} options</span>
          <div className="analysisContinuationMoves">
            {options.map((option) => (
              <button
                key={`${option.lineIndex}-${option.plyIndex}-${option.move}`}
                type="button"
                className={option.move === activeMove ? "active" : ""}
                aria-current={option.move === activeMove ? "true" : undefined}
                onClick={() => onSelect(option.lineIndex, option.plyIndex)}
              >
                {movePrefix(currentPly, currentPly % 2 === 1)}
                {option.move}
              </button>
            ))}
          </div>
          <div className="analysisContinuationArrows">
            <button
              type="button"
              aria-label="Previous continuation"
              title="Previous continuation (Arrow Up)"
              onClick={() => onCycleOptions("previousOption")}
            >
              <FontAwesomeIcon icon={faChevronUp} />
            </button>
            <button
              type="button"
              aria-label="Next continuation"
              title="Next continuation (Arrow Down)"
              onClick={() => onCycleOptions("nextOption")}
            >
              <FontAwesomeIcon icon={faChevronDown} />
            </button>
          </div>
        </div>
      ) : null}
      <div
        className={`analysisTree ${inline ? "inline" : "nonInline"}`}
        role="list"
        aria-label="Analysis variations"
      >
        {content}
      </div>
    </>
  );
};
