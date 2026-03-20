import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "./Chessboard";

const appBasePath = (() => {
  const baseUrl = import.meta.env.BASE_URL || "/";
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
})();

const toAppRelativePath = (pathname) => {
  if (!pathname) return "/";
  if (!appBasePath) return pathname;
  if (pathname.startsWith(appBasePath)) {
    const trimmed = pathname.slice(appBasePath.length);
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }
  return pathname;
};

const lichessAnalysisUrl = (fen) => {
  if (!fen) return "https://lichess.org/analysis/atomic";
  return `https://lichess.org/analysis/atomic/${fen.replaceAll(" ", "_")}`;
};

const orientationFromFen = (fen) => {
  const turn = fen?.split(" ")?.[1];
  return turn === "b" ? "black" : "white";
};

const getCurrentPuzzlePath = () => {
  const redirectedPath =
    new window.URLSearchParams(window.location.search).get("puzzlePath") || "";
  const rawPath = redirectedPath || window.location.pathname;
  return toAppRelativePath(rawPath);
};

const parsePuzzleIdFromPath = () => {
  const currentPath = getCurrentPuzzlePath();
  const match = currentPath.match(/^\/(\d+)\/?$/);
  if (!match) return null;

  const puzzleId = Number.parseInt(match[1], 10);
  if (Number.isNaN(puzzleId)) return null;
  return puzzleId;
};

const puzzleIndexFromPath = (puzzles) => {
  const puzzleId = parsePuzzleIdFromPath();
  if (puzzleId === null) return -1;

  const puzzleIndex = puzzles.findIndex(
    (puzzle) => puzzle.puzzleId === puzzleId,
  );
  return puzzleIndex;
};

const replaceUrlWithPuzzle = (puzzleId) => {
  const nextPath = `${appBasePath}/${puzzleId}`;
  if (window.location.pathname !== nextPath) {
    window.history.replaceState(null, "", nextPath);
  }
};

const hasSolution = (puzzle) => {
  if (!puzzle) return false;
  if (typeof puzzle.solution === "string")
    return puzzle.solution.trim().length > 0;
  return Array.isArray(puzzle.solution) && puzzle.solution.length > 0;
};

const createMoveTree = (lines) => {
  const root = {
    children: new Map(),
    lineIndexes: new Set(),
    firstOccurrence: null,
  };

  for (const [lineIndex, line] of lines.entries()) {
    let node = root;
    node.lineIndexes.add(lineIndex);

    for (const [moveIndex, move] of line.entries()) {
      if (!node.children.has(move)) {
        node.children.set(move, {
          move,
          children: new Map(),
          lineIndexes: new Set(),
          firstOccurrence: { lineIndex, moveIndex },
        });
      }

      node = node.children.get(move);
      node.lineIndexes.add(lineIndex);
    }
  }

  return root;
};

const movePrefix = (plyIndex, force = false) => {
  if (plyIndex % 2 === 0) return `${Math.floor(plyIndex / 2) + 1}. `;
  if (force) return `${Math.floor(plyIndex / 2) + 1}... `;
  return "";
};

const orderedChildren = (node) =>
  [...node.children.values()].sort((a, b) => {
    const firstLineDiff =
      (a.firstOccurrence?.lineIndex ?? 0) - (b.firstOccurrence?.lineIndex ?? 0);
    if (firstLineDiff !== 0) return firstLineDiff;
    return (
      (a.firstOccurrence?.moveIndex ?? 0) - (b.firstOccurrence?.moveIndex ?? 0)
    );
  });

const findMainChild = (children) => children[0];

const supabaseConfig = {
  url: import.meta.env.VITE_SUPABASE_URL?.trim() || "",
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || "",
  table: import.meta.env.VITE_SUPABASE_PUZZLES_TABLE?.trim() || "puzzles",
};

const loadPuzzlesFromSupabase = async () => {
  const { url, anonKey, table } = supabaseConfig;
  if (!url || !anonKey) {
    throw new Error(
      "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local",
    );
  }

  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/${encodeURIComponent(table)}?select=*`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} while loading Supabase table "${table}"`,
    );
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error(`Expected Supabase table "${table}" to return an array`);
  }

  return data;
};

const getSupabaseEndpoint = () => {
  const { url, table } = supabaseConfig;
  if (!url) return "";
  return `${url.replace(/\/$/, "")}/rest/v1/${encodeURIComponent(table)}?select=*`;
};

export const App = () => {
  const [puzzles, setPuzzles] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [loadingError, setLoadingError] = useState("");
  const [showSolution, setShowSolution] = useState(false);
  const [solutionNavigation, setSolutionNavigation] = useState(null);
  const [loadDebug, setLoadDebug] = useState({
    phase: "idle",
    endpoint: getSupabaseEndpoint(),
    hasUrl: Boolean(supabaseConfig.url),
    hasAnonKey: Boolean(supabaseConfig.anonKey),
    totalRows: 0,
    usableRows: 0,
    samplePuzzleId: "",
    startedAt: "",
    finishedAt: "",
    error: "",
  });
  const [boardState, setBoardState] = useState({
    fen: "",
    turn: "",
    status: "Loading puzzles...",
    winner: undefined,
    error: "",
    line: "",
    lineMoves: [],
    solutionLines: [],
    solutionLineIndex: 0,
    lineIndex: 0,
    viewingSolution: false,
    showWrongMove: false,
    showRetryMove: false,
    solved: false,
  });

  const isCancelledRef = useRef(false);

  const loadPuzzles = useCallback(async () => {
    try {
      const startedAt = new Date().toISOString();
      setLoadingError("");
      setBoardState((prev) => ({
        ...prev,
        status: "Loading puzzles...",
        error: "",
      }));
      setLoadDebug((prev) => ({
        ...prev,
        phase: "loading",
        endpoint: getSupabaseEndpoint(),
        hasUrl: Boolean(supabaseConfig.url),
        hasAnonKey: Boolean(supabaseConfig.anonKey),
        totalRows: 0,
        usableRows: 0,
        samplePuzzleId: "",
        startedAt,
        finishedAt: "",
        error: "",
      }));
      const data = await loadPuzzlesFromSupabase();

      const availablePuzzles = data
        .map((item, index) => {
          const rawId = item?.id;
          const parsedId = Number.parseInt(rawId, 10);
          const puzzleId = Number.isFinite(parsedId) ? parsedId : index + 1;

          return {
            ...item,
            puzzleId,
          };
        })
        .filter(
          (item) =>
            typeof item?.fen === "string" &&
            item.fen.length > 0 &&
            hasSolution(item),
        );

      if (availablePuzzles.length === 0) {
        throw new Error(
          `No puzzles found in "${supabaseConfig.table}" with both a valid fen and a solution`,
        );
      }

      if (!isCancelledRef.current) {
        const firstIndexFromPath = puzzleIndexFromPath(availablePuzzles);
        const firstIndex =
          firstIndexFromPath >= 0
            ? firstIndexFromPath
            : Math.floor(Math.random() * availablePuzzles.length);

        setPuzzles(availablePuzzles);
        setHistory([firstIndex]);
        setHistoryIndex(0);
        replaceUrlWithPuzzle(availablePuzzles[firstIndex].puzzleId);
        setLoadDebug((prev) => ({
          ...prev,
          phase: "success",
          totalRows: data.length,
          usableRows: availablePuzzles.length,
          samplePuzzleId: String(availablePuzzles[0]?.puzzleId ?? ""),
          finishedAt: new Date().toISOString(),
        }));
      }
    } catch (error) {
      if (!isCancelledRef.current) {
        const message = error.message || "Failed to load puzzles";
        setLoadingError(message);
        setLoadDebug((prev) => ({
          ...prev,
          phase: "error",
          finishedAt: new Date().toISOString(),
          error: message,
        }));
        setBoardState((prev) => ({
          ...prev,
          status: "Puzzle load error",
          error: message,
        }));
      }
    }
  }, []);

  useEffect(() => {
    isCancelledRef.current = false;
    loadPuzzles();

    return () => {
      isCancelledRef.current = true;
    };
  }, [loadPuzzles]);

  useEffect(() => {
    if (puzzles.length === 0) return;

    const onPopState = () => {
      const selectedIndex = puzzleIndexFromPath(puzzles);
      if (selectedIndex < 0) return;

      setHistory([selectedIndex]);
      setHistoryIndex(0);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [puzzles]);

  const activePuzzleIndex = historyIndex >= 0 ? history[historyIndex] : -1;
  const activePuzzle =
    activePuzzleIndex >= 0 ? puzzles[activePuzzleIndex] : null;
  const fen = activePuzzle?.fen ?? "";
  const author = activePuzzle?.author?.trim() || "Unknown";
  const event = activePuzzle?.event?.trim() || "";
  const orientation = orientationFromFen(fen);
  const analysisUrl = useMemo(() => lichessAnalysisUrl(fen), [fen]);

  const handleNextPuzzle = () => {
    if (puzzles.length === 0) return;
    setShowSolution(false);
    setSolutionNavigation(null);

    if (historyIndex < history.length - 1) {
      const nextHistoryIndex = historyIndex + 1;
      setHistoryIndex(nextHistoryIndex);
      const nextPuzzleIndex = history[nextHistoryIndex];
      const nextPuzzle = puzzles[nextPuzzleIndex];
      if (nextPuzzle) replaceUrlWithPuzzle(nextPuzzle.puzzleId);
      return;
    }

    const nextIndex = Math.floor(Math.random() * puzzles.length);

    const truncated = history.slice(0, historyIndex + 1);
    setHistory([...truncated, nextIndex]);
    setHistoryIndex(truncated.length);
    replaceUrlWithPuzzle(puzzles[nextIndex].puzzleId);
  };

  const handlePreviousPuzzle = () => {
    if (historyIndex <= 0) return;
    setShowSolution(false);
    setSolutionNavigation(null);
    const previousHistoryIndex = historyIndex - 1;
    setHistoryIndex(previousHistoryIndex);
    const previousPuzzleIndex = history[previousHistoryIndex];
    const previousPuzzle = puzzles[previousPuzzleIndex];
    if (previousPuzzle) replaceUrlWithPuzzle(previousPuzzle.puzzleId);
  };

  const handleToggleSolution = () => {
    setShowSolution((prev) => !prev);
    setSolutionNavigation(null);
  };

  const handleMoveClick = (lineIndex, moveIndex) => {
    setSolutionNavigation({
      lineIndex,
      plyIndex: moveIndex + 1,
    });
  };

  const inlineSolutionMoves = useMemo(() => {
    if (!boardState.solutionLines?.length) return null;

    const tree = createMoveTree(boardState.solutionLines);

    const renderNode = (node, plyIndex, keyPrefix, forceMoveNumber = false) => {
      const availableLineIndexes = [...node.lineIndexes.values()].sort(
        (a, b) => a - b,
      );
      const targetLineIndex = node.lineIndexes.has(boardState.solutionLineIndex)
        ? boardState.solutionLineIndex
        : (availableLineIndexes[0] ?? 0);

      const isActiveMove =
        node.lineIndexes.has(boardState.solutionLineIndex) &&
        boardState.lineIndex === plyIndex + 1;

      const content = [
        <button
          key={`${keyPrefix}-move-${plyIndex}-${node.move}`}
          type="button"
          className={`moveChip ${isActiveMove ? "active" : ""}`}
          onClick={() => handleMoveClick(targetLineIndex, plyIndex)}
        >
          {movePrefix(plyIndex, forceMoveNumber)}
          {node.move}
        </button>,
      ];

      const children = orderedChildren(node);
      if (children.length === 0) return content;

      const main = findMainChild(children);
      const variations = children.filter((child) => child !== main);

      variations.forEach((variation, variationIndex) => {
        const variationKey = `${keyPrefix}-variation-${plyIndex}-${variationIndex}`;
        content.push(
          <span key={`${variationKey}-open`} className="variationParen">
            (
          </span>,
        );
        content.push(
          ...renderNode(
            variation,
            plyIndex + 1,
            variationKey,
            (plyIndex + 1) % 2 === 1,
          ),
        );
        content.push(
          <span key={`${variationKey}-close`} className="variationParen">
            )
          </span>,
        );
      });

      content.push(...renderNode(main, plyIndex + 1, `${keyPrefix}-main`));
      return content;
    };

    const rootChildren = orderedChildren(tree);
    if (rootChildren.length === 0) return null;

    const rootMain = findMainChild(rootChildren, boardState.solutionLineIndex);
    const rootVariations = rootChildren.filter((child) => child !== rootMain);

    const content = [...renderNode(rootMain, 0, "root-main")];

    rootVariations.forEach((variation, index) => {
      const variationKey = `root-variation-${index}`;
      content.push(
        <span key={`${variationKey}-open`} className="variationParen">
          (
        </span>,
      );
      content.push(...renderNode(variation, 0, variationKey));
      content.push(
        <span key={`${variationKey}-close`} className="variationParen">
          )
        </span>,
      );
    });

    return content;
  }, [
    boardState.lineIndex,
    boardState.solutionLineIndex,
    boardState.solutionLines,
    handleMoveClick,
  ]);

  return (
    <div className="page">
      <div className="panel">
        <h1>Atomic Puzzle Trainer</h1>
        <p>Available puzzles: {puzzles.length}</p>

        <div className="controls">
          <div className="buttonRow">
            <button
              type="button"
              onClick={handlePreviousPuzzle}
              disabled={historyIndex <= 0}
            >
              Prev
            </button>
            <button
              type="button"
              onClick={handleNextPuzzle}
              disabled={puzzles.length === 0}
            >
              Next
            </button>
            <a
              className={`analyzeButton ${!fen ? "disabled" : ""}`}
              href={analysisUrl}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!fen}
              onClick={(event) => {
                if (!fen) event.preventDefault();
              }}
            >
              Analyze
            </a>
            <button
              type="button"
              onClick={handleToggleSolution}
              disabled={!fen}
            >
              {showSolution ? "Hide solution" : "Show solution"}
            </button>
          </div>
        </div>

        {boardState.error ? (
          <div className="errorText">{boardState.error}</div>
        ) : null}
        {loadingError ? <div className="errorText">{loadingError}</div> : null}

        <div className="fenBox">
          <div className="fenLabel">Supabase debug</div>
          <code>
            phase={loadDebug.phase} | hasUrl={String(loadDebug.hasUrl)} |
            hasAnonKey={String(loadDebug.hasAnonKey)}
          </code>
          <code>endpoint={loadDebug.endpoint || "missing"}</code>
          <code>
            rows={loadDebug.usableRows}/{loadDebug.totalRows} | samplePuzzleId=
            {loadDebug.samplePuzzleId || "n/a"}
          </code>
          <code>startedAt={loadDebug.startedAt || "n/a"}</code>
          <code>finishedAt={loadDebug.finishedAt || "n/a"}</code>
          <code>error={loadDebug.error || "none"}</code>
          <button
            type="button"
            onClick={loadPuzzles}
          >
            Retry Supabase Load
          </button>
        </div>

        <div className="fenBox">
          <div className="fenLabel">Current FEN</div>
          <code>{boardState.fen || fen || "No puzzle loaded"}</code>
        </div>

        <div className="fenBox">
          <div className="fenLabel">Puzzle author</div>
          <code>{author}</code>
        </div>

        {event ? (
          <div className="fenBox">
            <div className="fenLabel">Event</div>
            <code>{event}</code>
          </div>
        ) : null}

        <div className="lineBox">
          <div className="fenLabel">Move line (← / → to navigate)</div>
          {boardState.viewingSolution && boardState.solutionLines?.length ? (
            <div
              className="moveList inlineSolutionTree"
              role="list"
              aria-label="Solution variations"
            >
              {inlineSolutionMoves}
            </div>
          ) : boardState.lineMoves?.length ? (
            <div className="moveList" role="list" aria-label="Move line">
              {boardState.lineMoves.map((move, index) => {
                const isActive =
                  boardState.viewingSolution &&
                  boardState.lineIndex === index + 1;
                return (
                  <button
                    key={`${move}-${index}`}
                    type="button"
                    className={`moveChip ${isActive ? "active" : ""}`}
                    onClick={() => handleMoveClick(0, index)}
                  >
                    {index % 2 === 0 ? `${Math.floor(index / 2) + 1}.` : ""}
                    {move}
                  </button>
                );
              })}
            </div>
          ) : (
            <code>{boardState.line || "No moves yet"}</code>
          )}
        </div>
      </div>

      <div className="boardWrap">
        <div className="boardFrame">
          {boardState.showWrongMove ? (
            <div className="moveIndicator wrong" aria-label="Wrong move" />
          ) : null}
          {boardState.showRetryMove ? (
            <div className="moveIndicator retry" aria-label="Try again" />
          ) : null}
          {boardState.solved ? (
            <div className="moveIndicator correct" aria-label="Puzzle solved" />
          ) : null}
          {fen ? (
            <Chessboard
              fen={fen}
              orientation={orientation}
              coordinates
              solution={activePuzzle?.solution}
              showSolution={showSolution}
              solutionNavigation={solutionNavigation}
              onNavigateHandled={() => setSolutionNavigation(null)}
              onStateChange={setBoardState}
            />
          ) : (
            <div className="emptyBoard">Waiting for puzzle data...</div>
          )}
        </div>
      </div>
    </div>
  );
};
