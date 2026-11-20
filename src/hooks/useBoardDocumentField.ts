import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { getErrorMessage } from "../utils/errors";
import { inputCommitHandlers } from "../utils/inputCommit";

type TextInput = HTMLInputElement | HTMLTextAreaElement;

export const normalizeBoardFen = (value: string): string => value.trim().replace(/\s+/g, " ");

export const useBoardDocumentField = (
  committedValue: string,
  onCommit: (value: string) => string,
  fallbackError: string,
) => {
  const dirty = useRef(false);
  const [value, setValue] = useState(committedValue);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!dirty.current) setValue(committedValue);
  }, [committedValue]);

  const replace = (nextValue: string) => {
    dirty.current = false;
    setValue(nextValue);
    setError("");
  };

  return {
    field: {
      value,
      error,
      onChange: (event: ChangeEvent<TextInput>) => {
        dirty.current = true;
        setValue(event.target.value);
      },
      ...inputCommitHandlers((draft) => {
        if (!dirty.current) return;
        try {
          replace(draft === committedValue ? committedValue : onCommit(draft));
        } catch (cause) {
          setError(getErrorMessage(cause, fallbackError));
        }
      }),
    },
    replace,
  };
};
