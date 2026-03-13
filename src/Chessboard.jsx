import { useEffect, useRef } from "react";
import { Chessground } from "@lichess-org/chessground";
import { chessgroundDests } from "chessops/compat";
import { makeFen, parseFen } from "chessops/fen";
import { parseSquare } from "chessops/util";
import { Atomic } from "chessops/variant";

function createAtomicPosition(fen) {
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
}

function getStatus(position) {
  const outcome = position.outcome();
  if (outcome) {
    if (outcome.winner === "white") return "White wins";
    if (outcome.winner === "black") return "Black wins";
    return "Draw";
  }

  if (position.isCheck()) return `${position.turn} to move — check`;
  return `${position.turn} to move`;
}

function toPromotion(square) {
  const rank = square[1];
  return rank === "1" || rank === "8" ? "queen" : undefined;
}

export default function Chessboard({
  fen,
  orientation,
  coordinates,
  onStateChange,
}) {
  const elementRef = useRef(null);
  const cgRef = useRef(null);
  const positionRef = useRef(null);

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
            if (!position) return;

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

            position.play(move);
            syncBoard(position, [orig, dest]);
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

  function syncBoard(position, lastMove) {
    positionRef.current = position;

    const outcome = position.outcome();
    const movableColor = outcome ? undefined : position.turn;

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

    onStateChange?.({
      fen: makeFen(position.toSetup()),
      turn: position.turn,
      status: getStatus(position),
      winner: outcome?.winner,
      error: "",
    });
  }

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
      });
      return;
    }

    syncBoard(created.position);
  }, [fen, orientation, coordinates]);

  return <div ref={elementRef} className="cg-board" />;
}
