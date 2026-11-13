import "@lichess-org/chessground/assets/chessground.base.css";
import "../../theme/chessground.blue.css";
import "../../theme/chessground.pieces.css";
import "./Chessboard.css";

import type { Api } from "@lichess-org/chessground/api";
import type { DrawShape } from "@lichess-org/chessground/draw";
import type { Key } from "@lichess-org/chessground/types";
import type { Color, Role, SquareName } from "chessops";
import { chessgroundDests } from "chessops/compat";
import { makeFen } from "chessops/fen";
import { makeSan } from "chessops/san";
import { makeUci, parseSquare } from "chessops/util";
import type { Atomic } from "chessops/variant";
import { memo, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  correctAttemptMoveIndex,
  formatPuzzleAttemptPgn,
} from "../../../shared/domain/puzzles/attemptPgn";
import type { PuzzleIntro } from "../../../shared/domain/puzzles/gameHistory";
import { useAppSettings } from "../../context/AppSettings";
import { playBoardMoveSound } from "../../lib/boardSounds/boardSounds";
import {
  convertUciLineToSan,
  formatSolutionMove,
  moveFromUci,
  movePrefix,
  parseSolutionUciLines,
  splitSolutionMove,
  startingPlyFromFen,
  toComparableUci,
  type UciSolutionEntry,
  type UciSolutionLine,
} from "../../lib/chess/pgn";
import { lichessAnalysisGlyphSvg } from "../../lib/gameAnalysis/lichessAnalysisGlyph";
import { keyboardShortcutAction } from "../../lib/keyboardShortcuts";
import {
  type AttemptResolved,
  type BoardLineRef,
  type ChessboardState,
  initialBoardView,
  type PlaybackCommand,
  type SolutionNavigation,
} from "../../types/chessboard";
import { BlindMoveSquares } from "./BlindMoveSquares";
import {
  appendBoardMove,
  assertBoardHistory,
  type BoardHistory,
  cloneBoardHistory,
  createBoardHistory,
  historyContainsPosition,
  historyMoveKeys,
  historyMoveSans,
} from "./boardHistory";
import { resolvePlayback } from "./boardPlayback";
import { BoardPromotionPicker } from "./BoardPromotionPicker";
import { BoardResizeHandle } from "./BoardResizeHandle";
import { isTextEntryTarget, useBoardShortcuts } from "./boardShortcuts";
import { buildBoardStyle, buildPieceStyle } from "./boardStyle";
import { buildPgnHistory } from "./pgnHistory";
import {
  createPendingPromotion,
  getPromotionChoices,
  type PendingPromotion,
  type PromotionRole,
} from "./promotionHelpers";
import {
  buildSolutionHistory,
  evaluateTrainingMove,
  isSolutionCompleteAt,
  tryCreateAtomicPosition,
} from "./puzzlePlayback";
import { useChessground } from "./useChessground";
import { usePuzzleTraining } from "./usePuzzleTraining";
import {
  annotateVariationMove,
  createVariationHistory,
  saveVariation,
  synchronizeVariationHistory,
  type TranspositionHistorySnapshot,
  variationHistoryAt,
  variationMoveSans,
} from "./variationHistory";

type BoardFeedback = Partial<Pick<ChessboardState, "status" | "error" | "feedback">>;

type DisplaySolutionEntry = {
  moveEntries: UciSolutionLine;
  sanLine: string[];
  history: BoardHistory;
};

export type ChessboardProps = {
  puzzleId: string | number | null | undefined;
  fen: string;
  orientation: Color;
  coordinates: boolean;
  solution: string;
  solutionUciLines?: UciSolutionLine[];
  showSolution: boolean;
  intro?: PuzzleIntro | null | undefined;
  autoplayIntro?: boolean;
  blindFen?: string | undefined;
  onIntroEnd?: (durationMs: number, completed: boolean) => void;
  analysisMode?: boolean;
  solutionNavigation?: SolutionNavigation | null | undefined;
  previewMove?: string | null | undefined;
  threatMove?: string | null | undefined;
  engineMoves?: readonly string[] | null | undefined;
  analysisMarker?: { uci: string; symbol: string; fill: string } | null | undefined;
  dimensionsRef?: RefObject<HTMLElement>;
  captureNavigationShortcuts?: boolean;
  enableNavigationShortcuts?: boolean;
  solutionEditor?: boolean;
  linkTranspositions?: boolean;
  restrictMovesToSolution?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  premoveColor?: Color;
  premovesEnabled?: boolean;
  onNavigateHandled?: () => void;
  onAttemptResolved?: (result: AttemptResolved) => void;
  onStateChange?: (state: ChessboardState) => void;
};

const getStatus = (position: Atomic): string => {
  const outcome = position.outcome();
  if (outcome) {
    if (outcome.winner === "white") return "White wins";
    if (outcome.winner === "black") return "Black wins";
    return "Draw";
  }

  if (position.isCheck()) return `${position.turn} to move — check`;
  return `${position.turn} to move`;
};

const colorFromFen = (fen: string): Color => (fen?.split(" ")?.[1] === "b" ? "black" : "white");

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

const PUZZLE_INTRO_HOLD_MS = 550;
const PUZZLE_INTRO_ANIMATION_MS = 120;
const MOVE_EVALUATION_DELAY_MS = 250;
const ANALYSIS_LINE_PLAYBACK_DELAY_MS = 250;

const keyPair = (a: string, b: string): [Key, Key] => [a as Key, b as Key];

const previewMoveShape = (
  uci: string | null | undefined,
  brush: "paleBlue" | "threat" | "bestMove" | "otherEngineMove",
): DrawShape[] => {
  const normalized = uci?.trim().toLowerCase() ?? "";
  if (!/^[a-h][1-8][a-h][1-8]/.test(normalized)) return [];

  return [
    {
      orig: normalized.slice(0, 2) as Key,
      dest: normalized.slice(2, 4) as Key,
      brush,
      below: true,
    },
  ];
};

const promotionRoleByUci: Partial<Record<string, Role>> = {
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
};

const useLatestRef = <T,>(value: T) => {
  const ref = useRef(value);
  ref.current = value;
  return ref;
};

const ChessboardComponent = ({
  puzzleId,
  fen,
  orientation,
  coordinates,
  solution,
  solutionUciLines: suppliedSolutionUciLines,
  showSolution,
  intro,
  autoplayIntro = true,
  blindFen,
  onIntroEnd,
  analysisMode = false,
  solutionNavigation,
  previewMove,
  threatMove,
  engineMoves,
  analysisMarker,
  dimensionsRef,
  captureNavigationShortcuts = false,
  enableNavigationShortcuts = true,
  solutionEditor = false,
  linkTranspositions = false,
  restrictMovesToSolution = false,
  disabled = false,
  hidden = false,
  premoveColor,
  premovesEnabled = false,
  onNavigateHandled,
  onAttemptResolved,
  onStateChange,
}: ChessboardProps) => {
  const {
    pieceSet,
    colorMode,
    boardTheme,
    customLightSquare,
    customDarkSquare,
    boardColorOverrideTheme,
    boardOverrideLightSquare,
    boardOverrideDarkSquare,
    showBoardCoordinates,
    showBestMoveArrow,
    setShowBestMoveArrow,
    keyboardShortcuts,
    enableBoardPremoves,
    boardSoundsEnabled,
    boardSoundSet,
  } = useAppSettings();
  const effectivePremovesEnabled = premovesEnabled && enableBoardPremoves;
  const elementRef = useRef<HTMLDivElement | null>(null);
  const lastAutomaticResetFenRef = useRef<string | null>(null);
  const cgRef = useRef<Api | null>(null);
  const positionRef = useRef<Atomic | null>(null);
  const pendingPromotionRef = useRef<PendingPromotion | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const historyRef = useRef<BoardHistory>(createBoardHistory());
  const retryLinesRef = useRef<string[][]>([]);
  const {
    interactionLockedRef,
    attemptRef,
    evaluationTimerRef,
    cancelEvaluation: clearMoveEvaluationTimer,
    resetTraining,
  } = usePuzzleTraining();
  const orientationRef = useLatestRef(orientation);
  const coordinatesRef = useLatestRef(coordinates);
  const showSolutionRef = useLatestRef(showSolution);
  const analysisModeRef = useLatestRef(analysisMode);
  const restrictMovesToSolutionRef = useLatestRef(restrictMovesToSolution);
  const disabledRef = useLatestRef(disabled);
  const blindFenRef = useLatestRef(blindFen);
  const initialIntroRef = useRef(intro);
  const initialAutoplayIntroRef = useRef(autoplayIntro);
  const introPlayingRef = useRef(false);
  const analysisPlaybackRunningRef = useRef(false);
  const introPlayedRef = useRef(false);
  const onIntroEndRef = useLatestRef(onIntroEnd);
  const premoveColorRef = useLatestRef(premoveColor);
  const premovesEnabledRef = useLatestRef(effectivePremovesEnabled);
  const fenRef = useLatestRef(fen);
  const solutionNavigationRef = useLatestRef(solutionNavigation);
  const puzzleIdRef = useLatestRef(puzzleId);
  const solverColorRef = useLatestRef<Color>(colorFromFen(fen));
  const onStateChangeRef = useLatestRef(onStateChange);
  const onAttemptResolvedRef = useLatestRef(onAttemptResolved);
  const onNavigateHandledRef = useLatestRef(onNavigateHandled);
  const boardSoundsEnabledRef = useLatestRef(boardSoundsEnabled);
  const boardSoundSetRef = useLatestRef(boardSoundSet);

  const playMoveSound = useCallback(
    (positionAfterMove: Atomic, san: string, uci: string): void => {
      if (!boardSoundsEnabledRef.current) return;
      playBoardMoveSound(boardSoundSetRef.current, {
        san,
        uci,
        isCheck: positionAfterMove.isCheck(),
      });
    },
    [boardSoundSetRef, boardSoundsEnabledRef],
  );

  const solutionUciLines = useMemo(
    () => suppliedSolutionUciLines ?? parseSolutionUciLines(fen, solution),
    [fen, solution, suppliedSolutionUciLines],
  );
  const solutionEntries = useMemo(
    () =>
      solutionUciLines.flatMap((line): DisplaySolutionEntry[] => {
        const history = buildSolutionHistory(fen, line);
        return history
          ? [{ moveEntries: line, sanLine: convertUciLineToSan(fen, line), history }]
          : [];
      }),
    [fen, solutionUciLines],
  );
  const solutionUciLinesRef = useLatestRef(solutionUciLines);
  const solutionEntriesRef = useRef(solutionEntries);
  solutionEntriesRef.current = solutionEntries;
  const viewRef = useRef(initialBoardView());
  const alternativeContinuationSelectedRef = useRef(false);
  const customVariationsRef = useRef(createVariationHistory());
  const transpositionHistoryRef = useRef<TranspositionHistorySnapshot | null>(null);
  const pieceStyle = useMemo(() => buildPieceStyle(pieceSet), [pieceSet]);
  const boardStyle = useMemo(
    () =>
      buildBoardStyle(
        boardTheme,
        customLightSquare,
        customDarkSquare,
        boardColorOverrideTheme,
        boardOverrideLightSquare,
        boardOverrideDarkSquare,
        colorMode,
      ),
    [
      boardTheme,
      colorMode,
      customDarkSquare,
      customLightSquare,
      boardColorOverrideTheme,
      boardOverrideLightSquare,
      boardOverrideDarkSquare,
    ],
  );

  const isSolutionPlaybackLocked = useCallback(
    (): boolean => showSolutionRef.current && !analysisModeRef.current,
    [analysisModeRef, showSolutionRef],
  );

  const canBrowseSolution = useCallback(
    (): boolean => showSolutionRef.current || (solutionEditor && analysisModeRef.current),
    [analysisModeRef, solutionEditor, showSolutionRef],
  );

  const isTraining = useCallback(
    (): boolean =>
      solutionEntriesRef.current.length > 0 && !analysisModeRef.current && !showSolutionRef.current,
    [analysisModeRef, showSolutionRef],
  );

  const canNavigateBoard = useCallback(
    (): boolean =>
      Boolean(positionRef.current) &&
      !disabledRef.current &&
      !blindFenRef.current &&
      !introPlayingRef.current &&
      !analysisPlaybackRunningRef.current &&
      !pendingPromotionRef.current &&
      evaluationTimerRef.current === null,
    [blindFenRef, disabledRef, evaluationTimerRef],
  );

  const getPlaybackContext = useCallback((): Parameters<typeof resolvePlayback>[0] => {
    const lines: Parameters<typeof resolvePlayback>[0]["lines"] = [];
    if (canBrowseSolution()) {
      solutionEntriesRef.current.forEach(({ history }, index) => {
        lines.push({ line: { source: "solution", index }, history });
      });
    }
    if (analysisModeRef.current) {
      const variations = customVariationsRef.current;
      variations.leaves.forEach((_, index) => {
        const history = variationHistoryAt(variations, index);
        if (history) lines.push({ line: { source: "custom", index }, history });
      });
    }
    return {
      history: historyRef.current,
      view: viewRef.current,
      canBrowseIntro: Boolean(initialIntroRef.current),
      keepContinuation: alternativeContinuationSelectedRef.current,
      lines,
    };
  }, [analysisModeRef, canBrowseSolution]);

  const isMoveInputBlocked = useCallback(
    (): boolean =>
      disabledRef.current ||
      introPlayingRef.current ||
      viewRef.current.position === "beforeIntro" ||
      interactionLockedRef.current ||
      // A training review can move the cursor, but only the live position accepts moves.
      (isTraining() && historyRef.current.index !== historyRef.current.plies.length - 1) ||
      isSolutionPlaybackLocked(),
    [disabledRef, interactionLockedRef, isSolutionPlaybackLocked, isTraining],
  );

  const getCorrectLineMove = useCallback((): string | null => {
    if (!solutionEntriesRef.current[0]?.moveEntries.length) return null;

    const displayedMoveIndex = correctAttemptMoveIndex(
      solutionEntriesRef.current.map((entry) => entry.moveEntries),
      historyMoveKeys(historyRef.current),
    );
    const playedSan = historyMoveSans(historyRef.current)[displayedMoveIndex];
    return playedSan
      ? `${movePrefix(startingPlyFromFen(fenRef.current) + displayedMoveIndex, true)}${playedSan}`
      : null;
  }, [fenRef]);

  const getAttemptPgn = useCallback(
    (finalMove?: string): string => {
      const played = historyMoveSans(historyRef.current);
      if (finalMove) played.push(finalMove);
      return formatPuzzleAttemptPgn(fenRef.current, [played, ...retryLinesRef.current]);
    },
    [fenRef],
  );

  const getDisplayTurn = useCallback(
    (position: Atomic, nextState?: BoardFeedback | undefined): Color => {
      if (
        viewRef.current.position === "beforeIntro" ||
        !solutionEntriesRef.current.length ||
        analysisModeRef.current ||
        showSolutionRef.current
      ) {
        return position.turn;
      }

      if (nextState?.feedback === "wrong" || attemptRef.current.solved) {
        return position.turn;
      }

      return solverColorRef.current ?? position.turn;
    },
    [analysisModeRef, attemptRef, showSolutionRef, solverColorRef],
  );

  const emitState = useCallback(
    (position: Atomic, next?: BoardFeedback | undefined): ChessboardState => {
      if (linkTranspositions && analysisModeRef.current) {
        const synchronized = synchronizeVariationHistory(
          historyRef.current,
          customVariationsRef.current,
          transpositionHistoryRef.current,
        );
        if (synchronized) {
          historyRef.current = synchronized.history;
          customVariationsRef.current = synchronized.variations;
          transpositionHistoryRef.current = synchronized.snapshot;
          if (synchronized.lineIndex !== undefined) {
            viewRef.current.line = { source: "custom", index: synchronized.lineIndex };
          }
        }
      }
      const history = historyRef.current;
      const displayTurn = getDisplayTurn(position, next);
      const playbackContext = getPlaybackContext();
      // Temporary page-level locks (blind mode, save in progress) are applied
      // by the caller; publish availability for the board's current cursor.
      const canNavigate = !pendingPromotionRef.current && evaluationTimerRef.current === null;
      const state: ChessboardState = {
        playback: {
          start: canNavigate && Boolean(resolvePlayback(playbackContext, "start")),
          previous: canNavigate && Boolean(resolvePlayback(playbackContext, "previous")),
          next: canNavigate && Boolean(resolvePlayback(playbackContext, "next")),
          end: canNavigate && Boolean(resolvePlayback(playbackContext, "end")),
        },
        fen: makeFen(position.toSetup()),
        turn: displayTurn,
        status:
          next?.status ??
          (displayTurn === position.turn ? getStatus(position) : `${displayTurn} to move`),
        winner: position.outcome()?.winner,
        error: "",
        lineMoves: historyMoveSans(history),
        ...(isTraining() ? { attemptPgn: getAttemptPgn() } : {}),
        solutionLines: canBrowseSolution()
          ? solutionEntriesRef.current.map((entry) => [...entry.sanLine])
          : [],
        customLines: variationMoveSans(customVariationsRef.current),
        view: { ...viewRef.current },
        solved: attemptRef.current.solved,
        ...(next ?? {}),
      };

      onStateChangeRef.current?.(state);
      return state;
    },
    [
      attemptRef,
      analysisModeRef,
      canBrowseSolution,
      evaluationTimerRef,
      getAttemptPgn,
      getDisplayTurn,
      getPlaybackContext,
      isTraining,
      linkTranspositions,
      onStateChangeRef,
    ],
  );

  const resetSession = useCallback(
    ({
      history,
      locked = false,
      candidates = [],
      solved = false,
    }: {
      history: BoardHistory;
      locked?: boolean;
      candidates?: UciSolutionLine[];
      solved?: boolean;
    }): void => {
      historyRef.current = history;
      retryLinesRef.current = [];
      viewRef.current.position = historyRef.current.index;
      viewRef.current.line = { source: "history" };
      alternativeContinuationSelectedRef.current = false;
      customVariationsRef.current = createVariationHistory();
      resetTraining({ locked, candidates, solved });
    },
    [resetTraining],
  );

  type MovableConfig = {
    color?: Color;
    dests: Map<Key, Key[]>;
    free: boolean;
  };

  const allowedSolutionContinuations = useCallback((): UciSolutionEntry[] => {
    if (!restrictMovesToSolutionRef.current) return [];

    const history = historyRef.current;
    const playedMoveKeys = historyMoveKeys(history);
    const continuations: UciSolutionEntry[] = [];
    for (const entry of solutionEntriesRef.current) {
      const followsPlayedLine = playedMoveKeys.every(
        (moveKey, index) => entry.moveEntries[index]?.key === moveKey,
      );
      const continuation = entry.moveEntries[history.index];
      if (followsPlayedLine && continuation) continuations.push(continuation);
    }
    return continuations;
  }, [restrictMovesToSolutionRef]);

  const getMovableConfig = useCallback(
    (position: Atomic): MovableConfig => {
      if (blindFenRef.current || isMoveInputBlocked()) {
        return {
          dests: new Map(),
          free: false,
        };
      }

      const outcome = position.outcome();
      const legalDests = chessgroundDests(position);
      const dests = restrictMovesToSolutionRef.current
        ? allowedSolutionContinuations().reduce((allowed, entry) => {
            const orig = entry.uci.slice(0, 2) as SquareName;
            const dest = entry.uci.slice(2, 4) as SquareName;
            const legalFromOrigin = legalDests.get(orig);
            if (!legalFromOrigin?.includes(dest)) return allowed;
            const current = allowed.get(orig) ?? [];
            if (!current.includes(dest)) allowed.set(orig, [...current, dest]);
            return allowed;
          }, new Map<Key, Key[]>())
        : legalDests;
      return {
        ...(outcome
          ? {}
          : { color: premovesEnabledRef.current ? premoveColorRef.current : position.turn }),
        dests:
          premovesEnabledRef.current && position.turn !== premoveColorRef.current
            ? new Map()
            : dests,
        free: false,
      };
    },
    [
      allowedSolutionContinuations,
      isMoveInputBlocked,
      blindFenRef,
      premoveColorRef,
      premovesEnabledRef,
      restrictMovesToSolutionRef,
    ],
  );

  const saveMove = useCallback(
    (
      position: Atomic,
      lastMove: [Key, Key] | undefined,
      moveUci: string,
      moveKey: string,
      moveSan: string,
    ): void => {
      const previousActiveLine = viewRef.current.line;
      const history = historyRef.current;
      const nextFen = makeFen(position.toSetup());
      const previousCustomHistory =
        previousActiveLine.source === "custom"
          ? variationHistoryAt(customVariationsRef.current, previousActiveLine.index)
          : null;
      const previousLineHistory = previousCustomHistory ?? history;
      const previousContinuationKey = previousLineHistory.plies[history.index + 1]?.key;
      const followsPreviousContinuation = previousContinuationKey === moveKey;
      const createsCustomBranch =
        previousContinuationKey !== undefined && previousContinuationKey !== moveKey;

      if (
        analysisModeRef.current &&
        previousActiveLine.source !== "solution" &&
        followsPreviousContinuation
      ) {
        if (previousCustomHistory) {
          const continuedHistory = cloneBoardHistory(previousCustomHistory);
          continuedHistory.index = history.index + 1;
          historyRef.current = continuedHistory;
        } else {
          history.index += 1;
        }
        viewRef.current.line = previousActiveLine;
        return;
      }

      if (
        analysisModeRef.current &&
        previousActiveLine.source === "history" &&
        history.index < history.plies.length - 1
      ) {
        saveVariation(customVariationsRef.current, cloneBoardHistory(history));
      }

      appendBoardMove(history, {
        fen: nextFen,
        lastMove,
        uci: moveUci,
        key: moveKey,
        san: moveSan,
      });

      if (analysisModeRef.current) {
        if (previousActiveLine.source !== "custom" || createsCustomBranch) {
          const index = saveVariation(customVariationsRef.current, history);
          viewRef.current.line = { source: "custom", index };
        } else {
          saveVariation(customVariationsRef.current, history, previousActiveLine.index);
          viewRef.current.line = previousActiveLine;
        }
      } else {
        viewRef.current.line = { source: "history" };
      }
    },
    [analysisModeRef],
  );

  const syncBoard = useCallback(
    (
      position: Atomic,
      lastMove: [Key, Key] | undefined,
      nextState?: BoardFeedback | undefined,
    ): void => {
      positionRef.current = position;
      if (viewRef.current.position !== "beforeIntro")
        viewRef.current.position = historyRef.current.index;

      const movable = getMovableConfig(position);
      const referenceFen = blindFenRef.current;
      const displayTurn = getDisplayTurn(position, nextState);
      const displayCheck =
        displayTurn === position.turn && position.isCheck() ? position.turn : false;

      cgRef.current?.set({
        fen: referenceFen ?? makeFen(position.toSetup()),
        orientation: orientationRef.current,
        coordinates: coordinatesRef.current,
        turnColor: referenceFen ? colorFromFen(referenceFen) : displayTurn,
        lastMove:
          referenceFen || viewRef.current.position === "beforeIntro" ? [] : (lastMove ?? []),
        check: !referenceFen && displayCheck,
        movable,
      });

      emitState(position, nextState);

      if (
        premovesEnabledRef.current &&
        premoveColorRef.current === position.turn &&
        !blindFenRef.current &&
        !isMoveInputBlocked()
      ) {
        cgRef.current?.playPremove?.();
      }
    },
    [
      blindFenRef,
      coordinatesRef,
      emitState,
      getDisplayTurn,
      getMovableConfig,
      isMoveInputBlocked,
      orientationRef,
      premoveColorRef,
      premovesEnabledRef,
    ],
  );

  const navigateTo = useCallback(
    (target: number | "beforeIntro", keepContinuation = false): boolean => {
      const history = historyRef.current;
      if (!canNavigateBoard() || !history.plies.length) return false;
      assertBoardHistory(history);
      const beforeIntro = target === "beforeIntro";
      const targetIndex = beforeIntro ? 0 : target;
      if (!Number.isInteger(targetIndex) || !history.plies[targetIndex]) return false;
      if (target === viewRef.current.position) return false;

      const targetFen = beforeIntro
        ? initialIntroRef.current?.beforeFen
        : history.plies[targetIndex]?.fen;
      if (targetFen === undefined) return false;
      const { position } = tryCreateAtomicPosition(targetFen);
      if (!position) return false;

      cgRef.current?.cancelPremove?.();
      alternativeContinuationSelectedRef.current = keepContinuation;
      history.index = targetIndex;
      // The opponent's move precedes puzzle ply zero; inspecting its starting
      // position must not add a training ply or briefly activate the puzzle root.
      viewRef.current.position = beforeIntro ? "beforeIntro" : targetIndex;
      interactionLockedRef.current = isSolutionPlaybackLocked();

      syncBoard(position, history.plies[targetIndex]?.lastMove);
      return true;
    },
    [canNavigateBoard, interactionLockedRef, isSolutionPlaybackLocked, syncBoard],
  );

  const activateHistory = useCallback(
    ({
      history,
      ply,
      activeLine,
      locked,
      keepContinuation = false,
    }: {
      history: BoardHistory;
      ply?: number | undefined;
      activeLine: BoardLineRef;
      locked: boolean;
      keepContinuation?: boolean;
    }): void => {
      history.index = Math.max(
        0,
        Math.min(ply ?? history.plies.length - 1, history.plies.length - 1),
      );
      assertBoardHistory(history);
      const step = history.plies[history.index];
      if (!step) return;
      const { position } = tryCreateAtomicPosition(step.fen);
      if (!position) return;

      clearMoveEvaluationTimer();
      alternativeContinuationSelectedRef.current = keepContinuation;
      viewRef.current.position = history.index;
      historyRef.current = history;
      viewRef.current.line = activeLine;
      interactionLockedRef.current = locked;
      syncBoard(position, step.lastMove);
    },
    [interactionLockedRef, clearMoveEvaluationTimer, syncBoard],
  );

  const showSolutionLine = useCallback(
    (lineIndex: number, targetPly?: number): void => {
      const solutionEntry = solutionEntriesRef.current[lineIndex];
      if (!canBrowseSolution() || !solutionEntry?.moveEntries?.length) return;

      activateHistory({
        history: cloneBoardHistory(solutionEntry.history),
        ply: targetPly,
        activeLine: { source: "solution", index: lineIndex },
        locked: !analysisModeRef.current,
      });
    },
    [activateHistory, analysisModeRef, canBrowseSolution],
  );

  const showCustomLine = useCallback(
    (lineIndex: number, targetPly?: number): void => {
      const storedHistory = variationHistoryAt(customVariationsRef.current, lineIndex);
      if (isTraining() || !storedHistory?.plies[targetPly ?? storedHistory.index]) return;

      activateHistory({
        history: cloneBoardHistory(storedHistory),
        ply: targetPly,
        activeLine: { source: "custom", index: lineIndex },
        locked: false,
      });
    },
    [activateHistory, isTraining],
  );

  const navigatePlayback = useCallback(
    (command: PlaybackCommand): boolean => {
      if (!canNavigateBoard()) return false;
      const target = resolvePlayback(getPlaybackContext(), command);
      if (!target) return false;

      if (target.line && typeof target.position === "number") {
        cgRef.current?.cancelPremove?.();
        activateHistory({
          history: cloneBoardHistory(target.line.history),
          ply: target.position,
          activeLine: target.line.line,
          locked: isSolutionPlaybackLocked(),
          keepContinuation: Boolean(target.selectsContinuation),
        });
        return true;
      }

      return navigateTo(
        target.position,
        command === "next" && alternativeContinuationSelectedRef.current,
      );
    },
    [activateHistory, canNavigateBoard, getPlaybackContext, isSolutionPlaybackLocked, navigateTo],
  );

  const autoplayOpponentMove = useCallback(
    (position: Atomic): boolean => {
      const candidates = attemptRef.current.candidates;
      const progress = attemptRef.current.progress;
      const nextEntry: UciSolutionEntry | undefined =
        candidates.map((line) => line[progress]).find((entry) => entry && !entry.retry) ??
        candidates[0]?.[progress];

      if (!nextEntry) {
        attemptRef.current.solved = true;
        return false;
      }

      const move = moveFromUci(position, nextEntry.uci);
      if (!move) {
        attemptRef.current.solved = true;
        return false;
      }

      const opponentMoveSan = makeSan(position, move);
      position.play(move);
      playMoveSound(position, opponentMoveSan, nextEntry.uci);
      saveMove(
        position,
        keyPair(nextEntry.uci.slice(0, 2), nextEntry.uci.slice(2, 4)),
        nextEntry.uci,
        nextEntry.key,
        opponentMoveSan,
      );

      attemptRef.current.candidates = candidates.filter(
        (line) => line[progress]?.uci === nextEntry.uci,
      );
      attemptRef.current.progress = progress + 1;
      attemptRef.current.solved = isSolutionCompleteAt(
        attemptRef.current.candidates,
        attemptRef.current.progress,
      );

      return true;
    },
    [attemptRef, playMoveSound, saveMove],
  );

  const clearPendingPromotion = useCallback((): void => {
    pendingPromotionRef.current = null;
    setPendingPromotion(null);
  }, []);

  const playUserMove = useCallback(
    (orig: string, dest: string, promotion?: Role | undefined): void => {
      const position = positionRef.current;
      if (!position || isMoveInputBlocked()) {
        return;
      }

      const from = parseSquare(orig);
      const to = parseSquare(dest);
      if (from === undefined || to === undefined) return;

      const move = promotion ? { from, to, promotion } : { from, to };

      if (!position.isLegal(move)) {
        syncBoard(position, keyPair(orig, dest));
        return;
      }

      const userMoveText = makeUci(move).toLowerCase();
      const userMoveSan = makeSan(position, move);
      const userMoveKey = toComparableUci(position, userMoveText, move);

      if (
        restrictMovesToSolutionRef.current &&
        !allowedSolutionContinuations().some((entry) => entry.key === userMoveKey)
      ) {
        syncBoard(position, historyRef.current.plies[historyRef.current.index]?.lastMove);
        return;
      }

      const soundPosition = tryCreateAtomicPosition(makeFen(position.toSetup())).position;
      if (soundPosition) {
        soundPosition.play(move);
        playMoveSound(soundPosition, userMoveSan, userMoveText);
      }

      if (analysisModeRef.current) {
        position.play(move);
        saveMove(position, keyPair(orig, dest), userMoveText, userMoveKey, userMoveSan);
        syncBoard(position, keyPair(orig, dest));
        return;
      }

      const trainingEnabled = solutionEntriesRef.current.length > 0 && !analysisModeRef.current;

      if (!trainingEnabled || attemptRef.current.solved) {
        position.play(move);
        saveMove(position, keyPair(orig, dest), userMoveText, userMoveKey, userMoveSan);
        syncBoard(position, keyPair(orig, dest));
        return;
      }

      const moveResult = evaluateTrainingMove({
        playedMoveKeys: historyMoveKeys(historyRef.current),
        solutionLines: solutionUciLinesRef.current,
        moveKey: userMoveKey,
      });
      const { candidates, progress, evaluation: moveEvaluation } = moveResult;
      let createsTwofoldRepetition = false;
      if (moveEvaluation === "wrong") {
        const { position: nextPosition } = tryCreateAtomicPosition(makeFen(position.toSetup()));
        if (nextPosition) {
          nextPosition.play(move);
          createsTwofoldRepetition = historyContainsPosition(
            historyRef.current,
            makeFen(nextPosition.toSetup()),
            initialIntroRef.current?.beforeFen,
          );
        }
      }
      attemptRef.current.candidates = candidates;
      attemptRef.current.progress = progress;

      interactionLockedRef.current = true;
      cgRef.current?.set({
        lastMove: blindFenRef.current ? [] : keyPair(orig, dest),
        movable: {
          dests: new Map(),
          free: false,
        },
      });

      clearMoveEvaluationTimer();
      const scheduledPuzzleId = puzzleIdRef.current;
      const scheduledFen = fenRef.current;
      const scheduledHistoryIndex = historyRef.current.index;
      const scheduledProgress = attemptRef.current.progress;

      evaluationTimerRef.current = window.setTimeout(() => {
        evaluationTimerRef.current = null;

        if (
          puzzleIdRef.current !== scheduledPuzzleId ||
          fenRef.current !== scheduledFen ||
          historyRef.current.index !== scheduledHistoryIndex ||
          attemptRef.current.progress !== scheduledProgress
        ) {
          return;
        }

        const activePos = positionRef.current;
        if (!activePos) return;

        if (moveEvaluation === "retry" || createsTwofoldRepetition) {
          retryLinesRef.current.push([...historyMoveSans(historyRef.current), userMoveSan]);
          interactionLockedRef.current = false;
          syncBoard(activePos, undefined, {
            feedback: "retry",
            status: "Try again",
          });
          return;
        }

        if (moveEvaluation === "wrong") {
          interactionLockedRef.current = false;
          onAttemptResolvedRef.current?.({
            puzzleId: puzzleIdRef.current,
            puzzleCorrect: false,
            incorrectMove: `${movePrefix(startingPlyFromFen(makeFen(activePos.toSetup())), true)}${userMoveSan}`,
            attemptPgn: getAttemptPgn(userMoveSan),
            correctMove: null,
          });
          syncBoard(activePos, undefined, {
            feedback: "wrong",
            status: "Incorrect",
          });
          return;
        }

        activePos.play(move);
        saveMove(activePos, keyPair(orig, dest), userMoveText, userMoveKey, userMoveSan);

        const acceptedState = moveResult.acceptedState;
        if (!acceptedState) return;
        attemptRef.current = acceptedState;

        if (acceptedState.solved) {
          interactionLockedRef.current = false;
          attemptRef.current.solved = true;
          onAttemptResolvedRef.current?.({
            puzzleId: puzzleIdRef.current,
            puzzleCorrect: true,
            incorrectMove: null,
            correctMove: getCorrectLineMove(),
            attemptPgn: getAttemptPgn(),
          });
          syncBoard(activePos, keyPair(orig, dest), {
            status: "Correct",
            feedback: "correct",
          });
          return;
        }

        const playedOpponent = autoplayOpponentMove(activePos);
        interactionLockedRef.current = false;

        if (attemptRef.current.solved) {
          onAttemptResolvedRef.current?.({
            puzzleId: puzzleIdRef.current,
            puzzleCorrect: true,
            incorrectMove: null,
            correctMove: getCorrectLineMove(),
            attemptPgn: getAttemptPgn(),
          });
        }

        const lastUci = historyRef.current.plies[historyRef.current.index]?.uci;
        syncBoard(
          activePos,
          playedOpponent && lastUci !== undefined
            ? keyPair(lastUci.slice(0, 2), lastUci.slice(2, 4))
            : undefined,
          {
            status: attemptRef.current.solved ? "Correct" : getStatus(activePos),
            ...(attemptRef.current.solved ? { feedback: "correct" as const } : {}),
          },
        );
      }, MOVE_EVALUATION_DELAY_MS);
      emitState(position);
    },
    [
      autoplayOpponentMove,
      allowedSolutionContinuations,
      isMoveInputBlocked,
      blindFenRef,
      interactionLockedRef,
      attemptRef,
      clearMoveEvaluationTimer,
      fenRef,
      analysisModeRef,
      evaluationTimerRef,
      emitState,
      getCorrectLineMove,
      getAttemptPgn,
      onAttemptResolvedRef,
      playMoveSound,
      puzzleIdRef,
      restrictMovesToSolutionRef,
      saveMove,
      solutionUciLinesRef,
      syncBoard,
    ],
  );

  const choosePromotion = useCallback(
    (role: PromotionRole): void => {
      const pending = pendingPromotionRef.current;
      if (!pending) return;

      clearPendingPromotion();
      playUserMove(pending.orig, pending.dest, role);
    },
    [clearPendingPromotion, playUserMove],
  );

  const playUciMove = useCallback(
    (uci: string): void => {
      const normalized = uci.trim().toLowerCase();
      if (normalized.length < 4) return;

      clearPendingPromotion();
      const promotionCode = normalized[4];
      playUserMove(
        normalized.slice(0, 2),
        normalized.slice(2, 4),
        promotionCode ? promotionRoleByUci[promotionCode] : undefined,
      );
    },
    [clearPendingPromotion, playUserMove],
  );

  const resetToFen = useCallback(
    (nextFen: string): void => {
      clearMoveEvaluationTimer();
      clearPendingPromotion();

      const { position, error } = tryCreateAtomicPosition(nextFen);
      if (!position) {
        positionRef.current = null;
        cgRef.current?.set({
          orientation: orientationRef.current,
          coordinates: coordinatesRef.current,
          check: false,
          movable: {
            dests: new Map(),
          },
        });
        onStateChangeRef.current?.({
          fen: nextFen,
          turn: "",
          view: initialBoardView(),
          status: "Invalid position",
          winner: undefined,
          error,
          solved: false,
        });
        return;
      }

      resetSession({ history: createBoardHistory(nextFen) });

      syncBoard(position, undefined);
    },
    [
      clearMoveEvaluationTimer,
      clearPendingPromotion,
      coordinatesRef,
      onStateChangeRef,
      orientationRef,
      resetSession,
      syncBoard,
    ],
  );

  const loadPgnMainline = useCallback(
    (initialFen: string, pgn: string, requestedLine?: number, requestedPly?: number): void => {
      clearMoveEvaluationTimer();
      clearPendingPromotion();

      const result = buildPgnHistory(initialFen, pgn);
      if (!result.ok) {
        const currentPosition = positionRef.current;
        if (currentPosition) {
          emitState(currentPosition, {
            status: result.kind === "fen" ? "Invalid position" : "Invalid PGN",
            error: result.error,
          });
        }
        return;
      }

      const lineIndex = Math.max(0, Math.min(requestedLine ?? 0, result.histories.length - 1));
      const selectedHistory = result.histories[lineIndex] ?? result.history;
      resetSession({ history: selectedHistory });
      if (result.histories.length > 1) {
        result.histories.forEach((history) => saveVariation(customVariationsRef.current, history));
        activateHistory({
          history: selectedHistory,
          ply: requestedPly,
          activeLine: { source: "custom", index: lineIndex },
          locked: false,
        });
        return;
      }

      activateHistory({
        history: selectedHistory,
        ply: requestedPly,
        activeLine: { source: "history" },
        locked: false,
      });
    },
    [activateHistory, clearMoveEvaluationTimer, clearPendingPromotion, emitState, resetSession],
  );

  const handleBoardMove = useCallback(
    (orig: string, dest: string): void => {
      const position = positionRef.current;
      if (!position || isMoveInputBlocked() || pendingPromotionRef.current) {
        return;
      }
      const from = parseSquare(orig);
      const to = parseSquare(dest);
      if (from === undefined || to === undefined) return;
      const piece = position.board.get(from);
      const choices = getPromotionChoices({ position, from, to, piece });
      if (choices.length > 1 && piece) {
        const pending = createPendingPromotion({
          orig,
          dest,
          color: piece.color,
          choices,
          orientation: orientationRef.current,
        });
        pendingPromotionRef.current = pending;
        setPendingPromotion(pending);
        syncBoard(position, undefined);
        return;
      }
      playUserMove(orig, dest, choices[0]);
    },
    [isMoveInputBlocked, orientationRef, playUserMove, syncBoard],
  );

  const getBlindLegalDestinations = (origin: Key): readonly Key[] => {
    const position = positionRef.current;
    if (
      !position ||
      interactionLockedRef.current ||
      isSolutionPlaybackLocked() ||
      pendingPromotionRef.current
    ) {
      return [];
    }
    // The rewind is visual only; never give Chessground the hidden position's destination map.
    return chessgroundDests(position).get(origin) ?? [];
  };

  const cleanupBoard = useCallback(() => {
    clearMoveEvaluationTimer();
    positionRef.current = null;
    clearPendingPromotion();
  }, [clearMoveEvaluationTimer, clearPendingPromotion]);

  useChessground({
    elementRef,
    dimensionsRef,
    apiRef: cgRef,
    fen: blindFen ?? (intro && autoplayIntro && !prefersReducedMotion() ? intro.beforeFen : fen),
    orientation,
    coordinates,
    movableColor: premoveColor,
    premovesEnabled: effectivePremovesEnabled,
    onAfterMove: handleBoardMove,
    onCleanup: cleanupBoard,
  });

  useEffect(() => {
    if (!effectivePremovesEnabled || disabled) cgRef.current?.cancelPremove?.();
    cgRef.current?.set({ premovable: { enabled: effectivePremovesEnabled } });
  }, [disabled, effectivePremovesEnabled]);

  const supportsEngineArrows = engineMoves !== undefined;
  useEffect(() => {
    if (!supportsEngineArrows) return;
    const toggleEngineArrows = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        isTextEntryTarget(event.target) ||
        (event.target instanceof Element &&
          event.target.closest("dialog, [role='dialog'], [role='textbox']")) ||
        keyboardShortcutAction(event, keyboardShortcuts) !== "toggleBestMoveArrow"
      ) {
        return;
      }
      event.preventDefault();
      setShowBestMoveArrow((current) => !current);
    };
    window.addEventListener("keydown", toggleEngineArrows);
    return () => window.removeEventListener("keydown", toggleEngineArrows);
  }, [keyboardShortcuts, setShowBestMoveArrow, supportsEngineArrows]);

  useEffect(() => {
    const markerUci = analysisMarker?.uci.trim().toLowerCase() ?? "";
    const markerSvg = analysisMarker
      ? lichessAnalysisGlyphSvg(analysisMarker.symbol, analysisMarker.fill)
      : null;
    const marker =
      /^[a-h][1-8][a-h][1-8]/.test(markerUci) && markerSvg
        ? [
            {
              orig: markerUci.slice(2, 4) as Key,
              customSvg: { html: markerSvg },
            } satisfies DrawShape,
          ]
        : [];
    const preview = threatMove
      ? previewMoveShape(threatMove, "threat")
      : previewMoveShape(previewMove, "paleBlue");
    const engineArrows =
      !preview.length && showBestMoveArrow && !disabled && engineMoves
        ? [
            ...engineMoves.slice(1).flatMap((move) => previewMoveShape(move, "otherEngineMove")),
            ...previewMoveShape(engineMoves[0], "bestMove"),
          ]
        : [];
    cgRef.current?.setAutoShapes([...engineArrows, ...preview, ...marker]);
  }, [analysisMarker, disabled, engineMoves, previewMove, showBestMoveArrow, threatMove]);

  useEffect(() => {
    if (!showSolution) return;
    const currentHistory = historyRef.current;
    const currentPly = currentHistory.index;
    const playedMoveKeys = historyMoveKeys(currentHistory, currentPly);
    const matchingLineIndex = solutionEntriesRef.current.findIndex((entry) =>
      playedMoveKeys.every((moveKey, index) => entry.moveEntries[index]?.key === moveKey),
    );

    showSolutionLine(matchingLineIndex >= 0 ? matchingLineIndex : 0, currentPly);
  }, [fen, showSolution, showSolutionLine]);

  useEffect(() => {
    if (!solutionNavigation || introPlayingRef.current) return;

    if (
      (solutionNavigation.type === "custom" || solutionNavigation.type === "solution") &&
      positionRef.current &&
      !canNavigateBoard()
    ) {
      onNavigateHandledRef.current?.();
      return;
    }
    if (
      solutionNavigation.type !== "play" &&
      solutionNavigation.type !== "command" &&
      solutionNavigation.type !== "history"
    ) {
      cgRef.current?.cancelPremove?.();
    }

    switch (solutionNavigation.type) {
      case "reset":
        resetToFen(solutionNavigation.fen);
        break;
      case "loadPgn":
        loadPgnMainline(
          solutionNavigation.fen ?? fenRef.current,
          solutionNavigation.pgn,
          solutionNavigation.line,
          solutionNavigation.ply,
        );
        break;
      case "play":
        playUciMove(solutionNavigation.uci);
        break;
      case "line": {
        analysisPlaybackRunningRef.current = true;
        let cancelled = false;
        let timeoutId: number | null = null;
        const stepDelay = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? 0
          : ANALYSIS_LINE_PLAYBACK_DELAY_MS;

        const finish = (): void => {
          if (cancelled) return;
          analysisPlaybackRunningRef.current = false;
          onNavigateHandledRef.current?.();
        };
        const playNext = (index: number): void => {
          if (cancelled) return;
          const uci = solutionNavigation.ucis[index];
          if (!uci) {
            finish();
            return;
          }
          const position = positionRef.current;
          const move = position ? moveFromUci(position, uci.trim().toLowerCase()) : undefined;
          if (!position || !move || !position.isLegal(move)) {
            finish();
            return;
          }
          playUciMove(uci);
          if (index === solutionNavigation.ucis.length - 1) {
            finish();
            return;
          }
          timeoutId = window.setTimeout(() => playNext(index + 1), stepDelay);
        };

        playNext(0);
        return () => {
          cancelled = true;
          analysisPlaybackRunningRef.current = false;
          if (timeoutId !== null) window.clearTimeout(timeoutId);
        };
      }
      case "command":
        navigatePlayback(solutionNavigation.command);
        break;
      case "custom":
        showCustomLine(solutionNavigation.line, solutionNavigation.ply);
        break;
      case "solution":
        if (
          solutionEntriesRef.current[solutionNavigation.line]?.history.plies[solutionNavigation.ply]
        ) {
          showSolutionLine(solutionNavigation.line, solutionNavigation.ply);
        }
        break;
      case "history":
        navigateTo(solutionNavigation.ply);
        break;
      case "annotate": {
        const annotation = /^(?:\?|\?\?|\?!|!\?|!!)?$/.test(solutionNavigation.annotation)
          ? solutionNavigation.annotation
          : "";
        if (solutionNavigation.source === "custom" && solutionNavigation.line !== undefined) {
          const targetHistory = variationHistoryAt(
            customVariationsRef.current,
            solutionNavigation.line,
          );
          const targetSan = targetHistory?.plies[solutionNavigation.ply]?.san;
          if (targetSan) {
            annotateVariationMove(
              customVariationsRef.current,
              solutionNavigation.line,
              solutionNavigation.ply,
              formatSolutionMove(splitSolutionMove(targetSan).san, annotation),
            );
            if (viewRef.current.line.source === "custom") {
              const refreshed = variationHistoryAt(
                customVariationsRef.current,
                viewRef.current.line.index,
              );
              if (refreshed) {
                refreshed.index = Math.min(historyRef.current.index, refreshed.plies.length - 1);
                historyRef.current = refreshed;
              }
            }
          }
        } else {
          const target = historyRef.current.plies[solutionNavigation.ply];
          if (target?.san) {
            target.san = formatSolutionMove(splitSolutionMove(target.san).san, annotation);
          }
        }

        const position = positionRef.current;
        if (position) {
          syncBoard(position, historyRef.current.plies[historyRef.current.index]?.lastMove);
        }
        break;
      }
    }

    onNavigateHandledRef.current?.();
    return undefined;
  }, [
    solutionNavigation,
    fenRef,
    onNavigateHandledRef,
    canNavigateBoard,
    navigatePlayback,
    navigateTo,
    loadPgnMainline,
    playUciMove,
    resetToFen,
    showSolutionLine,
    showCustomLine,
    syncBoard,
  ]);

  useEffect(() => {
    if (!analysisMode) return;

    const position = positionRef.current;
    if (!position) return;

    clearMoveEvaluationTimer();
    clearPendingPromotion();
    interactionLockedRef.current = false;

    syncBoard(position, historyRef.current.plies[historyRef.current.index]?.lastMove, {
      status: getStatus(position),
    });
  }, [
    analysisMode,
    interactionLockedRef,
    clearMoveEvaluationTimer,
    clearPendingPromotion,
    syncBoard,
  ]);

  useBoardShortcuts(navigatePlayback, !enableNavigationShortcuts, captureNavigationShortcuts);

  useEffect(() => {
    if (showSolution && solutionEntriesRef.current.length > 0) return;
    if (solutionNavigationRef.current && historyRef.current.plies.length) {
      if (solutionEditor && analysisModeRef.current) {
        lastAutomaticResetFenRef.current = fen;
      }
      return;
    }
    if (solutionEditor && analysisModeRef.current) {
      if (lastAutomaticResetFenRef.current === fen) return;
    }
    lastAutomaticResetFenRef.current = fen;

    clearMoveEvaluationTimer();

    const { position, error } = tryCreateAtomicPosition(fen);
    if (!position) {
      positionRef.current = null;
      cgRef.current?.set({
        orientation: orientationRef.current,
        coordinates: coordinatesRef.current,
        check: false,
        movable: {
          dests: new Map(),
        },
      });
      onStateChangeRef.current?.({
        fen,
        turn: "",
        view: initialBoardView(),
        status: "Invalid position",
        winner: undefined,
        error,
        solved: false,
      });
      return;
    }

    clearPendingPromotion();
    const history = createBoardHistory(fen);
    resetSession({
      history,
      locked: showSolution && !analysisModeRef.current,
      candidates: solutionUciLines,
      solved: isSolutionCompleteAt(solutionUciLines, 0),
    });

    const openingMove = initialIntroRef.current;
    const lastMove = openingMove
      ? keyPair(openingMove.uci.slice(0, 2), openingMove.uci.slice(2, 4))
      : undefined;
    history.plies[0]!.lastMove = lastMove;
    const showPuzzlePosition = () => {
      syncBoard(position, lastMove);
    };
    if (
      !openingMove ||
      !initialAutoplayIntroRef.current ||
      blindFenRef.current ||
      introPlayedRef.current ||
      showSolution
    ) {
      showPuzzlePosition();
      return;
    }

    // Keep the solution rooted at ply zero. Only the displayed board is rewound.
    const board = cgRef.current;
    const notifyIntroEnd = onIntroEndRef.current;
    const startedAt = Date.now();
    const reducedMotion = prefersReducedMotion();
    const setIntroInteraction = (enabled: boolean) => {
      board?.set({ draggable: { enabled }, selectable: { enabled } });
    };
    introPlayingRef.current = true;
    setIntroInteraction(false);
    let finishTimer: number | undefined;
    let animationFrame: number | undefined;
    const finish = () => {
      if (board?.state.animation?.current) {
        animationFrame = window.requestAnimationFrame(finish);
        return;
      }
      introPlayingRef.current = false;
      introPlayedRef.current = true;
      setIntroInteraction(true);
      showPuzzlePosition();
      notifyIntroEnd?.(Date.now() - startedAt, true);
    };
    if (!reducedMotion) {
      board?.set({
        fen: openingMove.beforeFen,
        animation: { enabled: false },
        turnColor: colorFromFen(openingMove.beforeFen),
        lastMove: [],
        check: false,
        movable: { dests: new Map(), free: false },
      });
    }
    const playTimer = window.setTimeout(
      () => {
        if (reducedMotion) {
          finish();
          return;
        }
        // Animate the board without publishing the new position until input unlocks.
        board?.set({
          animation: { enabled: true, duration: PUZZLE_INTRO_ANIMATION_MS },
          fen: makeFen(position.toSetup()),
          turnColor: position.turn,
          lastMove: lastMove ?? [],
          check: position.isCheck() ? position.turn : false,
        });
        playMoveSound(position, openingMove.san, openingMove.uci);
        finishTimer = window.setTimeout(finish, PUZZLE_INTRO_ANIMATION_MS);
      },
      reducedMotion ? 0 : PUZZLE_INTRO_HOLD_MS,
    );
    return () => {
      window.clearTimeout(playTimer);
      window.clearTimeout(finishTimer);
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
      if (introPlayingRef.current) {
        notifyIntroEnd?.(Date.now() - startedAt, false);
        introPlayingRef.current = false;
        setIntroInteraction(true);
        board?.set({ animation: { enabled: true } });
      }
    };
  }, [
    fen,
    blindFenRef,
    solutionUciLines,
    clearMoveEvaluationTimer,
    clearPendingPromotion,
    coordinatesRef,
    analysisModeRef,
    onIntroEndRef,
    onStateChangeRef,
    orientationRef,
    playMoveSound,
    solutionEditor,
    resetSession,
    showSolution,
    solutionNavigationRef,
    syncBoard,
  ]);

  const previousBlindFenRef = useRef(blindFen);
  useEffect(() => {
    if (introPlayingRef.current) {
      cgRef.current?.set({ orientation, coordinates });
      return;
    }
    let position = positionRef.current;
    if (!position) {
      const fallbackFen = historyRef.current.plies[historyRef.current.index]?.fen ?? fenRef.current;
      position = tryCreateAtomicPosition(fallbackFen).position;
    }
    if (!position) return;
    positionRef.current = position;

    const history = historyRef.current;
    const movable = getMovableConfig(position);
    const displayTurn = getDisplayTurn(position);
    const displayCheck =
      displayTurn === position.turn && position.isCheck() ? position.turn : false;

    const lastMove =
      viewRef.current.position === "beforeIntro"
        ? undefined
        : history.plies[history.index]?.lastMove;
    const blindViewChanged = previousBlindFenRef.current !== blindFen;
    previousBlindFenRef.current = blindFen;
    cgRef.current?.set({
      ...(blindViewChanged ? { fen: blindFen ?? makeFen(position.toSetup()) } : {}),
      orientation,
      coordinates,
      movable,
      turnColor: blindFen ? colorFromFen(blindFen) : displayTurn,
      lastMove: blindFen ? [] : (lastMove ?? []),
      check: !blindFen && displayCheck,
    });
  }, [
    orientation,
    blindFen,
    coordinates,
    disabled,
    fenRef,
    getDisplayTurn,
    getMovableConfig,
    effectivePremovesEnabled,
  ]);

  return (
    <div
      hidden={hidden}
      data-blind-board={blindFen ? "" : undefined}
      className={`cg-boardShell cg-pieceTheme${showBoardCoordinates === false ? " coordinatesHidden" : ""}`}
      style={{ ...pieceStyle, ...boardStyle }}
    >
      <div ref={elementRef} className="cg-board" />
      <BoardResizeHandle />
      {blindFen && !disabled && !pendingPromotion ? (
        <BlindMoveSquares
          key={blindFen}
          orientation={orientation}
          getLegalDestinations={getBlindLegalDestinations}
          onSelect={(square) => cgRef.current?.set({ lastMove: square ? [square] : [] })}
          onMove={handleBoardMove}
          onIllegalMove={() => {
            if (positionRef.current) emitState(positionRef.current, { error: "Illegal move" });
          }}
        />
      ) : null}
      {pendingPromotion && (
        <BoardPromotionPicker
          pending={pendingPromotion}
          orientation={orientation}
          onChoose={choosePromotion}
          {...(blindFen ? { onCancel: clearPendingPromotion } : {})}
        />
      )}
    </div>
  );
};

// The surrounding analysis and practice workspaces update for clocks, database responses, and
// engine progress. Chessground owns its rendered board, so avoid re-running this React shell when
// none of the board-facing props changed.
export const Chessboard = memo(ChessboardComponent);
