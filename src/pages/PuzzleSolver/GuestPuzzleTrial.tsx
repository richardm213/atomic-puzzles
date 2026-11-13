import "./PuzzleSolver.css";
import "./GuestPuzzleTrial.css";

import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { makeSquare } from "chessops/util";
import { useEffect, useMemo, useRef, useState } from "react";

import { Chessboard } from "../../components/Chessboard/Chessboard";
import { PuzzleLoginScreen } from "../../components/RequireAuthentication/RequireAuthentication";
import { createAtomicPosition } from "../../lib/chess/pgn";
import { boardPly, type ChessboardState } from "../../types/chessboard";
import { orientationFromFen } from "../../utils/chessNotation";
import { GUEST_PUZZLES } from "./guestPuzzles";
import { PuzzlePositionRows } from "./PuzzlePositionRows";

// The original five positions were replaced, so their count cannot index this set.
const PROGRESS_KEY = "atomic-puzzles:guest-trial:v2";
const GUEST_PUZZLE_ROUTE = "/solve/guest/$guestNumber";
let progressInMemory = 0;

const readProgress = (): number => {
  try {
    const count = Number(window.localStorage.getItem(PROGRESS_KEY));
    if (Number.isInteger(count) && count >= 0 && count <= GUEST_PUZZLES.length) {
      return Math.max(count, progressInMemory);
    }
  } catch {
    // Storage can be unavailable; the trial still works in memory.
  }
  return progressInMemory;
};

const saveProgress = (count: number): void => {
  // Replaying an earlier URL must not overwrite later progress.
  progressInMemory = Math.max(readProgress(), count);
  try {
    window.localStorage.setItem(PROGRESS_KEY, String(progressInMemory));
  } catch {
    // Progress is still kept for the current visit.
  }
};

const GuestPuzzle = ({
  index,
  puzzle,
  onSolved,
  onNext,
}: {
  index: number;
  puzzle: (typeof GUEST_PUZZLES)[number];
  onSolved: () => void;
  onNext: () => void;
}) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [boardState, setBoardState] = useState<ChessboardState>();
  const solved = boardState?.solved ?? false;
  const liveFen = boardState?.fen || puzzle.fen;
  const position = useMemo(
    () => (solved ? null : createAtomicPosition(liveFen)),
    [liveFen, solved],
  );
  const orientation = orientationFromFen(puzzle.fen);
  const last = index + 1 === GUEST_PUZZLES.length;
  const missed = Boolean(boardState?.feedback === "wrong" || boardState?.feedback === "retry");
  const feedback = solved
    ? "Solved!"
    : missed
      ? "Try another move."
      : boardPly(boardState)
        ? "Good move. Keep going."
        : "";

  useEffect(() => {
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (solved) nextRef.current?.focus();
  }, [solved]);

  return (
    <section data-board-resize="guest" className="guestPuzzleTrial" aria-labelledby="guest-puzzle-title">
      <div className="boardWrap guestPuzzleBoard">
        <div
          className={`boardFrame${solved ? " hasFeedback correct" : missed ? " hasFeedback wrong" : ""}`}
        >
          <div className="boardStage">
            <Chessboard
              puzzleId={`guest-${index + 1}`}
              fen={puzzle.fen}
              solution={puzzle.solution}
              orientation={orientation}
              coordinates
              showSolution={false}
              enableNavigationShortcuts={false}
              disabled={solved}
              onAttemptResolved={({ puzzleCorrect }) => {
                if (puzzleCorrect) onSolved();
              }}
              onStateChange={setBoardState}
            />
          </div>
        </div>
      </div>
      <div className="panel puzzlePanel guestPuzzlePanel">
        <header className="guestPuzzleHeader">
          <h1 id="guest-puzzle-title" ref={headingRef} tabIndex={-1}>
            Puzzle {index + 1} of {GUEST_PUZZLES.length}
          </h1>
        </header>
        <PuzzlePositionRows fen={liveFen} showEmpty />
        {position ? (
          <div className="visuallyHidden">
            {(["white", "black"] as const).map((color) => {
              const pieces = Array.from(position.board)
                .filter(([, piece]) => piece.color === color)
                .map(([square, piece]) => `${piece.role} on ${makeSquare(square)}`)
                .join(", ");
              return (
                <p key={color}>{`${color === "white" ? "White" : "Black"} pieces: ${pieces}`}</p>
              );
            })}
          </div>
        ) : null}
        <p
          className="guestPuzzleFeedback"
          role="status"
          data-result={solved ? "solved" : missed ? "missed" : undefined}
        >
          {feedback}
        </p>
        {solved ? (
          <div className="guestPuzzleActions">
            <button type="button" className="guestPuzzleNext" ref={nextRef} onClick={onNext}>
              {last ? "Finish" : "Next puzzle"}
            </button>
            <a href={`https://lichess.org/study/${puzzle.source}`} target="_blank" rel="noreferrer">
              Source study <span className="visuallyHidden">(opens in a new tab)</span>
            </a>
          </div>
        ) : null}
        <p className="guestPuzzleNotice">
          <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
          <span>
            These guest puzzles aren’t representative of the quality of puzzles available after
            login.
          </span>
        </p>
      </div>
    </section>
  );
};

export const GuestPuzzleTrial = ({ guestNumber }: { guestNumber?: string }) => {
  const navigate = useNavigate();
  // Read once per URL so the final solved board stays visible until Finish.
  const [progress] = useState(readProgress);
  const isComplete = progress >= GUEST_PUZZLES.length;

  if (guestNumber === undefined) {
    return (
      <PuzzleLoginScreen
        focusHeading={isComplete}
        guestAction={
          !isComplete
            ? {
                label:
                  progress === 0
                    ? `Try ${GUEST_PUZZLES.length} guest puzzles`
                    : "Resume guest puzzles",
                onClick: () => {
                  void navigate({
                    to: GUEST_PUZZLE_ROUTE,
                    params: { guestNumber: String(progress + 1) },
                  });
                },
              }
            : undefined
        }
      />
    );
  }

  const index = Number(guestNumber) - 1;
  const puzzle = /^[1-9]\d*$/.test(guestNumber) ? GUEST_PUZZLES[index] : undefined;
  if (!puzzle || isComplete) return <Navigate to="/solve" replace />;

  if (index > progress) {
    return (
      <Navigate to={GUEST_PUZZLE_ROUTE} params={{ guestNumber: String(progress + 1) }} replace />
    );
  }

  return (
    <GuestPuzzle
      key={index}
      index={index}
      puzzle={puzzle}
      onSolved={() => saveProgress(index + 1)}
      onNext={() => {
        if (index + 1 === GUEST_PUZZLES.length) {
          void navigate({ to: "/solve", replace: true });
        } else {
          void navigate({ to: GUEST_PUZZLE_ROUTE, params: { guestNumber: String(index + 2) } });
        }
      }}
    />
  );
};
