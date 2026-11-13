import { useCallback, useEffect, useRef } from "react";

import { BOARD_SIZE_PROPERTY, boardSizeKey, LEGACY_BOARD_SIZE_KEY, resetBoardSize } from "../../lib/chess/boardSize";
import { getBrowserStorageItem, setBrowserStorageItem } from "../../utils/browserStorage";

export const BoardResizeHandle = () => {
  const handleRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; size: number } | null>(null);

  const elements = useCallback(() => {
    const shell = handleRef.current?.closest<HTMLElement>(".cg-boardShell");
    const layout = shell?.closest<HTMLElement>("[data-board-resize]");
    return shell && layout ? { shell, layout } : null;
  }, []);
  const setSize = useCallback((size: number) => {
    const target = elements();
    if (!target) return;
    const { layout } = target;
    const clamped = Math.round(Math.max(200, Math.min(window.innerWidth - 8, 1200, size)));
    layout.style.setProperty(BOARD_SIZE_PROPERTY, `${clamped}px`);
    document.body.dispatchEvent(new Event("chessground.resize"));
  }, [elements]);
  // Layout columns include the board's frame or evaluation-bar gutter.
  const currentSize = (target: { shell: HTMLElement; layout: HTMLElement }) =>
    target.shell.getBoundingClientRect().width +
    (parseFloat(getComputedStyle(target.layout).getPropertyValue("--board-resize-gutter")) || 0);
  const persistSize = () => {
    const target = elements();
    if (!target) return;
    setBrowserStorageItem("local", boardSizeKey(target.layout),
      target.layout.style.getPropertyValue(BOARD_SIZE_PROPERTY).replace("px", ""));
  };

  useEffect(() => {
    const target = elements();
    if (!target) return;
    const saved = getBrowserStorageItem("local", boardSizeKey(target.layout)) ??
      (["analysis", "game"].includes(target.layout.dataset.boardResize ?? "")
        ? getBrowserStorageItem("local", LEGACY_BOARD_SIZE_KEY) : null);
    if (saved && Number.isFinite(Number(saved))) setSize(Number(saved));
  }, [elements, setSize]);

  return (
    <button
      ref={handleRef}
      type="button"
      className="boardResizeHandle"
      aria-label="Resize board"
      title="Resize board (arrow keys to adjust, double-click to reset)"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const target = elements();
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        drag.current = {
          id: event.pointerId, x: event.clientX, y: event.clientY,
          size: currentSize(target),
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        setSize(start.size + (Math.abs(dx) > Math.abs(dy) ? dx : dy));
      }}
      onPointerUp={(event) => {
        if (drag.current?.id !== event.pointerId) return;
        drag.current = null;
        persistSize();
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={() => { drag.current = null; }}
      onDoubleClick={() => {
        const target = elements();
        if (!target) return;
        resetBoardSize(target.layout);
      }}
      onKeyDown={(event) => {
        const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1
          : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
        const target = elements();
        if (!direction || !target) return;
        event.preventDefault();
        event.stopPropagation();
        setSize(currentSize(target) + direction * (event.shiftKey ? 40 : 8));
        persistSize();
      }}
    />
  );
};
