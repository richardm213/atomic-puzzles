import { useEffect, useMemo, useRef, useState } from "react";
import { Chessground } from "@lichess-org/chessground";
import { chessgroundDests } from "chessops/compat";
import { makeFen } from "chessops/fen";
import { makeSan } from "chessops/san";
import { makeUci, parseSquare } from "chessops/util";
import { useAppSettings } from "../../context/AppSettings";
import {
  convertUciLineToSan,
  moveFromUci,
  parseSolutionUciLines,
  toComparableUci,
} from "../../lib/puzzles/solutionPgn";
import { buildBoardStyle, buildPieceStyle } from "./boardStyle";
import {
  buildSolutionHistory,
  hasExpectedMoveAt,
  recomputeTrainingState,
  tryCreateAtomicPosition,
} from "./puzzlePlayback";
import {
  createPendingPromotion,
  getPromotionChoices,
  getPromotionSquareStyle,
} from "./promotionHelpers";
import "./Chessboard.css";

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

const otherColor = (color) => (color === "white" ? "black" : "white");

const colorFromFen = (fen) => (fen?.split(" ")?.[1] === "b" ? "black" : "white");

const MOVE_EVALUATION_DELAY_MS = 250;

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
  puzzleId,
  fen,
  orientation,
  coordinates,
  solution,
  showSolution,
  analysisMode = false,
  solutionNavigation,
  onNavigateHandled,
  onAttemptResolved,
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
  const moveEvaluationTimerRef = useRef(null);
  const puzzleSolvedRef = useRef(false);
  const candidateLinesRef = useRef([]);
  const progressRef = useRef(0);
  const orientationRef = useRef(orientation);
  const coordinatesRef = useRef(coordinates);
  const showSolutionRef = useRef(showSolution);
  const analysisModeRef = useRef(analysisMode);
  const fenRef = useRef(fen);
  const puzzleIdRef = useRef(puzzleId);
  const solverColorRef = useRef(colorFromFen(fen));

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
    solverColorRef.current = colorFromFen(fen);
  }, [fen]);

  useEffect(() => {
    puzzleIdRef.current = puzzleId;
  }, [puzzleId]);

  const emitState = (position, next) => {
    const history = historyRef.current;
    const displayTurn = getDisplayTurn(position, next);
    const state = {
      fen: makeFen(position.toSetup()),
      turn: displayTurn,
      status: next?.status ?? (displayTurn === position.turn ? getStatus(position) : `${displayTurn} to move`),
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

  const isAnalysisModeActive = () => analysisModeRef.current;
  const isSolutionPlaybackLocked = () => showSolutionRef.current && !isAnalysisModeActive();

  const clearMoveEvaluationTimer = () => {
    if (moveEvaluationTimerRef.current === null) return;

    window.clearTimeout(moveEvaluationTimerRef.current);
    moveEvaluationTimerRef.current = null;
  };

  const getDisplayTurn = (position, nextState) => {
    if (!trainingEnabledRef.current || isAnalysisModeActive() || showSolutionRef.current) {
      return position.turn;
    }

    if (nextState?.showWrongMove || nextState?.solved || nextState?.status === "Correct") {
      return position.turn;
    }

    return solverColorRef.current ?? position.turn;
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

    if (!isAnalysisModeActive()) {
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
    const displayTurn = getDisplayTurn(position, nextState);
    const displayCheck = displayTurn === position.turn && position.isCheck() ? position.turn : false;

    cgRef.current?.set({
      fen: makeFen(position.toSetup()),
      orientation: orientationRef.current,
      coordinates: coordinatesRef.current,
      turnColor: displayTurn,
      lastMove,
      check: displayCheck,
      movable,
    });

    emitState(position, nextState);
  };

  const recomputeTrainingFromHistory = (targetIndex) => {
    const nextState = recomputeTrainingState({
      isTrainingEnabled: trainingEnabledRef.current,
      isAnalysisMode: isAnalysisModeActive(),
      playedMoveKeys: historyRef.current.moveKeys.slice(0, targetIndex),
      solutionLines: solutionLinesRef.current,
    });

    candidateLinesRef.current = nextState.candidates;
    progressRef.current = nextState.progress;
    puzzleSolvedRef.current = nextState.solved;
  };

  const navigateTo = (targetIndex) => {
    const history = historyRef.current;
    if (targetIndex < 0 || targetIndex >= history.fens.length) return;

    clearMoveEvaluationTimer();

    const { position } = tryCreateAtomicPosition(history.fens[targetIndex]);
    if (!position) return;

    history.index = targetIndex;
    moveLockRef.current = isSolutionPlaybackLocked();
    recomputeTrainingFromHistory(targetIndex);

    syncBoard(position, history.lastMoves[targetIndex]);
  };

  const showSolutionLine = (lineIndex, targetPly) => {
    const solutionEntry = displaySolutionEntriesRef.current[lineIndex];
    if (!solutionEntry?.moveEntries?.length) return;

    clearMoveEvaluationTimer();

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
    moveLockRef.current = !isAnalysisModeActive();
    candidateLinesRef.current = [];
    progressRef.current = 0;
    const solvedBeforeSolution = puzzleSolvedRef.current;

    const { position } = tryCreateAtomicPosition(solutionHistory.fens[clampedIndex]);
    if (!position) return;

    syncBoard(position, solutionHistory.lastMoves[clampedIndex], {
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
    const nextEntry = candidates[0]?.[progress];

    if (!nextEntry) {
      puzzleSolvedRef.current = true;
      return false;
    }

    const move = moveFromUci(position, nextEntry.uci);
    if (!move) {
      puzzleSolvedRef.current = true;
      return false;
    }

    const opponentMoveSan = makeSan(position, move);
    position.play(move);
    saveMove(
      position,
      [nextEntry.uci.slice(0, 2), nextEntry.uci.slice(2, 4)],
      nextEntry.uci,
      nextEntry.key,
      opponentMoveSan,
    );

    candidateLinesRef.current = candidates.filter((line) => line[progress]?.uci === nextEntry.uci);
    progressRef.current = progress + 1;
    puzzleSolvedRef.current = !hasExpectedMoveAt(candidateLinesRef.current, progressRef.current);

    return true;
  };

  const clearPendingPromotion = () => {
    pendingPromotionRef.current = null;
    setPendingPromotion(null);
  };

  const playUserMove = (orig, dest, promotion) => {
    const position = positionRef.current;
    if (!position || moveLockRef.current || isSolutionPlaybackLocked()) {
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

    const activePosition = isAnalysisModeActive()
      ? (getAnalysisPositionForMove(position, from) ?? position)
      : position;

    if (!activePosition.isLegal(move)) {
      syncBoard(position, [orig, dest]);
      return;
    }

    const userMoveText = makeUci(move).toLowerCase();
    const userMoveSan = makeSan(activePosition, move);
    const userMoveKey = toComparableUci(activePosition, userMoveText, move);

    if (isAnalysisModeActive()) {
      activePosition.play(move);
      saveMove(activePosition, [orig, dest], userMoveText, userMoveKey, userMoveSan);
      syncBoard(activePosition, [orig, dest], {
        showWrongMove: false,
        solved: false,
        status: getStatus(activePosition),
      });
      return;
    }

    const trainingEnabled = trainingEnabledRef.current && !isAnalysisModeActive();

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

    moveLockRef.current = true;
    cgRef.current?.set({
      lastMove: [orig, dest],
      movable: {
        color: undefined,
        dests: new Map(),
        free: false,
      },
    });

    clearMoveEvaluationTimer();
    const scheduledPuzzleId = puzzleIdRef.current;
    const scheduledFen = fenRef.current;
    const scheduledHistoryIndex = historyRef.current.index;
    const scheduledProgress = progressRef.current;

    moveEvaluationTimerRef.current = window.setTimeout(() => {
      moveEvaluationTimerRef.current = null;

      if (
        puzzleIdRef.current !== scheduledPuzzleId ||
        fenRef.current !== scheduledFen ||
        historyRef.current.index !== scheduledHistoryIndex ||
        progressRef.current !== scheduledProgress
      ) {
        return;
      }

      const activePosition = positionRef.current;
      if (!activePosition) return;

      if (!accepted.has(userMoveKey)) {
        moveLockRef.current = false;
        onAttemptResolved?.({ puzzleId: puzzleIdRef.current, puzzleCorrect: false });
        syncBoard(activePosition, undefined, {
          showWrongMove: true,
          solved: false,
          status: "Incorrect",
        });
        return;
      }

      activePosition.play(move);
      saveMove(activePosition, [orig, dest], userMoveText, userMoveKey, userMoveSan);

      const nextCandidates = candidates.filter((line) => line[progress]?.key === userMoveKey);
      candidateLinesRef.current = nextCandidates;
      progressRef.current = progress + 1;

      if (!hasExpectedMoveAt(nextCandidates, progressRef.current)) {
        moveLockRef.current = false;
        puzzleSolvedRef.current = true;
        onAttemptResolved?.({ puzzleId: puzzleIdRef.current, puzzleCorrect: true });
        syncBoard(activePosition, [orig, dest], {
          showWrongMove: false,
          solved: true,
          status: "Correct",
        });
        return;
      }

      const playedOpponent = autoplayOpponentMove(activePosition);
      moveLockRef.current = false;

      if (puzzleSolvedRef.current) {
        onAttemptResolved?.({ puzzleId: puzzleIdRef.current, puzzleCorrect: true });
      }

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
    }, MOVE_EVALUATION_DELAY_MS);
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
              isSolutionPlaybackLocked() ||
              pendingPromotionRef.current
            ) {
              return;
            }

            const from = parseSquare(orig);
            const to = parseSquare(dest);
            if (from === undefined || to === undefined) return;

            const piece = position.board.get(from);
            const promotionChoices = getPromotionChoices({
              position,
              from,
              to,
              piece,
              isAnalysisMode: isAnalysisModeActive(),
              getAnalysisPositionForMove,
            });

            if (promotionChoices.length > 1) {
              const pending = createPendingPromotion({
                orig,
                dest,
                color: piece.color,
                choices: promotionChoices,
                orientation: orientationRef.current,
              });
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
      clearMoveEvaluationTimer();
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

    clearMoveEvaluationTimer();
    clearPendingPromotion();
    moveLockRef.current = false;
    candidateLinesRef.current = [];
    progressRef.current = 0;

    syncBoard(position, historyRef.current.lastMoves[historyRef.current.index], {
      showWrongMove: false,
      solved: puzzleSolvedRef.current,
      status: puzzleSolvedRef.current ? "Correct" : getStatus(position),
    });
  }, [analysisMode]);

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

    clearMoveEvaluationTimer();

    const { position, error } = tryCreateAtomicPosition(fen);
    if (!position) {
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
        error,
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
    moveLockRef.current = showSolution && !isAnalysisModeActive();
    candidateLinesRef.current = solutionUciLines;
    progressRef.current = 0;
    puzzleSolvedRef.current = trainingEnabledRef.current && !hasExpectedMoveAt(solutionUciLines, 0);

    syncBoard(position, undefined, {
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
    const displayTurn = getDisplayTurn(position);
    const displayCheck = displayTurn === position.turn && position.isCheck() ? position.turn : false;

    cgRef.current?.set({
      orientation,
      coordinates,
      movable,
      turnColor: displayTurn,
      lastMove: history.lastMoves[history.index],
      check: displayCheck,
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
              style={getPromotionSquareStyle(pendingPromotion, index, orientationRef.current)}
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
