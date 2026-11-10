import { useEffect, useRef } from "react";

import type { PuzzleLeadIn } from "../../../shared/domain/puzzles/gameHistory";
import { movePrefix, startingPlyFromFen } from "../../lib/chess/pgn";

export const BlindPuzzlePanel = ({
  leadIn,
  played,
  error,
  canGiveUp,
  onGiveUp,
}: {
  leadIn: PuzzleLeadIn;
  played: string[];
  error: string;
  canGiveUp: boolean;
  onGiveUp: () => void;
}) => {
  const listRef = useRef<HTMLOListElement>(null);
  const firstPly = startingPlyFromFen(leadIn.beforeFen);
  useEffect(() => {
    const list = listRef.current;
    if (played.length && list) list.scrollTop = list.scrollHeight;
  }, [played.length]);

  return (
    <section className="puzzleAnalysisPanel puzzleBlindPanel" aria-label="Blind mode">
      <div className="puzzleBlindInstructions">
        <strong>
          Blind mode · {leadIn.moves.length} {leadIn.moves.length === 1 ? "ply" : "plies"}
        </strong>
      </div>
      <ol
        ref={listRef}
        className="puzzleBlindMoves"
        aria-label="Moves from the displayed position"
        aria-live="polite"
      >
        {[...leadIn.moves, ...played].map((san, index) => {
          const ply = firstPly + index;
          return (
            <li key={ply}>
              <span>{movePrefix(ply, index === 0)}</span>
              {san}
            </li>
          );
        })}
      </ol>
      <div className="puzzleBlindError" role="status">
        {error}
      </div>
      {canGiveUp ? (
        <div className="puzzleBlindActions">
          <button type="button" className="analysisToolbarButton" onClick={onGiveUp}>
            Reveal solution
          </button>
        </div>
      ) : null}
    </section>
  );
};
