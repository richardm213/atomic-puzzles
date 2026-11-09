import "./AnalysisMoveTree.css";

import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";

import {
  buildIndexedSolutionMoveTree,
  type IndexedSolutionMoveNode,
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

const BLOCK_VARIATION_MIN_PLIES = 5;

const isLongVariation = (node: IndexedSolutionMoveNode): boolean => {
  let current: IndexedSolutionMoveNode | undefined = node;
  for (let plies = 1; current; plies++) {
    if (plies >= BLOCK_VARIATION_MIN_PLIES || current.children.size > 1) return true;
    current = current.children.values().next().value;
  }
  return false;
};

export const AnalysisMoveTree = ({
  lines,
  moves,
  currentPly,
  pinnedLineIndex,
  initialPly = 0,
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
  initialPly?: number | undefined;
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
  const tree = buildIndexedSolutionMoveTree(lines);

  const renderMove = (
    node: IndexedSolutionMoveNode,
    ply: number,
    keyPrefix: string,
    forceMoveNumber = false,
  ): ReactNode => {
    const prefix = movePrefix(initialPly + ply, forceMoveNumber);
    const indexes = [...node.lineIndexes].sort((left, right) => left - right);
    const targetLine = node.lineIndexes.has(activeLine) ? activeLine : (indexes[0] ?? 0);
    const mainlineAssessment = node.lineIndexes.has(0) ? assessments[ply] : undefined;
    const visibleAssessment =
      mainlineAssessment?.classification === "best" ? undefined : mainlineAssessment;
    const current = node.lineIndexes.has(activeLine) && currentPly === ply + 1;
    return (
      <button
        key={`${keyPrefix}-move-${ply}-${node.move}`}
        type="button"
        className={`analysisTreeMove ${visibleAssessment?.classification ?? ""} ${current ? "active" : ""}`}
        aria-label={[prefix.trim(), node.move, visibleAssessment?.classification]
          .filter(Boolean)
          .join(" ")}
        aria-current={current ? "step" : undefined}
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
        {prefix ? <span className="analysisTreeMoveNumber">{prefix.trim()}</span> : null}
        {node.move}
        {visibleAssessment ? (
          <b aria-label={visibleAssessment.classification}>{visibleAssessment.symbol}</b>
        ) : null}
      </button>
    );
  };

  const renderContinuations = (
    parent: IndexedSolutionMoveNode,
    ply: number,
    keyPrefix: string,
    preferredLine: number,
    forceMoveNumber = false,
  ): ReactNode[] => {
    const children = orderedChildren(parent);
    const main = children.find((child) => child.lineIndexes.has(preferredLine)) ?? children[0];
    if (!main) return [];
    const variations = children.filter((child) => child !== main);
    return [
      renderMove(main, ply, keyPrefix, forceMoveNumber),
      ...variations.map((variation, index) => {
        const key = `${keyPrefix}-variation-${ply}-${index}`;
        const block = !inline || isLongVariation(variation);
        return (
          <span key={key} className={`analysisTreeVariation${block ? " block" : ""}`}>
            {block ? null : <span aria-hidden="true">(</span>}
            {renderMove(variation, ply, key, true)}
            {renderContinuations(
              variation,
              ply + 1,
              key,
              variation.firstOccurrence?.lineIndex ?? 0,
            )}
            {block ? null : <span aria-hidden="true">)</span>}
          </span>
        );
      }),
      ...renderContinuations(main, ply + 1, keyPrefix, preferredLine, variations.length > 0),
    ];
  };

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
                {movePrefix(initialPly + currentPly, (initialPly + currentPly) % 2 === 1)}
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
        {renderContinuations(tree, 0, "root", 0, initialPly % 2 === 1)}
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
