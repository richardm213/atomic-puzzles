import { useEffect, useMemo, useRef } from "react";
import { Chessground } from "@lichess-org/chessground";
import { chessgroundDests } from "chessops/compat";
import { makeFen, parseFen } from "chessops/fen";
import { parseSan } from "chessops/san";
import { makeUci, parseSquare } from "chessops/util";
import { Atomic } from "chessops/variant";

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

const tokenFromSolution = (token) => {
  const strippedMoveNumber = token.replace(/^\d+\.(\.\.)?/, "");
  const strippedAnnotation = strippedMoveNumber.replace(/[!?]+$/g, "");
  if (!strippedAnnotation) return "";
  if (["*", "1-0", "0-1", "1/2-1/2"].includes(strippedAnnotation)) {
    return "";
  }
  return strippedAnnotation;
};

const parseSolutionUciLines = (fen, solution) => {
  if (typeof solution !== "string" || solution.trim().length === 0) return [];

  const created = createAtomicPosition(fen);
  if (!created.ok) return [];

  const tokens = solution
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\$\d+/g, " ")
    .match(/\(|\)|[^\s()]+/g);

  if (!tokens) return [];

  const uciLines = [];

  const walk = (startIndex, position, line) => {
    let index = startIndex;
    const currentPosition = position.clone();
    const currentLine = [...line];
    let sawMove = false;
    let lastBranchPosition = currentPosition.clone();
    let lastBranchLine = [...currentLine];

    while (index < tokens.length) {
      const token = tokens[index];
      if (token === ")") {
        if (sawMove) uciLines.push(currentLine);
        return index + 1;
      }

      if (token === "(") {
        index = walk(index + 1, lastBranchPosition, lastBranchLine);
        continue;
      }

      const san = tokenFromSolution(token);
      if (!san) {
        index += 1;
        continue;
      }

      lastBranchPosition = currentPosition.clone();
      lastBranchLine = [...currentLine];

      const move = parseSan(currentPosition, san);
      if (!move || !currentPosition.isLegal(move)) {
        index += 1;
        continue;
      }

      const uci = makeUci(move).toLowerCase();
      currentLine.push(uci);
      currentPosition.play(move);
      sawMove = true;
      index += 1;
    }

    if (sawMove) uciLines.push(currentLine);
    return index;
  };

  walk(0, created.position, []);

  const unique = [];
  const seen = new Set();
  for (const line of uciLines) {
    if (line.length === 0) continue;
    const key = line.join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(line);
  }

  return unique;
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
  lines.some((line) => progress < line.length);

export const Chessboard = ({
  fen,
  orientation,
  coordinates,
  solution,
  onStateChange,
}) => {
  const elementRef = useRef(null);
  const cgRef = useRef(null);
  const positionRef = useRef(null);
  const historyRef = useRef({
    fens: [],
    lastMoves: [],
    moveTexts: [],
    index: 0,
  });
  const moveLockRef = useRef(false);
  const puzzleSolvedRef = useRef(false);
  const candidateLinesRef = useRef([]);
  const progressRef = useRef(0);
  const orientationRef = useRef(orientation);
  const coordinatesRef = useRef(coordinates);

  const solutionUciLines = useMemo(() => parseSolutionUciLines(fen, solution), [fen, solution]);

  const solutionLinesRef = useRef([]);
  const trainingEnabledRef = useRef(false);

  useEffect(() => {
    solutionLinesRef.current = solutionUciLines;
    trainingEnabledRef.current = solutionUciLines.length > 0;
  }, [solutionUciLines]);

  useEffect(() => {
    orientationRef.current = orientation;
    coordinatesRef.current = coordinates;
  }, [orientation, coordinates]);

  const emitState = (position, next) => {
    const history = historyRef.current;
    const state = {
      fen: makeFen(position.toSetup()),
      turn: position.turn,
      status: getStatus(position),
      winner: position.outcome()?.winner,
      error: "",
      line: history.moveTexts.join(" "),
      lineIndex: history.index,
      showWrongMove: false,
      solved: puzzleSolvedRef.current,
      ...(next || {}),
    };

    onStateChange?.(state);
    return state;
  };

  const saveMove = (position, lastMove, moveText) => {
    const history = historyRef.current;
    const nextFen = makeFen(position.toSetup());

    if (history.index < history.moveTexts.length) {
      history.fens = history.fens.slice(0, history.index + 1);
      history.lastMoves = history.lastMoves.slice(0, history.index + 1);
      history.moveTexts = history.moveTexts.slice(0, history.index);
    }

    history.fens.push(nextFen);
    history.lastMoves.push(lastMove);
    history.moveTexts.push(moveText);
    history.index += 1;
  };

  const syncBoard = (position, lastMove, nextState) => {
    positionRef.current = position;

    const outcome = position.outcome();
    const movableColor = outcome || moveLockRef.current ? undefined : position.turn;

    cgRef.current?.set({
      fen: makeFen(position.toSetup()),
      orientation: orientationRef.current,
      coordinates: coordinatesRef.current,
      turnColor: position.turn,
      lastMove,
      check: position.isCheck() ? position.turn : false,
      movable: {
        color: movableColor,
        dests: chessgroundDests(position),
      },
    });

    emitState(position, nextState);
  };

  const recomputeTrainingFromHistory = (targetIndex) => {
    if (!trainingEnabledRef.current) {
      candidateLinesRef.current = [];
      progressRef.current = 0;
      puzzleSolvedRef.current = false;
      return;
    }

    const playedMoves = historyRef.current.moveTexts.slice(0, targetIndex);
    let candidates = solutionLinesRef.current;
    let progress = 0;
    let solved = !hasExpectedMoveAt(candidates, progress);

    for (const moveText of playedMoves) {
      if (solved) continue;

      const matching = candidates.filter((line) => line[progress] === moveText);
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
    moveLockRef.current = false;
    recomputeTrainingFromHistory(targetIndex);

    syncBoard(created.position, history.lastMoves[targetIndex]);
  };

  const autoplayOpponentMove = (position) => {
    const candidates = candidateLinesRef.current;
    const progress = progressRef.current;
    const nextOpponentMove = candidates.find((line) => line[progress])?.[progress];

    if (!nextOpponentMove) {
      puzzleSolvedRef.current = true;
      return false;
    }

    const nextCandidates = candidates.filter((line) => line[progress] === nextOpponentMove);
    const move = moveFromUci(position, nextOpponentMove);
    if (!move) {
      puzzleSolvedRef.current = true;
      return false;
    }

    position.play(move);
    saveMove(
      position,
      [nextOpponentMove.slice(0, 2), nextOpponentMove.slice(2, 4)],
      nextOpponentMove,
    );

    candidateLinesRef.current = nextCandidates;
    progressRef.current = progress + 1;
    puzzleSolvedRef.current = !hasExpectedMoveAt(nextCandidates, progressRef.current);

    return true;
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
            if (!position || moveLockRef.current) return;

            const from = parseSquare(orig);
            const to = parseSquare(dest);
            if (from === undefined || to === undefined) return;

            const piece = position.board.get(from);
            const move = {
              from,
              to,
              promotion: piece?.role === "pawn" ? toPromotion(dest) : undefined,
            };

            if (!position.isLegal(move)) {
              syncBoard(position, [orig, dest]);
              return;
            }

            const userMoveText = `${orig}${dest}`.toLowerCase();
            const trainingEnabled = trainingEnabledRef.current;

            if (!trainingEnabled || puzzleSolvedRef.current) {
              position.play(move);
              saveMove(position, [orig, dest], userMoveText);
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
                .filter((uci) => typeof uci === "string"),
            );

            if (!accepted.has(userMoveText)) {
              syncBoard(position, undefined, {
                showWrongMove: true,
                solved: false,
                status: "Try again",
              });
              return;
            }

            position.play(move);
            saveMove(position, [orig, dest], userMoveText);

            const nextCandidates = candidates.filter((line) => line[progress] === userMoveText);
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
                      historyRef.current.moveTexts[historyRef.current.index - 1].slice(0, 2),
                      historyRef.current.moveTexts[historyRef.current.index - 1].slice(2, 4),
                    ]
                  : undefined,
                {
                  showWrongMove: false,
                  solved: puzzleSolvedRef.current,
                  status: puzzleSolvedRef.current
                    ? "Correct"
                    : getStatus(activePosition),
                },
              );
            }, 250);
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
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigateTo(historyRef.current.index - 1);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        navigateTo(historyRef.current.index + 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
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
      moveTexts: [],
      index: 0,
    };
    moveLockRef.current = false;
    candidateLinesRef.current = solutionUciLines;
    progressRef.current = 0;
    puzzleSolvedRef.current =
      trainingEnabledRef.current && !hasExpectedMoveAt(solutionUciLines, 0);

    syncBoard(created.position, undefined, {
      showWrongMove: false,
      solved: false,
    });
  }, [fen, solutionUciLines]);

  useEffect(() => {
    const position = positionRef.current;
    if (!position) return;

    const history = historyRef.current;
    const outcome = position.outcome();
    const movableColor = outcome || moveLockRef.current ? undefined : position.turn;

    cgRef.current?.set({
      orientation,
      coordinates,
      movable: {
        color: movableColor,
        dests: chessgroundDests(position),
      },
      lastMove: history.lastMoves[history.index],
      check: position.isCheck() ? position.turn : false,
    });
  }, [orientation, coordinates]);

  return <div ref={elementRef} className="cg-board" />;
};
