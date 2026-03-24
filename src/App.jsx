import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { Chessboard } from "./components/Chessboard";
import { RankingsPage } from "./pages/Rankings";
import { RecentMatchesPage } from "./pages/RecentMatches";
import { PlayerProfilePage } from "./pages/PlayerProfile";
import { fetchLbRows, hasSupabaseLbConfig } from "./lib/supabaseLb";

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

const appPath = (pathname = "/") => {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${appBasePath}${normalized}`;
};

const lichessAnalysisUrl = (fen) => {
  if (!fen) return "https://lichess.org/analysis/atomic";
  return `https://lichess.org/analysis/atomic/${fen.replaceAll(" ", "_")}`;
};

const orientationFromFen = (fen) => {
  const turn = fen?.split(" ")?.[1];
  return turn === "b" ? "black" : "white";
};

const getRedirectedPath = () => {
  const redirectedPathFromQuery =
    new window.URLSearchParams(window.location.search).get("puzzlePath") || "";

  let redirectedPathFromSession = "";
  try {
    redirectedPathFromSession = window.sessionStorage.getItem("redirectedPuzzlePath") || "";
    if (redirectedPathFromSession) {
      window.sessionStorage.removeItem("redirectedPuzzlePath");
    }
  } catch {
    // Ignore storage failures and rely on the current path or query parameter.
  }

  const rawPath = redirectedPathFromQuery || redirectedPathFromSession;
  return toAppRelativePath(rawPath);
};

const parsePuzzleIdFromPath = (currentPath) => {
  const match = currentPath.match(/^\/(?:solve\/)?(\d+)\/?$/);
  if (!match) return null;

  const puzzleId = Number.parseInt(match[1], 10);
  if (Number.isNaN(puzzleId)) return null;
  return puzzleId;
};

const puzzleIndexFromPath = (puzzles, currentPath) => {
  const puzzleId = parsePuzzleIdFromPath(currentPath);
  if (puzzleId === null) return -1;

  const puzzleIndex = puzzles.findIndex((puzzle) => puzzle.puzzleId === puzzleId);
  return puzzleIndex;
};

const navigateToPuzzle = (navigate, puzzleId, options = {}) => {
  navigate(`/solve/${puzzleId}`, options);
};

const hasSolution = (puzzle) => {
  if (!puzzle) return false;
  if (typeof puzzle.solution === "string") return puzzle.solution.trim().length > 0;
  return Array.isArray(puzzle.solution) && puzzle.solution.length > 0;
};

const randomPuzzleIndex = (length, excludedIndex = -1) => {
  if (length <= 1) return 0;
  let candidate = Math.floor(Math.random() * length);
  while (candidate === excludedIndex) {
    candidate = Math.floor(Math.random() * length);
  }
  return candidate;
};

const solutionFieldCandidates = ["solution", "moves", "line", "pgn", "variation"];

const normalizeSolution = (rawValue) => {
  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    return trimmed.length > 0 ? trimmed : "";
  }

  if (Array.isArray(rawValue)) {
    const joined = rawValue
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean)
      .join(" ");
    return joined;
  }

  return "";
};

const extractSolutionFromRow = (row) => {
  for (const fieldName of solutionFieldCandidates) {
    const normalized = normalizeSolution(row?.[fieldName]);
    if (normalized) {
      return {
        solution: normalized,
        sourceField: fieldName,
      };
    }
  }

  return {
    solution: "",
    sourceField: null,
  };
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
    const firstLineDiff = (a.firstOccurrence?.lineIndex ?? 0) - (b.firstOccurrence?.lineIndex ?? 0);
    if (firstLineDiff !== 0) return firstLineDiff;
    return (a.firstOccurrence?.moveIndex ?? 0) - (b.firstOccurrence?.moveIndex ?? 0);
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
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  }

  const baseUrl = url.replace(/\/$/, "");
  const pageSize = 1000;
  let offset = 0;
  const allRows = [];

  while (true) {
    const endpoint = `${baseUrl}/rest/v1/${encodeURIComponent(table)}?select=*&limit=${pageSize}&offset=${offset}`;
    const response = await fetch(endpoint, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while loading Supabase table "${table}"`);
    }

    const pageRows = await response.json();
    if (!Array.isArray(pageRows)) {
      throw new Error(`Expected Supabase table "${table}" to return an array`);
    }

    allRows.push(...pageRows);
    if (pageRows.length < pageSize) break;
    offset += pageSize;
  }

  return allRows;
};

const TopNav = () => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
  }, [searchOpen]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const target = searchQuery.trim();
    if (!target) return;
    navigate(`/@/${encodeURIComponent(target)}`);
  };

  const closeSearchIfFocusOutside = () => {
    window.requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLElement)) {
        setSearchOpen(false);
        return;
      }

      if (!activeElement.closest(".navSearch")) {
        setSearchOpen(false);
      }
    });
  };

  const closeSearchOnMouseLeave = () => {
    setSearchOpen(false);
    searchInputRef.current?.blur();
  };

  return (
    <header className="topNav">
      <Link className="homeBrand" to="/" aria-label="Go to home page">
        <img src={appPath("/favicon.ico")} alt="Atomic Puzzles" width="24" height="24" />
      </Link>
      <div className="topNavCenter">
        <div className="navSearchSlot">
          <form
            className={`navSearch ${searchOpen ? "open" : ""}`}
            onSubmit={handleSearchSubmit}
            onMouseEnter={() => setSearchOpen(true)}
            onMouseLeave={closeSearchOnMouseLeave}
            onFocusCapture={() => setSearchOpen(true)}
            onBlurCapture={closeSearchIfFocusOutside}
          >
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              placeholder="Search player"
              aria-label="Search player username"
              onChange={(event) => setSearchQuery(event.target.value)}
              tabIndex={searchOpen ? 0 : -1}
            />
            <button
              className="navSearchIcon"
              type={searchOpen ? "submit" : "button"}
              aria-label="Search player"
              onClick={() => {
                if (!searchOpen) {
                  setSearchOpen(true);
                }
              }}
            >
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            </button>
            <button className="navSearchGo" type="submit" tabIndex={searchOpen ? 0 : -1}>
              Go
            </button>
          </form>
        </div>
        <nav className="topNavLinks" aria-label="Main navigation">
          <Link to="/rankings">Rankings</Link>
          <Link to="/solve">Puzzles</Link>
          <Link to="/recent">Recent</Link>
        </nav>
      </div>
    </header>
  );
};

const HomePage = () => {
  const [homeError, setHomeError] = useState("");

  useEffect(() => {
    const loadHomeData = async () => {
      try {
        setHomeError("");
        if (!hasSupabaseLbConfig()) {
          throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
        }
        await fetchLbRows({ limit: 1 });
      } catch (error) {
        setHomeError(String(error?.message || error));
      }
    };

    loadHomeData();
  }, []);

  return (
    <div className="homePage">
      <div className="panel homePanel">
        <h1>Atomic Puzzles</h1>
        <p className="homeIntro">
          Welcome! This site helps you solve atomic puzzles, sharpen tactical ability, and keep up
          with the current player rankings and stats.
        </p>

        <section className="homeButtonRow">
          <Link className="primaryCta" to="/solve">
            Solve Puzzles
          </Link>
          <Link className="primaryCta" to="/rankings">
            View Rankings
          </Link>
          <Link className="primaryCta" to="/recent">
            View Recent Matches
          </Link>
        </section>

        {homeError ? <div className="errorText">{homeError}</div> : null}

        <section className="homeDescriptions">
          <article className="homeDescriptionCard">
            <h2>Puzzles and Improvement</h2>
            <p>
              Train with tactical puzzle positions to build pattern recognition, improve calculation
              speed, and perform better in practical atomic games.
            </p>
          </article>
          <article className="homeDescriptionCard">
            <h2>Rankings</h2>
            <p>
              View the top atomic blitz and bullet rankings for the current month. Explore
              historical rankings going back to 2023. Blitz and bullet ratings are tracked
              separately because skill transfer is not one-to-one: hyperbullet farmers and stronger
              blitz players often excel in very different ways.
            </p>
          </article>
          <article className="homeDescriptionCard">
            <h2>Player Stats and Fairness</h2>
            <p>
              Stats are tracked for each player account individually so you can review account-level
              progress over time. Cheaters and alt abusers are excluded from rankings and rating
              calculations to keep the system as fair and meaningful as possible.
            </p>
          </article>
          <article className="homeDescriptionCard">
            <h2>Recent Matches</h2>
            <p>
              Open recent matches for the latest competitive results and momentum checks across the
              strongest active players.
            </p>
          </article>
        </section>
      </div>
    </div>
  );
};

export const App = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== "/") return;
    const redirectedPath = getRedirectedPath();
    if (!redirectedPath || redirectedPath === "/") return;
    navigate(redirectedPath, { replace: true });
  }, [location.pathname, location.search, navigate]);

  return (
    <div className="appShell">
      <TopNav />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/rankings" element={<RankingsPage />} />
        <Route path="/recent" element={<RecentMatchesPage />} />
        <Route path="/matches" element={<RecentMatchesPage />} />
        <Route path="/solve/:puzzleId?" element={<AtomicTrainerPage />} />
        <Route path="/:puzzleId" element={<LegacyPuzzleRoute />} />
        <Route path="/@/:username" element={<ProfileRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
};

const LegacyPuzzleRoute = () => {
  const { puzzleId = "" } = useParams();
  return <Navigate to={`/solve/${puzzleId}`} replace />;
};

const ProfileRoute = () => {
  const { username = "" } = useParams();
  return <PlayerProfilePage username={username} />;
};

const AtomicTrainerPage = () => {
  const navigate = useNavigate();
  const { puzzleId = "" } = useParams();
  const [puzzles, setPuzzles] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [nextPuzzleIndex, setNextPuzzleIndex] = useState(-1);
  const [loadingError, setLoadingError] = useState("");
  const [showSolution, setShowSolution] = useState(false);
  const [solutionNavigation, setSolutionNavigation] = useState(null);
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
      setLoadingError("");
      setBoardState((prev) => ({
        ...prev,
        status: "Loading puzzles...",
        error: "",
      }));
      const data = await loadPuzzlesFromSupabase();

      const normalizedPuzzles = data.map((item, index) => {
        const rawId = item?.id;
        const parsedId = Number.parseInt(rawId, 10);
        const puzzleId = Number.isFinite(parsedId) ? parsedId : index + 1;
        const fen = typeof item?.fen === "string" ? item.fen.trim() : "";
        const { solution } = extractSolutionFromRow(item);

        return {
          ...item,
          fen,
          solution,
          puzzleId,
        };
      });

      const availablePuzzles = normalizedPuzzles.filter(
        (item) => typeof item?.fen === "string" && item.fen.length > 0 && hasSolution(item),
      );

      if (data.length === 0) {
        const message = `Supabase returned 0 rows from table "${supabaseConfig.table}". Check table name and RLS SELECT policy for the anon role.`;
        if (!isCancelledRef.current) {
          setLoadingError(message);
          setBoardState((prev) => ({
            ...prev,
            status: "Puzzle load error",
            error: message,
          }));
        }
        return;
      }

      if (availablePuzzles.length === 0) {
        const message = `No puzzles found in "${supabaseConfig.table}" with both a valid fen and a solution`;
        if (!isCancelledRef.current) {
          setLoadingError(message);
          setBoardState((prev) => ({
            ...prev,
            status: "Puzzle load error",
            error: message,
          }));
        }
        return;
      }

      if (!isCancelledRef.current) {
        const firstIndexFromPath = puzzleIndexFromPath(availablePuzzles, `/solve/${puzzleId}`);
        const firstIndex =
          firstIndexFromPath >= 0
            ? firstIndexFromPath
            : randomPuzzleIndex(availablePuzzles.length);

        setPuzzles(availablePuzzles);
        setHistory([firstIndex]);
        setHistoryIndex(0);
        setNextPuzzleIndex(randomPuzzleIndex(availablePuzzles.length, firstIndex));
        navigateToPuzzle(navigate, availablePuzzles[firstIndex].puzzleId, { replace: true });
      }
    } catch (error) {
      if (!isCancelledRef.current) {
        const message = error.message || "Failed to load puzzles";
        setLoadingError(message);
        setBoardState((prev) => ({
          ...prev,
          status: "Puzzle load error",
          error: message,
        }));
      }
    }
  }, [navigate, puzzleId]);

  useEffect(() => {
    isCancelledRef.current = false;
    loadPuzzles();

    return () => {
      isCancelledRef.current = true;
    };
  }, [loadPuzzles]);

  useEffect(() => {
    if (!puzzleId || puzzles.length === 0) return;

    const selectedIndex = puzzleIndexFromPath(puzzles, `/solve/${puzzleId}`);
    if (selectedIndex < 0) return;

    const currentIndex = history[historyIndex];
    if (currentIndex === selectedIndex) return;

    const existingHistoryIndex = history.findIndex((entry) => entry === selectedIndex);
    if (existingHistoryIndex >= 0) {
      setHistoryIndex(existingHistoryIndex);
      return;
    }

    const truncated = history.slice(0, historyIndex + 1);
    setHistory([...truncated, selectedIndex]);
    setHistoryIndex(truncated.length);
  }, [puzzleId, puzzles, history, historyIndex]);

  const activePuzzleIndex = historyIndex >= 0 ? history[historyIndex] : -1;
  const activePuzzle = activePuzzleIndex >= 0 ? puzzles[activePuzzleIndex] : null;
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
      if (nextPuzzle) navigateToPuzzle(navigate, nextPuzzle.puzzleId);
      return;
    }

    const nextIndex =
      nextPuzzleIndex >= 0 ? nextPuzzleIndex : randomPuzzleIndex(puzzles.length, activePuzzleIndex);

    const truncated = history.slice(0, historyIndex + 1);
    setHistory([...truncated, nextIndex]);
    setHistoryIndex(truncated.length);
    navigateToPuzzle(navigate, puzzles[nextIndex].puzzleId);
    setNextPuzzleIndex(randomPuzzleIndex(puzzles.length, nextIndex));
  };

  const handlePreviousPuzzle = () => {
    if (historyIndex <= 0) return;
    setShowSolution(false);
    setSolutionNavigation(null);
    const previousHistoryIndex = historyIndex - 1;
    setHistoryIndex(previousHistoryIndex);
    const previousPuzzleIndex = history[previousHistoryIndex];
    const previousPuzzle = puzzles[previousPuzzleIndex];
    if (previousPuzzle) navigateToPuzzle(navigate, previousPuzzle.puzzleId);
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
      const availableLineIndexes = [...node.lineIndexes.values()].sort((a, b) => a - b);
      const targetLineIndex = node.lineIndexes.has(boardState.solutionLineIndex)
        ? boardState.solutionLineIndex
        : (availableLineIndexes[0] ?? 0);

      const isActiveMove =
        node.lineIndexes.has(boardState.solutionLineIndex) && boardState.lineIndex === plyIndex + 1;

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
          ...renderNode(variation, plyIndex + 1, variationKey, (plyIndex + 1) % 2 === 1),
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
            <button type="button" onClick={handlePreviousPuzzle} disabled={historyIndex <= 0}>
              Prev
            </button>
            <button type="button" onClick={handleNextPuzzle} disabled={puzzles.length === 0}>
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
            <button type="button" onClick={handleToggleSolution} disabled={!fen}>
              {showSolution ? "Hide solution" : "Show solution"}
            </button>
          </div>
        </div>

        {boardState.error ? <div className="errorText">{boardState.error}</div> : null}
        {loadingError ? <div className="errorText">{loadingError}</div> : null}

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
                const isActive = boardState.viewingSolution && boardState.lineIndex === index + 1;
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
