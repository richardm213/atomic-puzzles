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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAppSettings } from "../../context/AppSettings";
import {
  moveFromUci,
  movePrefix,
  parseSolutionUciLines,
  toComparableUci,
  type UciSolutionEntry,
  type UciSolutionLine,
} from "../../lib/puzzles/solutionPgn";
import type {
  AttemptResolved,
  ChessboardState,
  PlaybackCommand,
  SolutionNavigation,
} from "../../types/chessboard";
import {
  appendBoardMove,
  assertBoardHistory,
  type BoardHistory,
  cloneBoardHistory,
  createBoardHistory,
  historyMoveKeys,
  historyMoveSans,
} from "./boardHistory";
import { useBoardShortcuts } from "./boardShortcuts";
import { buildBoardStyle, buildPieceStyle } from "./boardStyle";
import { buildPgnHistory } from "./pgnHistory";
import {
  createPendingPromotion,
  getPromotionChoices,
  getPromotionSquareStyle,
  type PendingPromotion,
  type PromotionRole,
} from "./promotionHelpers";
import {
  buildSolutionHistory,
  evaluateTrainingMove,
  hasExpectedMoveAt,
  recomputeTrainingState,
  tryCreateAtomicPosition,
} from "./puzzlePlayback";
import { useChessground } from "./useChessground";
import { usePuzzleTraining } from "./usePuzzleTraining";
import {
  createVariationHistory,
  saveVariation,
  variationHistoryAt,
  variationMoveKeys,
  variationMoveSans,
} from "./variationHistory";

type DisplaySolutionEntry = {
  moveEntries: UciSolutionLine;
  sanLine: string[];
  history: BoardHistory;
};

type ActiveLine =
  | { source: "history" }
  | { source: "solution"; index: number }
  | { source: "custom"; index: number };

export type ChessboardProps = {
  puzzleId: string | number | null | undefined;
  fen: string;
  orientation: Color;
  coordinates: boolean;
  solution: string;
  solutionUciLines?: UciSolutionLine[];
  showSolution: boolean;
  analysisMode?: boolean;
  solutionNavigation?: SolutionNavigation | null | undefined;
  previewMove?: string | null | undefined;
  captureNavigationShortcuts?: boolean;
  preserveAnalysisHistoryOnSolutionChange?: boolean;
  restrictMovesToSolution?: boolean;
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

const MOVE_EVALUATION_DELAY_MS = 250;

const keyPair = (a: string, b: string): [Key, Key] => [a as Key, b as Key];

const previewMoveShape = (uci: string | null | undefined): DrawShape[] => {
  const normalized = uci?.trim().toLowerCase() ?? "";
  if (!/^[a-h][1-8][a-h][1-8]/.test(normalized)) return [];

  return [
    {
      orig: normalized.slice(0, 2) as Key,
      dest: normalized.slice(2, 4) as Key,
      brush: "paleBlue",
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

export const Chessboard = ({
  puzzleId,
  fen,
  orientation,
  coordinates,
  solution,
  solutionUciLines: suppliedSolutionUciLines,
  showSolution,
  analysisMode = false,
  solutionNavigation,
  previewMove,
  captureNavigationShortcuts = false,
  preserveAnalysisHistoryOnSolutionChange = false,
  restrictMovesToSolution = false,
  onNavigateHandled,
  onAttemptResolved,
  onStateChange,
}: ChessboardProps) => {
  const {
    pieceSet,
    boardTheme,
    customLightSquare,
    customDarkSquare,
    boardColorOverrideTheme,
    boardOverrideLightSquare,
    boardOverrideDarkSquare,
  } = useAppSettings();
  const elementRef = useRef<HTMLDivElement | null>(null);
  const lastAutomaticResetFenRef = useRef<string | null>(null);
  const cgRef = useRef<Api | null>(null);
  const positionRef = useRef<Atomic | null>(null);
  const pendingPromotionRef = useRef<PendingPromotion | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const historyRef = useRef<BoardHistory>(createBoardHistory());
  const {
    boardStatusRef,
    candidateLinesRef,
    progressRef,
    evaluationTimerRef,
    cancelEvaluation: clearMoveEvaluationTimer,
    resetTraining,
  } = usePuzzleTraining();
  const orientationRef = useLatestRef(orientation);
  const coordinatesRef = useLatestRef(coordinates);
  const showSolutionRef = useLatestRef(showSolution);
  const analysisModeRef = useLatestRef(analysisMode);
  const restrictMovesToSolutionRef = useLatestRef(restrictMovesToSolution);
  const fenRef = useLatestRef(fen);
  const solutionNavigationRef = useLatestRef(solutionNavigation);
  const puzzleIdRef = useLatestRef(puzzleId);
  const solverColorRef = useLatestRef<Color>(colorFromFen(fen));
  const onStateChangeRef = useLatestRef(onStateChange);
  const onAttemptResolvedRef = useLatestRef(onAttemptResolved);

  const solutionUciLines = useMemo(
    () => suppliedSolutionUciLines ?? parseSolutionUciLines(fen, solution),
    [fen, solution, suppliedSolutionUciLines],
  );
  const solutionEntries = useMemo(
    () =>
      solutionUciLines.flatMap((line): DisplaySolutionEntry[] => {
        const history = buildSolutionHistory(fen, line);
        return history ? [{ moveEntries: line, sanLine: historyMoveSans(history), history }] : [];
      }),
    [fen, solutionUciLines],
  );
  const solutionUciLinesRef = useLatestRef(solutionUciLines);
  const solutionEntriesRef = useRef(solutionEntries);
  solutionEntriesRef.current = solutionEntries;
  const activeLineRef = useRef<ActiveLine>({ source: "history" });
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
      ),
    [
      boardTheme,
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
    (position: Atomic, nextState?: Partial<ChessboardState> | undefined): Color => {
      if (
        !solutionEntriesRef.current.length ||
        analysisModeRef.current ||
        showSolutionRef.current
      ) {
        return position.turn;
      }

      if (nextState?.showWrongMove || nextState?.solved || nextState?.status === "Correct") {
        return position.turn;
      }

      return solverColorRef.current ?? position.turn;
    },
    [analysisModeRef, showSolutionRef, solverColorRef],
  );

  const emitState = useCallback(
    (position: Atomic, next?: Partial<ChessboardState> | undefined): ChessboardState => {
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
        solutionLines: solutionEntriesRef.current.map((entry) => [...entry.sanLine]),
        customLines: variationMoveSans(customVariationsRef.current),
        solutionLineIndex:
          activeLineRef.current.source === "solution" ? activeLineRef.current.index : 0,
        ...(activeLineRef.current.source === "custom"
          ? { customLineIndex: activeLineRef.current.index }
          : {}),
        lineIndex: history.index,
        viewingSolution: activeLineRef.current.source === "solution",
        showWrongMove: false,
        showRetryMove: false,
        solved: boardStatusRef.current.solved,
        ...(next ?? {}),
      };

      onStateChangeRef.current?.(state);
      return state;
    },
    [boardStatusRef, getDisplayTurn, onStateChangeRef],
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
      activeLineRef.current = { source: "history" };
      customVariationsRef.current = createVariationHistory();
      resetTraining({ mode: locked ? "solution" : "training", locked, candidates, solved });
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
      if (boardStatusRef.current.locked) {
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
        ...(outcome ? {} : { color: position.turn }),
        dests,
        free: false,
      };
    },
    [allowedSolutionContinuations, boardStatusRef, restrictMovesToSolutionRef],
  );

  const saveMove = useCallback(
    (
      position: Atomic,
      lastMove: [Key, Key] | undefined,
      moveUci: string,
      moveKey: string,
      moveSan: string,
    ): void => {
      const previousActiveLine = activeLineRef.current;
      const history = historyRef.current;
      const nextFen = makeFen(position.toSetup());

      appendBoardMove(history, {
        fen: nextFen,
        lastMove,
        uci: moveUci,
        key: moveKey,
        san: moveSan,
      });

      if (analysisModeRef.current) {
        if (previousActiveLine.source !== "custom") {
          const index = saveVariation(customVariationsRef.current, history);
          activeLineRef.current = { source: "custom", index };
        } else {
          saveVariation(customVariationsRef.current, history, previousActiveLine.index);
          activeLineRef.current = previousActiveLine;
        }
      } else {
        activeLineRef.current = { source: "history" };
      }
    },
    [analysisModeRef],
  );

  const syncBoard = useCallback(
    (
      position: Atomic,
      lastMove: [Key, Key] | undefined,
      nextState?: Partial<ChessboardState> | undefined,
    ): void => {
      positionRef.current = position;

      const movable = getMovableConfig(position);
      const displayTurn = getDisplayTurn(position, nextState);
      const displayCheck =
        displayTurn === position.turn && position.isCheck() ? position.turn : false;

      cgRef.current?.set({
        fen: makeFen(position.toSetup()),
        orientation: orientationRef.current,
        coordinates: coordinatesRef.current,
        turnColor: displayTurn,
        lastMove: lastMove ?? [],
        check: displayCheck,
        movable,
      });

      emitState(position, nextState);
    },
    [coordinatesRef, emitState, getDisplayTurn, getMovableConfig, orientationRef],
  );

  const recomputeTrainingFromHistory = useCallback(
    (targetIndex: number): void => {
      const nextState = recomputeTrainingState({
        isTrainingEnabled: solutionEntriesRef.current.length > 0,
        isAnalysisMode: analysisModeRef.current,
        playedMoveKeys: historyMoveKeys(historyRef.current, targetIndex),
        solutionLines: solutionUciLinesRef.current,
      });

      candidateLinesRef.current = nextState.candidates;
      progressRef.current = nextState.progress;
      boardStatusRef.current.solved = nextState.solved;
    },
    [analysisModeRef, boardStatusRef, candidateLinesRef, progressRef, solutionUciLinesRef],
  );

  const navigateTo = useCallback(
    (targetIndex: number): void => {
      const history = historyRef.current;
      assertBoardHistory(history);
      if (targetIndex < 0 || targetIndex >= history.plies.length) return;

      clearMoveEvaluationTimer();

      const targetFen = history.plies[targetIndex]?.fen;
      if (targetFen === undefined) return;
      const { position } = tryCreateAtomicPosition(targetFen);
      if (!position) return;

      history.index = targetIndex;
      boardStatusRef.current.locked = isSolutionPlaybackLocked();
      recomputeTrainingFromHistory(targetIndex);

      syncBoard(position, history.plies[targetIndex]?.lastMove);
    },
    [
      boardStatusRef,
      clearMoveEvaluationTimer,
      isSolutionPlaybackLocked,
      recomputeTrainingFromHistory,
      syncBoard,
    ],
  );

  const activateHistory = useCallback(
    ({
      history,
      ply,
      activeLine,
      locked,
      state,
    }: {
      history: BoardHistory;
      ply?: number | undefined;
      activeLine: ActiveLine;
      locked: boolean;
      state?: Partial<ChessboardState>;
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
      historyRef.current = history;
      activeLineRef.current = activeLine;
      boardStatusRef.current = {
        ...boardStatusRef.current,
        mode: activeLine.source === "solution" ? "solution" : "analysis",
        locked,
      };
      syncBoard(position, step.lastMove, state);
    },
    [boardStatusRef, clearMoveEvaluationTimer, syncBoard],
  );

  const showSolutionLine = useCallback(
    (lineIndex: number, targetPly?: number): void => {
      const solutionEntry = solutionEntriesRef.current[lineIndex];
      if (!solutionEntry?.moveEntries?.length) return;

      candidateLinesRef.current = [];
      progressRef.current = 0;
      activateHistory({
        history: cloneBoardHistory(solutionEntry.history),
        ply: targetPly,
        activeLine: { source: "solution", index: lineIndex },
        locked: !analysisModeRef.current,
        state: {
          solved: boardStatusRef.current.solved,
          viewingSolution: true,
          solutionLineIndex: lineIndex,
        },
      });
    },
    [activateHistory, analysisModeRef, boardStatusRef, candidateLinesRef, progressRef],
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
        state: { viewingSolution: false },
      });
    },
    [activateHistory],
  );

  const navigatePlayback = useCallback(
    (command: PlaybackCommand): void => {
      const history = historyRef.current;
      let resolvedCommand = command;

      if (command === "previousOption" || command === "nextOption") {
        const playedMoveKeys = historyMoveKeys(history);
        const options: Array<{ source: "solution" | "custom"; lineIndex: number; key: string }> =
          [];
        const seenMoves = new Set<string>();
        const canBrowseSolutionOptions =
          showSolutionRef.current ||
          (preserveAnalysisHistoryOnSolutionChange && analysisModeRef.current);
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

        if (canBrowseSolutionOptions) {
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
          const activeLine = activeLineRef.current;
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
          return;
        }

        resolvedCommand = command === "previousOption" ? "start" : "end";
      }

      if (showSolutionRef.current && activeLineRef.current.source === "solution") {
        const activeLineIndex = activeLineRef.current.index;

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
      analysisModeRef,
      navigateTo,
      preserveAnalysisHistoryOnSolutionChange,
      showCustomLine,
      showSolutionLine,
      showSolutionRef,
    ],
  );

  const autoplayOpponentMove = useCallback(
    (position: Atomic): boolean => {
      const candidates = candidateLinesRef.current;
      const progress = progressRef.current;
      const nextEntry: UciSolutionEntry | undefined = candidates[0]?.[progress];

      if (!nextEntry) {
        boardStatusRef.current.solved = true;
        return false;
      }

      const move = moveFromUci(position, nextEntry.uci);
      if (!move) {
        boardStatusRef.current.solved = true;
        return false;
      }

      const opponentMoveSan = makeSan(position, move);
      position.play(move);
      saveMove(
        position,
        keyPair(nextEntry.uci.slice(0, 2), nextEntry.uci.slice(2, 4)),
        nextEntry.uci,
        nextEntry.key,
        opponentMoveSan,
      );

      candidateLinesRef.current = candidates.filter(
        (line) => line[progress]?.uci === nextEntry.uci,
      );
      progressRef.current = progress + 1;
      boardStatusRef.current.solved = !hasExpectedMoveAt(
        candidateLinesRef.current,
        progressRef.current,
      );

      return true;
    },
    [boardStatusRef, candidateLinesRef, progressRef, saveMove],
  );

  const clearPendingPromotion = useCallback((): void => {
    pendingPromotionRef.current = null;
    setPendingPromotion(null);
  }, []);

  const playUserMove = useCallback(
    (orig: string, dest: string, promotion?: Role | undefined): void => {
      const position = positionRef.current;
      if (!position || boardStatusRef.current.locked || isSolutionPlaybackLocked()) {
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

      if (analysisModeRef.current) {
        position.play(move);
        saveMove(position, keyPair(orig, dest), userMoveText, userMoveKey, userMoveSan);
        syncBoard(position, keyPair(orig, dest), {
          solved: false,
          status: getStatus(position),
        });
        return;
      }

      const trainingEnabled = solutionEntriesRef.current.length > 0 && !analysisModeRef.current;

      if (!trainingEnabled || boardStatusRef.current.solved) {
        position.play(move);
        saveMove(position, keyPair(orig, dest), userMoveText, userMoveKey, userMoveSan);
        syncBoard(position, keyPair(orig, dest), {
          solved: boardStatusRef.current.solved,
        });
        return;
      }

      const moveResult = evaluateTrainingMove({
        playedMoveKeys: historyMoveKeys(historyRef.current),
        solutionLines: solutionUciLinesRef.current,
        moveKey: userMoveKey,
      });
      const { candidates, progress, evaluation: moveEvaluation } = moveResult;
      candidateLinesRef.current = candidates;
      progressRef.current = progress;

      boardStatusRef.current = { ...boardStatusRef.current, mode: "evaluating", locked: true };
      cgRef.current?.set({
        lastMove: keyPair(orig, dest),
        movable: {
          dests: new Map(),
          free: false,
        },
      });

      clearMoveEvaluationTimer();
      const scheduledPuzzleId = puzzleIdRef.current;
      const scheduledFen = fenRef.current;
      const scheduledHistoryIndex = historyRef.current.index;
      const scheduledProgress = progressRef.current;

      evaluationTimerRef.current = window.setTimeout(() => {
        evaluationTimerRef.current = null;

        if (
          puzzleIdRef.current !== scheduledPuzzleId ||
          fenRef.current !== scheduledFen ||
          historyRef.current.index !== scheduledHistoryIndex ||
          progressRef.current !== scheduledProgress
        ) {
          return;
        }

        const activePos = positionRef.current;
        if (!activePos) return;

        if (moveEvaluation === "retry") {
          boardStatusRef.current = { ...boardStatusRef.current, mode: "training", locked: false };
          syncBoard(activePos, undefined, {
            showRetryMove: true,
            solved: false,
            status: "Try again",
          });
          return;
        }

        if (moveEvaluation === "wrong") {
          boardStatusRef.current = { ...boardStatusRef.current, mode: "training", locked: false };
          onAttemptResolvedRef.current?.({
            puzzleId: puzzleIdRef.current,
            puzzleCorrect: false,
            incorrectMove: `${Math.floor(progress / 2) + 1}. ${userMoveSan}`,
            correctMove: null,
          });
          syncBoard(activePos, undefined, {
            showWrongMove: true,
            solved: false,
            status: "Incorrect",
          });
          return;
        }

        activePos.play(move);
        saveMove(activePos, keyPair(orig, dest), userMoveText, userMoveKey, userMoveSan);

        const nextCandidates = candidates.filter((line) => line[progress]?.key === userMoveKey);
        candidateLinesRef.current = nextCandidates;
        progressRef.current = progress + 1;

        if (!hasExpectedMoveAt(nextCandidates, progressRef.current)) {
          boardStatusRef.current = { mode: "training", locked: false, solved: true };
          onAttemptResolvedRef.current?.({
            puzzleId: puzzleIdRef.current,
            puzzleCorrect: true,
            incorrectMove: null,
            correctMove: getCorrectLineMove(),
          });
          syncBoard(activePos, keyPair(orig, dest), {
            solved: true,
            status: "Correct",
          });
          return;
        }

        const playedOpponent = autoplayOpponentMove(activePos);
        boardStatusRef.current.locked = false;

        if (boardStatusRef.current.solved) {
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
            solved: boardStatusRef.current.solved,
            status: boardStatusRef.current.solved ? "Correct" : getStatus(activePos),
          },
        );
      }, MOVE_EVALUATION_DELAY_MS);
    },
    [
      autoplayOpponentMove,
      allowedSolutionContinuations,
      boardStatusRef,
      candidateLinesRef,
      clearMoveEvaluationTimer,
      fenRef,
      analysisModeRef,
      isSolutionPlaybackLocked,
      evaluationTimerRef,
      getCorrectLineMove,
      onAttemptResolvedRef,
      puzzleIdRef,
      progressRef,
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
          status: "Invalid position",
          winner: undefined,
          error,
          showWrongMove: false,
          showRetryMove: false,
          solved: false,
        });
        return;
      }

      resetSession({ history: createBoardHistory(nextFen) });

      syncBoard(position, undefined, {
        solved: false,
        viewingSolution: false,
      });
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
    (initialFen: string, pgn: string): void => {
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

      resetSession({ history: result.history });

      syncBoard(result.position, result.history.plies[result.history.index]?.lastMove, {
        solved: false,
        viewingSolution: false,
      });
    },
    [clearMoveEvaluationTimer, clearPendingPromotion, emitState, resetSession, syncBoard],
  );

  const handleBoardMove = useCallback(
    (orig: string, dest: string): void => {
      const position = positionRef.current;
      if (
        !position ||
        boardStatusRef.current.locked ||
        isSolutionPlaybackLocked() ||
        pendingPromotionRef.current
      ) {
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
    [boardStatusRef, isSolutionPlaybackLocked, orientationRef, playUserMove, syncBoard],
  );

  const cleanupBoard = useCallback(() => {
    clearMoveEvaluationTimer();
    positionRef.current = null;
    clearPendingPromotion();
  }, [clearMoveEvaluationTimer, clearPendingPromotion]);

  useChessground({
    elementRef,
    apiRef: cgRef,
    fen,
    orientation,
    coordinates,
    onAfterMove: handleBoardMove,
    onCleanup: cleanupBoard,
  });

  useEffect(() => {
    cgRef.current?.setAutoShapes(previewMoveShape(previewMove));
  }, [previewMove]);

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
    if (!solutionNavigation) return;

    switch (solutionNavigation.type) {
      case "reset":
        resetToFen(solutionNavigation.fen);
        break;
      case "loadPgn":
        loadPgnMainline(solutionNavigation.fen ?? fenRef.current, solutionNavigation.pgn);
        break;
      case "play":
        playUciMove(solutionNavigation.uci);
        break;
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
    }

    onNavigateHandled?.();
  }, [
    solutionNavigation,
    fenRef,
    onNavigateHandled,
    navigatePlayback,
    navigateTo,
    loadPgnMainline,
    playUciMove,
    resetToFen,
    showSolutionLine,
    showCustomLine,
  ]);

  useEffect(() => {
    if (!analysisMode) return;

    const position = positionRef.current;
    if (!position) return;

    clearMoveEvaluationTimer();
    clearPendingPromotion();
    boardStatusRef.current = {
      mode: "analysis",
      locked: false,
      solved: boardStatusRef.current.solved,
    };
    candidateLinesRef.current = [];
    progressRef.current = 0;

    syncBoard(position, historyRef.current.plies[historyRef.current.index]?.lastMove, {
      solved: boardStatusRef.current.solved,
      status: boardStatusRef.current.solved ? "Correct" : getStatus(position),
    });
  }, [
    analysisMode,
    boardStatusRef,
    candidateLinesRef,
    clearMoveEvaluationTimer,
    clearPendingPromotion,
    progressRef,
    syncBoard,
  ]);

  useBoardShortcuts(navigatePlayback, pendingPromotion !== null, captureNavigationShortcuts);

  useEffect(() => {
    if (showSolution && solutionEntriesRef.current.length > 0) return;
    if (solutionNavigationRef.current) {
      if (preserveAnalysisHistoryOnSolutionChange && analysisModeRef.current) {
        lastAutomaticResetFenRef.current = fen;
      }
      return;
    }
    if (preserveAnalysisHistoryOnSolutionChange && analysisModeRef.current) {
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
        status: "Invalid position",
        winner: undefined,
        error,
        showWrongMove: false,
        showRetryMove: false,
        solved: false,
      });
      return;
    }

    clearPendingPromotion();
    resetSession({
      history: createBoardHistory(fen),
      locked: showSolution && !analysisModeRef.current,
      candidates: solutionUciLines,
      solved: solutionUciLines.length > 0 && !hasExpectedMoveAt(solutionUciLines, 0),
    });

    syncBoard(position, undefined, {
      solved: false,
      viewingSolution: showSolution,
    });
  }, [
    fen,
    solutionUciLines,
    clearMoveEvaluationTimer,
    clearPendingPromotion,
    coordinatesRef,
    analysisModeRef,
    onStateChangeRef,
    orientationRef,
    preserveAnalysisHistoryOnSolutionChange,
    resetSession,
    showSolution,
    solutionNavigationRef,
    syncBoard,
  ]);

  useEffect(() => {
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

    const lastMove = history.plies[history.index]?.lastMove;
    cgRef.current?.set({
      orientation,
      coordinates,
      movable,
      turnColor: displayTurn,
      lastMove: lastMove ?? [],
      check: displayCheck,
    });
  }, [orientation, coordinates, fenRef, getDisplayTurn, getMovableConfig]);

  return (
    <div className="cg-boardShell cg-pieceTheme" style={{ ...pieceStyle, ...boardStyle }}>
      <div ref={elementRef} className="cg-board" />
      {pendingPromotion ? (
        <div
          id="promotion-choice"
          className={pendingPromotion.vertical}
          aria-label="Select promotion piece"
          onContextMenu={(event) => event.preventDefault()}
        >
          {pendingPromotion.choices.map((role, index) => (
            <square
              key={role}
              role="button"
              tabIndex={0}
              style={getPromotionSquareStyle(pendingPromotion, index, orientationRef.current)}
              aria-label={`Promote to ${role}`}
              onClick={() => choosePromotion(role)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                choosePromotion(role);
              }}
            >
              <piece className={`${role} ${pendingPromotion.color}`} aria-hidden="true" />
            </square>
          ))}
        </div>
      ) : null}
    </div>
  );
};
