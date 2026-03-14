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

const isMoveNumberToken = (token) => /^\d+\.(?:\.\.)?$/.test(token);
const isGameResultToken = (token) =>
  token === "1-0" || token === "0-1" || token === "1/2-1/2" || token === "*";

const sanitizeSanToken = (token) =>
  token
    .replace(/[!?]+/g, "")
    .replace(/^\{.*\}$/, "")
    .trim();

const parseSolutionLines = (solution) => {
  if (typeof solution !== "string" || solution.trim().length === 0) return [];

  const tokens = solution.match(/\(|\)|[^\s()]+/g) ?? [];
  let index = 0;

  const parseSequence = (baseLine) => {
    const currentLine = [...baseLine];
    const collectedLines = [];

    while (index < tokens.length) {
      const token = tokens[index++];

      if (token === "(") {
        const variationLines = parseSequence([...currentLine]);
        collectedLines.push(...variationLines);
        continue;
      }

      if (token === ")") {
        break;
      }

      if (isMoveNumberToken(token) || isGameResultToken(token)) {
        continue;
      }

      const sanitized = sanitizeSanToken(token);
      if (!sanitized) continue;
      currentLine.push(sanitized);
    }

    collectedLines.push(currentLine);
    return collectedLines;
  };

  const allLines = parseSequence([]);
  const unique = [];
  const seen = new Set();

  for (const line of allLines) {
    if (line.length === 0) continue;
    const key = line.join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(line);
  }

  return unique;
};

const legalMoveFromSan = (position, sanText) => parseSan(position, sanText);

const continuationFromUserMove = (position, lines, userMoveUci) => {
  for (const line of lines) {
    const [firstSan, opponentSan] = line;
    if (!firstSan) continue;

    const firstMove = legalMoveFromSan(position, firstSan);
    if (!firstMove) continue;

    if (makeUci(firstMove) !== userMoveUci) continue;

    return {
      firstSan,
      opponentSan,
    };
  }

  return null;
};

const acceptedUserMoveUcis = (position, lines) => {
  const accepted = new Set();

  for (const line of lines) {
    const firstSan = line[0];
    if (!firstSan) continue;

    const move = legalMoveFromSan(position, firstSan);
    if (!move) continue;

    accepted.add(makeUci(move));
  }

  return accepted;
};

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

  const solutionLines = useMemo(() => parseSolutionLines(solution), [solution]);
  const solutionLinesRef = useRef([]);
  const trainingEnabledRef = useRef(false);

  useEffect(() => {
    solutionLinesRef.current = solutionLines;
    trainingEnabledRef.current = solutionLines.length > 0;
  }, [solutionLines]);

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
    const movableColor =
      outcome || moveLockRef.current ? undefined : position.turn;

    cgRef.current?.set({
      fen: makeFen(position.toSetup()),
      orientation,
      coordinates,
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

  const navigateTo = (targetIndex) => {
    const history = historyRef.current;
    if (targetIndex < 0 || targetIndex >= history.fens.length) return;

    const created = createAtomicPosition(history.fens[targetIndex]);
    if (!created.ok) return;

    history.index = targetIndex;
    moveLockRef.current = false;

    const trainingEnabled = trainingEnabledRef.current;
    puzzleSolvedRef.current = trainingEnabled && targetIndex >= 1;

    syncBoard(created.position, history.lastMoves[targetIndex]);
  };

  const playOpponentMove = (position, moveText) => {
    const fromText = moveText.slice(0, 2);
    const toText = moveText.slice(2, 4);

    const from = parseSquare(fromText);
    const to = parseSquare(toText);

    if (from === undefined || to === undefined) return false;

    const piece = position.board.get(from);
    const move = {
      from,
      to,
      promotion: piece?.role === "pawn" ? toPromotion(toText) : undefined,
    };

    if (!position.isLegal(move)) return false;

    position.play(move);
    saveMove(position, [fromText, toText], moveText);
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

            const lines = solutionLinesRef.current;
            const accepted = acceptedUserMoveUcis(position, lines);
            if (!accepted.has(userMoveText)) {
              syncBoard(position, undefined, {
                showWrongMove: true,
                solved: false,
                status: "Try again",
              });
              return;
            }

            const continuation = continuationFromUserMove(
              position,
              lines,
              userMoveText,
            );
            const opponentSan = continuation?.opponentSan;

            position.play(move);
            saveMove(position, [orig, dest], userMoveText);

            if (opponentSan) {
              moveLockRef.current = true;
              syncBoard(position, [orig, dest], {
                showWrongMove: false,
                solved: false,
              });

              window.setTimeout(() => {
                const activePosition = positionRef.current;
                if (!activePosition) return;

                moveLockRef.current = false;

                const opponentMove = legalMoveFromSan(
                  activePosition,
                  opponentSan,
                );
                if (opponentMove && activePosition.isLegal(opponentMove)) {
                  const opponentUci = makeUci(opponentMove);
                  activePosition.play(opponentMove);
                  saveMove(
                    activePosition,
                    [opponentUci.slice(0, 2), opponentUci.slice(2, 4)],
                    opponentUci,
                  );
                  puzzleSolvedRef.current = true;
                  syncBoard(
                    activePosition,
                    [opponentUci.slice(0, 2), opponentUci.slice(2, 4)],
                    {
                      showWrongMove: false,
                      solved: true,
                      status: "Correct",
                    },
                  );
                  return;
                }

                puzzleSolvedRef.current = true;
                syncBoard(activePosition, undefined, {
                  showWrongMove: false,
                  solved: true,
                  status: "Correct",
                });
              }, 250);

              return;
            }

            puzzleSolvedRef.current = true;
            syncBoard(position, [orig, dest], {
              showWrongMove: false,
              solved: true,
              status: "Correct",
            });
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
        orientation,
        coordinates,
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
    puzzleSolvedRef.current = false;

    syncBoard(created.position, undefined, {
      showWrongMove: false,
      solved: false,
    });
  }, [fen, orientation, coordinates]);

  return <div ref={elementRef} className="cg-board" />;
};
