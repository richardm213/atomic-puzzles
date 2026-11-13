import { useKeyboardShortcutSettings } from "../context/AppSettings";
import { keyboardShortcutAria, keyboardShortcutHint } from "../lib/keyboardShortcuts";
import { useBoardActionShortcuts } from "./useBoardActionShortcuts";

export const useBoardItemShortcuts = ({
  onPrevious,
  onNext,
}: {
  onPrevious?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
}) => {
  const settings = useKeyboardShortcutSettings();
  useBoardActionShortcuts(
    {
      ...(onPrevious ? { previousItem: onPrevious } : {}),
      ...(onNext ? { nextItem: onNext } : {}),
    },
    Boolean(onPrevious || onNext),
  );
  return {
    previousHint: keyboardShortcutHint(settings, "previousItem"),
    nextHint: keyboardShortcutHint(settings, "nextItem"),
    previousAria: keyboardShortcutAria(settings, "previousItem"),
    nextAria: keyboardShortcutAria(settings, "nextItem"),
  };
};
