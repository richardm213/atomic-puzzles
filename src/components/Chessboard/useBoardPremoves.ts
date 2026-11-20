import type { Api } from "@lichess-org/chessground/api";
import type { Key } from "@lichess-org/chessground/types";
import type { Color } from "chessops";
import { type RefObject, useCallback, useEffect, useRef } from "react";

export const useBoardPremoves = (
  apiRef: RefObject<Api>,
  color: Color | undefined,
  enabled: boolean,
  disabled: boolean,
) => {
  const settings = useRef({ color, enabled });
  settings.current = { color, enabled };

  const cancelPremove = useCallback(() => {
    apiRef.current?.cancelPremove?.();
  }, [apiRef]);

  useEffect(() => {
    if (!enabled || disabled) cancelPremove();
    apiRef.current?.set({ premovable: { enabled } });
  }, [apiRef, cancelPremove, disabled, enabled]);

  const premoveMovableConfig = useCallback(
    (turn: Color, gameOver: boolean, dests: Map<Key, Key[]>) => {
      const { color, enabled } = settings.current;
      const movableColor = enabled ? color : turn;
      return {
        ...(gameOver || !movableColor ? {} : { color: movableColor }),
        dests: enabled && turn !== color ? new Map<Key, Key[]>() : dests,
        free: false,
      };
    },
    [],
  );

  const playPremove = useCallback(
    (turn: Color, canPlay: () => boolean) => {
      const { color, enabled } = settings.current;
      if (enabled && turn === color && canPlay()) apiRef.current?.playPremove?.();
    },
    [apiRef],
  );

  return { cancelPremove, playPremove, premoveMovableConfig };
};
