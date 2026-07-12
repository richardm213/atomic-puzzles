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

export const boardShortcutCommand = (
  event: Pick<KeyboardEvent, "key" | "target" | "metaKey" | "ctrlKey" | "altKey">,
): BoardShortcutCommand | null => {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (!(event.target instanceof Element)) return commandByKey[event.key] ?? null;
  if (event.target.closest(interactiveSelector)) return null;
  return commandByKey[event.key] ?? null;
};

export const useBoardShortcuts = (
  onCommand: (command: BoardShortcutCommand) => void,
  disabled = false,
): void => {
  useEffect(() => {
    if (disabled) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      const command = boardShortcutCommand(event);
      if (!command) return;

      event.preventDefault();
      onCommand(command);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disabled, onCommand]);
};
