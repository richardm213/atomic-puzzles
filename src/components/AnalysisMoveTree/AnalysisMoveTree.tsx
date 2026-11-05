import "./AnalysisMoveTree.css";

import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";

import {
  buildSolutionMoveTree,
  findMainChild,
  movePrefix,
  orderedChildren,
  splitSolutionMove,
} from "../../lib/chess/pgn";
import type { GameMoveAssessment } from "../../lib/gameAnalysis/gameAnalysis";
import type { PlaybackCommand } from "../../types/chessboard";
import {
  type AnnotationMenuPosition,
  annotationMenuPosition,
  MoveAnnotationMenu,
} from "../MoveAnnotationMenu/MoveAnnotationMenu";
import {
  activeLineIndex,
  matchingLineIndexes,
  variationOptions,
} from "../VariationTree/VariationTree";

type MoveTreeNode = import("../../lib/chess/pgn").SolutionMoveNode<{
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
  onAnnotate,
  onDelete,
  assessments = [],
}: {
  lines: string[][];
  moves: string[];
  currentPly: number;
  pinnedLineIndex?: number | undefined;
  inline?: boolean;
  onSelect: (lineIndex: number, moveIndex: number) => void;
  onCycleOptions: (command: Extract<PlaybackCommand, "previousOption" | "nextOption">) => void;
  onAnnotate?: ((lineIndex: number, moveIndex: number, annotation: string) => void) | undefined;
  onDelete?: ((lineIndex: number, moveIndex: number) => void) | undefined;
  assessments?: GameMoveAssessment[] | undefined;
}) => {
  const [annotationTarget, setAnnotationTarget] = useState<{
    lineIndex: number;
    moveIndex: number;
    current: string;
    position: AnnotationMenuPosition;
  } | null>(null);
  const closeAnnotationMenu = useCallback(() => setAnnotationTarget(null), []);

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
    const mainlineAssessment = node.lineIndexes.has(0) ? assessments[ply] : undefined;
    const visibleAssessment =
      mainlineAssessment?.classification === "best" ? undefined : mainlineAssessment;
    const content: ReactNode[] = [
      <button
        key={`${keyPrefix}-move-${ply}-${node.move}`}
        type="button"
        className={`analysisTreeMove ${visibleAssessment?.classification ?? ""} ${node.lineIndexes.has(activeLine) && currentPly === ply + 1 ? "active" : ""}`}
        aria-current={
          node.lineIndexes.has(activeLine) && currentPly === ply + 1 ? "step" : undefined
        }
        onClick={() => {
          onSelect(targetLine, ply);
        }}
        onContextMenu={
          onAnnotate || onDelete
            ? (event) => {
                event.preventDefault();
                setAnnotationTarget({
                  lineIndex: targetLine,
                  moveIndex: ply,
                  current: splitSolutionMove(node.move).annotation,
                  position: annotationMenuPosition(event),
                });
              }
            : undefined
        }
        title={onAnnotate || onDelete ? "Right-click to edit move" : undefined}
      >
        {movePrefix(ply, forceMoveNumber)}
        {node.move}
        {visibleAssessment ? (
          <b aria-label={visibleAssessment.classification}>{visibleAssessment.symbol}</b>
        ) : null}
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
      {annotationTarget && (onAnnotate || onDelete) ? (
        <MoveAnnotationMenu
          position={annotationTarget.position}
          current={annotationTarget.current}
          onClose={closeAnnotationMenu}
          onSelect={(annotation) => {
            onAnnotate?.(annotationTarget.lineIndex, annotationTarget.moveIndex, annotation);
            closeAnnotationMenu();
          }}
          onDelete={
            onDelete
              ? () => {
                  onDelete(annotationTarget.lineIndex, annotationTarget.moveIndex);
                  closeAnnotationMenu();
                }
              : undefined
          }
        />
      ) : null}
    </>
  );
};
