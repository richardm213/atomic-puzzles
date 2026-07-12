import { type RefObject, useCallback, useEffect, useRef } from "react";

const BOARD_WHEEL_DISCRETE_STEP_PX = 10;
const BOARD_WHEEL_TRACKPAD_STEP_PX = 24;
const BOARD_WHEEL_GESTURE_RESET_MS = 120;

export type BoardWheelNavigationCommand = "next" | "previous";

export const useBoardWheelNavigation = ({
  boardPanelRef,
  canStepBack,
  canStepForward,
  onNavigate,
}: {
  boardPanelRef: RefObject<HTMLElement>;
  canStepBack: boolean;
  canStepForward: boolean;
  onNavigate: (command: BoardWheelNavigationCommand) => void;
}): void => {
  const wheelDeltaRef = useRef(0);
  const wheelLastAtRef = useRef(0);
  const wheelDirectionRef = useRef(0);
  const canStepBackRef = useRef(false);
  const canStepForwardRef = useRef(false);

  useEffect(() => {
    canStepBackRef.current = canStepBack;
    canStepForwardRef.current = canStepForward;
  }, [canStepBack, canStepForward]);

  const handleBoardWheel = useCallback(
    (event: WheelEvent): void => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

      event.preventDefault();
      event.stopPropagation();

      const now = window.performance.now();
      const direction = Math.sign(event.deltaY);
      if (direction === 0) return;

      if (
        direction !== wheelDirectionRef.current ||
        now - wheelLastAtRef.current > BOARD_WHEEL_GESTURE_RESET_MS
      ) {
        wheelDeltaRef.current = 0;
      }
      wheelLastAtRef.current = now;
      wheelDirectionRef.current = direction;

      const deltaScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 240 : 1;
      const scaledDelta = event.deltaY * deltaScale;
      const isDiscreteStep =
        event.deltaMode !== 0 || Math.abs(scaledDelta) >= BOARD_WHEEL_DISCRETE_STEP_PX;

      if (isDiscreteStep) {
        wheelDeltaRef.current = 0;
      } else {
        wheelDeltaRef.current += scaledDelta;
        if (Math.abs(wheelDeltaRef.current) < BOARD_WHEEL_TRACKPAD_STEP_PX) return;
      }

      const command =
        (isDiscreteStep ? scaledDelta : wheelDeltaRef.current) > 0 ? "next" : "previous";
      wheelDeltaRef.current = 0;

      if (command === "next" && !canStepForwardRef.current) return;
      if (command === "previous" && !canStepBackRef.current) return;

      onNavigate(command);
    },
    [onNavigate],
  );

  useEffect(() => {
    const boardPanel = boardPanelRef.current;
    if (!boardPanel) return;

    boardPanel.addEventListener("wheel", handleBoardWheel, { passive: false });

    return () => {
      boardPanel.removeEventListener("wheel", handleBoardWheel);
    };
  }, [boardPanelRef, handleBoardWheel]);
};
