import "./EndgamePractice.css";
import "../../features/analysisWorkspace/AnalysisWorkspace.css";

import {
  faBolt,
  faCheck,
  faClockRotateLeft,
  faCopy,
  faExternalLinkAlt,
  faRotateRight,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Chessboard } from "../../components/Chessboard/Chessboard";
import { CommunityDiscussion } from "../../components/PuzzleCommunity/PuzzleCommunity";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { useCopyFeedback } from "../../hooks/useCopyFeedback";
import {
  type EndgameLeaderboardEntry,
  updateEndgameLeaderboard,
} from "../../lib/endgamePractice/endgameLeaderboard";
import {
  buildEndgamePgn,
  categoryLabel,
  chooseDefenderMove,
  defenderReplyFens,
  type EndgameCategory,
  type EndgameMode,
  type EndgamePosition,
  generateEndgamePosition,
  hasBlackPawn,
  pawnEndgameCategories,
} from "../../lib/endgamePractice/endgamePractice";
import {
  classifyEndgameEngineEvaluation,
  ENDGAME_EVALUATION_DEPTH,
  engineStartIsLongerThanMateInFive,
} from "../../lib/endgamePractice/fairyStockfishEndgame";
import {
  chooseEqualTablebaseDefense,
  probeAtomicTablebase,
} from "../../lib/endgamePractice/tablebaseDefense";
import {
  analyzeFairyStockfishPosition,
  findFairyStockfishMove,
} from "../../lib/practice/fairyStockfish";
import type { ChessboardState, SolutionNavigation } from "../../types/chessboard";
import { formatLocalDateTime } from "../../utils/formatters";

type RoundStatus = "ready" | "preparing" | "running" | "won" | "failed";

const PLAYER_KEY = "atomic-puzzles:endgame-race:player";
const GUEST_ID_KEY = "atomic-puzzles:endgame-practice:guest-id";
const OLD_LEADERBOARD_KEYS = [
  "atomic-puzzles:endgame-race:leaderboard:v1",
  "atomic-puzzles:endgame-race:leaderboard:v2",
];
const randomPawnCategory = (exclude?: EndgameCategory): EndgameCategory => {
  const choices = pawnEndgameCategories.filter((category) => category !== exclude);
  return choices[Math.floor(Math.random() * choices.length)] ?? "regular-file:rank-regular";
};

const formatTime = (milliseconds: number): string => {
  if (milliseconds < 10_000) return `${(milliseconds / 1_000).toFixed(2)}s`;
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const formatClockTime = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const modeLabel = (mode: EndgameMode): string => {
  if (mode === "pawn-duel") return "KQP vs KP";
  if (mode === "blockade") return "KQ vs KP";
  if (mode === "two-queens") return "KQQ vs K";
  if (mode === "rook-vs-pawn") return "KR vs KP";
  if (mode === "rook-bishop-vs-king") return "KRB vs K";
  if (mode === "rook-pawn-vs-king") return "KRP vs K";
  return "KRP vs KP";
};

const usesPawnCategories = (mode: EndgameMode): boolean =>
  mode === "pawn-duel" || mode === "blockade" || mode === "rook-pawn-vs-pawn";

const defenderHasEscapingPawn = (mode: EndgameMode): boolean =>
  mode === "pawn-duel" ||
  mode === "blockade" ||
  mode === "rook-vs-pawn" ||
  mode === "rook-pawn-vs-pawn";

const PREPARED_POSITION_KEY =
  "atomic-puzzles:endgame-practice:prepared-position:atomic-stockfish:v2";
const preparedPositions = new Map<string, EndgamePosition>();
const pendingPositions = new Map<string, Promise<EndgamePosition | null>>();

const positionCategory = (mode: EndgameMode, category: EndgameCategory): EndgameCategory =>
  usesPawnCategories(mode) ? category : "no-pawn";

const preparedPositionKey = (mode: EndgameMode, category: EndgameCategory): string =>
  `${mode}:${positionCategory(mode, category)}`;

const storedPositionKey = (key: string): string => `${PREPARED_POSITION_KEY}:${key}`;

const readPreparedPosition = (key: string): EndgamePosition | null => {
  const memoryPosition = preparedPositions.get(key);
  if (memoryPosition) return memoryPosition;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(storedPositionKey(key)) ?? "null",
    ) as EndgamePosition | null;
    if (!parsed || typeof parsed.fen !== "string" || !parsed.fen.includes(" ")) return null;
    preparedPositions.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
};

const storePreparedPosition = (key: string, position: EndgamePosition): void => {
  preparedPositions.set(key, position);
  window.localStorage.setItem(storedPositionKey(key), JSON.stringify(position));
};

const takePreparedPosition = (
  mode: EndgameMode,
  category: EndgameCategory,
): EndgamePosition | null => {
  const key = preparedPositionKey(mode, category);
  const position = readPreparedPosition(key);
  if (!position) return null;
  preparedPositions.delete(key);
  window.localStorage.removeItem(storedPositionKey(key));
  return position;
};

const prepareEndgamePosition = (
  mode: EndgameMode,
  category: EndgameCategory,
): Promise<EndgamePosition | null> => {
  const key = preparedPositionKey(mode, category);
  const cached = readPreparedPosition(key);
  if (cached) return Promise.resolve(cached);
  const pending = pendingPositions.get(key);
  if (pending) return pending;

  const promise = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 16_000);
    try {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const candidate = generateEndgamePosition(mode, positionCategory(mode, category));
        let rejectedEarly = false;
        const evaluations = await analyzeFairyStockfishPosition(
          candidate.fen,
          1,
          controller.signal,
          undefined,
          "atomic-stockfish",
          {
            refresh: true,
            stopWhen: (candidates) => {
              rejectedEarly =
                (candidates[0]?.depth ?? 0) >= ENDGAME_EVALUATION_DEPTH &&
                !engineStartIsLongerThanMateInFive(candidates);
              return rejectedEarly;
            },
          },
        );
        if (rejectedEarly) continue;
        if (engineStartIsLongerThanMateInFive(evaluations)) {
          storePreparedPosition(key, candidate);
          return candidate;
        }
      }
      return null;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
      pendingPositions.delete(key);
    }
  })();
  pendingPositions.set(key, promise);
  return promise;
};

const preloadDefenderTablebases = (fen: string, signal: AbortSignal): Promise<void> =>
  Promise.all(
    defenderReplyFens(fen).map((replyFen) => probeAtomicTablebase(replyFen, signal)),
  ).then(() => undefined);

export const EndgamePracticePage = () => {
  const { user } = useAuth();
  const [initialSetup] = useState(() => {
    const category = randomPawnCategory();
    return { category, position: generateEndgamePosition("pawn-duel", category) };
  });
  const [mode, setMode] = useState<EndgameMode>("pawn-duel");
  const [category, setCategory] = useState<EndgameCategory>(initialSetup.category);
  const [position, setPosition] = useState(initialSetup.position);
  const [boardState, setBoardState] = useState<ChessboardState | null>(null);
  const [navigation, setNavigation] = useState<SolutionNavigation | null>(null);
  const navigationRef = useRef<SolutionNavigation | null>(null);
  const [status, setStatus] = useState<RoundStatus>("ready");
  const [failureLabel, setFailureLabel] = useState<"Draw" | "Escaped" | "Gave up" | "Lost">(
    "Escaped",
  );
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const scoredRoundRef = useRef<string | null>(null);
  const roundIdRef = useRef(crypto.randomUUID());
  const nextCategoryRef = useRef<EndgameCategory | null>(null);
  const preparationControllerRef = useRef<AbortController | null>(null);
  const readyPositionFenRef = useRef<string | null>(null);
  const [entries, setEntries] = useState<EndgameLeaderboardEntry[]>([]);
  const [ownBest, setOwnBest] = useState<EndgameLeaderboardEntry | null>(null);
  const [guestId] = useState(() => {
    const existing = window.localStorage.getItem(GUEST_ID_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(GUEST_ID_KEY, created);
    return created;
  });
  const [guestName, setGuestName] = useState(
    () => window.localStorage.getItem(PLAYER_KEY)?.trim() || "Guest",
  );
  const { copy: copyPgn, copyLabel: copyPgnLabel, resetCopyFeedback } = useCopyFeedback();

  const playerName = user?.username || guestName.trim() || "Guest";
  const leaderboardCategory = positionCategory(mode, category);
  const currentFen = boardState?.fen || position.fen;
  const positionPgn = useMemo(
    () => buildEndgamePgn(position.fen, boardState?.lineMoves ?? []),
    [boardState?.lineMoves, position.fen],
  );
  const analysisHref = `/analysis/${currentFen.replaceAll(" ", "_")}`;
  const currentTurn = boardState?.turn || "white";
  const isOpponentThinking = status === "running" && currentTurn === "black" && !navigation;
  const attemptIsOver = status === "won" || status === "failed";

  const queueNavigation = useCallback((next: SolutionNavigation) => {
    navigationRef.current = next;
    setNavigation(next);
  }, []);

  useEffect(
    () => () => {
      preparationControllerRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    OLD_LEADERBOARD_KEYS.forEach((key) => window.localStorage.removeItem(key));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void updateEndgameLeaderboard(
      {
        action: "load",
        mode,
        category: leaderboardCategory,
        guestId,
        guestName: playerName,
      },
      controller.signal,
    )
      .then((result) => {
        setEntries(result.entries);
        setOwnBest(result.ownBest);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [guestId, leaderboardCategory, mode, playerName]);

  useEffect(() => {
    void prepareEndgamePosition(mode, category);
  }, [category, mode]);

  const createReadyPosition = useCallback(
    (nextMode: EndgameMode, nextCategory: EndgameCategory) => {
      preparationControllerRef.current?.abort();
      preparationControllerRef.current = null;
      const nextPosition = generateEndgamePosition(nextMode, nextCategory);
      setPosition(nextPosition);
      setBoardState(null);
      setNavigation(null);
      navigationRef.current = null;
      setStatus("ready");
      readyPositionFenRef.current = null;
      setFailureLabel("Escaped");
      setElapsedMs(0);
      startedAtRef.current = null;
      roundIdRef.current = crypto.randomUUID();
      scoredRoundRef.current = null;
      resetCopyFeedback();
    },
    [resetCopyFeedback],
  );

  const startRound = useCallback(() => {
    preparationControllerRef.current?.abort();
    const controller = new AbortController();
    preparationControllerRef.current = controller;
    setStatus("preparing");
    setFailureLabel("Escaped");

    void (async () => {
      const roundCategory =
        attemptIsOver && usesPawnCategories(mode)
          ? (nextCategoryRef.current ?? randomPawnCategory(category))
          : category;
      if (roundCategory !== category) setCategory(roundCategory);
      let selectedPosition =
        status === "ready" &&
        roundCategory === category &&
        readyPositionFenRef.current === position.fen
          ? position
          : takePreparedPosition(mode, roundCategory);
      if (!selectedPosition) {
        await prepareEndgamePosition(mode, roundCategory);
        selectedPosition = takePreparedPosition(mode, roundCategory);
      }
      if (controller.signal.aborted || preparationControllerRef.current !== controller) return;
      if (!selectedPosition) {
        preparationControllerRef.current = null;
        setStatus("ready");
        return;
      }

      preparationControllerRef.current = null;

      setPosition(selectedPosition);
      setBoardState(null);
      setNavigation(null);
      navigationRef.current = null;
      setElapsedMs(0);
      setStatus("running");
      readyPositionFenRef.current = null;
      startedAtRef.current = window.performance.now();
      roundIdRef.current = crypto.randomUUID();
      scoredRoundRef.current = null;
      void prepareEndgamePosition(mode, roundCategory);
      if (!usesPawnCategories(mode)) {
        nextCategoryRef.current = "no-pawn";
      } else {
        const nextCategory = randomPawnCategory(roundCategory);
        nextCategoryRef.current = nextCategory;
        void prepareEndgamePosition(mode, nextCategory);
      }
    })();
  }, [attemptIsOver, category, mode, position, status]);

  // Tablebases improve defense, but an unavailable service must not prevent a
  // round from starting: defender moves already fall back to Atomic-Stockfish.
  useEffect(() => {
    if (status !== "running") return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 16_000);
    void preloadDefenderTablebases(position.fen, controller.signal)
      .catch(() => undefined)
      .finally(() => window.clearTimeout(timeout));
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [position.fen, status]);

  const startOver = useCallback(() => {
    if (status !== "running") return;
    preparationControllerRef.current?.abort();
    const controller = new AbortController();
    preparationControllerRef.current = controller;
    startedAtRef.current = null;
    navigationRef.current = null;
    setNavigation(null);
    setElapsedMs(0);
    setStatus("preparing");

    void (async () => {
      let selectedPosition = takePreparedPosition(mode, category);
      if (!selectedPosition) {
        await prepareEndgamePosition(mode, category);
        selectedPosition = takePreparedPosition(mode, category);
      }
      if (controller.signal.aborted || preparationControllerRef.current !== controller) return;
      preparationControllerRef.current = null;
      setBoardState(null);
      if (!selectedPosition) {
        readyPositionFenRef.current = null;
        setStatus("ready");
        return;
      }

      setPosition(selectedPosition);
      readyPositionFenRef.current = selectedPosition.fen;
      setFailureLabel("Escaped");
      roundIdRef.current = crypto.randomUUID();
      scoredRoundRef.current = null;
      resetCopyFeedback();
      setStatus("ready");
      void prepareEndgamePosition(mode, category);
    })();
  }, [category, mode, resetCopyFeedback, status]);

  const giveUp = useCallback(() => {
    if (status !== "running") return;
    startedAtRef.current = null;
    navigationRef.current = null;
    setNavigation(null);
    setFailureLabel("Gave up");
    setStatus("failed");
  }, [status]);

  useEffect(() => {
    if (status !== "running" || startedAtRef.current === null) return;
    let frame = 0;
    const tick = () => {
      if (startedAtRef.current !== null)
        setElapsedMs(window.performance.now() - startedAtRef.current);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [status]);

  useEffect(() => {
    if (!isOpponentThinking) return;
    const controller = new AbortController();
    let active = true;
    const requestTimeout = window.setTimeout(() => controller.abort(), 5_000);
    const minimumDelay = new Promise<void>((resolve) => window.setTimeout(resolve, 220));
    const engineFallback = async (): Promise<string | null> => {
      try {
        return (
          (await findFairyStockfishMove(
            currentFen,
            controller.signal,
            undefined,
            "atomic-stockfish",
          )) ?? chooseDefenderMove(currentFen)
        );
      } catch {
        return chooseDefenderMove(currentFen);
      }
    };

    void probeAtomicTablebase(currentFen, controller.signal)
      .then(async (result) => {
        const move = chooseEqualTablebaseDefense(result) ?? (await engineFallback());
        await minimumDelay;
        if (!active) return;
        if (move) queueNavigation({ type: "play", uci: move });
        else setStatus("failed");
      })
      .catch(async () => {
        const fallbackMove = await engineFallback();
        await minimumDelay;
        if (!active) return;
        if (fallbackMove) queueNavigation({ type: "play", uci: fallbackMove });
        else setStatus("failed");
      });

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(requestTimeout);
    };
  }, [currentFen, isOpponentThinking, queueNavigation]);

  useEffect(() => {
    if (status !== "running" || currentTurn !== "white" || !boardState) return;
    const controller = new AbortController();
    let active = true;
    const requestTimeout = window.setTimeout(() => controller.abort(), 4_000);

    void analyzeFairyStockfishPosition(
      currentFen,
      1,
      controller.signal,
      undefined,
      "atomic-stockfish",
    )
      .then((evaluations) => {
        if (!active) return;
        const evaluation = classifyEndgameEngineEvaluation(evaluations);
        if (evaluation !== "draw" && evaluation !== "lost") return;
        startedAtRef.current = null;
        setFailureLabel(evaluation === "draw" ? "Draw" : "Lost");
        setStatus("failed");
      })
      .catch(() => undefined);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(requestTimeout);
    };
  }, [boardState, currentFen, currentTurn, status]);

  useEffect(() => {
    if (status !== "running" || !boardState) return;
    if (boardState.winner === "white") {
      const finished = startedAtRef.current
        ? window.performance.now() - startedAtRef.current
        : elapsedMs;
      const roundId = roundIdRef.current;
      if (scoredRoundRef.current === roundId) return;
      scoredRoundRef.current = roundId;
      startedAtRef.current = null;
      setElapsedMs(finished);
      setStatus("won");
      void updateEndgameLeaderboard({
        action: "record",
        mode,
        category: leaderboardCategory,
        guestId,
        guestName: playerName,
        durationMs: Math.round(finished),
      })
        .then((result) => {
          setEntries(result.entries);
          setOwnBest(result.ownBest);
        })
        .catch(() => undefined);
      return;
    }
    if (
      boardState.winner === "black" ||
      (defenderHasEscapingPawn(mode) && !hasBlackPawn(boardState.fen))
    ) {
      startedAtRef.current = null;
      setFailureLabel(boardState.winner === "black" ? "Lost" : "Escaped");
      setStatus("failed");
    }
  }, [boardState, elapsedMs, guestId, leaderboardCategory, mode, playerName, status]);
  const statusText =
    status === "won"
      ? "Solved"
      : status === "failed"
        ? failureLabel
        : status === "preparing"
          ? "Loading"
          : isOpponentThinking
            ? "Defender"
            : status === "running"
              ? "Your move"
              : "Ready";

  return (
    <div className="endgamePracticePage">
      <Seo
        title="Endgame practice"
        description="Timed atomic queen endgame practice with rank-based leaderboards."
        path="/puzzles/endgames"
      />

      <h1 className="endgameTitleSr">Endgame practice</h1>

      <div className="endgamePracticeLayout">
        <main className="endgameBoardArea">
          <div
            className={`endgameBoardFrame ${
              status === "won"
                ? "hasFeedback isCorrect"
                : status === "failed"
                  ? "hasFeedback isIncorrect"
                  : ""
            }`}
            aria-label="Endgame practice board"
          >
            <Chessboard
              puzzleId={null}
              fen={position.fen}
              orientation="white"
              coordinates
              solution=""
              showSolution={false}
              analysisMode
              disabled={status !== "running"}
              premoveColor="white"
              premovesEnabled
              solutionNavigation={navigation}
              onNavigateHandled={() => {
                navigationRef.current = null;
                setNavigation(null);
              }}
              onStateChange={setBoardState}
            />
            {status === "ready" || status === "preparing" ? (
              <div className="endgameBoardOverlay">
                <div className={`endgameResult ${status}`}>
                  <strong>{status === "preparing" ? "Loading…" : "Ready"}</strong>
                  <button
                    type="button"
                    onClick={() => startRound()}
                    disabled={status === "preparing"}
                  >
                    <FontAwesomeIcon icon={faBolt} aria-hidden="true" />
                    {status === "preparing" ? "Loading…" : "Start round"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          {attemptIsOver ? (
            <div className="analysisBoardTextPanel endgamePositionTools">
              <div className="analysisBoardActions">
                <button
                  type="button"
                  className="analysisLichessLink"
                  onClick={() => void copyPgn(positionPgn)}
                >
                  <FontAwesomeIcon
                    icon={copyPgnLabel === "Copied" ? faCheck : faCopy}
                    aria-hidden="true"
                  />
                  {copyPgnLabel}
                </button>
                {attemptIsOver ? (
                  <a
                    className="analysisLichessLink"
                    href={analysisHref}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <FontAwesomeIcon icon={faExternalLinkAlt} aria-hidden="true" />
                    Open analysis
                  </a>
                ) : null}
              </div>
              <div className="analysisPgnBox analysisTextBox" aria-label="PGN">
                <span>PGN</span>
                <textarea
                  value={positionPgn}
                  rows={3}
                  readOnly
                  spellCheck={false}
                  aria-label="PGN"
                />
              </div>
            </div>
          ) : null}
        </main>

        <aside className="endgameSidebar">
          <div className="endgamePanel">
            <section className="endgameControls" aria-labelledby="endgame-settings-heading">
              <div className="endgameControlsHeader">
                <h2 id="endgame-settings-heading">Challenge</h2>
                <div className={`endgameClock ${status === "running" ? "isRunning" : ""}`}>
                  <span aria-live="off">{formatClockTime(elapsedMs)}</span>
                  <small aria-live="polite">{statusText}</small>
                </div>
              </div>
              <label className="endgameModeSelect">
                <span>Endgame</span>
                <select
                  value={mode}
                  disabled={status === "running" || status === "preparing"}
                  onChange={(event) => {
                    const nextMode = event.target.value as EndgameMode;
                    const nextCategory = usesPawnCategories(nextMode)
                      ? randomPawnCategory()
                      : "no-pawn";
                    setMode(nextMode);
                    setCategory(nextCategory);
                    nextCategoryRef.current = null;
                    createReadyPosition(nextMode, nextCategory);
                  }}
                >
                  {(
                    [
                      "pawn-duel",
                      "blockade",
                      "two-queens",
                      "rook-vs-pawn",
                      "rook-bishop-vs-king",
                      "rook-pawn-vs-king",
                      "rook-pawn-vs-pawn",
                    ] as const
                  ).map((option) => (
                    <option key={option} value={option}>
                      {modeLabel(option)}
                    </option>
                  ))}
                </select>
              </label>

              {!user ? (
                <label className="endgamePlayerName">
                  <span>Player name</span>
                  <input
                    value={guestName}
                    maxLength={24}
                    disabled={status === "running" || status === "preparing"}
                    onChange={(event) => {
                      setGuestName(event.target.value);
                      window.localStorage.setItem(PLAYER_KEY, event.target.value);
                    }}
                  />
                </label>
              ) : null}

              {status === "running" ? (
                <div className="endgameAttemptActions">
                  <button
                    type="button"
                    className="analysisLichessLink endgameStartOverButton"
                    onClick={startOver}
                  >
                    <FontAwesomeIcon icon={faRotateRight} aria-hidden="true" />
                    Start over
                  </button>
                  <button
                    type="button"
                    className="analysisLichessLink endgameGiveUpButton"
                    onClick={giveUp}
                  >
                    Give up
                  </button>
                </div>
              ) : null}
            </section>

            {status === "running" && ownBest ? (
              <section className="endgameLeaderboard" aria-labelledby="endgame-own-best-heading">
                <div className="endgameLeaderboardHeader">
                  <h2 id="endgame-own-best-heading">Your best</h2>
                  <span>
                    {usesPawnCategories(mode)
                      ? categoryLabel(leaderboardCategory)
                      : modeLabel(mode)}
                  </span>
                </div>
                <p className="endgameOwnBest">{formatTime(ownBest.durationMs)}</p>
              </section>
            ) : attemptIsOver ? (
              <section className="endgameLeaderboard" aria-labelledby="endgame-leaderboard-heading">
                <div className="endgameLeaderboardHeader">
                  <h2 id="endgame-leaderboard-heading">Timed attempts</h2>
                  <span>
                    {usesPawnCategories(mode)
                      ? categoryLabel(leaderboardCategory)
                      : modeLabel(mode)}
                  </span>
                </div>
                {entries.length ? (
                  <ol className="endgameLeaderboardList">
                    {entries.map((entry, index) => (
                      <li key={entry.id}>
                        <strong>{entry.player}</strong>
                        <span className="endgamePlacement">#{index + 1}</span>
                        <time
                          className="endgameAttemptDate"
                          dateTime={entry.completedAt}
                          aria-label={`Attempted ${formatLocalDateTime(entry.completedAt)}`}
                        >
                          {formatLocalDateTime(entry.completedAt)}
                        </time>
                        <span
                          className="endgameFinishDuration"
                          aria-label={`Finish time ${formatTime(entry.durationMs)}`}
                        >
                          <FontAwesomeIcon icon={faClockRotateLeft} aria-hidden="true" />
                          {formatTime(entry.durationMs)}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="endgameEmptyLeaderboard">No times yet.</p>
                )}
                <footer>
                  <span>Global</span>
                  {ownBest ? <strong>Your best {formatTime(ownBest.durationMs)}</strong> : null}
                </footer>
              </section>
            ) : null}
            {attemptIsOver ? (
              <div className="endgameRoundActions">
                <button
                  type="button"
                  className="endgameNextPositionButton"
                  onClick={() => startRound()}
                >
                  Next position
                </button>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {attemptIsOver ? (
        <section className="endgameDiscussion" aria-labelledby="endgame-discussion-heading">
          <h2 id="endgame-discussion-heading">Discussion</h2>
          <CommunityDiscussion
            target={{ type: "endgame", id: "queen-pawn-race" }}
            allowCommentVotes={false}
            deferUntilVisible
          />
        </section>
      ) : null}
    </div>
  );
};
