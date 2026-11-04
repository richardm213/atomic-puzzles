import type { Dispatch, SetStateAction } from "react";
import { useCallback, useState } from "react";

import { getBrowserStorageItem, setBrowserStorageJson } from "../utils/browserStorage";

type Schema<T> = {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false };
};

const parseStoredValue = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export const usePersistedState = <T>(
  storageKey: string,
  schema: Schema<T>,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] => {
  const [value, setValue] = useState<T>(() => {
    const storedValue = getBrowserStorageItem("local", storageKey);
    if (storedValue === null) return defaultValue;
    const parsed = schema.safeParse(parseStoredValue(storedValue));
    return parsed.success ? parsed.data : defaultValue;
  });

  const setPersistedValue = useCallback<Dispatch<SetStateAction<T>>>(
    (nextValue) => {
      setValue((currentValue) => {
        const resolvedValue =
          typeof nextValue === "function"
            ? (nextValue as (current: T) => T)(currentValue)
            : nextValue;
        // Persist in the same turn as the UI update so a navigation or unmount
        // cannot strand the new setting between render and an effect.
        setBrowserStorageJson("local", storageKey, resolvedValue);
        return resolvedValue;
      });
    },
    [storageKey],
  );

  return [value, setPersistedValue];
};
