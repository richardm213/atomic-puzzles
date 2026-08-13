import { useEffect } from "react";

import type { PlaybackCommand } from "../../types/chessboard";

export type BoardShortcutCommand = PlaybackCommand;

const commandByKey: Partial<Record<string, BoardShortcutCommand>> = {
  ArrowLeft: "previous",
  ArrowRight: "next",
  ArrowUp: "previousOption",
  ArrowDown: "nextOption",
  Backspace: "previous",
};

const interactiveSelector =
  "a, button, input, textarea, select, summary, [contenteditable='true'], [role='button'], [role='menuitem'], [role='option'], [role='slider'], [role='tab']";

export const shortcutIndexFromKeyboardEvent = (
  event: Pick<KeyboardEvent, "key" | "code">,
): number | null => {
  const key = event.key.toLowerCase();
  if (key === " " || key === "spacebar") return 0;
  if (/^[1-9]$/.test(key)) return Number(key) - 1;

  const code = event.code.toLowerCase();
  if (/^(digit|numpad)[1-9]$/.test(code)) return Number(code.slice(-1)) - 1;
  return null;
};

export const isTextEntryTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  Boolean(
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable ||
    target.contentEditable === "true",
  );

export const boardShortcutCommand = (
  event: Pick<KeyboardEvent, "key" | "target" | "metaKey" | "ctrlKey" | "altKey">,
  captureInteractive = false,
): BoardShortcutCommand | null => {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (!(event.target instanceof Element)) return commandByKey[event.key] ?? null;
  if (!captureInteractive && event.target.closest(interactiveSelector)) return null;
  if (
    captureInteractive &&
    event.target.closest("input, textarea, select, [contenteditable='true'], [role='slider']")
  ) {
    return null;
  }
  return commandByKey[event.key] ?? null;
};

export const useBoardShortcuts = (
  onCommand: (command: BoardShortcutCommand) => void,
  disabled = false,
  captureInteractive = false,
): void => {
  useEffect(() => {
    if (disabled) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      const command = boardShortcutCommand(event, captureInteractive);
      if (!command) return;

      event.preventDefault();
      onCommand(command);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [captureInteractive, disabled, onCommand]);
};
