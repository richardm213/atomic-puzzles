import { useCallback, useEffect, useRef, useState } from "react";

import { splitSolutionMove } from "../../lib/chess/pgn";
import type { GameMoveAssessment } from "../../lib/gameAnalysis/gameAnalysis";
import {
  type AnnotationMenuPosition,
  annotationMenuPosition,
  MoveAnnotationMenu,
} from "../MoveAnnotationMenu/MoveAnnotationMenu";

export type MovePair = {
  number: number;
  white: string | undefined;
  black: string | undefined;
  whitePly: number;
  blackPly: number;
};

export const pairPlayedMoves = (moves: string[]): MovePair[] => {
  const pairs: MovePair[] = [];

  for (let index = 0; index < moves.length; index += 2) {
    pairs.push({
      number: Math.floor(index / 2) + 1,
      white: moves[index],
      black: moves[index + 1],
      whitePly: index + 1,
      blackPly: index + 2,
    });
  }

  return pairs;
};

export const PlayedMoves = ({
  moves,
  currentPly,
  onNavigate,
  onAnnotate,
  onDelete,
  assessments = [],
}: {
  moves: string[];
  currentPly: number;
  onNavigate: (ply: number) => void;
  onAnnotate?: ((moveIndex: number, annotation: string) => void) | undefined;
  onDelete?: ((moveIndex: number) => void) | undefined;
  assessments?: GameMoveAssessment[] | undefined;
}) => {
  const activeMoveRef = useRef<HTMLButtonElement | null>(null);
  const [annotationTarget, setAnnotationTarget] = useState<{
    moveIndex: number;
    current: string;
    position: AnnotationMenuPosition;
  } | null>(null);
  const closeAnnotationMenu = useCallback(() => setAnnotationTarget(null), []);
  const visibleAssessment = (ply: number): GameMoveAssessment | undefined => {
    const assessment = assessments[ply - 1];
    return assessment?.classification === "best" ? undefined : assessment;
  };

  useEffect(() => {
    activeMoveRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [currentPly]);

  return (
    <>
      <ol className="analysisMoveList" aria-label="Played moves" aria-live="polite">
        {pairPlayedMoves(moves).map((pair) => (
          <li key={pair.number}>
            <span className="analysisMoveNumber">{pair.number}.</span>
            {pair.white ? (
              <button
                ref={currentPly === pair.whitePly ? activeMoveRef : undefined}
                type="button"
                className={`${currentPly === pair.whitePly ? "active" : ""} ${visibleAssessment(pair.whitePly)?.classification ?? ""}`}
                aria-current={currentPly === pair.whitePly ? "step" : undefined}
                onClick={() => {
                  onNavigate(pair.whitePly);
                }}
                onContextMenu={
                  onAnnotate || onDelete
                    ? (event) => {
                        event.preventDefault();
                        setAnnotationTarget({
                          moveIndex: pair.whitePly - 1,
                          current: splitSolutionMove(pair.white).annotation,
                          position: annotationMenuPosition(event),
                        });
                      }
                    : undefined
                }
                title={onAnnotate || onDelete ? "Right-click to edit move" : undefined}
              >
                <span>{pair.white}</span>
                {visibleAssessment(pair.whitePly) ? (
                  <b aria-label={visibleAssessment(pair.whitePly)!.classification}>
                    {visibleAssessment(pair.whitePly)!.symbol}
                  </b>
                ) : null}
              </button>
            ) : (
              <span />
            )}
            {pair.black ? (
              <button
                ref={currentPly === pair.blackPly ? activeMoveRef : undefined}
                type="button"
                className={`${currentPly === pair.blackPly ? "active" : ""} ${visibleAssessment(pair.blackPly)?.classification ?? ""}`}
                aria-current={currentPly === pair.blackPly ? "step" : undefined}
                onClick={() => {
                  onNavigate(pair.blackPly);
                }}
                onContextMenu={
                  onAnnotate || onDelete
                    ? (event) => {
                        event.preventDefault();
                        setAnnotationTarget({
                          moveIndex: pair.blackPly - 1,
                          current: splitSolutionMove(pair.black).annotation,
                          position: annotationMenuPosition(event),
                        });
                      }
                    : undefined
                }
                title={onAnnotate || onDelete ? "Right-click to edit move" : undefined}
              >
                <span>{pair.black}</span>
                {visibleAssessment(pair.blackPly) ? (
                  <b aria-label={visibleAssessment(pair.blackPly)!.classification}>
                    {visibleAssessment(pair.blackPly)!.symbol}
                  </b>
                ) : null}
              </button>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ol>
      {annotationTarget && (onAnnotate || onDelete) ? (
        <MoveAnnotationMenu
          position={annotationTarget.position}
          current={annotationTarget.current}
          onClose={closeAnnotationMenu}
          onSelect={
            onAnnotate
              ? (annotation) => onAnnotate(annotationTarget.moveIndex, annotation)
              : undefined
          }
          onDelete={onDelete ? () => onDelete(annotationTarget.moveIndex) : undefined}
        />
      ) : null}
    </>
  );
};
