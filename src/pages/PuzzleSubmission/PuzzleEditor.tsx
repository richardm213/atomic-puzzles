import "./PuzzleSubmission.css";

import {
  faCheck,
  faChevronLeft,
  faChevronRight,
  faCircleInfo,
  faCopy,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { INITIAL_FEN as STARTING_FEN } from "chessops/fen";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";

import { Chessboard } from "../../components/Chessboard/Chessboard";
import { MoveNotation } from "../../components/MoveNotation/MoveNotation";
import {
  continuationOptionsAt,
  SolutionMoveTree,
  SolutionPlaybackControls,
} from "../../components/SolutionMoveNavigation/SolutionMoveNavigation";
import { AtomicDbAnalysisBlock } from "../../features/analysisWorkspace/AtomicDbAnalysisBlock";
import { useAtomicDbBoardAnalysis } from "../../hooks/useAtomicDbBoardAnalysis";
import { useAtomicDbEngineSettings } from "../../hooks/useAtomicDbEngineSettings";
import { useCopyFeedback } from "../../hooks/useCopyFeedback";
import { buildBoardLoadNavigation } from "../../lib/analysis/boardLoading";
import {
  convertUciLineToSan,
  formatSolutionMove,
  mergeAdditiveSolutionLine,
  parseSolutionUciLines,
  prunePgnLinesFromMove,
  sameSolutionMove,
  serializeSanLinesToPgn,
  splitSolutionMove,
} from "../../lib/chess/pgn";
import {
  ensurePuzzlePgnHeaders,
  parsePuzzlePgnInput,
  type PuzzleSubmissionValue,
  splitPuzzlePgnBatch,
  validateParsedPuzzleSubmission,
  validatePuzzleSubmission,
} from "../../lib/puzzles/puzzleSubmission";
import { createAtomicPosition } from "../../lib/puzzles/solutionPgn";
import type { ChessboardState, PlaybackCommand, SolutionNavigation } from "../../types/chessboard";
import { orientationFromFen } from "../../utils/chessNotation";
import { getErrorMessage } from "../../utils/errors";

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

const OPA_STYLE_DESCRIPTION =
  "Only the best moves are accepted. Weaker alternatives are rejected even if they also lead to mate.";

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
  tone: "error" | "success" | "warning";
  text: ReactNode;
};

type PuzzleEditorProps = {
  value: PuzzleSubmissionValue;
  onChange: (value: PuzzleSubmissionValue) => void;
  resetKey: string | number;
  actions?: ReactNode;
  boardFooter?: ReactNode;
  fieldsBeforeEvent?: ReactNode;
  eventAside?: ReactNode;
  analysisFooter?: ReactNode;
  feedback?: PuzzleEditorFeedback | undefined;
  showCopyPgn?: boolean;
  showSolutionPgnField?: boolean;
  solutionPgnUnderBoard?: boolean;
  allowSolutionEditing?: boolean;
  readOnly?: boolean;
  showExplanation?: boolean;
  showMetadataFields?: boolean;
  batchMode?: boolean;
  batchPosition?: { current: number; total: number };
  onBatchLoad?: (values: PuzzleSubmissionValue[]) => void;
  onPreviousPuzzle?: () => void;
  onNextPuzzle?: () => void;
  showAnalysisEngine?: boolean;
};

const SOLUTION_INPUT_MODE_STORAGE_KEY = "puzzleEditor.solutionInputMode";

const savedSolutionInputMode = (): "pgn" | "fen" => {
  try {
    return window.localStorage.getItem(SOLUTION_INPUT_MODE_STORAGE_KEY) === "fen" ? "fen" : "pgn";
  } catch {
    return "pgn";
  }
};

export const PuzzleEditor = ({
  value,
  onChange,
  resetKey,
  actions,
  boardFooter,
  fieldsBeforeEvent,
  eventAside,
  analysisFooter,
  feedback,
  showCopyPgn = false,
  showSolutionPgnField = true,
  solutionPgnUnderBoard = false,
  allowSolutionEditing = false,
  readOnly = false,
  showExplanation = true,
  showMetadataFields = true,
  batchMode = false,
  batchPosition,
  onBatchLoad,
  onPreviousPuzzle,
  onNextPuzzle,
  showAnalysisEngine = false,
}: PuzzleEditorProps) => {
  const [initialPgnState] = useState(() =>
    editorPgnState(value.solution, value.fen || STARTING_FEN),
  );
  const [appliedFen, setAppliedFen] = useState(initialPgnState.fen);
  const [fenDraft, setFenDraft] = useState(initialPgnState.fen);
  const [solutionDraft, setSolutionDraft] = useState(initialPgnState.draft);
  const [solutionInputMode, setSolutionInputMode] = useState<"pgn" | "fen">(savedSolutionInputMode);
  const [orientation, setOrientation] = useState<"white" | "black">(() =>
    orientationFromFen(initialPgnState.fen),
  );
  const [navigation, setNavigation] = useState<SolutionNavigation | null>(null);
  const [boardState, setBoardState] = useState<ChessboardState | null>(null);
  const [editorError, setEditorError] = useState("");
  const [activeLineIndex, setActiveLineIndex] = useState(0);
  const [hoveredEngineMove, setHoveredEngineMove] = useState<string | null>(null);
  const [engineSettings, setEngineSettings] = useAtomicDbEngineSettings();
  const engineLinePlayingRef = useRef(false);
  const {
    copy: copyToClipboard,
    copyLabel: copyPgnLabel,
    resetCopyFeedback,
  } = useCopyFeedback(1_500);
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
    resetCopyFeedback();
    const nextPgnState = editorPgnState(value.solution, value.fen || STARTING_FEN);
    const nextFen = nextPgnState.fen;
    setAppliedFen(nextFen);
    setFenDraft(nextFen);
    setSolutionDraft(nextPgnState.draft);
    setOrientation(orientationFromFen(nextFen));
    setBoardState(null);
    setHoveredEngineMove(null);
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

  const applySolutionDraft = (): void => {
    try {
      if (batchMode && onBatchLoad) {
        const pgns = splitPuzzlePgnBatch(solutionDraft);
        if (pgns.length > 1) {
          const normalizedBatch = pgns.map((pgn, index) => {
            try {
              return validatePuzzleSubmission({ ...value, solution: pgn, explanation: "" });
            } catch (error) {
              const detail = getErrorMessage(error, "Invalid PGN.");
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
        setFenDraft(nextFen);
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
      setFenDraft(normalized.fen);
      setOrientation(orientationFromFen(normalized.fen));
      setEditorError("");
      setNavigation({
        type: "solution",
        line: 0,
        ply: 0,
      });
    } catch (error) {
      setEditorError(getErrorMessage(error, "Invalid move line."));
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
      setFenDraft(normalized.fen);
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
    await copyToClipboard(solutionDraft);
  };

  const changeSolutionInputMode = (mode: "pgn" | "fen"): void => {
    setSolutionInputMode(mode);
    try {
      window.localStorage.setItem(SOLUTION_INPUT_MODE_STORAGE_KEY, mode);
    } catch {
      // The preference is optional when browser storage is unavailable.
    }
  };

  const applyFenDraft = (): void => {
    const nextFen = fenDraft.trim();
    try {
      if (!nextFen) throw new Error("Enter a FEN.");
      createAtomicPosition(nextFen);
      if (nextFen === appliedFen) {
        setFenDraft(nextFen);
        setEditorError("");
        return;
      }

      const nextHeaders = ensurePuzzlePgnHeaders("", nextFen);
      fixedFenRef.current = null;
      savedBoardLineRef.current = "";
      setAppliedFen(nextFen);
      setFenDraft(nextFen);
      setSolutionDraft(nextHeaders);
      setOrientation(orientationFromFen(nextFen));
      setActiveLineIndex(0);
      setEditorError("");
      onChange({ ...value, fen: nextFen, solution: "" });
      setNavigation({ type: "reset", fen: nextFen });
    } catch (error) {
      setEditorError(getErrorMessage(error, "Invalid FEN."));
    }
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

  const commitSolutionLines = (
    nextLines: string[][],
    targetLineIndex: number,
    {
      targetPly,
      resetBoardHistory = false,
    }: { targetPly?: number; resetBoardHistory?: boolean } = {},
  ): void => {
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
    const nextPly = targetPly ?? nextLines[nextActiveLineIndex]?.length ?? 0;
    setNavigation(
      resetBoardHistory
        ? buildBoardLoadNavigation({
            fen: appliedFen,
            pgn: nextDraft,
            line: nextActiveLineIndex,
            ply: nextPly,
          })
        : {
            type: "solution",
            line: nextActiveLineIndex,
            ply: nextPly,
          },
    );
  };

  const deleteCurrentLine = (): void => {
    if (!canEditSolution || !solutionLines[activeLineIndex]) return;

    try {
      savedBoardLineRef.current = "";
      commitSolutionLines(
        solutionLines.filter((_, lineIndex) => lineIndex !== activeLineIndex),
        Math.max(0, activeLineIndex - 1),
        { resetBoardHistory: true },
      );
    } catch (error) {
      setEditorError(getErrorMessage(error, "Unable to delete line."));
    }
  };

  const annotateSolutionMove = (lineIndex: number, moveIndex: number, annotation: string): void => {
    const line = solutionLines[lineIndex];
    const move = line?.[moveIndex];
    if (!line || !move) return;

    try {
      const nextLines = solutionLines.map((candidate, candidateIndex) =>
        candidateIndex === lineIndex
          ? candidate.map((candidateMove, candidateMoveIndex) =>
              candidateMoveIndex === moveIndex
                ? formatSolutionMove(splitSolutionMove(candidateMove).san, annotation)
                : candidateMove,
            )
          : candidate,
      );
      commitSolutionLines(nextLines, lineIndex);
      setNavigation({ type: "solution", line: lineIndex, ply: moveIndex + 1 });
    } catch (error) {
      setEditorError(getErrorMessage(error, "Unable to annotate move."));
    }
  };

  const deleteSolutionFromMove = (lineIndex: number, moveIndex: number): void => {
    const line = solutionLines[lineIndex];
    if (!line?.[moveIndex]) return;

    try {
      savedBoardLineRef.current = "";
      const pruned = prunePgnLinesFromMove(solutionLines, lineIndex, moveIndex, sameSolutionMove);
      commitSolutionLines(pruned.lines, pruned.lineIndex, {
        targetPly: pruned.ply,
        resetBoardHistory: true,
      });
    } catch (error) {
      setEditorError(getErrorMessage(error, "Unable to delete move."));
    }
  };

  const handleBoardState = (state: ChessboardState): void => {
    setBoardState(state);
    if (state.viewingSolution) setActiveLineIndex(state.solutionLineIndex ?? 0);
    if (state.error) {
      setEditorError(state.error);
    }

    if (
      !canEditSolution ||
      engineLinePlayingRef.current ||
      navigation !== null ||
      state.viewingSolution ||
      state.customLineIndex === undefined
    ) {
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
        currentLine?.[moveIndex] && sameSolutionMove(currentLine[moveIndex], move)
          ? currentLine[moveIndex]
          : move,
      );
      const followsCurrentLineFromMiddle = Boolean(
        currentLine &&
        editedLine.length < currentLine.length &&
        editedLine.every((move, moveIndex) => sameSolutionMove(currentLine[moveIndex], move)),
      );
      if (followsCurrentLineFromMiddle) {
        return;
      }

      const mergedLine = mergeAdditiveSolutionLine(
        solutionLines,
        editedLine,
        currentLine ? activeLineIndex : undefined,
        sameSolutionMove,
      );
      if (!mergedLine.changed) {
        setActiveLineIndex(mergedLine.lineIndex);
        setNavigation({ type: "solution", line: mergedLine.lineIndex, ply: editedLine.length });
        return;
      }

      commitSolutionLines(mergedLine.lines, mergedLine.lineIndex);
    } catch (error) {
      setEditorError(getErrorMessage(error, "Unable to edit line."));
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
  const currentFen = boardState?.fen || appliedFen;
  const engine = useAtomicDbBoardAnalysis({
    currentFen,
    enabled: showAnalysisEngine && engineSettings.enabled,
    atomicDbEnabled: engineSettings.atomicDbEnabled !== false,
    navigation,
    lineCount: engineSettings.lineCount,
    showFollowUpMoves: engineSettings.showFollowUpMoves,
  });

  const playEngineLine = (ucis: string[]): void => {
    engineLinePlayingRef.current = true;
    engine.beginVariationPlayback();
    setNavigation({ type: "line", ucis });
  };

  const finishNavigation = (): void => {
    setNavigation(null);
    if (engineLinePlayingRef.current) {
      engineLinePlayingRef.current = false;
      engine.finishVariationPlayback();
    }
  };

  const editorMovePanel = solutionLines.length ? (
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
  ) : null;

  const reviewMovePanel = (
    <section className="puzzleReviewMovePanel" aria-label="Solution moves">
      {solutionLines.length ? (
        <MoveNotation
          lines={solutionLines}
          moves={boardState?.lineMoves ?? solutionLines[activeLineIndex] ?? []}
          currentPly={currentPly}
          pinnedLineIndex={activeLineIndex}
          inline
          onNavigate={(ply) => navigateToMove(activeLineIndex, Math.max(0, ply - 1))}
          onSelectVariation={navigateToMove}
          onCycleOptions={navigate}
          onAnnotate={
            canEditSolution
              ? (lineIndex, moveIndex, annotation) => {
                  if (lineIndex !== undefined) {
                    annotateSolutionMove(lineIndex, moveIndex, annotation);
                  }
                }
              : undefined
          }
          onDelete={canEditSolution ? deleteSolutionFromMove : undefined}
        />
      ) : (
        <p>No solution moves.</p>
      )}
    </section>
  );

  const solutionPgnField = showSolutionPgnField ? (
    <div className="puzzleEditorSolutionField">
      <div className="puzzleEditorFieldHeader">
        {batchMode ? (
          <label htmlFor={solutionInputId}>Solutions PGNs</label>
        ) : (
          <div className="puzzleSolutionInputMode" role="group" aria-label="Position input">
            <button
              type="button"
              className={solutionInputMode === "pgn" ? "active" : ""}
              aria-pressed={solutionInputMode === "pgn"}
              onClick={() => changeSolutionInputMode("pgn")}
            >
              PGN
            </button>
            <button
              type="button"
              className={solutionInputMode === "fen" ? "active" : ""}
              aria-pressed={solutionInputMode === "fen"}
              onClick={() => changeSolutionInputMode("fen")}
            >
              FEN
            </button>
          </div>
        )}
        {showCopyPgn && solutionInputMode === "pgn" ? (
          <button type="button" className="puzzleCopyPgnButton" onClick={() => void copyPgn()}>
            <FontAwesomeIcon
              icon={copyPgnLabel === "Copied" ? faCheck : faCopy}
              aria-hidden="true"
            />
            {copyPgnLabel}
          </button>
        ) : null}
      </div>
      {batchMode || solutionInputMode === "pgn" ? (
        <textarea
          id={solutionInputId}
          aria-label={batchMode ? undefined : "Solution PGN"}
          value={solutionDraft}
          rows={solutionPgnUnderBoard ? 4 : 6}
          required
          readOnly={solutionLocked}
          spellCheck={false}
          onChange={(event) => handleSolutionChange(event.target.value)}
          onBlur={solutionLocked ? undefined : applySolutionDraft}
        />
      ) : (
        <div className="puzzleEditorFenField">
          <label htmlFor={`${solutionInputId}-fen`}>FEN</label>
          <input
            id={`${solutionInputId}-fen`}
            type="text"
            value={fenDraft}
            readOnly={readOnly}
            spellCheck={false}
            onChange={(event) => {
              setFenDraft(event.target.value);
              setEditorError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !readOnly) applyFenDraft();
            }}
          />
          {!readOnly ? (
            <button type="button" className="queueSecondaryButton" onClick={applyFenDraft}>
              Load FEN
            </button>
          ) : null}
        </div>
      )}
    </div>
  ) : null;

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
          previewMove={hoveredEngineMove}
          previewMoveBrush="paleBlue"
          onNavigateHandled={finishNavigation}
          onStateChange={handleBoardState}
        />
        {boardFooter ? <div className="puzzleEditorBoardFooter">{boardFooter}</div> : null}
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
        {solutionPgnUnderBoard ? solutionPgnField : null}
        {showAnalysisEngine ? null : editorMovePanel}
      </div>

      <div className="puzzleEditorFields">
        {showAnalysisEngine ? (
          <section className="puzzleReviewAnalysisPanel" aria-label="Position analysis and moves">
            <AtomicDbAnalysisBlock
              fen={engine.fen}
              analysis={engine.analysis}
              settings={engineSettings}
              setSettings={setEngineSettings}
              onDisable={() => setHoveredEngineMove(null)}
              onFlipBoard={() =>
                setOrientation((current) => (current === "white" ? "black" : "white"))
              }
              onPlayLine={playEngineLine}
              onHoverMove={setHoveredEngineMove}
              disabled={engine.variationPlaying}
            />
            {reviewMovePanel}
          </section>
        ) : null}
        {analysisFooter}
        {!solutionPgnUnderBoard ? solutionPgnField : null}

        {showMetadataFields ? (
          <>
            {fieldsBeforeEvent}

            <div className={`puzzleEditorEventFields${eventAside ? " withAside" : ""}`}>
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
              {eventAside}
            </div>

            <div className="puzzleEditorPlayerFields">
              <label>
                <span className="puzzleEditorLabelHeader">
                  <span>White player</span>
                  <small>Optional</small>
                </span>
                <input
                  type="text"
                  aria-label="White player (optional)"
                  value={value.whitePlayer ?? ""}
                  placeholder="Lichess username"
                  readOnly={readOnly}
                  spellCheck={false}
                  onChange={(event) => onChange({ ...value, whitePlayer: event.target.value })}
                />
              </label>
              <label>
                <span className="puzzleEditorLabelHeader">
                  <span>Black player</span>
                  <small>Optional</small>
                </span>
                <input
                  type="text"
                  aria-label="Black player (optional)"
                  value={value.blackPlayer ?? ""}
                  placeholder="Lichess username"
                  readOnly={readOnly}
                  spellCheck={false}
                  onChange={(event) => onChange({ ...value, blackPlayer: event.target.value })}
                />
              </label>
            </div>

            <div className="puzzleOpaField">
              <label>
                <input
                  type="checkbox"
                  checked={value.opaStyle === true}
                  disabled={readOnly}
                  onChange={(event) => onChange({ ...value, opaStyle: event.target.checked })}
                />
                <span>OPA style</span>
              </label>
              <span
                className="puzzleOpaHelp"
                role="img"
                tabIndex={0}
                title={OPA_STYLE_DESCRIPTION}
                aria-label={`OPA style: ${OPA_STYLE_DESCRIPTION}`}
                data-tooltip={OPA_STYLE_DESCRIPTION}
              >
                <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
              </span>
            </div>
          </>
        ) : null}

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
          <div
            className={`queueMessage ${feedback.tone}`}
            role={feedback.tone === "error" ? "alert" : "status"}
          >
            {feedback.text}
          </div>
        ) : null}
        {actions}
      </div>
    </div>
  );
};
