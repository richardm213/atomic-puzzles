import { useEffect, useMemo, useRef, useState } from "react";
import { Chessground } from "@lichess-org/chessground";
import { chessgroundDests } from "chessops/compat";
import { makeFen, parseFen } from "chessops/fen";
import { makeSan } from "chessops/san";
import { makeUci, parseSquare } from "chessops/util";
import { Atomic } from "chessops/variant";
import { getBoardThemeColors, useAppSettings } from "../../context/AppSettings";
import { convertUciLineToSan, parseSolutionUciLines } from "../../lib/solutionPgn";
import "./Chessboard.css";

const createAtomicPosition = (fen) => {
  const parsed = parseFen(fen);
  if (parsed.isErr) {
    return {
      ok: false,
      error: `Invalid FEN: ${parsed.error.message}`,
    };
  }

  const created = Atomic.fromSetup(parsed.value);
  if (created.isErr) {
    return {
      ok: false,
      error: `Atomic setup error: ${created.error.message}`,
    };
  }

  return {
    ok: true,
    position: created.value,
  };
};

const getStatus = (position) => {
  const outcome = position.outcome();
  if (outcome) {
    if (outcome.winner === "white") return "White wins";
    if (outcome.winner === "black") return "Black wins";
    return "Draw";
  }

  if (position.isCheck()) return `${position.turn} to move — check`;
  return `${position.turn} to move`;
};

const toPromotion = (square) => {
  const rank = square[1];
  return rank === "1" || rank === "8" ? "queen" : undefined;
};

const promotionOptions = ["queen", "knight", "rook", "bishop"];

const squareName = (file, rank) => `${String.fromCharCode("a".charCodeAt(0) + file)}${rank + 1}`;
const pieceCodes = {
  pawn: "P",
  bishop: "B",
  knight: "N",
  rook: "R",
  queen: "Q",
  king: "K",
};

const checkerboardSvg = (light, dark) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' shape-rendering='crispEdges'><rect width='8' height='8' fill='${light}'/><g fill='${dark}'><rect width='1' height='1'/><rect x='2' width='1' height='1'/><rect x='4' width='1' height='1'/><rect x='6' width='1' height='1'/><rect x='1' y='1' width='1' height='1'/><rect x='3' y='1' width='1' height='1'/><rect x='5' y='1' width='1' height='1'/><rect x='7' y='1' width='1' height='1'/><rect y='2' width='1' height='1'/><rect x='2' y='2' width='1' height='1'/><rect x='4' y='2' width='1' height='1'/><rect x='6' y='2' width='1' height='1'/><rect x='1' y='3' width='1' height='1'/><rect x='3' y='3' width='1' height='1'/><rect x='5' y='3' width='1' height='1'/><rect x='7' y='3' width='1' height='1'/><rect y='4' width='1' height='1'/><rect x='2' y='4' width='1' height='1'/><rect x='4' y='4' width='1' height='1'/><rect x='6' y='4' width='1' height='1'/><rect x='1' y='5' width='1' height='1'/><rect x='3' y='5' width='1' height='1'/><rect x='5' y='5' width='1' height='1'/><rect x='7' y='5' width='1' height='1'/><rect y='6' width='1' height='1'/><rect x='2' y='6' width='1' height='1'/><rect x='4' y='6' width='1' height='1'/><rect x='6' y='6' width='1' height='1'/><rect x='1' y='7' width='1' height='1'/><rect x='3' y='7' width='1' height='1'/><rect x='5' y='7' width='1' height='1'/><rect x='7' y='7' width='1' height='1'/></g></svg>`,
  )}")`;

const boardTextureAsset = (filename) => `url("${import.meta.env.BASE_URL}board-textures/${filename}")`;

const clampColorChannel = (value) => Math.max(0, Math.min(255, Math.round(value)));

const parseHexColor = (value) => {
  const normalized = /^#([0-9a-f]{6})$/i.exec(value ?? "");
  if (!normalized) return null;

  return {
    r: Number.parseInt(normalized[1].slice(0, 2), 16),
    g: Number.parseInt(normalized[1].slice(2, 4), 16),
    b: Number.parseInt(normalized[1].slice(4, 6), 16),
  };
};

const toHexColor = ({ r, g, b }) =>
  `#${[r, g, b].map((channel) => clampColorChannel(channel).toString(16).padStart(2, "0")).join("")}`;

const mixHexColors = (base, target, amount) => {
  const baseRgb = parseHexColor(base);
  const targetRgb = parseHexColor(target);
  if (!baseRgb || !targetRgb) return base;

  return toHexColor({
    r: baseRgb.r + (targetRgb.r - baseRgb.r) * amount,
    g: baseRgb.g + (targetRgb.g - baseRgb.g) * amount,
    b: baseRgb.b + (targetRgb.b - baseRgb.b) * amount,
  });
};

const toRgba = (hex, alpha) => {
  const rgb = parseHexColor(hex);
  if (!rgb) return `rgba(0, 0, 0, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};

const boardTextureConfig = {
  "blue-marble": {
    overlay:
      "radial-gradient(circle at 16% 20%, rgba(255, 255, 255, 0.35), transparent 32%), radial-gradient(circle at 84% 18%, rgba(255, 255, 255, 0.2), transparent 28%), linear-gradient(135deg, rgba(61, 91, 126, 0.26), rgba(255, 255, 255, 0.08) 30%, rgba(61, 91, 126, 0.2) 60%, transparent 100%)",
    blendMode: "soft-light, normal",
  },
  canvas: {
    overlay:
      "repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.1) 0 2px, rgba(120, 96, 53, 0.05) 2px 4px), repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.08) 0 2px, rgba(120, 96, 53, 0.05) 2px 4px)",
    blendMode: "multiply, normal",
  },
  wood: {
    backgroundImage: boardTextureAsset("wood.jpg"),
    size: "cover",
  },
  wood2: {
    backgroundImage: boardTextureAsset("wood2.jpg"),
    size: "cover",
  },
  wood3: {
    backgroundImage: boardTextureAsset("wood3.jpg"),
    size: "cover",
  },
  wood4: {
    backgroundImage: boardTextureAsset("wood4.jpg"),
    size: "cover",
  },
  maple: {
    backgroundImage: boardTextureAsset("maple.jpg"),
    size: "cover",
  },
  maple2: {
    backgroundImage: boardTextureAsset("maple2.jpg"),
    size: "cover",
  },
  leather: {
    backgroundImage: boardTextureAsset("leather.jpg"),
    size: "cover",
  },
  marble: {
    backgroundImage: boardTextureAsset("marble.jpg"),
    size: "cover",
  },
  "green-plastic": {
    overlay:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.03) 32%, rgba(0, 0, 0, 0.1) 100%)",
    blendMode: "soft-light, normal",
  },
  metal: {
    backgroundImage: boardTextureAsset("metal.jpg"),
    size: "cover",
  },
  newspaper: {
    overlay:
      "repeating-linear-gradient(0deg, rgba(94, 82, 66, 0.08) 0 2px, transparent 2px 5px), radial-gradient(circle at 14% 20%, rgba(120, 109, 91, 0.09), transparent 26%)",
    blendMode: "multiply, normal",
  },
  "purple-diag": {
    overlay:
      "repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0 10px, rgba(70, 37, 106, 0.08) 10px 20px)",
    blendMode: "multiply, normal",
  },
  ic: {
    overlay:
      "linear-gradient(135deg, rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0.04) 45%, rgba(76, 177, 210, 0.16) 100%), repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0 8px, rgba(91, 188, 214, 0.08) 8px 18px)",
    blendMode: "screen, normal",
  },
};

const buildBoardStyle = (
  boardTheme,
  customLightSquare,
  customDarkSquare,
  boardColorOverrideTheme,
  boardOverrideLightSquare,
  boardOverrideDarkSquare,
) => {
  const palette = getBoardThemeColors(
    boardTheme,
    customLightSquare,
    customDarkSquare,
    boardColorOverrideTheme,
    boardOverrideLightSquare,
    boardOverrideDarkSquare,
  );
  const texture = boardTextureConfig[boardTheme];
  const lightCoordColor = mixHexColors(palette.light, "#000000", 0.45);
  const darkCoordColor = mixHexColors(palette.dark, "#ffffff", 0.72);
  const backgroundImage = texture?.backgroundImage
    ? texture.backgroundImage
    : texture?.overlay
      ? `${texture.overlay}, ${checkerboardSvg(palette.light, palette.dark)}`
      : checkerboardSvg(palette.light, palette.dark);

  return {
    "--cg-board-background-image": backgroundImage,
    "--cg-board-background-size": texture?.size ?? (texture?.overlay ? "100% 100%, 100% 100%" : "100% 100%"),
    "--cg-board-background-blend-mode": texture?.blendMode ?? "normal",
    "--cg-board-light-last-move": toRgba(mixHexColors(palette.light, "#7fd0ff", 0.35), 0.46),
    "--cg-board-dark-last-move": toRgba(mixHexColors(palette.dark, "#2a95ff", 0.2), 0.42),
    "--cg-board-coord-dark": lightCoordColor,
    "--cg-board-coord-light": darkCoordColor,
  };
};

const buildPieceStyle = (pieceSet) => {
  const pieceStyle = {};

  for (const [role, code] of Object.entries(pieceCodes)) {
    pieceStyle[`--cg-piece-white-${role}`] = `url("https://lichess1.org/assets/piece/${pieceSet}/w${code}.svg")`;
    pieceStyle[`--cg-piece-black-${role}`] = `url("https://lichess1.org/assets/piece/${pieceSet}/b${code}.svg")`;
  }

  return pieceStyle;
};

const toComparableUci = (position, uci, move) => {
  const normalized = uci.toLowerCase();
  const activeMove = move ?? moveFromUci(position, normalized);
  if (!activeMove) return normalized;

  const piece = position.board.get(activeMove.from);
  if (piece?.role !== "king") return normalized;

  const fromFile = activeMove.from % 8;
  const fromRank = Math.floor(activeMove.from / 8);
  const toFile = activeMove.to % 8;
  const toRank = Math.floor(activeMove.to / 8);
  const fileDelta = toFile - fromFile;

  if (fromRank !== toRank || Math.abs(fileDelta) < 2) return normalized;

  const castledKingFile = fromFile + 2 * Math.sign(fileDelta);
  if (castledKingFile < 0 || castledKingFile > 7) return normalized;

  return `${squareName(fromFile, fromRank)}${squareName(castledKingFile, fromRank)}`;
};

const moveFromUci = (position, uci) => {
  const from = parseSquare(uci.slice(0, 2));
  const to = parseSquare(uci.slice(2, 4));
  if (from === undefined || to === undefined) return null;

  const piece = position.board.get(from);
  const promotionCode = uci[4];
  const promotion =
    promotionCode === "q"
      ? "queen"
      : promotionCode === "r"
        ? "rook"
        : promotionCode === "b"
          ? "bishop"
          : promotionCode === "n"
            ? "knight"
            : piece?.role === "pawn"
              ? toPromotion(uci.slice(2, 4))
              : undefined;

  const move = { from, to, promotion };
  return position.isLegal(move) ? move : null;
};

const hasExpectedMoveAt = (lines, progress) =>
  lines.some((line) => line[progress] && !line[progress].questionable);

const otherColor = (color) => (color === "white" ? "black" : "white");

const mergeDests = (...maps) => {
  const merged = new Map();

  maps.forEach((map) => {
    map.forEach((destinations, square) => {
      const existing = merged.get(square) ?? [];
      merged.set(square, [...new Set([...existing, ...destinations])]);
    });
  });

  return merged;
};

export const Chessboard = ({
  fen,
  orientation,
  coordinates,
  solution,
  showSolution,
  analysisMode = false,
  autoRetryWrongMoves = false,
  solutionNavigation,
  retrySignal,
  onNavigateHandled,
  onStateChange,
}) => {
  const {
    pieceSet,
    boardTheme,
    customLightSquare,
    customDarkSquare,
    boardColorOverrideTheme,
    boardOverrideLightSquare,
    boardOverrideDarkSquare,
  } = useAppSettings();
  const elementRef = useRef(null);
  const cgRef = useRef(null);
  const positionRef = useRef(null);
  const pendingPromotionRef = useRef(null);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const historyRef = useRef({
    fens: [],
    lastMoves: [],
    moveUcis: [],
    moveKeys: [],
    moveSans: [],
    index: 0,
  });
  const moveLockRef = useRef(false);
  const puzzleSolvedRef = useRef(false);
  const candidateLinesRef = useRef([]);
  const progressRef = useRef(0);
  const orientationRef = useRef(orientation);
  const coordinatesRef = useRef(coordinates);
  const showSolutionRef = useRef(showSolution);
  const analysisModeRef = useRef(analysisMode);
  const fenRef = useRef(fen);

  const solutionUciLines = useMemo(() => parseSolutionUciLines(fen, solution), [fen, solution]);

  const solutionLinesRef = useRef([]);
  const trainingEnabledRef = useRef(false);
  const displaySolutionEntriesRef = useRef([]);
  const displaySolutionLinesRef = useRef([]);
  const activeSolutionLineRef = useRef(0);
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

  useEffect(() => {
    solutionLinesRef.current = solutionUciLines;
    trainingEnabledRef.current = solutionUciLines.length > 0;
    displaySolutionEntriesRef.current = solutionUciLines
      .map((line) => {
        const sanLine = convertUciLineToSan(fen, line);
        if (sanLine.length === 0) return null;
        return {
          moveEntries: line,
          uciLine: line.map((entry) => entry.uci),
          sanLine,
        };
      })
      .filter(Boolean);
    displaySolutionLinesRef.current = displaySolutionEntriesRef.current.map(
      (entry) => entry.sanLine,
    );
    activeSolutionLineRef.current = 0;
  }, [fen, solutionUciLines]);

  useEffect(() => {
    orientationRef.current = orientation;
    coordinatesRef.current = coordinates;
  }, [orientation, coordinates]);

  useEffect(() => {
    showSolutionRef.current = showSolution;
  }, [showSolution]);

  useEffect(() => {
    analysisModeRef.current = analysisMode;
  }, [analysisMode]);

  useEffect(() => {
    fenRef.current = fen;
  }, [fen]);

  const emitState = (position, next) => {
    const history = historyRef.current;
    const state = {
      fen: makeFen(position.toSetup()),
      turn: position.turn,
      status: getStatus(position),
      winner: position.outcome()?.winner,
      error: "",
      line: history.moveSans.join(" "),
      lineMoves: history.moveSans,
      solutionLines: displaySolutionLinesRef.current,
      solutionLineIndex: activeSolutionLineRef.current,
      lineIndex: history.index,
      viewingSolution: showSolutionRef.current,
      showWrongMove: false,
      solved: puzzleSolvedRef.current,
      ...(next || {}),
    };

    onStateChange?.(state);
    return state;
  };

  const getAnalysisPositionForMove = (position, from) => {
    const piece = position.board.get(from);
    if (!piece) return null;
    if (piece.color === position.turn) return position;

    const adjusted = position.clone();
    adjusted.turn = piece.color;
    return adjusted;
  };

  const getMovableConfig = (position) => {
    if (moveLockRef.current) {
      return {
        color: undefined,
        dests: new Map(),
        free: false,
      };
    }

    if (!analysisModeRef.current) {
      return {
        color: position.outcome() ? undefined : position.turn,
        dests: chessgroundDests(position),
        free: false,
      };
    }

    const currentTurnDests = chessgroundDests(position);
    const alternatePosition = position.clone();
    alternatePosition.turn = otherColor(position.turn);
    const alternateTurnDests = chessgroundDests(alternatePosition);

    return {
      color: "both",
      dests: mergeDests(currentTurnDests, alternateTurnDests),
      free: false,
    };
  };

  const saveMove = (position, lastMove, moveUci, moveKey, moveSan) => {
    const history = historyRef.current;
    const nextFen = makeFen(position.toSetup());

    if (history.index < history.moveUcis.length) {
      history.fens = history.fens.slice(0, history.index + 1);
      history.lastMoves = history.lastMoves.slice(0, history.index + 1);
      history.moveUcis = history.moveUcis.slice(0, history.index);
      history.moveKeys = history.moveKeys.slice(0, history.index);
      history.moveSans = history.moveSans.slice(0, history.index);
    }

    history.fens.push(nextFen);
    history.lastMoves.push(lastMove);
    history.moveUcis.push(moveUci);
    history.moveKeys.push(moveKey);
    history.moveSans.push(moveSan);
    history.index += 1;
  };

  const syncBoard = (position, lastMove, nextState) => {
    positionRef.current = position;

    const movable = getMovableConfig(position);

    cgRef.current?.set({
      fen: makeFen(position.toSetup()),
      orientation: orientationRef.current,
      coordinates: coordinatesRef.current,
      turnColor: position.turn,
      lastMove,
      check: position.isCheck() ? position.turn : false,
      movable,
    });

    emitState(position, nextState);
  };

  const recomputeTrainingFromHistory = (targetIndex) => {
    if (!trainingEnabledRef.current || analysisModeRef.current) {
      candidateLinesRef.current = [];
      progressRef.current = 0;
      puzzleSolvedRef.current = false;
      return;
    }

    const playedMoves = historyRef.current.moveKeys.slice(0, targetIndex);
    let candidates = solutionLinesRef.current;
    let progress = 0;
    let solved = !hasExpectedMoveAt(candidates, progress);

    for (const moveText of playedMoves) {
      if (solved) continue;

      const matching = candidates.filter((line) => line[progress]?.key === moveText);
      if (matching.length === 0) break;

      candidates = matching;
      progress += 1;
      solved = !hasExpectedMoveAt(candidates, progress);
    }

    candidateLinesRef.current = candidates;
    progressRef.current = progress;
    puzzleSolvedRef.current = solved;
  };

  const navigateTo = (targetIndex) => {
    const history = historyRef.current;
    if (targetIndex < 0 || targetIndex >= history.fens.length) return;

    const created = createAtomicPosition(history.fens[targetIndex]);
    if (!created.ok) return;

    history.index = targetIndex;
    moveLockRef.current = showSolutionRef.current && !analysisModeRef.current;
    recomputeTrainingFromHistory(targetIndex);

    syncBoard(created.position, history.lastMoves[targetIndex]);
  };

  const buildSolutionHistory = (initialFen, line) => {
    const created = createAtomicPosition(initialFen);
    if (!created.ok) return null;

    const position = created.position;
    const fens = [initialFen];
    const lastMoves = [undefined];
    const moveUcis = [];
    const moveSans = [];
    const moveKeys = [];

    for (const entry of line) {
      const uci = entry.uci;
      const move = moveFromUci(position, uci);
      if (!move) break;

      const san = makeSan(position, move);
      position.play(move);
      fens.push(makeFen(position.toSetup()));
      lastMoves.push([uci.slice(0, 2), uci.slice(2, 4)]);
      moveUcis.push(uci);
      moveKeys.push(entry.key);
      moveSans.push(san);
    }

    return { fens, lastMoves, moveUcis, moveKeys, moveSans };
  };

  const showSolutionLine = (lineIndex, targetPly) => {
    const solutionEntry = displaySolutionEntriesRef.current[lineIndex];
    if (!solutionEntry?.moveEntries?.length) return;

    const solutionHistory = buildSolutionHistory(fenRef.current, solutionEntry.moveEntries);
    if (!solutionHistory) return;

    const clampedIndex = Math.max(
      0,
      Math.min(targetPly ?? solutionHistory.moveUcis.length, solutionHistory.moveUcis.length),
    );

    historyRef.current = {
      ...solutionHistory,
      index: clampedIndex,
    };
    activeSolutionLineRef.current = lineIndex;
    moveLockRef.current = !analysisModeRef.current;
    candidateLinesRef.current = [];
    progressRef.current = 0;
    const solvedBeforeSolution = puzzleSolvedRef.current;

    const created = createAtomicPosition(solutionHistory.fens[clampedIndex]);
    if (!created.ok) return;

    syncBoard(created.position, solutionHistory.lastMoves[clampedIndex], {
      showWrongMove: false,
      solved: solvedBeforeSolution,
      viewingSolution: true,
      solutionLineIndex: lineIndex,
      solutionLines: displaySolutionLinesRef.current,
    });
  };

  const autoplayOpponentMove = (position) => {
    const candidates = candidateLinesRef.current;
    const progress = progressRef.current;
    const nextOpponentMove = candidates.find(
      (line) => line[progress] && !line[progress].questionable,
    )?.[progress]?.uci;

    if (!nextOpponentMove) {
      puzzleSolvedRef.current = true;
      return false;
    }

    const nextCandidates = candidates.filter((line) => line[progress]?.uci === nextOpponentMove);
    const move = moveFromUci(position, nextOpponentMove);
    if (!move) {
      puzzleSolvedRef.current = true;
      return false;
    }

    const opponentMoveSan = makeSan(position, move);
    position.play(move);
    saveMove(
      position,
      [nextOpponentMove.slice(0, 2), nextOpponentMove.slice(2, 4)],
      nextOpponentMove,
      candidates.find((line) => line[progress]?.uci === nextOpponentMove)?.[progress]?.key ??
        nextOpponentMove,
      opponentMoveSan,
    );

    candidateLinesRef.current = nextCandidates;
    progressRef.current = progress + 1;
    puzzleSolvedRef.current = !hasExpectedMoveAt(nextCandidates, progressRef.current);

    return true;
  };

  const clearPendingPromotion = () => {
    pendingPromotionRef.current = null;
    setPendingPromotion(null);
  };

  const getPromotionChoices = (position, from, to, piece) => {
    if (piece?.role !== "pawn") return [];

    const destination = squareName(to % 8, Math.floor(to / 8));
    if (!toPromotion(destination)) return [];
    const activePosition =
      analysisModeRef.current ? getAnalysisPositionForMove(position, from) ?? position : position;

    return promotionOptions.filter((role) => activePosition.isLegal({ from, to, promotion: role }));
  };

  const getPromotionSquareStyle = (pending, index) => {
    const to = parseSquare(pending.dest);
    if (to === undefined) return {};

    const file = to % 8;
    const orientationValue = orientationRef.current;
    const left = (orientationValue === "white" ? file : 7 - file) * 12.5;
    const top = (pending.color === orientationValue ? index : 7 - index) * 12.5;

    return {
      left: `${left}%`,
      top: `${top}%`,
    };
  };

  const playUserMove = (orig, dest, promotion) => {
    const position = positionRef.current;
    if (
      !position ||
      moveLockRef.current ||
      (showSolutionRef.current && !analysisModeRef.current)
    ) {
      return;
    }

    const from = parseSquare(orig);
    const to = parseSquare(dest);
    if (from === undefined || to === undefined) return;

    const move = {
      from,
      to,
      promotion,
    };

    const activePosition =
      analysisModeRef.current ? getAnalysisPositionForMove(position, from) ?? position : position;

    if (!activePosition.isLegal(move)) {
      syncBoard(position, [orig, dest]);
      return;
    }

    const userMoveText = makeUci(move).toLowerCase();
    const userMoveSan = makeSan(activePosition, move);
    const userMoveKey = toComparableUci(activePosition, userMoveText, move);

    if (analysisModeRef.current) {
      activePosition.play(move);
      saveMove(activePosition, [orig, dest], userMoveText, userMoveKey, userMoveSan);
      syncBoard(activePosition, [orig, dest], {
        showWrongMove: false,
        solved: false,
        status: getStatus(activePosition),
      });
      return;
    }

    const trainingEnabled = trainingEnabledRef.current && !analysisModeRef.current;

    if (!trainingEnabled || puzzleSolvedRef.current) {
      position.play(move);
      saveMove(position, [orig, dest], userMoveText, userMoveKey, userMoveSan);
      syncBoard(position, [orig, dest], {
        showWrongMove: false,
        solved: puzzleSolvedRef.current,
      });
      return;
    }

    const progress = progressRef.current;
    const candidates = candidateLinesRef.current;
    const accepted = new Set(
      candidates
        .map((line) => line[progress])
        .filter((entry) => entry && !entry.questionable)
        .map((entry) => entry.key),
    );

    if (!accepted.has(userMoveKey)) {
      moveLockRef.current = !autoRetryWrongMoves;
      syncBoard(position, undefined, {
        showWrongMove: true,
        solved: false,
        status: "Incorrect",
      });
      return;
    }

    position.play(move);
    saveMove(position, [orig, dest], userMoveText, userMoveKey, userMoveSan);

    const nextCandidates = candidates.filter((line) => line[progress]?.key === userMoveKey);
    candidateLinesRef.current = nextCandidates;
    progressRef.current = progress + 1;

    if (!hasExpectedMoveAt(nextCandidates, progressRef.current)) {
      puzzleSolvedRef.current = true;
      syncBoard(position, [orig, dest], {
        showWrongMove: false,
        solved: true,
        status: "Correct",
      });
      return;
    }

    moveLockRef.current = true;
    syncBoard(position, [orig, dest], {
      showWrongMove: false,
      solved: false,
    });

    window.setTimeout(() => {
      const activePosition = positionRef.current;
      if (!activePosition) return;

      const playedOpponent = autoplayOpponentMove(activePosition);
      moveLockRef.current = false;

      syncBoard(
        activePosition,
        playedOpponent
          ? [
              historyRef.current.moveUcis[historyRef.current.index - 1].slice(0, 2),
              historyRef.current.moveUcis[historyRef.current.index - 1].slice(2, 4),
            ]
          : undefined,
        {
          showWrongMove: false,
          solved: puzzleSolvedRef.current,
          status: puzzleSolvedRef.current ? "Correct" : getStatus(activePosition),
        },
      );
    }, 250);
  };

  const choosePromotion = (role) => {
    const pending = pendingPromotionRef.current;
    if (!pending) return;

    clearPendingPromotion();
    playUserMove(pending.orig, pending.dest, role);
  };

  useEffect(() => {
    if (!elementRef.current) return;

    cgRef.current = Chessground(elementRef.current, {
      fen,
      orientation,
      coordinates,
      movable: {
        free: false,
        color: "white",
        dests: new Map(),
        showDests: true,
        events: {
          after: (orig, dest) => {
            const position = positionRef.current;
            if (
              !position ||
              moveLockRef.current ||
              (showSolutionRef.current && !analysisModeRef.current) ||
              pendingPromotionRef.current
            ) {
              return;
            }

            const from = parseSquare(orig);
            const to = parseSquare(dest);
            if (from === undefined || to === undefined) return;

            const piece = position.board.get(from);
            const promotionChoices = getPromotionChoices(position, from, to, piece);

            if (promotionChoices.length > 1) {
              const pending = {
                orig,
                dest,
                color: piece.color,
                vertical: piece.color === orientationRef.current ? "top" : "bottom",
                choices: promotionChoices,
              };
              pendingPromotionRef.current = pending;
              setPendingPromotion(pending);
              syncBoard(position, undefined);
              return;
            }

            playUserMove(orig, dest, promotionChoices[0]?.role);
          },
        },
      },
      draggable: {
        enabled: true,
      },
      selectable: {
        enabled: true,
      },
    });

    return () => {
      cgRef.current = null;
      positionRef.current = null;
      clearPendingPromotion();
    };
  }, []);

  useEffect(() => {
    if (!showSolution) return;
    const currentHistory = historyRef.current;
    const currentPly = currentHistory.index;
    const playedMoveKeys = currentHistory.moveKeys.slice(0, currentPly);
    const matchingLineIndex = displaySolutionEntriesRef.current.findIndex((entry) =>
      playedMoveKeys.every((moveKey, index) => entry.moveEntries[index]?.key === moveKey),
    );

    showSolutionLine(matchingLineIndex >= 0 ? matchingLineIndex : 0, currentPly);
  }, [fen, showSolution]);

  useEffect(() => {
    if (!solutionNavigation) return;

    if (solutionNavigation.useHistory) {
      navigateTo(solutionNavigation.plyIndex);
    } else if (showSolutionRef.current) {
      showSolutionLine(
        solutionNavigation.lineIndex ?? activeSolutionLineRef.current,
        solutionNavigation.plyIndex,
      );
    } else if (solutionNavigation.plyIndex !== undefined) {
      navigateTo(solutionNavigation.plyIndex);
    }

    onNavigateHandled?.();
  }, [solutionNavigation, onNavigateHandled]);

  useEffect(() => {
    if (!analysisMode) return;

    const position = positionRef.current;
    if (!position) return;

    clearPendingPromotion();
    moveLockRef.current = false;
    candidateLinesRef.current = [];
    progressRef.current = 0;

    syncBoard(position, historyRef.current.lastMoves[historyRef.current.index], {
      showWrongMove: false,
      solved: false,
      status: getStatus(position),
    });
  }, [analysisMode]);

  useEffect(() => {
    if (!retrySignal) return;

    const created = createAtomicPosition(fenRef.current);
    if (!created.ok) return;

    clearPendingPromotion();
    moveLockRef.current = false;
    candidateLinesRef.current = solutionLinesRef.current;
    progressRef.current = 0;
    puzzleSolvedRef.current = false;
    activeSolutionLineRef.current = 0;
    historyRef.current = {
      fens: [fenRef.current],
      lastMoves: [undefined],
      moveUcis: [],
      moveKeys: [],
      moveSans: [],
      index: 0,
    };

    syncBoard(created.position, undefined, {
      showWrongMove: false,
      solved: false,
      viewingSolution: false,
      solutionLineIndex: 0,
      solutionLines: displaySolutionLinesRef.current,
      status: getStatus(created.position),
    });
  }, [retrySignal]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const isInputTarget =
        event.target instanceof HTMLElement &&
        (event.target.tagName === "INPUT" ||
          event.target.tagName === "TEXTAREA" ||
          event.target.isContentEditable);
      if (isInputTarget) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (showSolutionRef.current) {
          showSolutionLine(activeSolutionLineRef.current, historyRef.current.index - 1);
        } else {
          navigateTo(historyRef.current.index - 1);
        }
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (showSolutionRef.current) {
          showSolutionLine(activeSolutionLineRef.current, historyRef.current.index + 1);
        } else {
          navigateTo(historyRef.current.index + 1);
        }
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (showSolution && displaySolutionLinesRef.current.length > 0) return;

    const created = createAtomicPosition(fen);

    if (!created.ok) {
      positionRef.current = null;
      cgRef.current?.set({
        orientation: orientationRef.current,
        coordinates: coordinatesRef.current,
        lastMove: undefined,
        check: false,
        movable: {
          color: undefined,
          dests: new Map(),
        },
      });
      onStateChange?.({
        fen,
        turn: "",
        status: "Invalid position",
        winner: undefined,
        error: created.error,
        showWrongMove: false,
        solved: false,
      });
      return;
    }

    historyRef.current = {
      fens: [fen],
      lastMoves: [undefined],
      moveUcis: [],
      moveKeys: [],
      moveSans: [],
      index: 0,
    };
    clearPendingPromotion();
    activeSolutionLineRef.current = 0;
    moveLockRef.current = showSolution && !analysisModeRef.current;
    candidateLinesRef.current = solutionUciLines;
    progressRef.current = 0;
    puzzleSolvedRef.current = trainingEnabledRef.current && !hasExpectedMoveAt(solutionUciLines, 0);

    syncBoard(created.position, undefined, {
      showWrongMove: false,
      solved: false,
      viewingSolution: showSolution,
    });
  }, [fen, solutionUciLines]);

  useEffect(() => {
    const position = positionRef.current;
    if (!position) return;

    const history = historyRef.current;
    const movable = getMovableConfig(position);

    cgRef.current?.set({
      orientation,
      coordinates,
      movable,
      lastMove: history.lastMoves[history.index],
      check: position.isCheck() ? position.turn : false,
    });
  }, [orientation, coordinates]);

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
              tabIndex="0"
              style={getPromotionSquareStyle(pendingPromotion, index)}
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
