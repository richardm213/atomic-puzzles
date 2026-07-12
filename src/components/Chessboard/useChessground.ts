import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { Color } from "chessops";
import { type MutableRefObject, type RefObject,useEffect } from "react";

export const useChessground = ({
  elementRef,
  apiRef,
  fen,
  orientation,
  coordinates,
  onAfterMove,
  onCleanup,
}: {
  elementRef: RefObject<HTMLDivElement>;
  apiRef: MutableRefObject<Api | null>;
  fen: string;
  orientation: Color;
  coordinates: boolean;
  onAfterMove: (orig: string, dest: string) => void;
  onCleanup: () => void;
}): void => {
  useEffect(() => {
    if (!elementRef.current) return;
    apiRef.current = Chessground(elementRef.current, {
      fen,
      orientation,
      coordinates,
      movable: {
        free: false,
        color: "white",
        dests: new Map(),
        showDests: true,
        events: { after: onAfterMove },
      },
      draggable: { enabled: true },
      selectable: { enabled: true },
      drawable: { visible: true },
    });

    return () => {
      apiRef.current = null;
      onCleanup();
    };
  }, [apiRef, coordinates, elementRef, fen, onAfterMove, onCleanup, orientation]);
};
