import { useEffect } from "react";

import { useKeyboardShortcutSettings } from "../../context/AppSettings";
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  keyboardShortcutAction,
  type KeyboardShortcutSettings,
} from "../../lib/keyboardShortcuts";
import type { PlaybackCommand } from "../../types/chessboard";

export type BoardShortcutCommand = PlaybackCommand;

const commandByAction: Partial<Record<string, BoardShortcutCommand>> = {
  previousMove: "previous",
  nextMove: "next",
  previousLine: "previousOption",
  nextLine: "nextOption",
};

const interactiveSelector =
  "a, button, input, textarea, select, summary, [contenteditable='true'], [role='button'], [role='menuitem'], [role='option'], [role='slider'], [role='tab']";

export const shortcutIndexFromKeyboardEvent = (
  event: Pick<KeyboardEvent, "key" | "code"> &
    Partial<Pick<KeyboardEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey">>,
  settings = DEFAULT_KEYBOARD_SHORTCUTS,
): number | null => {
  const action = keyboardShortcutAction(event, settings);
  if (action === "playBestMove") return 0;
  return action?.startsWith("explorerMove")
    ? Number(action.slice("explorerMove".length)) - 1
    : null;
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
  event: Pick<KeyboardEvent, "key" | "target" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  captureInteractive = false,
  settings: KeyboardShortcutSettings = DEFAULT_KEYBOARD_SHORTCUTS,
): BoardShortcutCommand | null => {
  const action = keyboardShortcutAction(event, settings);
  const command = action ? (commandByAction[action] ?? null) : null;
  if (!(event.target instanceof Element)) return command;
  if (!captureInteractive && event.target.closest(interactiveSelector)) return null;
  if (
    captureInteractive &&
    event.target.closest("input, textarea, select, [contenteditable='true'], [role='slider']")
  ) {
    return null;
  }
  return command;
};

export const useBoardShortcuts = (
  onCommand: (command: BoardShortcutCommand) => void,
  disabled = false,
  captureInteractive = false,
): void => {
  const settings = useKeyboardShortcutSettings();
  useEffect(() => {
    if (disabled) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      const command = boardShortcutCommand(event, captureInteractive, settings);
      if (!command) return;

      event.preventDefault();
      onCommand(command);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [captureInteractive, disabled, onCommand, settings]);
};
