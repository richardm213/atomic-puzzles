import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { choosePracticeEngineMove } from "../lib/practice/engineSelection";
import {
  handoffApplies,
  type PracticeHandoff,
  shouldUsePracticeEngine,
} from "../lib/practice/engineSettings";
import {
  fetchPracticeExplorerResponse,
  PRACTICE_AUTOMOVE_MIN_THINK_MS,
  practiceEngineSearchOptions,
} from "../lib/practice/moveSource";
import type { usePracticeSettings } from "../pages/Practice/usePracticeSettings";
import type { SolutionNavigation } from "../types/chessboard";
import { chooseDatabaseMove } from "../utils/boardMoveSelection";
import { useAtomicDbAnalysis } from "./useAtomicDbAnalysis";
import { useOpeningExplorer } from "./useOpeningExplorer";

type Settings = Pick<
  ReturnType<typeof usePracticeSettings>["settings"],
  "engine" | "opponentMode" | "playerContinuation"
>;
type Props = {
  available: boolean;
  blocked: boolean;
  fen: string;
  moves: string[];
  turn: "white" | "black";
  side: "white" | "black";
  source: "general" | "player";
  username: string;
  settings: Settings;
  onNavigate: (navigation: SolutionNavigation) => void;
};

export const usePracticeOpponent = ({
  available,
  blocked,
  fen,
  moves,
  turn,
  side,
  source,
  username,
  settings,
  onNavigate,
}: Props) => {
  const [running, setRunning] = useState(false);
  const [handoff, setHandoff] = useState<PracticeHandoff | null>(null);
  const [alternate, setAlternate] = useState(false);
  const tried = useRef(new Map<string, Set<string>>());
  const lastFen = useRef("");
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;
  const opponentSide = side === "white" ? "black" : "white";
  const prefixKey = moves.join(" ");
  const handoffActive = handoffApplies(handoff, moves);
  const canRun = available && (source === "general" || !!username.trim());
  const sourceKey = JSON.stringify({
    source,
    username,
    opponentSide,
    continuation: settings.playerContinuation,
    minGames: settings.engine.minGames,
  });
  const request = useCallback(
    (signal: AbortSignal) =>
      fetchPracticeExplorerResponse({
        fen,
        opponentSource: source,
        opponentUsernames: username.trim() ? [username.trim()] : [],
        opponentSide,
        playerContinuation: settings.playerContinuation,
        minGames: settings.engine.minGames,
        signal,
      }),
    [fen, source, username, opponentSide, settings.playerContinuation, settings.engine.minGames],
  );
  const database = useOpeningExplorer({
    enabled: canRun && running && !handoffActive,
    fen,
    playerColor: opponentSide,
    showPerformance: false,
    request,
    cacheKey: `${fen}:${sourceKey}`,
  });
  const choices = useMemo(
    () =>
      alternate
        ? database.moves.filter((move) => !tried.current.get(fen)?.has(move.uci))
        : database.moves,
    [alternate, database.moves, fen],
  );
  const useEngine =
    handoffActive ||
    (database.status === "ready" &&
      (shouldUsePracticeEngine(
        database.moves.reduce((sum, move) => sum + move.games, 0),
        settings.engine.minGames,
      ) ||
        !choices.length));
  const ready = canRun && running && !blocked && turn === opponentSide && lastFen.current !== fen;
  const engine = useAtomicDbAnalysis(
    fen,
    practiceEngineSearchOptions(fen, settings.engine, ready && useEngine),
  );

  useEffect(() => {
    if (!available) setRunning(false);
  }, [available]);
  useEffect(() => {
    setHandoff(null);
    tried.current.clear();
    lastFen.current = "";
  }, [sourceKey]);
  useEffect(() => {
    if (!blocked && handoff && !handoffApplies(handoff, prefixKey ? prefixKey.split(" ") : []))
      setHandoff(null);
  }, [blocked, handoff, prefixKey]);
  useEffect(() => {
    if (!ready) return;
    if (useEngine && !handoffActive) setHandoff({ prefix: prefixKey ? prefixKey.split(" ") : [] });
    const selected = useEngine
      ? engine.status === "ready" && engine.result?.fen === fen && engine.result.position
        ? choosePracticeEngineMove(
            fen,
            engine.result.position,
            engine.principalVariations,
            settings.engine,
            alternate ? tried.current.get(fen) : undefined,
          )
        : null
      : database.status === "ready"
        ? chooseDatabaseMove(choices, settings.opponentMode)?.uci
        : null;
    if (!selected) return;
    const timer = setTimeout(
      () => {
        lastFen.current = fen;
        if (!alternate) tried.current.clear();
        const previous = tried.current.get(fen) ?? new Set<string>();
        previous.add(selected);
        tried.current.set(fen, previous);
        setAlternate(false);
        navigateRef.current({ type: "play", uci: selected });
      },
      useEngine ? 0 : PRACTICE_AUTOMOVE_MIN_THINK_MS,
    );
    return () => clearTimeout(timer);
  }, [
    ready,
    useEngine,
    handoffActive,
    prefixKey,
    fen,
    engine.status,
    engine.result,
    engine.principalVariations,
    database.status,
    choices,
    settings.engine,
    settings.opponentMode,
    alternate,
  ]);

  return {
    running,
    canRun,
    error:
      database.status === "error" ? database.error : engine.status === "error" ? engine.error : "",
    toggle: () => {
      lastFen.current = "";
      setRunning((value) => !value);
    },
    pause: () => setRunning(false),
    different: () => {
      lastFen.current = "";
      setAlternate(true);
      setRunning(true);
      if (turn !== opponentSide && moves.length)
        navigateRef.current({ type: "command", command: "previous" });
    },
  };
};
