import "./GuestPuzzleTrial.css";

import { parseSan } from "chessops/san";
import { makeSquare, makeUci } from "chessops/util";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { Chessboard } from "../../components/Chessboard/Chessboard";
import { PuzzleLoginScreen } from "../../components/RequireAuthentication/RequireAuthentication";
import { createAtomicPosition, moveFromUci } from "../../lib/chess/pgn";
import type { ChessboardState, SolutionNavigation } from "../../types/chessboard";
import { orientationFromFen } from "../../utils/chessNotation";
import { GUEST_PUZZLES } from "./guestPuzzles";

const PROGRESS_KEY = "atomic-puzzles:guest-trial:v1";

const readProgress = (): number => {
  try {
    const count = Number(window.localStorage.getItem(PROGRESS_KEY));
    if (Number.isInteger(count) && count >= 0 && count <= GUEST_PUZZLES.length) return count;
  } catch {
    // Storage can be unavailable; the trial still works in memory.
  }
  return 0;
};

const saveProgress = (count: number): void => {
  try {
    window.localStorage.setItem(PROGRESS_KEY, String(count));
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
  const [moveError, setMoveError] = useState("");
  const [moveCommand, setMoveCommand] = useState<SolutionNavigation | null>(null);
  const [position] = useState(() => createAtomicPosition(puzzle.fen));
  const solved = boardState?.solved ?? false;
  const orientation = orientationFromFen(puzzle.fen);
  const last = index + 1 === GUEST_PUZZLES.length;
  const feedback =
    moveError ||
    (solved
      ? "Solved!"
      : boardState?.showWrongMove || boardState?.showRetryMove
        ? "Not mate. Try again."
        : "");

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (solved) nextRef.current?.focus();
  }, [solved]);

  const submitMove = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const input = String(new FormData(event.currentTarget).get("move") ?? "").trim();
    const move = /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(input)
      ? moveFromUci(position, input.toLowerCase())
      : parseSan(position, input);
    if (!move || !position.isLegal(move)) {
      setMoveError("Enter a legal move, such as e2e4 or e4.");
      return;
    }
    setMoveError("");
    setMoveCommand({ type: "play", uci: makeUci(move) });
  };

  return (
    <section className="guestPuzzleTrial" aria-labelledby="guest-puzzle-title">
      <header className="guestPuzzleHeader">
        <h1 id="guest-puzzle-title" ref={headingRef} tabIndex={-1}>
          Puzzle {index + 1} of {GUEST_PUZZLES.length}
        </h1>
        <p>{orientation === "white" ? "White" : "Black"} to move · Mate in one</p>
      </header>
      {!solved ? (
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
      <Chessboard
        puzzleId={`guest-${index + 1}`}
        fen={puzzle.fen}
        solution={puzzle.solution}
        orientation={orientation}
        coordinates
        showSolution={false}
        enableNavigationShortcuts={false}
        disabled={solved}
        solutionNavigation={moveCommand}
        onNavigateHandled={() => setMoveCommand(null)}
        onAttemptResolved={({ puzzleCorrect }) => {
          if (puzzleCorrect) onSolved();
        }}
        onStateChange={(state) => {
          setMoveError("");
          setBoardState(state);
        }}
      />
      <div className="guestPuzzleFeedback">
        <p id="guest-puzzle-feedback" role="status">
          {feedback}
        </p>
        {solved ? (
          <button type="button" className="guestPuzzleNext" ref={nextRef} onClick={onNext}>
            {last ? "Finish" : "Next puzzle"}
          </button>
        ) : null}
      </div>
      {!solved ? (
        <details className="guestPuzzleKeyboard">
          <summary>Enter a move by keyboard</summary>
          <form onSubmit={submitMove}>
            <label htmlFor="guest-puzzle-move">Move</label>
            <input
              id="guest-puzzle-move"
              name="move"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-invalid={Boolean(moveError)}
              aria-describedby="guest-puzzle-feedback"
              onChange={() => setMoveError("")}
            />
            <button type="submit">Play move</button>
          </form>
        </details>
      ) : null}
    </section>
  );
};

export const GuestPuzzleTrial = () => {
  // Keep the starting index stable until Next/Finish, even after saving a solve.
  const [index, setIndex] = useState(readProgress);
  const [playing, setPlaying] = useState(false);
  const puzzle = GUEST_PUZZLES[index];

  if (!playing || !puzzle) {
    return (
      <PuzzleLoginScreen
        focusHeading={playing}
        guestAction={
          puzzle
            ? {
                label: index === 0 ? "Try 5 guest puzzles" : "Resume guest puzzles",
                onClick: () => setPlaying(true),
              }
            : undefined
        }
      />
    );
  }

  return (
    <GuestPuzzle
      key={index}
      index={index}
      puzzle={puzzle}
      onSolved={() => saveProgress(index + 1)}
      onNext={() => setIndex(index + 1)}
    />
  );
};
