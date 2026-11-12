import type { FocusEvent, KeyboardEvent } from "react";

type TextInput = HTMLInputElement | HTMLTextAreaElement;

export const inputCommitHandlers = (commit: (value: string, force?: boolean) => void) => ({
  onBlur: (event: FocusEvent<TextInput>) => commit(event.currentTarget.value),
  onKeyDown: (event: KeyboardEvent<TextInput>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    commit(event.currentTarget.value, true);
  },
});
