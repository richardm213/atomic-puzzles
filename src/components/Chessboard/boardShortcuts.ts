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
  "a, button, summary, [role='button'], [role='menuitem'], [role='option'], [role='tab']";

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
  if (
    isTextEntryTarget(event.target) ||
    event.target.closest(
      "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='slider'], [role='dialog'], dialog",
    )
  )
    return null;
  if (!captureInteractive && event.target.closest(interactiveSelector)) return null;
  return command;
};

export const useBoardShortcuts = (
  onCommand: (command: BoardShortcutCommand) => boolean,
  disabled = false,
  captureInteractive = false,
): void => {
  const settings = useKeyboardShortcutSettings();
  useEffect(() => {
    if (disabled) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing) return;
      const command = boardShortcutCommand(event, captureInteractive, settings);
      if (!command) return;

      if (onCommand(command)) event.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [captureInteractive, disabled, onCommand, settings]);
};
