import "./PuzzleSubmission.css";

import {
  faCheck,
  faChevronLeft,
  faChevronRight,
  faCopy,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";

import { Chessboard } from "../../components/Chessboard/Chessboard";
import {
  continuationOptionsAt,
  SolutionMoveTree,
  SolutionPlaybackControls,
} from "../../components/SolutionMoveNavigation/SolutionMoveNavigation";
import {
  ensurePuzzlePgnHeaders,
  parsePuzzlePgnInput,
  type PuzzleSubmissionValue,
  splitPuzzlePgnBatch,
  validateParsedPuzzleSubmission,
  validatePuzzleSubmission,
} from "../../lib/puzzles/puzzleSubmission";
import {
  convertUciLineToSan,
  mergeAdditiveSolutionLine,
  parseSolutionUciLines,
  serializeSanLinesToPgn,
} from "../../lib/puzzles/solutionPgn";
import type { ChessboardState, PlaybackCommand, SolutionNavigation } from "../../types/chessboard";
import { copyTextToClipboard } from "../../utils/clipboard";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const combinePgnHeadersAndMoves = (headers: string, moves: string): string =>
  headers && moves ? `${headers}\n\n${moves}` : headers || moves;

const multilineSolutionPgn = (pgn: string): string =>
  pgn
    .replace(/\s*\(\s*/g, "\n(")
    .replace(/\s*\)\s*/g, ")\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

const sameBoardMove = (solutionMove: string, boardMove: string | undefined): boolean =>
  solutionMove.replace(/[!?]+$/g, "") === boardMove;

const orientationFromFen = (fen: string): "white" | "black" =>
  fen.split(" ")[1] === "b" ? "black" : "white";

const editorPgnState = (solution: string, fallbackFen: string) => {
  try {
    const parsed = parsePuzzlePgnInput(solution, fallbackFen);
    const fen = parsed.fen || fallbackFen;
    const headers = ensurePuzzlePgnHeaders(parsed.headerText, fen);
    return {
      fen,
      draft: combinePgnHeadersAndMoves(headers, parsed.solution),
    };
  } catch {
    return { fen: fallbackFen, draft: solution };
  }
};

type PuzzleEditorFeedback = {
  tone: "error" | "success";
  text: ReactNode;
};

type PuzzleEditorProps = {
  value: PuzzleSubmissionValue;
  onChange: (value: PuzzleSubmissionValue) => void;
  resetKey: string | number;
  actions?: ReactNode;
  feedback?: PuzzleEditorFeedback | undefined;
  showCopyPgn?: boolean;
  allowSolutionEditing?: boolean;
  readOnly?: boolean;
  showExplanation?: boolean;
  batchMode?: boolean;
  batchPosition?: { current: number; total: number };
  onBatchLoad?: (values: PuzzleSubmissionValue[]) => void;
  onPreviousPuzzle?: () => void;
  onNextPuzzle?: () => void;
};

export const PuzzleEditor = ({
  value,
  onChange,
  resetKey,
  actions,
  feedback,
  showCopyPgn = false,
  allowSolutionEditing = false,
  readOnly = false,
  showExplanation = true,
  batchMode = false,
  batchPosition,
  onBatchLoad,
  onPreviousPuzzle,
  onNextPuzzle,
}: PuzzleEditorProps) => {
  const [initialPgnState] = useState(() =>
    editorPgnState(value.solution, value.fen || STARTING_FEN),
  );
  const [appliedFen, setAppliedFen] = useState(initialPgnState.fen);
  const [solutionDraft, setSolutionDraft] = useState(initialPgnState.draft);
  const [orientation, setOrientation] = useState<"white" | "black">(() =>
    orientationFromFen(initialPgnState.fen),
  );
  const [navigation, setNavigation] = useState<SolutionNavigation | null>(null);
  const [boardState, setBoardState] = useState<ChessboardState | null>(null);
  const [editorError, setEditorError] = useState("");
  const [activeLineIndex, setActiveLineIndex] = useState(0);
  const [copyPgnLabel, setCopyPgnLabel] = useState("Copy PGN");
  const copyResetTimerRef = useRef<number | null>(null);
  const savedBoardLineRef = useRef("");
  const fixedFenRef = useRef<string | null>(value.solution.trim() ? initialPgnState.fen : null);
  const solutionInputId = useId();
  const canEditSolution = allowSolutionEditing && !readOnly;
  const solutionLocked = readOnly || (Boolean(value.solution.trim()) && !canEditSolution);

  const solutionMovetext = useMemo(() => {
    try {
      return parsePuzzlePgnInput(value.solution, appliedFen).solution;
    } catch {
      return value.solution;
    }
  }, [appliedFen, value.solution]);

  const solutionUciLines = useMemo(
    () => parseSolutionUciLines(appliedFen, solutionMovetext),
    [appliedFen, solutionMovetext],
  );

  const solutionLines = useMemo(
    () =>
      solutionUciLines
        .map((line) => convertUciLineToSan(appliedFen, line))
        .filter((line) => line.length > 0),
    [appliedFen, solutionUciLines],
  );

  useEffect(() => {
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = null;
    }
    setCopyPgnLabel("Copy PGN");
    const nextPgnState = editorPgnState(value.solution, value.fen || STARTING_FEN);
    const nextFen = nextPgnState.fen;
    setAppliedFen(nextFen);
    setSolutionDraft(nextPgnState.draft);
    setOrientation(orientationFromFen(nextFen));
    setEditorError("");
    savedBoardLineRef.current = "";
    fixedFenRef.current = value.solution.trim() ? nextFen : null;
    setActiveLineIndex(0);
    setNavigation(
      value.solution.trim()
        ? {
            type: "solution",
            line: 0,
            ply: 0,
          }
        : { type: "reset", fen: nextFen },
    );
    // resetKey intentionally identifies a newly selected puzzle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(
    () => () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    },
    [],
  );

  const applySolutionDraft = (): void => {
    try {
      if (batchMode && onBatchLoad) {
        const pgns = splitPuzzlePgnBatch(solutionDraft);
        if (pgns.length > 1) {
          const normalizedBatch = pgns.map((pgn, index) => {
            try {
              return validatePuzzleSubmission({ ...value, solution: pgn, explanation: "" });
            } catch (error) {
              const detail = error instanceof Error ? error.message : "Invalid PGN.";
              throw new Error(`Puzzle ${index + 1}: ${detail}`);
            }
          });
          setEditorError("");
          onBatchLoad(normalizedBatch);
          return;
        }
      }

      const parsed = parsePuzzlePgnInput(solutionDraft, appliedFen);
      const nextFen = parsed.fen || appliedFen;
      const nextHeaders = ensurePuzzlePgnHeaders(parsed.headerText, nextFen);

      if (canEditSolution && fixedFenRef.current !== null && nextFen !== fixedFenRef.current) {
        throw new Error(
          "The puzzle FEN and initial position cannot be changed after the solution is loaded.",
        );
      }

      if (!parsed.solution) {
        if (canEditSolution) {
          throw new Error("Enter at least one move.");
        }
        onChange({ ...value, fen: nextFen, solution: "" });
        setAppliedFen(nextFen);
        setOrientation(orientationFromFen(nextFen));
        setNavigation({ type: "reset", fen: nextFen });
        setEditorError("Enter at least one move.");
        return;
      }

      const normalized = validateParsedPuzzleSubmission(value, parsed);
      if (canEditSolution && fixedFenRef.current === null) {
        fixedFenRef.current = normalized.fen;
      }
      onChange(normalized);
      setSolutionDraft(combinePgnHeadersAndMoves(nextHeaders, parsed.solution));
      setAppliedFen(normalized.fen);
      setOrientation(orientationFromFen(normalized.fen));
      setEditorError("");
      setNavigation({
        type: "solution",
        line: 0,
        ply: 0,
      });
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Invalid move line.");
    }
  };

  const handleSolutionChange = (solution: string): void => {
    setSolutionDraft(solution);
    setEditorError("");

    if (!canEditSolution) return;

    try {
      const parsed = parsePuzzlePgnInput(solution, appliedFen);
      if (fixedFenRef.current !== null && parsed.fen !== fixedFenRef.current) {
        setEditorError(
          "The puzzle FEN and initial position cannot be changed after the solution is loaded.",
        );
        return;
      }
      const normalized = validateParsedPuzzleSubmission(value, parsed);
      if (fixedFenRef.current === null) fixedFenRef.current = normalized.fen;
      onChange(normalized);
      setAppliedFen(normalized.fen);
      setOrientation(orientationFromFen(normalized.fen));
      setActiveLineIndex(0);
      setNavigation({
        type: "solution",
        line: 0,
        ply: 0,
      });
    } catch {
      // Keep the last valid board and move tree while the replacement PGN is incomplete.
    }
  };

  const copyPgn = async (): Promise<void> => {
    const copied = await copyTextToClipboard(solutionDraft);
    setCopyPgnLabel(copied ? "Copied" : "Copy failed");
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = window.setTimeout(() => {
      setCopyPgnLabel("Copy PGN");
      copyResetTimerRef.current = null;
    }, 1_500);
  };

  const navigate = (command: PlaybackCommand): void => {
    setNavigation({ type: "command", command });
  };

  const navigateToMove = (lineIndex: number, moveIndex: number): void => {
    const line = solutionLines[lineIndex];
    if (!line) return;

    setActiveLineIndex(lineIndex);
    setNavigation({ type: "solution", line: lineIndex, ply: moveIndex + 1 });
  };

  const commitSolutionLines = (nextLines: string[][], targetLineIndex: number): void => {
    const parsedDraft = parsePuzzlePgnInput(solutionDraft, appliedFen);
    const headers = ensurePuzzlePgnHeaders(parsedDraft.headerText, appliedFen);

    if (nextLines.length === 0) {
      const nextDraft = combinePgnHeadersAndMoves(headers, "");
      savedBoardLineRef.current = "";
      setSolutionDraft(nextDraft);
      setEditorError("");
      setActiveLineIndex(0);
      onChange({ ...value, solution: "" });
      setNavigation({ type: "reset", fen: appliedFen });
      return;
    }

    const nextMovetext = multilineSolutionPgn(serializeSanLinesToPgn(appliedFen, nextLines));
    const nextDraft = combinePgnHeadersAndMoves(headers, nextMovetext);
    const normalized = validateParsedPuzzleSubmission(value, {
      ...parsedDraft,
      fen: appliedFen,
      solution: nextMovetext,
    });
    const nextActiveLineIndex = Math.min(targetLineIndex, nextLines.length - 1);

    if (fixedFenRef.current === null) fixedFenRef.current = appliedFen;
    setSolutionDraft(nextDraft);
    setEditorError("");
    setActiveLineIndex(nextActiveLineIndex);
    onChange(normalized);
    setNavigation({
      type: "solution",
      line: nextActiveLineIndex,
      ply: nextLines[nextActiveLineIndex]?.length ?? 0,
    });
  };

  const deleteCurrentLine = (): void => {
    if (!canEditSolution || !solutionLines[activeLineIndex]) return;

    try {
      commitSolutionLines(
        solutionLines.filter((_, lineIndex) => lineIndex !== activeLineIndex),
        Math.max(0, activeLineIndex - 1),
      );
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Unable to delete line.");
    }
  };

  const handleBoardState = (state: ChessboardState): void => {
    setBoardState(state);
    if (state.viewingSolution) setActiveLineIndex(state.solutionLineIndex ?? 0);
    if (state.error) {
      setEditorError(state.error);
    }

    if (!canEditSolution || state.viewingSolution || state.customLineIndex === undefined) {
      return;
    }

    const nextLine = state.lineMoves ?? [];
    const currentLine = solutionLines[activeLineIndex];
    const boardLineKey = `${activeLineIndex}:${nextLine.join(" ")}`;
    if (!nextLine.length || savedBoardLineRef.current === boardLineKey) {
      return;
    }
    savedBoardLineRef.current = boardLineKey;

    try {
      const editedLine = nextLine.map((move, moveIndex) =>
        currentLine?.[moveIndex] && sameBoardMove(currentLine[moveIndex], move)
          ? currentLine[moveIndex]
          : move,
      );
      const followsCurrentLineFromMiddle = Boolean(
        currentLine &&
        editedLine.length < currentLine.length &&
        editedLine.every((move, moveIndex) => sameBoardMove(currentLine[moveIndex]!, move)),
      );
      if (followsCurrentLineFromMiddle) {
        return;
      }

      const mergedLine = mergeAdditiveSolutionLine(
        solutionLines,
        editedLine,
        currentLine ? activeLineIndex : undefined,
        sameBoardMove,
      );
      if (!mergedLine.changed) {
        setActiveLineIndex(mergedLine.lineIndex);
        setNavigation({ type: "solution", line: mergedLine.lineIndex, ply: editedLine.length });
        return;
      }

      commitSolutionLines(mergedLine.lines, mergedLine.lineIndex);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Unable to edit line.");
    }
  };

  const currentPly = boardState?.lineIndex ?? 0;
  const moveCount = boardState?.lineMoves?.length ?? 0;
  const currentMoves = useMemo(
    () => boardState?.lineMoves?.slice(0, currentPly) ?? [],
    [boardState?.lineMoves, currentPly],
  );
  const variationOptionList = useMemo(
    () => continuationOptionsAt(solutionLines, currentMoves),
    [currentMoves, solutionLines],
  );

  return (
    <div className="puzzleEditor">
      <div className="puzzleEditorBoard">
        <Chessboard
          puzzleId={`puzzle-editor-${resetKey}`}
          fen={appliedFen}
          orientation={orientation}
          coordinates
          solution={value.solution}
          solutionUciLines={solutionUciLines}
          showSolution={readOnly}
          analysisMode={!readOnly}
          captureNavigationShortcuts
          preserveAnalysisHistoryOnSolutionChange
          restrictMovesToSolution={!canEditSolution}
          solutionNavigation={navigation}
          onNavigateHandled={() => {
            setNavigation(null);
          }}
          onStateChange={handleBoardState}
        />
        {batchPosition && batchPosition.total > 1 ? (
          <nav className="puzzleBatchNavigation" aria-label="Batch puzzles">
            <button type="button" disabled={batchPosition.current === 0} onClick={onPreviousPuzzle}>
              <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
              Previous
            </button>
            <span>
              Puzzle {batchPosition.current + 1} of {batchPosition.total}
            </span>
            <button
              type="button"
              disabled={batchPosition.current === batchPosition.total - 1}
              onClick={onNextPuzzle}
            >
              Next
              <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
            </button>
          </nav>
        ) : null}
        {solutionLines.length ? (
          <section className="puzzleEditorMoves" aria-label="Solution moves">
            <div className="puzzleEditorMovesHeader">
              <div>
                <strong>Moves</strong>
                <span>
                  {solutionLines.length > 1 ? `${solutionLines.length} solutions` : "1 solution"}
                </span>
              </div>
              <div className="puzzleEditorPlayback">
                {canEditSolution ? (
                  <button
                    type="button"
                    className="puzzleDeleteLineButton"
                    aria-label="Delete current line"
                    title="Delete current line"
                    onClick={deleteCurrentLine}
                  >
                    <FontAwesomeIcon icon={faTrashCan} aria-hidden="true" />
                  </button>
                ) : null}
                <SolutionPlaybackControls
                  canStart={currentPly > 0}
                  canPrevious={currentPly > 0}
                  canNext={currentPly < moveCount}
                  canEnd={currentPly < moveCount}
                  onNavigate={navigate}
                />
              </div>
            </div>
            <SolutionMoveTree
              lines={solutionLines}
              options={variationOptionList}
              currentPly={currentPly}
              activeLineIndex={activeLineIndex}
              onSelect={navigateToMove}
            />
          </section>
        ) : null}
      </div>

      <div className="puzzleEditorFields">
        <div className="puzzleEditorSolutionField">
          <div className="puzzleEditorFieldHeader">
            <label htmlFor={solutionInputId}>{batchMode ? "Solutions PGNs" : "Solution PGN"}</label>
            {showCopyPgn ? (
              <button type="button" className="puzzleCopyPgnButton" onClick={() => void copyPgn()}>
                <FontAwesomeIcon
                  icon={copyPgnLabel === "Copied" ? faCheck : faCopy}
                  aria-hidden="true"
                />
                {copyPgnLabel}
              </button>
            ) : null}
          </div>
          <textarea
            id={solutionInputId}
            value={solutionDraft}
            rows={6}
            required
            readOnly={solutionLocked}
            spellCheck={false}
            onChange={(event) => handleSolutionChange(event.target.value)}
            onBlur={solutionLocked ? undefined : applySolutionDraft}
          />
        </div>

        <label>
          <span className="puzzleEditorLabelHeader">
            <span>Event</span>
            <small>Same event creates a puzzle set</small>
          </span>
          <input
            type="text"
            aria-label="Event"
            value={value.event}
            placeholder="Optional event name"
            readOnly={readOnly}
            onChange={(event) => onChange({ ...value, event: event.target.value })}
          />
        </label>

        {showExplanation ? (
          <label className="puzzleEditorExplanationField">
            <span>Explanation</span>
            <textarea
              value={value.explanation}
              rows={5}
              spellCheck
              readOnly={readOnly}
              onChange={(event) => onChange({ ...value, explanation: event.target.value })}
            />
          </label>
        ) : null}
        {editorError ? <p className="queueMessage error">{editorError}</p> : null}
        {!editorError && feedback ? (
          <p className={`queueMessage ${feedback.tone}`}>{feedback.text}</p>
        ) : null}
        {actions}
      </div>
    </div>
  );
};
