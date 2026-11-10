import { isNormal, kingCastlesTo, makeSquare } from "chessops";
import { castlingSide } from "chessops/chess";
import { useCallback, useMemo, useRef } from "react";

import { createAtomicPosition, moveFromUci } from "../lib/chess/pgn";
import type { SolutionNavigation } from "../types/chessboard";
import type { AtomicDbAnalysisState } from "./useAtomicDbAnalysis";
import { useAtomicDbAnalysis } from "./useAtomicDbAnalysis";

const PRINCIPAL_VARIATION_PLIES = 5;

export const useAtomicDbBoardAnalysis = ({
  currentFen,
  enabled,
  atomicDbEnabled = true,
  navigation,
  lineCount,
  showFollowUpMoves = true,
  terminalOutcome = null,
  suspended = false,
}: {
  currentFen: string;
  enabled: boolean;
  atomicDbEnabled?: boolean;
  navigation: SolutionNavigation | null;
  lineCount: number;
  showFollowUpMoves?: boolean;
  terminalOutcome?: "white" | "black" | "draw" | null;
  suspended?: boolean;
}) => {
  const variationStartFenRef = useRef<string | null>(null);
  const variationPlaying = navigation?.type === "line";
  const navigationPending = navigation !== null;
  const fen = variationPlaying ? (variationStartFenRef.current ?? currentFen) : currentFen;
  const analysis = useAtomicDbAnalysis(fen, {
    // A disabled panel is fully dormant. Any board navigation preempts the current request so the
    // move is applied before analysis resumes on its destination.
    lineCount,
    atomicDbEnabled,
    plyCount: showFollowUpMoves ? PRINCIPAL_VARIATION_PLIES : 1,
    suspended: navigationPending || suspended,
    fallbackToEngine: enabled,
    enabled: enabled && terminalOutcome === null,
  });
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

  const position = analysis.result?.fen === currentFen ? analysis.result.position : null;
  const engineMoves = useMemo(() => {
    if (!enabled || navigationPending || suspended || terminalOutcome || !position) return null;
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
  }, [currentFen, enabled, lineCount, navigationPending, position, suspended, terminalOutcome]);

  const beginVariationPlayback = useCallback((): void => {
    variationStartFenRef.current = currentFen;
  }, [currentFen]);
  const finishVariationPlayback = useCallback((): void => {
    variationStartFenRef.current = null;
  }, []);

  return {
    analysis: terminalAnalysis ?? analysis,
    engineMoves,
    beginVariationPlayback,
    fen: terminalAnalysis ? currentFen : fen,
    finishVariationPlayback,
    variationPlaying,
  };
};
