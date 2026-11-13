import type { KeyboardEventHandler, PointerEventHandler, RefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { z } from "zod";

import { usePersistedState } from "../../hooks/usePersistedState";

export const useWorkspaceViewport = () => {
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  return { width, stacked: width <= 560 };
};

type PanelRef = RefObject<HTMLElement | null>;

export const useBoardAlignedPanelHeight = (
  panelRef: PanelRef,
  boardRef: PanelRef,
  lowerClockRef: PanelRef,
  hasLowerClock: boolean,
): number | null => {
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const board = boardRef.current;
    if (!panel || !board) return;

    const bottomElement = (hasLowerClock && lowerClockRef.current) || board;
    const desktop = window.matchMedia("(width > 560px)");
    const syncHeight = () => {
      const distance =
        bottomElement.getBoundingClientRect().bottom - panel.getBoundingClientRect().top;
      setHeight(desktop.matches && distance > 0 ? Math.round(distance) : null);
    };
    syncHeight();

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncHeight);
    for (const element of new Set([board, bottomElement, board.parentElement])) {
      if (element) observer?.observe(element);
    }
    window.addEventListener("resize", syncHeight);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncHeight);
    };
  }, [panelRef, boardRef, lowerClockRef, hasLowerClock]);
  return height;
};

const splitHeightSchema = z.number().nonnegative().nullable();
const MIN_EXPLORER_HEIGHT = 12;
const RESIZE_STEP = 24;
const pixels = (value: string) => Number.parseFloat(value) || 0;
const outerHeight = (element: HTMLElement | null) => {
  if (!element) return 0;
  const style = window.getComputedStyle(element);
  return (
    element.getBoundingClientRect().height + pixels(style.marginTop) + pixels(style.marginBottom)
  );
};

export const useOpeningExplorerSplit = ({
  scope,
  enabled,
  panelRef,
  movePanelRef,
  defaultPercent,
}: {
  scope: "analysis" | "games" | "practice";
  enabled: boolean;
  panelRef: PanelRef;
  movePanelRef: PanelRef;
  defaultPercent: number;
}) => {
  const [savedHeight, setSavedHeight] = usePersistedState(
    `atomic-puzzles.${scope}.explorer-split-height`,
    splitHeightSchema,
    null,
  );
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const stopDrag = useRef<(() => void) | null>(null);
  const readLimit = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return null;

    const style = window.getComputedStyle(panel);
    const contentHeight =
      panel.clientHeight - pixels(style.paddingTop) - pixels(style.paddingBottom);
    const session = panel.querySelector<HTMLElement>(".practiceSessionControls");
    const toolbar = panel.querySelector<HTMLElement>(".analysisBottomToolbar");
    const choices = panel.querySelector<HTMLElement>(
      ".analysisExplorerStack > .analysisContinuationChoices",
    );
    const reserved =
      outerHeight(session) +
      outerHeight(toolbar) +
      outerHeight(choices) +
      pixels(style.rowGap) * (session ? 3 : 2);
    return Math.max(0, Math.floor(contentHeight - reserved - MIN_EXPLORER_HEIGHT));
  }, [panelRef]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!enabled || !panel) return;

    const syncLimit = () => setMaxHeight(readLimit());
    syncLimit();
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncLimit);
    resize?.observe(panel);
    const stack = panel.querySelector(".analysisExplorerStack");
    for (const element of panel.querySelectorAll(
      ".practiceSessionControls, .analysisBottomToolbar, .analysisExplorerStack",
    )) {
      resize?.observe(element);
    }
    const changes =
      typeof MutationObserver === "undefined" ? null : new MutationObserver(syncLimit);
    if (stack) changes?.observe(stack, { childList: true });
    window.addEventListener("resize", syncLimit);
    return () => {
      resize?.disconnect();
      changes?.disconnect();
      window.removeEventListener("resize", syncLimit);
    };
  }, [enabled, panelRef, readLimit]);

  useEffect(() => () => stopDrag.current?.(), []);

  const movePanelHeight =
    savedHeight === null ? null : Math.min(savedHeight, maxHeight ?? savedHeight);
  const currentHeight = () =>
    movePanelRef.current?.getBoundingClientRect().height ?? movePanelHeight ?? 0;
  const resizeTo = (requested: number) => {
    const limit = readLimit();
    if (limit !== null) setSavedHeight(Math.round(Math.min(Math.max(0, requested), limit)));
  };

  const onKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    resizeTo(currentHeight() + (event.key === "ArrowDown" ? RESIZE_STEP : -RESIZE_STEP));
  };

  const onPointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    stopDrag.current?.();
    setResizing(true);

    const owner = event.currentTarget.ownerDocument;
    const pointerId = event.pointerId;
    const startY = event.clientY;
    const startHeight = currentHeight();
    const move = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      pointerEvent.preventDefault();
      resizeTo(startHeight + pointerEvent.clientY - startY);
    };
    const stop = () => {
      owner.removeEventListener("pointermove", move);
      owner.removeEventListener("pointerup", finish);
      owner.removeEventListener("pointercancel", finish);
      stopDrag.current = null;
    };
    const finish = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      stop();
      setResizing(false);
    };
    stopDrag.current = stop;
    owner.addEventListener("pointermove", move, { passive: false });
    owner.addEventListener("pointerup", finish);
    owner.addEventListener("pointercancel", finish);
  };

  return {
    movePanelHeight,
    resizing,
    separatorProps: {
      valueNow:
        movePanelHeight === null
          ? defaultPercent
          : Math.min(
              100,
              Math.round((movePanelHeight / Math.max(1, maxHeight ?? movePanelHeight)) * 100),
            ),
      onPointerDown,
      onKeyDown,
    },
  };
};
