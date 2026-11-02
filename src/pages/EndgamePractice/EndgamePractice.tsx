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
  connectionAwareTablebaseDefenseUcis,
  probeAtomicTablebase,
  tablebasePositionIsDrawn,
  tablebaseSideIsLosing,
  tablebaseSideIsWinning,
  tablebaseStartIsLongerThanMateInFour,
} from "../../lib/endgamePractice/atomicTablebase";
import {
  buildEndgamePgn,
  categoryLabel,
  chooseDefenderMove,
  connectedDefenderMoveUcis,
  type EndgameCategory,
  type EndgameMode,
  type EndgamePosition,
  generateEndgamePosition,
  hasBlackPawn,
} from "../../lib/endgamePractice/endgamePractice";
import type { ChessboardState, SolutionNavigation } from "../../types/chessboard";
import { formatLocalDateTime } from "../../utils/formatters";

type RoundStatus = "ready" | "preparing" | "running" | "won" | "failed";
type LeaderboardEntry = {
  id: string;
  player: string;
  mode: EndgameMode;
  category: EndgameCategory;
  durationMs: number;
  completedAt: string;
};

const STORAGE_KEY = "atomic-puzzles:endgame-race:leaderboard:v2";
const LEGACY_STORAGE_KEY = "atomic-puzzles:endgame-race:leaderboard:v1";
const PLAYER_KEY = "atomic-puzzles:endgame-race:player";
const categories: EndgameCategory[] = ["rank-3", "rank-4", "rank-5", "rank-6", "a-pawn", "h-pawn"];

const readLeaderboard = (): LeaderboardEntry[] => {
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    const rows = Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is LeaderboardEntry =>
            Boolean(entry) &&
            typeof entry === "object" &&
            typeof (entry as LeaderboardEntry).player === "string" &&
            Number.isFinite((entry as LeaderboardEntry).durationMs),
        )
      : [];
    const fastestByPlayer = new Map<string, LeaderboardEntry>();
    rows.forEach((entry) => {
      const key = `${entry.mode}:${entry.category}:${entry.player.trim().toLowerCase()}`;
      const current = fastestByPlayer.get(key);
      if (!current || entry.durationMs < current.durationMs) fastestByPlayer.set(key, entry);
    });
    return Array.from(fastestByPlayer.values());
  } catch {
    return [];
  }
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
  return "KQQ vs K";
};

const PREPARED_POSITION_KEY = "atomic-puzzles:endgame-practice:prepared-position:m5:v1";
const preparedPositions = new Map<string, EndgamePosition>();
const pendingPositions = new Map<string, Promise<EndgamePosition | null>>();

const positionCategory = (mode: EndgameMode, category: EndgameCategory): EndgameCategory =>
  mode === "two-queens" ? "no-pawn" : category;

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
    const timeout = window.setTimeout(() => controller.abort(), 3_000);
    try {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const candidate = generateEndgamePosition(mode, positionCategory(mode, category));
        const result = await probeAtomicTablebase(candidate.fen, controller.signal);
        if (tablebaseStartIsLongerThanMateInFour(result)) {
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

export const EndgamePracticePage = () => {
  const { user } = useAuth();
  const [mode, setMode] = useState<EndgameMode>("pawn-duel");
  const [category, setCategory] = useState<EndgameCategory>("rank-6");
  const [position, setPosition] = useState(() => generateEndgamePosition("pawn-duel", "rank-6"));
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
  const preparationControllerRef = useRef<AbortController | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>(readLeaderboard);
  const [guestName, setGuestName] = useState(
    () => window.localStorage.getItem(PLAYER_KEY)?.trim() || "Guest",
  );
  const { copy: copyPgn, copyLabel: copyPgnLabel, resetCopyFeedback } = useCopyFeedback();

  const playerName = user?.username || guestName.trim() || "Guest";
  const leaderboardCategory: EndgameCategory = mode === "two-queens" ? "no-pawn" : category;
  const currentFen = boardState?.fen || position.fen;
  const positionPgn = useMemo(() => buildEndgamePgn(currentFen), [currentFen]);
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
      let selectedPosition = takePreparedPosition(mode, category);
      if (!selectedPosition) {
        await prepareEndgamePosition(mode, category);
        selectedPosition = takePreparedPosition(mode, category);
      }
      if (controller.signal.aborted || preparationControllerRef.current !== controller) return;
      preparationControllerRef.current = null;
      if (!selectedPosition) {
        setStatus("ready");
        return;
      }

      setPosition(selectedPosition);
      setBoardState(null);
      setNavigation(null);
      navigationRef.current = null;
      setElapsedMs(0);
      setStatus("running");
      startedAtRef.current = window.performance.now();
      roundIdRef.current = crypto.randomUUID();
      scoredRoundRef.current = null;
      void prepareEndgamePosition(mode, category);
    })();
  }, [category, mode]);

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
    const requestTimeout = window.setTimeout(() => controller.abort(), 900);
    const minimumDelay = new Promise<void>((resolve) => window.setTimeout(resolve, 220));

    void probeAtomicTablebase(currentFen, controller.signal)
      .then(async (result) => {
        await minimumDelay;
        if (!active) return;
        if (tablebasePositionIsDrawn(result)) {
          startedAtRef.current = null;
          setFailureLabel("Draw");
          setStatus("failed");
          return;
        }
        if (tablebaseSideIsWinning(result.category)) {
          setFailureLabel("Lost");
          setStatus("failed");
          return;
        }
        if (!tablebaseSideIsLosing(result.category)) {
          const fallbackMove = chooseDefenderMove(currentFen);
          if (fallbackMove) queueNavigation({ type: "play", uci: fallbackMove });
          else setStatus("failed");
          return;
        }
        const bestCategory = result.moves[0]?.category;
        const bestCategoryUcis = new Set(
          result.moves
            .filter((candidate) => candidate.category === bestCategory)
            .map((candidate) => candidate.uci),
        );
        const connectedUcis = connectedDefenderMoveUcis(currentFen, bestCategoryUcis);
        const tablebaseUcis = connectionAwareTablebaseDefenseUcis(
          result,
          connectedUcis,
          Math.random,
        );
        const move =
          chooseDefenderMove(currentFen, Math.random, new Set(tablebaseUcis)) ??
          tablebaseUcis[0] ??
          null;
        if (move) queueNavigation({ type: "play", uci: move });
        else setStatus("failed");
      })
      .catch(async () => {
        await minimumDelay;
        if (!active) return;
        const fallbackMove = chooseDefenderMove(currentFen);
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
    const requestTimeout = window.setTimeout(() => controller.abort(), 900);

    void probeAtomicTablebase(currentFen, controller.signal)
      .then((result) => {
        if (!active || !tablebasePositionIsDrawn(result)) return;
        startedAtRef.current = null;
        setFailureLabel("Draw");
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
      const entry: LeaderboardEntry = {
        id: crypto.randomUUID(),
        player: playerName,
        mode,
        category: leaderboardCategory,
        durationMs: Math.round(finished),
        completedAt: new Date().toISOString(),
      };
      setEntries((current) => {
        const playerKey = playerName.trim().toLowerCase();
        const previousBest = current.find(
          (row) =>
            row.mode === mode &&
            row.category === leaderboardCategory &&
            row.player.trim().toLowerCase() === playerKey,
        );
        const retainedEntry =
          previousBest && previousBest.durationMs <= entry.durationMs ? previousBest : entry;
        const next = [
          ...current.filter(
            (row) =>
              row.mode !== mode ||
              row.category !== leaderboardCategory ||
              row.player.trim().toLowerCase() !== playerKey,
          ),
          retainedEntry,
        ]
          .sort((left, right) => left.durationMs - right.durationMs)
          .slice(0, 200);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
      return;
    }
    if (boardState.winner === "black" || (mode !== "two-queens" && !hasBlackPawn(boardState.fen))) {
      startedAtRef.current = null;
      setFailureLabel(boardState.winner === "black" ? "Lost" : "Escaped");
      setStatus("failed");
    }
  }, [boardState, elapsedMs, leaderboardCategory, mode, playerName, status]);

  const visibleEntries = useMemo(
    () =>
      entries
        .filter((entry) => entry.mode === mode && entry.category === leaderboardCategory)
        .sort((left, right) => left.durationMs - right.durationMs)
        .slice(0, 10),
    [entries, leaderboardCategory, mode],
  );

  const bestTime = visibleEntries[0]?.durationMs;
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
                  <button type="button" onClick={startRound} disabled={status === "preparing"}>
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
                    setMode(nextMode);
                    createReadyPosition(nextMode, category);
                  }}
                >
                  {(["pawn-duel", "blockade", "two-queens"] as const).map((option) => (
                    <option key={option} value={option}>
                      {modeLabel(option)}
                    </option>
                  ))}
                </select>
              </label>

              {mode !== "two-queens" ? (
                <label className="endgameCategorySelect">
                  <span>{mode === "pawn-duel" ? "Your pawn" : "Enemy pawn"}</span>
                  <select
                    value={category}
                    disabled={status === "running" || status === "preparing"}
                    onChange={(event) => {
                      const nextCategory = event.target.value as EndgameCategory;
                      setCategory(nextCategory);
                      createReadyPosition(mode, nextCategory);
                    }}
                  >
                    {categories.map((option) => (
                      <option key={option} value={option}>
                        {categoryLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {status === "running" ? (
                <button
                  type="button"
                  className="analysisLichessLink endgameGiveUpButton"
                  onClick={giveUp}
                >
                  Give up
                </button>
              ) : null}
            </section>

            <section className="endgameLeaderboard" aria-labelledby="endgame-leaderboard-heading">
              <div className="endgameLeaderboardHeader">
                <h2 id="endgame-leaderboard-heading">Timed attempts</h2>
                <span>{categoryLabel(leaderboardCategory)}</span>
              </div>
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
              {visibleEntries.length ? (
                <ol className="endgameLeaderboardList">
                  {visibleEntries.map((entry, index) => (
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
                <span>Local</span>
                {bestTime === undefined ? null : <strong>Best {formatTime(bestTime)}</strong>}
              </footer>
            </section>
            {attemptIsOver ? (
              <button type="button" className="endgameNextPositionButton" onClick={startRound}>
                <FontAwesomeIcon icon={faRotateRight} aria-hidden="true" />
                Next position
              </button>
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
