import { parseSquare } from "chessops/util";
import type { Color, Piece, Role, Square } from "chessops";
import type { Atomic } from "chessops/variant";
import type { CSSProperties } from "react";

export type PromotionRole = "queen" | "knight" | "rook" | "bishop";

const promotionOptions: PromotionRole[] = ["queen", "knight", "rook", "bishop"];

const isBackRank = (square: Square): boolean => {
  const rank = Math.floor(square / 8);
  return rank === 0 || rank === 7;
};

export type PendingPromotion = {
  orig: string;
  dest: string;
  color: Color;
  vertical: "top" | "bottom";
  choices: PromotionRole[];
};

export type GetPromotionChoicesArgs = {
  position: Atomic;
  from: Square;
  to: Square;
  piece: Piece | undefined;
  isAnalysisMode: boolean;
  getAnalysisPositionForMove: (position: Atomic, from: Square) => Atomic | null | undefined;
};

export const getPromotionChoices = ({
  position,
  from,
  to,
  piece,
  isAnalysisMode,
  getAnalysisPositionForMove,
}: GetPromotionChoicesArgs): PromotionRole[] => {
  if (piece?.role !== "pawn") return [];
  if (!isBackRank(to)) return [];

  const activePosition = isAnalysisMode
    ? (getAnalysisPositionForMove(position, from) ?? position)
    : position;

  return promotionOptions.filter((role) =>
    activePosition.isLegal({ from, to, promotion: role as Role }),
  );
};

export const createPendingPromotion = ({
  orig,
  dest,
  color,
  orientation,
  choices,
}: {
  orig: string;
  dest: string;
  color: Color;
  orientation: Color;
  choices: PromotionRole[];
}): PendingPromotion => ({
  orig,
  dest,
  color,
  vertical: color === orientation ? "top" : "bottom",
  choices,
});

export const getPromotionSquareStyle = (
  pending: PendingPromotion,
  index: number,
  orientation: Color,
): CSSProperties => {
  const to = parseSquare(pending.dest);
  if (to === undefined) return {};

  const file = to % 8;
  const left = (orientation === "white" ? file : 7 - file) * 12.5;
  const top = (pending.color === orientation ? index : 7 - index) * 12.5;

  return {
    left: `${left}%`,
    top: `${top}%`,
  };
};
