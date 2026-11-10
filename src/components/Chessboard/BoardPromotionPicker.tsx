import type { Color } from "chessops";
import { type KeyboardEvent, useLayoutEffect, useRef } from "react";

import {
  getPromotionSquareStyle,
  type PendingPromotion,
  type PromotionRole,
} from "./promotionHelpers";

export const BoardPromotionPicker = ({
  pending,
  orientation,
  onChoose,
  onCancel,
}: {
  pending: PendingPromotion;
  orientation: Color;
  onChoose: (role: PromotionRole) => void;
  onCancel?: () => void;
}) => {
  const firstChoice = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    firstChoice.current?.focus({ preventScroll: true });
  }, []);

  const cancelOnEscape = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Escape" || !onCancel) return;
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  };

  return (
    <div
      className="boardPromotionChoice"
      role="group"
      aria-label="Choose a promotion piece"
      onContextMenu={(event) => event.preventDefault()}
    >
      {onCancel && (
        <button
          type="button"
          className="boardPromotionCancel"
          aria-label="Cancel promotion"
          onClick={onCancel}
          onKeyDown={cancelOnEscape}
        ></button>
      )}
      {pending.choices.map((role, index) => (
        <button
          key={role}
          type="button"
          ref={index === 0 ? firstChoice : undefined}
          className="boardPromotionOption"
          style={getPromotionSquareStyle(pending, index, orientation)}
          aria-label={`Promote to ${role}`}
          onClick={() => onChoose(role)}
          onKeyDown={cancelOnEscape}
        >
          <span
            className="boardPromotionPiece"
            style={{ backgroundImage: `var(--cg-piece-${pending.color}-${role})` }}
            aria-hidden="true"
          ></span>
        </button>
      ))}
    </div>
  );
};
