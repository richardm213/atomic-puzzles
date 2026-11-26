import { isNormal, kingCastlesTo, makeSquare } from "chessops";
import { castlingSide } from "chessops/chess";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { gameAnalysisPositionKey } from "../../shared/domain/gameAnalysis";
import type { PreloadedAtomicDbGamePosition } from "../lib/atomicDb/analysisRepository";
import { createAtomicPosition, moveFromUci } from "../lib/chess/pgn";
import type { SolutionNavigation } from "../types/chessboard";
import { threatFenFromFen } from "../utils/chessNotation";
import { type AtomicDbAnalysisState, useAtomicDbAnalysis } from "./useAtomicDbAnalysis";

const PRINCIPAL_VARIATION_PLIES = 5;

export const useAtomicDbBoardAnalysis = ({
  currentFen,
  enabled,
  atomicDbEnabled = true,
  navigation,
  lineCount,
  atomicDbFollowUps = true,
  terminalOutcome = null,
  suspended = false,
  storedPositions,
}: {
  currentFen: string;
  enabled: boolean;
  atomicDbEnabled?: boolean;
  navigation: SolutionNavigation | null;
  lineCount: number;
  atomicDbFollowUps?: boolean;
  terminalOutcome?: "white" | "black" | "draw" | null;
  suspended?: boolean;
  storedPositions?: ReadonlyMap<string, PreloadedAtomicDbGamePosition> | undefined;
}) => {
  const [requestedThreatMode, setRequestedThreatMode] = useState(false);
  const threatFen = useMemo(
    () => (terminalOutcome ? null : threatFenFromFen(currentFen)),
    [currentFen, terminalOutcome],
  );
  const threatAvailable = enabled && !suspended && threatFen !== null;
  const threatMode = threatAvailable && requestedThreatMode;
  const setThreatMode = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      setRequestedThreatMode(
        (current) => threatAvailable && (typeof next === "function" ? next(current) : next),
      );
    },
    [threatAvailable],
  );
  useEffect(() => {
    if (!threatAvailable) setRequestedThreatMode(false);
  }, [threatAvailable]);
  const variationStartFenRef = useRef<string | null>(null);
  const variationPlaying = navigation?.type === "line";
  const navigationPending = navigation !== null;
  const fen = variationPlaying ? (variationStartFenRef.current ?? currentFen) : currentFen;
  const analysisOptions = {
    lineCount,
    atomicDbEnabled,
    atomicDbFollowUps,
    progressivePreview: true,
    plyCount: PRINCIPAL_VARIATION_PLIES,
    // Let the board finish navigating before starting another search.
    suspended: navigationPending || suspended,
  };
  const storedPositionFor = (fen: string) => storedPositions?.get(gameAnalysisPositionKey(fen));
  const positionAnalysis = useAtomicDbAnalysis(fen, {
    ...analysisOptions,
    storedPosition: storedPositionFor(fen),
    fallbackToEngine: enabled,
    enabled: enabled && !threatMode && terminalOutcome === null,
  });
  const threatAnalysis = useAtomicDbAnalysis(threatFen ?? currentFen, {
    ...analysisOptions,
    enabled: threatMode && !variationPlaying,
    storedPosition: threatFen ? storedPositionFor(threatFen) : undefined,
    fallbackToEngine: threatMode,
  });
  const threatMove =
    threatMode && !navigationPending && threatAnalysis.result?.fen === threatFen
      ? (threatAnalysis.result.position?.bestMove ?? null)
      : null;
  const terminalAnalysis = useMemo<AtomicDbAnalysisState | null>(() => {
    if (!terminalOutcome) return null;
    const outcome =
      terminalOutcome === "white"
        ? "WHITE_WIN"
        : terminalOutcome === "black"
          ? "BLACK_WIN"
          : "DRAW";
    return {
      result: {
        fen: currentFen,
        position: {
          key: null,
          outcome,
          closure: null,
          score: null,
          point: null,
          bestMove: null,
          moves: [],
        },
      },
      status: "ready",
      error: "",
      principalVariations: {},
      source: "terminal",
    } satisfies AtomicDbAnalysisState;
  }, [currentFen, terminalOutcome]);

  const position =
    positionAnalysis.result?.fen === currentFen ? positionAnalysis.result.position : null;
  const engineMoves = useMemo(() => {
    if (!enabled || threatMode || navigationPending || suspended || terminalOutcome || !position)
      return null;
    try {
      const currentPosition = createAtomicPosition(currentFen);
      const rankedMoves = new Set(position.moves.map((move) => move.uci));
      const candidates = position.bestMove
        ? new Set([position.bestMove, ...rankedMoves])
        : rankedMoves;
      const arrows = new Set<string>();
      for (const uci of [...candidates].slice(0, lineCount)) {
        const move = moveFromUci(currentPosition, uci);
        if (!move || !isNormal(move)) continue;
        const side = castlingSide(currentPosition, move);
        const kingDestination = side ? kingCastlesTo(currentPosition.turn, side) : move.to;
        // In Chess960 the king can already be on its castling square; point to the rook then.
        const destination = kingDestination === move.from ? move.to : kingDestination;
        arrows.add(makeSquare(move.from) + makeSquare(destination));
      }
      return arrows.size ? [...arrows] : null;
    } catch {
      return null;
    }
  }, [
    currentFen,
    enabled,
    threatMode,
    lineCount,
    navigationPending,
    position,
    suspended,
    terminalOutcome,
  ]);

  const beginVariationPlayback = useCallback((): void => {
    variationStartFenRef.current = currentFen;
  }, [currentFen]);
  const finishVariationPlayback = useCallback((): void => {
    variationStartFenRef.current = null;
  }, []);

  const analysis = terminalAnalysis ?? positionAnalysis;
  const displayedAnalysis = threatMode ? threatAnalysis : analysis;
  const displayedFen = threatMode && threatFen ? threatFen : terminalAnalysis ? currentFen : fen;
  return {
    analysis,
    displayedAnalysis,
    displayedFen,
    threatMode,
    setThreatMode,
    threatMove,
    panelProps: {
      fen: displayedFen,
      analysis: displayedAnalysis,
      threatMode,
      threatAvailable,
      onThreatModeChange: setThreatMode,
    },
    engineMoves,
    beginVariationPlayback,
    finishVariationPlayback,
    variationPlaying,
  };
};
