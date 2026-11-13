import "@lichess-org/chessground/assets/chessground.base.css";
import "../../theme/chessground.blue.css";
import "../../theme/chessground.pieces.css";
import "../../components/Chessboard/Chessboard.css";

import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import { chessgroundDests } from "chessops/compat";
import type { Color } from "chessops/types";
import { makeSquare } from "chessops/util";
import type { Atomic } from "chessops/variant";
import { useLayoutEffect, useRef } from "react";

import { BoardPromotionPicker } from "../../components/Chessboard/BoardPromotionPicker";
import { BoardResizeHandle } from "../../components/Chessboard/BoardResizeHandle";
import { buildBoardStyle, buildPieceStyle } from "../../components/Chessboard/boardStyle";
import type { PendingPromotion, PromotionRole } from "../../components/Chessboard/promotionHelpers";
import { useAppSettings } from "../../context/AppSettings";
import type { LessonFrame } from "./lessonMoves";

export const LessonBoard = ({
  frame,
  position,
  orientation,
  enabled,
  onMove,
  promotion,
  onPromote,
  onCancelPromotion,
}: {
  frame: LessonFrame;
  position: Atomic;
  orientation: Color;
  enabled: boolean;
  onMove: (origin: string, destination: string) => void;
  promotion: PendingPromotion | null;
  onPromote: (role: PromotionRole) => void;
  onCancelPromotion: () => void;
}) => {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const settings = useAppSettings();

  useLayoutEffect(() => {
    if (!host.current) return;
    const board = Chessground(host.current, {
      coordinates: true,
      coordinatesOnSquares: false,
      animation: {
        enabled: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        duration: 170,
      },
      movable: {
        free: false,
        rookCastle: false,
        events: { after: (origin, destination) => onMoveRef.current(origin, destination) },
      },
      premovable: { enabled: false },
      drawable: { enabled: false, visible: true },
    });
    api.current = board;
    return () => {
      api.current = null;
      board.destroy();
    };
  }, []);

  useLayoutEffect(() => {
    const board = api.current;
    if (!board) return;
    board.set({
      fen: frame.fen,
      orientation,
      turnColor: position.turn,
      check: position.isCheck(),
      lastMove: frame.lastMove,
      movable: { color: position.turn, dests: enabled ? chessgroundDests(position) : new Map() },
      selectable: { enabled },
      draggable: { enabled },
    });
    board.setAutoShapes(frame.center ? [{ orig: frame.center, brush: "red" }] : []);
  }, [enabled, frame, orientation, position]);

  useLayoutEffect(() => {
    if (frame.explosion.length && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      api.current?.explode(frame.explosion);
    }
  }, [frame]);

  return (
    <div
      className="cg-boardShell cg-pieceTheme atomicLessonBoardShell"
      data-local-pieces={settings.pieceSet === "cburnett" ? "" : undefined}
      style={{
        ...(settings.pieceSet === "cburnett" ? {} : buildPieceStyle(settings.pieceSet)),
        ...buildBoardStyle(
          settings.boardTheme,
          settings.customLightSquare,
          settings.customDarkSquare,
          settings.boardColorOverrideTheme,
          settings.boardOverrideLightSquare,
          settings.boardOverrideDarkSquare,
          settings.colorMode,
        ),
      }}
    >
      <BoardResizeHandle />
      <div
        ref={host}
        className="cg-board"
        role="img"
        aria-label={`Atomic chess position, ${orientation} at the bottom. A text description is available under Board position and move entry.`}
      ></div>
      {promotion && (
        <BoardPromotionPicker
          pending={promotion}
          orientation={orientation}
          onChoose={onPromote}
          onCancel={onCancelPromotion}
        />
      )}
    </div>
  );
};

export const describePieces = (position: Atomic, color: Color): string => {
  const pieces = Array.from(position.board)
    .filter(([, piece]) => piece.color === color)
    .map(([square, piece]) => `${piece.role} ${makeSquare(square)}`);
  return pieces.length ? pieces.join(", ") : "no pieces";
};
