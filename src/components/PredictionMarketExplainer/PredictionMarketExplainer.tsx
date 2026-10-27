import "./PredictionMarketExplainer.css";

import type { CSSProperties } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const explanation =
  "Prediction markets let you trade on whether an event will happen. Buy Yes or No shares with Atomic Coins: a share bought at 30¢ costs 0.30 coins and pays 1 coin if correct, or 0 if wrong. You trade with other users, and a limit order lets you set the highest price you’ll pay or the lowest price you’ll accept; it fills when someone matches that price. You can sell before the market closes as expectations and prices change.";

type TooltipPosition = {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
};

export const PredictionMarketExplainer = () => {
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const updatePosition = () => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 24);
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    const showAbove = rect.bottom + 190 > window.innerHeight && rect.top > 190;
    setPosition(
      showAbove
        ? { left, width, bottom: window.innerHeight - rect.top + 8 }
        : { left, width, top: rect.bottom + 8 },
    );
  };

  const showTooltip = () => {
    updatePosition();
    setIsVisible(true);
  };

  useEffect(() => {
    if (!isVisible) return;
    const reposition = () => updatePosition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [isVisible]);

  const tooltipStyle = position as CSSProperties | null;

  return (
    <span
      className="predictionMarketExplainer"
      onPointerEnter={showTooltip}
      onPointerLeave={() => setIsVisible(false)}
    >
      <button
        ref={buttonRef}
        type="button"
        className="predictionMarketExplainerButton"
        aria-label="How prediction markets work"
        aria-describedby={tooltipId}
        onFocus={showTooltip}
        onBlur={() => setIsVisible(false)}
      >
        ?
      </button>
      {isVisible && position
        ? createPortal(
            <span
              id={tooltipId}
              className="predictionMarketExplainerTooltip"
              role="tooltip"
              style={tooltipStyle ?? undefined}
            >
              {explanation}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
};
