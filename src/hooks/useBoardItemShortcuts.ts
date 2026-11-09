import { useEffect } from "react";

import { isTextEntryTarget } from "../components/Chessboard/boardShortcuts";
import { useKeyboardShortcutSettings } from "../context/AppSettings";
import {
  keyboardShortcutAction,
  keyboardShortcutAria,
  keyboardShortcutHint,
} from "../lib/keyboardShortcuts";

export const useBoardItemShortcuts = ({
  onPrevious,
  onNext,
}: {
  onPrevious?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
}) => {
  const settings = useKeyboardShortcutSettings();
  useEffect(() => {
    if (!onPrevious && !onNext) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        isTextEntryTarget(event.target) ||
        (event.target instanceof Element &&
          event.target.closest("[contenteditable], [role='textbox'], [role='dialog'], dialog"))
      )
        return;
      const action = keyboardShortcutAction(event, settings);
      const handler =
        action === "previousItem" ? onPrevious : action === "nextItem" ? onNext : undefined;
      if (!handler) return;
      event.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settings, onPrevious, onNext]);
  return {
    previousHint: keyboardShortcutHint(settings, "previousItem"),
    nextHint: keyboardShortcutHint(settings, "nextItem"),
    previousAria: keyboardShortcutAria(settings, "previousItem"),
    nextAria: keyboardShortcutAria(settings, "nextItem"),
  };
};
