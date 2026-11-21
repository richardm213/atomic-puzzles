import "./PuzzleSubmission.css";

import { faCheck, faCircleInfo, faCopy, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { INITIAL_FEN as STARTING_FEN } from "chessops/fen";
import { type ReactNode, useId, useMemo, useRef, useState } from "react";

import { AtomicDbEvalBar } from "../../components/AtomicDbEngine/AtomicDbEngine";
import { BoardWorkspace } from "../../components/BoardWorkspace/BoardWorkspace";
import { Chessboard, type ChessboardProps } from "../../components/Chessboard/Chessboard";
import { CommentEditor } from "../../components/CommentEditor/CommentEditor";
import { MoveNotation } from "../../components/MoveNotation/MoveNotation";
import { PlaybackButtons } from "../../components/PlaybackButtons/PlaybackButtons";
import { AnalysisEngineExplorerPanels } from "../../features/analysisWorkspace/AnalysisEngineExplorerPanels";
import { AnalysisPlaybackBar } from "../../features/analysisWorkspace/AnalysisToolbar";
import { AnalysisWorkspacePanel } from "../../features/analysisWorkspace/AnalysisWorkspaceLayout";
import { AtomicDbAnalysisBlock } from "../../features/analysisWorkspace/AtomicDbAnalysisBlock";
import {
  OPA_STYLE_DESCRIPTION,
  PuzzleDraftField,
  PuzzleDraftFields,
} from "../../features/analysisWorkspace/PuzzleDraftFields";
import { useAtomicDbBoardAnalysis } from "../../hooks/useAtomicDbBoardAnalysis";
import { useAtomicDbEngineSettings } from "../../hooks/useAtomicDbEngineSettings";
import { normalizeBoardFen, useBoardDocumentField } from "../../hooks/useBoardDocumentField";
import { useCopyFeedback } from "../../hooks/useCopyFeedback";
import { useMoveNotationLayout } from "../../hooks/useMoveNotationLayout";
import {
  assertPuzzleDraftFen,
  buildBoardLoadNavigation,
  pgnLineIndexForPrefix,
} from "../../lib/analysis/boardLoading";
import { boardLineNavigation } from "../../lib/analysis/boardState";
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
import { synchronizeTranspositions } from "../../lib/chess/transpositions";
import {
  ensurePuzzlePgnHeaders,
  parsePuzzlePgnInput,
  type PuzzleSubmissionValue,
  validateParsedPuzzleSubmission,
} from "../../lib/puzzles/puzzleSubmission";
import { createAtomicPosition } from "../../lib/puzzles/solutionPgn";
import {
  boardPly,
  type ChessboardState,
  type PlaybackCommand,
  type SolutionNavigation,
} from "../../types/chessboard";
import { atomicDbPositionUrl } from "../../utils/atomicDb";
import { orientationFromFen } from "../../utils/chessNotation";
import { getErrorMessage } from "../../utils/errors";
import { lichessAtomicAnalysisUrl } from "../../utils/lichess";

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

const editorPgnState = (solution: string, fallbackFen: string) => {
  try {
    const parsed = parsePuzzlePgnInput(solution, fallbackFen);
    const fen = parsed.fen || fallbackFen;
    const headers = ensurePuzzlePgnHeaders(parsed.headerText, fen);
    return {
      fen,
      headers,
      event: parsed.event,
      draft: combinePgnHeadersAndMoves(headers, parsed.solution),
    };
  } catch {
    return { fen: fallbackFen, headers: "", event: "", draft: solution };
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
  beforeActions?: ReactNode;
  actions?: (disabled: boolean) => ReactNode;
  boardFooter?: ReactNode;
  additionalMetadata?: ReactNode;
  analysisFooter?: ReactNode;
  feedback?: PuzzleEditorFeedback | undefined;
  showCopyPgn?: boolean;
  showSolutionPgnField?: boolean;
  allowSolutionEditing?: boolean;
  readOnly?: boolean;
  busy?: boolean;
  showExplanation?: boolean;
  showMetadataFields?: boolean;
  showAnalysisEngine?: boolean;
  submissionWorkspace?: boolean;
};

const SOLUTION_INPUT_MODE_STORAGE_KEY = "puzzleEditor.solutionInputMode";

const savedSolutionInputMode = (): "pgn" | "fen" => {
  try {
    return window.localStorage.getItem(SOLUTION_INPUT_MODE_STORAGE_KEY) === "fen" ? "fen" : "pgn";
  } catch {
    return "pgn";
  }
};

const PuzzleEditorDraft = ({
  value,
  onChange,
  resetKey,
  beforeActions,
  actions,
  boardFooter,
  additionalMetadata,
  analysisFooter,
  feedback,
  showCopyPgn = false,
  showSolutionPgnField = true,
  allowSolutionEditing = false,
  readOnly = false,
  busy = false,
  showExplanation = true,
  showMetadataFields = true,
  showAnalysisEngine = false,
  submissionWorkspace = false,
}: PuzzleEditorProps) => {
  const [initialPgnState] = useState(() =>
    editorPgnState(value.solution, value.fen || STARTING_FEN),
  );
  const [appliedFen, setAppliedFen] = useState(initialPgnState.fen);
  const [solutionInputMode, setSolutionInputMode] = useState<"pgn" | "fen">(savedSolutionInputMode);
  const [orientation, setOrientation] = useState<"white" | "black">(() =>
    orientationFromFen(initialPgnState.fen),
  );
  const [navigation, setNavigation] = useState<SolutionNavigation | null>(() =>
    value.solution.trim()
      ? { type: "solution", line: 0, ply: 0 }
      : { type: "reset", fen: initialPgnState.fen },
  );
  const [boardState, setBoardState] = useState<ChessboardState | null>(null);
  const [editorError, setEditorError] = useState("");
  const boardPanelRef = useRef<HTMLDivElement>(null);
  const [activeLineIndex, setActiveLineIndex] = useState(0);
  const [hoveredEngineMove, setHoveredEngineMove] = useState<string | null>(null);
  const [engineSettings, setEngineSettings] = useAtomicDbEngineSettings();
  const [notationLayout, setNotationLayout] = useMoveNotationLayout();
  const engineLinePlayingRef = useRef(false);
  const { copy: copyToClipboard, copyLabel: copyPgnLabel } = useCopyFeedback(1_500);
  const savedBoardLineRef = useRef("");
  const acceptedPgnRef = useRef<Omit<typeof initialPgnState, "fen">>(initialPgnState);
  const fixedFenRef = useRef<string | null>(value.solution.trim() ? initialPgnState.fen : null);
  const solutionInputId = useId();
  const canEditSolution = allowSolutionEditing && !readOnly && !busy;
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

  const applyStartingPosition = (fen: string): void => {
    setAppliedFen(fen);
    setOrientation(orientationFromFen(fen));
  };

  const applySolutionDraft = (draft: string): string => {
    const parsed = parsePuzzlePgnInput(draft, appliedFen);
    const nextFen = normalizeBoardFen(parsed.fen || appliedFen);
    const headers = ensurePuzzlePgnHeaders(parsed.headerText, nextFen);
    const replacesRoot = nextFen !== appliedFen;
    if (canEditSolution) {
      assertPuzzleDraftFen(
        fixedFenRef.current,
        nextFen,
        "The puzzle FEN and initial position cannot be changed after the solution is loaded.",
      );
    }

    if (!parsed.solution) {
      if (canEditSolution && (!submissionWorkspace || value.solution.trim())) {
        throw new Error("Enter at least one move.");
      }
      createAtomicPosition(nextFen);
      onChange({ ...value, fen: nextFen, solution: "" });
      if (replacesRoot || !submissionWorkspace) {
        applyStartingPosition(nextFen);
        fenInput.replace(nextFen);
        setNavigation({ type: "reset", fen: nextFen });
      }
      if (!submissionWorkspace) {
        setEditorError("Enter at least one move.");
        return draft;
      }
      acceptedPgnRef.current = { headers, draft: headers, event: parsed.event };
      setEditorError("");
      return headers;
    }

    const draftLines = parseSolutionUciLines(nextFen, parsed.solution).map((line) =>
      convertUciLineToSan(nextFen, line),
    );
    const synced = synchronizeTranspositions(
      nextFen,
      draftLines,
      canEditSolution && !replacesRoot ? solutionLines : [],
    );
    const normalized = validateParsedPuzzleSubmission(value, {
      ...parsed,
      fen: nextFen,
      solution: serializeSanLinesToPgn(nextFen, synced),
    });
    if (canEditSolution && fixedFenRef.current === null) fixedFenRef.current = normalized.fen;
    const normalizedDraft = combinePgnHeadersAndMoves(headers, normalized.solution);
    acceptedPgnRef.current = { headers, draft: normalizedDraft, event: parsed.event };
    savedBoardLineRef.current = "";
    if (replacesRoot || !submissionWorkspace) {
      applyStartingPosition(normalized.fen);
      fenInput.replace(normalized.fen);
    }
    onChange(normalized);
    setActiveLineIndex(0);
    setEditorError("");
    setNavigation({ type: "solution", line: 0, ply: 0 });
    return normalizedDraft;
  };

  const changeSolutionInputMode = (mode: "pgn" | "fen"): void => {
    setSolutionInputMode(mode);
    try {
      window.localStorage.setItem(SOLUTION_INPUT_MODE_STORAGE_KEY, mode);
    } catch {
      // The preference is optional when browser storage is unavailable.
    }
  };

  const applyFenDraft = (draft: string): string => {
    const nextFen = normalizeBoardFen(draft);
    if (nextFen === appliedFen) return appliedFen;
    if (!nextFen) throw new Error("Enter a FEN.");
    createAtomicPosition(nextFen);

    const headers = ensurePuzzlePgnHeaders("", nextFen);
    fixedFenRef.current = null;
    savedBoardLineRef.current = "";
    applyStartingPosition(nextFen);
    acceptedPgnRef.current = { headers, draft: headers, event: "" };
    pgnInput.replace(headers);
    setActiveLineIndex(0);
    setEditorError("");
    onChange({ ...value, fen: nextFen, solution: "" });
    setNavigation({ type: "reset", fen: nextFen });
    return nextFen;
  };

  const fenInput = useBoardDocumentField(appliedFen, applyFenDraft, "Invalid FEN.");
  const pgnInput = useBoardDocumentField(
    acceptedPgnRef.current.draft,
    applySolutionDraft,
    "Invalid move line.",
  );

  const navigate = (command: PlaybackCommand): void => {
    setNavigation({ type: "command", command });
  };

  const navigateToMove = (lineIndex: number, moveIndex: number): void => {
    const line = solutionLines[lineIndex];
    if (!line) return;

    setActiveLineIndex(lineIndex);
    setNavigation(boardLineNavigation({ source: "solution", index: lineIndex }, moveIndex + 1));
  };

  const commitSolutionLines = (
    nextLines: string[][],
    targetLineIndex: number,
    {
      targetPly,
      resetBoardHistory = false,
    }: { targetPly?: number; resetBoardHistory?: boolean } = {},
  ): void => {
    const nextPly = targetPly ?? nextLines[targetLineIndex]?.length ?? 0;
    const retainedMoves = nextLines[targetLineIndex]?.slice(0, nextPly) ?? [];
    nextLines = synchronizeTranspositions(appliedFen, nextLines, solutionLines);
    const accepted = acceptedPgnRef.current;
    const headers = accepted.headers || ensurePuzzlePgnHeaders("", appliedFen);

    if (nextLines.length === 0) {
      const nextDraft = combinePgnHeadersAndMoves(headers, "");
      savedBoardLineRef.current = "";
      acceptedPgnRef.current = { ...accepted, headers, draft: nextDraft };
      setEditorError("");
      setActiveLineIndex(0);
      onChange({ ...value, solution: "" });
      setNavigation({ type: "reset", fen: appliedFen });
      return;
    }

    const nextMovetext = multilineSolutionPgn(serializeSanLinesToPgn(appliedFen, nextLines));
    const nextDraft = combinePgnHeadersAndMoves(headers, nextMovetext);
    const normalized = validateParsedPuzzleSubmission(value, {
      fen: appliedFen,
      solution: nextMovetext,
      event: accepted.event,
      headerText: headers,
      hadHeaders: true,
    });
    const nextActiveLineIndex = pgnLineIndexForPrefix(appliedFen, nextDraft, retainedMoves);

    if (fixedFenRef.current === null) fixedFenRef.current = appliedFen;
    acceptedPgnRef.current = { ...accepted, headers, draft: nextDraft };
    setEditorError("");
    setActiveLineIndex(nextActiveLineIndex);
    onChange(normalized);
    setNavigation(
      resetBoardHistory
        ? buildBoardLoadNavigation({
            fen: appliedFen,
            pgn: nextDraft,
            line: nextActiveLineIndex,
            ply: nextPly,
          })
        : boardLineNavigation({ source: "solution", index: nextActiveLineIndex }, nextPly),
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
      commitSolutionLines(nextLines, lineIndex, { targetPly: moveIndex + 1 });
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
    if (state.view.line.source === "solution") setActiveLineIndex(state.view.line.index);
    if (state.error) {
      setEditorError(state.error);
    }

    if (
      !canEditSolution ||
      engineLinePlayingRef.current ||
      navigation !== null ||
      state.view.line.source !== "custom"
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

  const currentPly = boardPly(boardState);
  const moveCount = boardState?.lineMoves?.length ?? 0;
  const currentFen = boardState?.fen || appliedFen;
  const engine = useAtomicDbBoardAnalysis({
    currentFen,
    enabled: showAnalysisEngine && engineSettings.enabled,
    suspended: busy,
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

  const moveNotation = solutionLines.length ? (
    <MoveNotation
      lines={solutionLines}
      initialFen={appliedFen}
      moves={boardState?.lineMoves ?? solutionLines[activeLineIndex] ?? []}
      currentPly={currentPly}
      pinnedLineIndex={activeLineIndex}
      inline={!submissionWorkspace || notationLayout === "inline"}
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
  ) : null;

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
          <PlaybackButtons
            className="solutionPlaybackControls"
            ariaLabel="Line playback"
            buttonClassName="solutionPlaybackButton"
            labels={{
              start: "Go to start of line",
              previous: "Go to previous move",
              next: "Go to next move",
              end: "Go to end of line",
            }}
            titles={{
              start: "Start (Arrow Up)",
              previous: "Previous (Arrow Left)",
              next: "Next (Arrow Right)",
              end: "End (Arrow Down)",
            }}
            canStart={currentPly > 0}
            canPrevious={currentPly > 0}
            canNext={currentPly < moveCount}
            canEnd={currentPly < moveCount}
            onNavigate={navigate}
          />
        </div>
      </div>
      {moveNotation}
    </section>
  ) : null;

  const solutionPgnField =
    showSolutionPgnField && !submissionWorkspace ? (
      <div className="puzzleEditorSolutionField">
        <div className="puzzleEditorFieldHeader">
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
          {showCopyPgn && solutionInputMode === "pgn" ? (
            <button
              type="button"
              className="puzzleCopyPgnButton"
              onClick={() => void copyToClipboard(pgnInput.field.value)}
            >
              <FontAwesomeIcon
                icon={copyPgnLabel === "Copied" ? faCheck : faCopy}
                aria-hidden="true"
              />
              {copyPgnLabel}
            </button>
          ) : null}
        </div>
        {solutionInputMode === "pgn" ? (
          <textarea
            id={solutionInputId}
            aria-label="Solution PGN"
            rows={6}
            required
            readOnly={solutionLocked}
            spellCheck={false}
            value={pgnInput.field.value}
            onChange={pgnInput.field.onChange}
            {...(!solutionLocked
              ? { onBlur: pgnInput.field.onBlur, onKeyDown: pgnInput.field.onKeyDown }
              : {})}
          />
        ) : (
          <div className="puzzleEditorFenField">
            <label htmlFor={`${solutionInputId}-fen`}>FEN</label>
            <input
              id={`${solutionInputId}-fen`}
              type="text"
              value={fenInput.field.value}
              readOnly={readOnly}
              spellCheck={false}
              onChange={fenInput.field.onChange}
              {...(!readOnly
                ? { onBlur: fenInput.field.onBlur, onKeyDown: fenInput.field.onKeyDown }
                : {})}
            />
          </div>
        )}
      </div>
    ) : null;

  const analysisEngine = showAnalysisEngine ? (
    <AtomicDbAnalysisBlock
      {...engine.panelProps}
      settings={engineSettings}
      setSettings={setEngineSettings}
      onDisable={() => setHoveredEngineMove(null)}
      onFlipBoard={() => setOrientation((current) => (current === "white" ? "black" : "white"))}
      {...(submissionWorkspace
        ? {
            notationInline: notationLayout === "inline",
            onToggleNotation: () =>
              setNotationLayout((current) => (current === "inline" ? "non-inline" : "inline")),
          }
        : {})}
      onPlayLine={playEngineLine}
      onHoverMove={setHoveredEngineMove}
      disabled={engine.variationPlaying || engine.threatMode}
    />
  ) : null;

  const boardProps: ChessboardProps = {
    disabled: busy,
    puzzleId: `puzzle-editor-${resetKey}`,
    fen: appliedFen,
    orientation,
    coordinates: true,
    solution: value.solution,
    solutionUciLines,
    showSolution: readOnly,
    analysisMode: !readOnly,
    captureNavigationShortcuts: true,
    solutionEditor: true,
    restrictMovesToSolution: !canEditSolution,
    solutionNavigation: navigation,
    previewMove: hoveredEngineMove,
    engineMoves: showAnalysisEngine ? engine.engineMoves : undefined,
    threatMove: showAnalysisEngine ? engine.threatMove : null,
    onNavigateHandled: finishNavigation,
    onStateChange: handleBoardState,
  };
  const atomicDbKey =
    engine.analysis.result?.fen === currentFen ? engine.analysis.result.position?.key : null;

  const playerFields = showMetadataFields ? (
    <div className="boardPuzzleComposerPlayers">
      {(["White", "Black"] as const).map((color) => {
        const field = color === "White" ? "whitePlayer" : "blackPlayer";
        return (
          <PuzzleDraftField key={field} label={`${color} player`}>
            <input
              type="text"
              aria-label={`${color} player (optional)`}
              value={value[field] ?? ""}
              placeholder="Lichess username"
              readOnly={readOnly}
              spellCheck={false}
              onChange={(event) => onChange({ ...value, [field]: event.target.value })}
            />
          </PuzzleDraftField>
        );
      })}
    </div>
  ) : null;

  const fieldError = fenInput.field.error || pgnInput.field.error;
  const displayedError = editorError || (!submissionWorkspace && fieldError);
  const feedbackMessage = displayedError ? (
    <p className="queueMessage error" role="alert">
      {displayedError}
    </p>
  ) : feedback ? (
    <div
      className={`queueMessage ${feedback.tone}`}
      role={feedback.tone === "error" ? "alert" : "status"}
    >
      {feedback.text}
    </div>
  ) : null;
  const actionButtons = actions?.(busy || Boolean(fieldError || editorError));

  return (
    <fieldset
      data-board-resize="editor"
      className={submissionWorkspace ? "analysisPage puzzleSubmissionWorkspace" : "puzzleEditor"}
      disabled={busy}
      aria-busy={busy}
      aria-label={submissionWorkspace ? "Puzzle editor" : undefined}
    >
      <div className="puzzleEditorBoard">
        {submissionWorkspace ? (
          <BoardWorkspace
            boardPanelRef={boardPanelRef}
            boardAriaLabel="Atomic chess board"
            boardTabIndex={0}
            chessboardProps={boardProps}
            positionStatus={{ fen: currentFen }}
            boardOverlay={
              <AtomicDbEvalBar
                fen={engine.displayedFen}
                analysis={engine.displayedAnalysis}
                enabled={engineSettings.enabled}
                orientation={orientation}
                threatMode={engine.threatMode}
              />
            }
            lichessHref={lichessAtomicAnalysisUrl(currentFen)}
            atomicDbHref={atomicDbKey ? atomicDbPositionUrl(atomicDbKey) : null}
            document={{
              fen: { ...fenInput.field, readOnly },
              pgn: { ...pgnInput.field, readOnly: solutionLocked },
            }}
          />
        ) : (
          <Chessboard {...boardProps} />
        )}
        {boardFooter ? <div className="puzzleEditorBoardFooter">{boardFooter}</div> : null}
        {showAnalysisEngine ? null : editorMovePanel}
      </div>

      {submissionWorkspace ? (
        <AnalysisWorkspacePanel
          className="analysisRightPanel"
          aria-label="Position analysis and moves"
        >
          <AnalysisEngineExplorerPanels
            engine={analysisEngine}
            moveContent={
              <>
                {moveNotation}
                {analysisFooter}
                <PuzzleDraftFields
                  value={value}
                  disabled={busy}
                  onChange={(changes) => onChange({ ...value, ...changes })}
                >
                  {additionalMetadata}
                  {playerFields}
                </PuzzleDraftFields>
              </>
            }
          />
          <AnalysisPlaybackBar
            ariaLabel="Solution playback"
            canStepBack={boardState?.playback?.previous ?? currentPly > 0}
            canStepForward={boardState?.playback?.next ?? currentPly < moveCount}
            onNavigate={navigate}
          />
          <div className="boardPuzzleComposerFooter">
            {feedbackMessage}
            {beforeActions}
            {actionButtons}
          </div>
        </AnalysisWorkspacePanel>
      ) : (
        <div className="puzzleEditorFields">
          {analysisEngine ? (
            <AnalysisWorkspacePanel
              className="puzzleEditorAnalysisPanel"
              aria-label="Position analysis and moves"
            >
              <AnalysisEngineExplorerPanels
                engine={analysisEngine}
                moveContent={moveNotation}
                movePanelAriaLabel="Solution moves"
              />
            </AnalysisWorkspacePanel>
          ) : null}
          {analysisFooter}
          {solutionPgnField}
          {showMetadataFields ? (
            <>
              {additionalMetadata}
              <label className="puzzleEditorEventField">
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
              {playerFields}
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
            <div className="puzzleEditorExplanationField">
              <span>Explanation</span>
              <CommentEditor
                aria-label="Explanation"
                maxLength={5000}
                value={value.explanation}
                readOnly={readOnly}
                onValueChange={(explanation) => onChange({ ...value, explanation })}
              />
            </div>
          ) : null}
          {feedbackMessage}
          {beforeActions}
          {actionButtons}
        </div>
      )}
    </fieldset>
  );
};

// Changing the draft key resets the board, text fields, and pending analysis together.
export const PuzzleEditor = (props: PuzzleEditorProps) => (
  <PuzzleEditorDraft key={props.resetKey} {...props} />
);
