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
import { BoardPromotionPicker } from "./BoardPromotionPicker";
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
  variationHistoryAt,
  variationMoveKeys,
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

  const isMoveInputBlocked = useCallback(
    (): boolean =>
      disabledRef.current ||
      introPlayingRef.current ||
      viewRef.current.position === "beforeIntro" ||
      interactionLockedRef.current ||
      isSolutionPlaybackLocked(),
    [disabledRef, interactionLockedRef, isSolutionPlaybackLocked],
  );

  const getCorrectLineMove = useCallback((): string | null => {
    const mainLine = solutionEntriesRef.current[0]?.moveEntries;
    if (!mainLine || solutionEntriesRef.current.length < 2) return null;

    const playedMoveKeys = historyMoveKeys(historyRef.current);
    const playedDivergenceIndex = playedMoveKeys.findIndex(
      (moveKey, moveIndex) => moveKey !== mainLine[moveIndex]?.key,
    );
    const mainLineDivergenceIndex = mainLine.findIndex((mainMove, moveIndex) =>
      solutionEntriesRef.current
        .slice(1)
        .some((alternateLine) => alternateLine.moveEntries[moveIndex]?.key !== mainMove.key),
    );
    const displayedMoveIndex =
      playedDivergenceIndex < 0 ? mainLineDivergenceIndex : playedDivergenceIndex;
    if (displayedMoveIndex < 0) return null;

    const playedSan = historyMoveSans(historyRef.current)[displayedMoveIndex];
    return playedSan ? `${movePrefix(displayedMoveIndex, true)}${playedSan}` : null;
  }, []);

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
      const history = historyRef.current;
      const displayTurn = getDisplayTurn(position, next);
      const state: ChessboardState = {
        fen: makeFen(position.toSetup()),
        turn: displayTurn,
        status:
          next?.status ??
          (displayTurn === position.turn ? getStatus(position) : `${displayTurn} to move`),
        winner: position.outcome()?.winner,
        error: "",
        lineMoves: historyMoveSans(history),
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
    [attemptRef, canBrowseSolution, getDisplayTurn, onStateChangeRef],
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
    (target: number | "beforeIntro"): boolean => {
      const history = historyRef.current;
      if (!history.plies.length) return false;
      assertBoardHistory(history);
      const beforeIntro = target === "beforeIntro";
      const targetIndex = beforeIntro ? 0 : target;
      if (targetIndex < 0 || targetIndex >= history.plies.length) return false;
      if (beforeIntro && (blindFenRef.current || introPlayingRef.current)) return false;

      const targetFen = beforeIntro
        ? initialIntroRef.current?.beforeFen
        : history.plies[targetIndex]?.fen;
      if (targetFen === undefined) return false;
      const { position } = tryCreateAtomicPosition(targetFen);
      if (!position) return false;

      clearMoveEvaluationTimer();
      history.index = targetIndex;
      // The opponent's move precedes puzzle ply zero; inspecting its starting
      // position must not add a training ply or briefly activate the puzzle root.
      viewRef.current.position = beforeIntro ? "beforeIntro" : targetIndex;
      interactionLockedRef.current = isSolutionPlaybackLocked();

      syncBoard(position, history.plies[targetIndex]?.lastMove);
      return true;
    },
    [
      blindFenRef,
      interactionLockedRef,
      clearMoveEvaluationTimer,
      isSolutionPlaybackLocked,
      syncBoard,
    ],
  );

  const activateHistory = useCallback(
    ({
      history,
      ply,
      activeLine,
      locked,
    }: {
      history: BoardHistory;
      ply?: number | undefined;
      activeLine: BoardLineRef;
      locked: boolean;
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
      if (!storedHistory) return;

      activateHistory({
        history: cloneBoardHistory(storedHistory),
        ply: targetPly,
        activeLine: { source: "custom", index: lineIndex },
        locked: false,
      });
    },
    [activateHistory],
  );

  const resumeDefaultMainLine = useCallback(
    (history: BoardHistory, matchingPly: number, targetPly: number): boolean => {
      const currentStep = history.plies[matchingPly];
      if (!currentStep) return false;

      const mainSolution = solutionEntriesRef.current[0]?.history;
      if (
        canBrowseSolution() &&
        mainSolution?.plies[matchingPly]?.fen === currentStep.fen &&
        mainSolution.plies[targetPly]
      ) {
        showSolutionLine(0, targetPly);
        return true;
      }

      const mainAnalysisLine = variationHistoryAt(customVariationsRef.current, 0);
      if (
        mainAnalysisLine?.plies[matchingPly]?.fen === currentStep.fen &&
        mainAnalysisLine.plies[targetPly]
      ) {
        showCustomLine(0, targetPly);
        return true;
      }

      return false;
    },
    [canBrowseSolution, showCustomLine, showSolutionLine],
  );

  const navigatePlayback = useCallback(
    (command: PlaybackCommand): void => {
      if (introPlayingRef.current) return;
      const history = historyRef.current;
      if (viewRef.current.position === "beforeIntro") {
        if (command === "previous" || command === "previousOption") return;
        if (command === "next" || command === "nextOption") {
          navigateTo(0);
          return;
        }
      }
      let resolvedCommand = command;

      if (command === "previousOption" || command === "nextOption") {
        const playedMoveKeys = historyMoveKeys(history);
        const options: Array<{ source: "solution" | "custom"; lineIndex: number; key: string }> =
          [];
        const seenMoves = new Set<string>();
        const addOption = (
          source: "solution" | "custom",
          lineIndex: number,
          moveKeys: string[],
        ): void => {
          const matches = playedMoveKeys.every((key, index) => moveKeys[index] === key);
          const nextKey = moveKeys[history.index];
          if (!matches || !nextKey || seenMoves.has(nextKey)) return;
          seenMoves.add(nextKey);
          options.push({ source, lineIndex, key: nextKey });
        };

        if (canBrowseSolution()) {
          solutionEntriesRef.current.forEach((entry, lineIndex) =>
            addOption(
              "solution",
              lineIndex,
              entry.moveEntries.map((move) => move.key),
            ),
          );
        }
        variationMoveKeys(customVariationsRef.current).forEach((moveKeys, lineIndex) =>
          addOption("custom", lineIndex, moveKeys),
        );
        if (options.length >= 2) {
          const activeLine = viewRef.current.line;
          const currentIndex =
            activeLine.source === "history"
              ? -1
              : options.findIndex(
                  (option) =>
                    option.source === activeLine.source && option.lineIndex === activeLine.index,
                );
          const delta = command === "nextOption" ? 1 : -1;
          const nextIndex =
            ((currentIndex < 0 ? 0 : currentIndex) + delta + options.length) % options.length;
          const nextOption = options[nextIndex]!;
          if (nextOption.source === "solution") {
            showSolutionLine(nextOption.lineIndex, history.index);
          } else {
            showCustomLine(nextOption.lineIndex, history.index);
          }
          alternativeContinuationSelectedRef.current = true;
          return;
        }

        resolvedCommand = command === "previousOption" ? "start" : "end";
      }

      if (
        (resolvedCommand === "start" || (resolvedCommand === "previous" && history.index === 0)) &&
        navigateTo("beforeIntro")
      )
        return;

      if (resolvedCommand === "previous") {
        alternativeContinuationSelectedRef.current = false;
        const targetPly = history.index - 1;
        if (resumeDefaultMainLine(history, targetPly, targetPly)) return;
      }

      if (resolvedCommand === "next" && !alternativeContinuationSelectedRef.current) {
        if (resumeDefaultMainLine(history, history.index, history.index + 1)) return;
      }

      if (showSolutionRef.current && viewRef.current.line.source === "solution") {
        const activeLineIndex = viewRef.current.line.index;

        const mainLineIndex = 0;
        const targetLineIndex = resolvedCommand === "end" ? mainLineIndex : activeLineIndex;
        const targetLine =
          solutionEntriesRef.current[targetLineIndex]?.moveEntries ??
          solutionEntriesRef.current[activeLineIndex]?.moveEntries;
        const targetLineLength = targetLine?.length ?? 0;

        if (resolvedCommand === "start") {
          showSolutionLine(targetLineIndex, 0);
          return;
        }

        if (resolvedCommand === "end") {
          showSolutionLine(targetLineIndex, targetLineLength);
          return;
        }

        const delta = resolvedCommand === "next" ? 1 : -1;
        showSolutionLine(activeLineIndex, history.index + delta);
        return;
      }

      if (resolvedCommand === "start") {
        navigateTo(0);
        return;
      }

      if (resolvedCommand === "end") {
        navigateTo(history.plies.length - 1);
        return;
      }

      navigateTo(history.index + (resolvedCommand === "next" ? 1 : -1));
    },
    [
      canBrowseSolution,
      navigateTo,
      resumeDefaultMainLine,
      showCustomLine,
      showSolutionLine,
      showSolutionRef,
    ],
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
            incorrectMove: `${Math.floor(progress / 2) + 1}. ${userMoveSan}`,
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
      getCorrectLineMove,
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

    if (solutionNavigation.type !== "play") cgRef.current?.cancelPremove?.();
    if (solutionNavigation.type !== "command") {
      alternativeContinuationSelectedRef.current = false;
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
        let cancelled = false;
        let timeoutId: number | null = null;
        const stepDelay = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? 0
          : ANALYSIS_LINE_PLAYBACK_DELAY_MS;

        const finish = (): void => {
          if (!cancelled) onNavigateHandledRef.current?.();
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
        showSolutionLine(solutionNavigation.line, solutionNavigation.ply);
        break;
      case "history":
        navigateTo(solutionNavigation.ply);
        break;
      case "annotate": {
        const annotation = /^[!?]{0,2}$/.test(solutionNavigation.annotation)
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

  useBoardShortcuts(
    navigatePlayback,
    !enableNavigationShortcuts || Boolean(blindFen) || pendingPromotion !== null,
    captureNavigationShortcuts,
  );

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
