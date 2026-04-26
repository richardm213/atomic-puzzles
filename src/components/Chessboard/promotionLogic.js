import { parseSquare } from "chessops/util";

const promotionOptions = ["queen", "knight", "rook", "bishop"];

const isBackRank = (square) => {
  const rank = Math.floor(square / 8);
  return rank === 0 || rank === 7;
};

export const getPromotionChoices = ({
  position,
  from,
  to,
  piece,
  isAnalysisMode,
  getAnalysisPositionForMove,
}) => {
  if (piece?.role !== "pawn") return [];
  if (!isBackRank(to)) return [];

  const activePosition = isAnalysisMode
    ? (getAnalysisPositionForMove(position, from) ?? position)
    : position;

  return promotionOptions.filter((role) => activePosition.isLegal({ from, to, promotion: role }));
};

export const createPendingPromotion = ({ orig, dest, color, orientation, choices }) => ({
  orig,
  dest,
  color,
  vertical: color === orientation ? "top" : "bottom",
  choices,
});

export const getPromotionSquareStyle = (pending, index, orientation) => {
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
