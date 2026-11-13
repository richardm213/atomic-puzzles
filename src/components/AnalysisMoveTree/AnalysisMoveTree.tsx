import "./AnalysisMoveTree.css";

import { faArrowRight, faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";

import {
  buildIndexedSolutionMoveTree,
  type IndexedSolutionMoveNode,
  movePrefix,
  orderedChildren,
  splitSolutionMove,
} from "../../lib/chess/pgn";
import {
  buildTranspositionMoveTree,
  type TranspositionMoveNode,
} from "../../lib/chess/transpositions";
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

export type PreviousMove = { ply: number; san: string };

type CycleOptions = (command: Extract<PlaybackCommand, "previousOption" | "nextOption">) => void;

export const AnalysisContinuationChoices = ({
  lines,
  moves,
  currentPly,
  pinnedLineIndex,
  initialPly = 0,
  onSelect,
  onCycleOptions,
}: {
  lines: string[][];
  moves: string[];
  currentPly: number;
  pinnedLineIndex?: number | undefined;
  initialPly?: number | undefined;
  onSelect: (lineIndex: number, moveIndex: number) => void;
  onCycleOptions?: CycleOptions | undefined;
}) => {
  const matchingLines = matchingLineIndexes(lines, moves.slice(0, currentPly));
  const options = variationOptions(lines, currentPly, matchingLines);
  if (options.length < 2) return null;

  const activeLine = activeLineIndex(matchingLines, pinnedLineIndex ?? null);
  const activeMove =
    options.find((option) => option.lineIndex === activeLine)?.move ?? options[0]?.move;
  const ply = initialPly + currentPly;

  return (
    <div className="analysisContinuationChoices" role="group" aria-label="Choose continuation">
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
            {movePrefix(ply, ply % 2 === 1)}
            {option.move}
          </button>
        ))}
      </div>
      {onCycleOptions && (
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
      )}
    </div>
  );
};

const BLOCK_VARIATION_MIN_PLIES = 5;

const visibleMoveNode = (
  tree: IndexedSolutionMoveNode,
  lines: string[][],
  lineIndex: number,
  currentPly: number,
): IndexedSolutionMoveNode | undefined => {
  let node: IndexedSolutionMoveNode | undefined = tree;
  for (let ply = 0; ply < currentPly; ply++) {
    const target = (node as TranspositionMoveNode | undefined)?.transposition;
    if (target) {
      node = tree;
      for (let index = 0; index <= target.moveIndex; index++) {
        node = node?.children.get(lines[target.lineIndex]?.[index] ?? "");
      }
    }
    node = node?.children.get(lines[lineIndex]?.[ply] ?? "");
  }
  return node;
};

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
  previousMove,
  beforePreviousMove = false,
  onSelectPreviousMove,
  onSelect,
  onCycleOptions,
  onAnnotate,
  onDelete,
  assessments = [],
  initialFen,
}: {
  lines: string[][];
  moves: string[];
  currentPly: number;
  pinnedLineIndex?: number | undefined;
  initialPly?: number | undefined;
  inline?: boolean;
  previousMove?: PreviousMove | undefined;
  beforePreviousMove?: boolean | undefined;
  onSelectPreviousMove?: (() => void) | undefined;
  onSelect: (lineIndex: number, moveIndex: number) => void;
  onCycleOptions?: CycleOptions | undefined;
  onAnnotate?: ((lineIndex: number, moveIndex: number, annotation: string) => void) | undefined;
  onDelete?: ((lineIndex: number, moveIndex: number) => void) | undefined;
  assessments?: GameMoveAssessment[] | undefined;
  initialFen?: string | undefined;
}) => {
  const [annotationTarget, setAnnotationTarget] = useState<{
    lineIndex: number;
    moveIndex: number;
    current: string;
    position: AnnotationMenuPosition;
  } | null>(null);
  const closeAnnotationMenu = useCallback(() => setAnnotationTarget(null), []);
  const tree = useMemo(
    () =>
      initialFen
        ? buildTranspositionMoveTree(initialFen, lines)
        : buildIndexedSolutionMoveTree(lines),
    [initialFen, lines],
  );

  if (!lines.length && !previousMove) return null;

  const currentMoves = moves.slice(0, currentPly);
  const matchingLines = matchingLineIndexes(lines, currentMoves);
  const activeLine = activeLineIndex(matchingLines, pinnedLineIndex ?? null);
  const activeMove = initialFen ? visibleMoveNode(tree, lines, activeLine, currentPly) : undefined;

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
    const current = initialFen
      ? node === activeMove
      : node.lineIndexes.has(activeLine) && currentPly === ply + 1;
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
    const target = (parent as TranspositionMoveNode).transposition;
    if (target)
      return [
        <button
          key={`${keyPrefix}-transposition`}
          type="button"
          className="analysisTreeMove transpositionJump"
          aria-label="Go to original continuation"
          title="Go to original continuation"
          onClick={() => onSelect(target.lineIndex, target.moveIndex)}
        >
          <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
        </button>,
      ];
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
      <div
        className={`analysisTree ${inline ? "inline" : "nonInline"}`}
        role="list"
        aria-label="Analysis variations"
      >
        {previousMove ? (
          <button
            type="button"
            className={`analysisTreeMove ${currentPly === 0 && !beforePreviousMove ? "active" : ""}`}
            aria-label={`${movePrefix(previousMove.ply, true).trim()} ${previousMove.san}`}
            aria-current={currentPly === 0 && !beforePreviousMove ? "step" : undefined}
            onClick={onSelectPreviousMove}
          >
            <span className="visuallyHidden">Opponent’s previous move: </span>
            <span className="analysisTreeMoveNumber">{movePrefix(previousMove.ply, true)}</span>
            {previousMove.san}
          </button>
        ) : null}
        {renderContinuations(tree, 0, "root", 0, !previousMove && initialPly % 2 === 1)}
      </div>
      {onCycleOptions && (
        <AnalysisContinuationChoices
          lines={lines}
          moves={moves}
          currentPly={currentPly}
          pinnedLineIndex={pinnedLineIndex}
          initialPly={initialPly}
          onSelect={onSelect}
          onCycleOptions={onCycleOptions}
        />
      )}
      {annotationTarget && (onAnnotate || onDelete) ? (
        <MoveAnnotationMenu
          position={annotationTarget.position}
          current={annotationTarget.current}
          onClose={closeAnnotationMenu}
          onSelect={
            onAnnotate
              ? (annotation) =>
                  onAnnotate(annotationTarget.lineIndex, annotationTarget.moveIndex, annotation)
              : undefined
          }
          onDelete={
            onDelete
              ? () => onDelete(annotationTarget.lineIndex, annotationTarget.moveIndex)
              : undefined
          }
        />
      ) : null}
    </>
  );
};
