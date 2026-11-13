import { useEffect, useRef } from "react";

import { isTextEntryTarget } from "../components/Chessboard/boardShortcuts";
import { useKeyboardShortcutSettings } from "../context/AppSettings";
import { type KeyboardShortcutAction, keyboardShortcutAction } from "../lib/keyboardShortcuts";

export type BoardActions = Partial<Record<KeyboardShortcutAction, () => void | false>>;

export const useBoardActionShortcuts = (actions: BoardActions, enabled = true) => {
  const settings = useKeyboardShortcutSettings();
  const latest = useRef(actions);
  latest.current = actions;
  useEffect(() => {
    if (!enabled) return;
    const handle = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        isTextEntryTarget(event.target) ||
        (event.target instanceof Element &&
          event.target.closest(
            "[contenteditable], [role='textbox'], [role='slider'], [role='dialog'], dialog",
          ))
      )
        return;
      const action = keyboardShortcutAction(event, settings);
      const run = action ? latest.current[action] : undefined;
      if (run && run() !== false) event.preventDefault();
    };
    window.addEventListener("keydown", handle, { capture: true });
    return () => window.removeEventListener("keydown", handle, { capture: true });
  }, [enabled, settings]);
};
