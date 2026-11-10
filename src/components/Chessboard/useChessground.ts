import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { Color } from "chessops";
import { type MutableRefObject, type RefObject, useEffect, useId, useRef } from "react";

export const useChessground = ({
  elementRef,
  dimensionsRef,
  apiRef,
  fen,
  orientation,
  coordinates,
  movableColor,
  premovesEnabled,
  onAfterMove,
  onCleanup,
}: {
  elementRef: RefObject<HTMLDivElement>;
  dimensionsRef: RefObject<HTMLElement> | undefined;
  apiRef: MutableRefObject<Api | null>;
  fen: string;
  orientation: Color;
  coordinates: boolean;
  movableColor: Color | undefined;
  premovesEnabled: boolean;
  onAfterMove: (orig: string, dest: string) => void;
  onCleanup: () => void;
}): void => {
  const initialConfigRef = useRef({ fen, orientation, coordinates, movableColor, premovesEnabled });
  const onAfterMoveRef = useRef(onAfterMove);
  onAfterMoveRef.current = onAfterMove;
  const markerNamespace = useId().replace(/:/g, "");

  useEffect(() => {
    if (!elementRef.current) return;
    const initial = initialConfigRef.current;
    const dimensionsTarget = dimensionsRef?.current;
    const api = Chessground(elementRef.current, {
      fen: initial.fen,
      orientation: initial.orientation,
      coordinates: initial.coordinates,
      coordinatesOnSquares: false,
      ...(dimensionsTarget ? { addDimensionsCssVarsTo: dimensionsTarget } : {}),
      movable: {
        free: false,
        color: initial.movableColor ?? "white",
        dests: new Map(),
        showDests: true,
        events: { after: (orig, dest) => onAfterMoveRef.current(orig, dest) },
      },
      premovable: {
        enabled: initial.premovesEnabled,
        showDests: true,
      },
      animation: { enabled: true, duration: 120 },
      draggable: { enabled: true },
      selectable: { enabled: true },
      drawable: { visible: true },
    });
    const brushes = {
      ...api.state.drawable.brushes,
      bestMove: { key: "best-move", color: "var(--color-primary)", opacity: 0.9, lineWidth: 12 },
      otherEngineMove: {
        key: "other-engine-move",
        color: "var(--color-primary)",
        opacity: 0.35,
        lineWidth: 9,
      },
      threat: { key: "threat", color: "var(--board-threat-ink)", opacity: 1, lineWidth: 12 },
    };
    // Chessground uses brush keys as document-wide SVG marker IDs, even on hidden boards.
    api.set({
      drawable: {
        brushes: Object.fromEntries(
          Object.entries(brushes).map(([name, brush]) => [
            name,
            { ...brush, key: `${markerNamespace}-${brush.key}` },
          ]),
        ),
      },
    });
    apiRef.current = api;

    return () => {
      apiRef.current = null;
      onCleanup();
    };
  }, [apiRef, dimensionsRef, elementRef, markerNamespace, onCleanup]);
};
