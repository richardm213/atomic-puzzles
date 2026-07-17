import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";

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
    if (typeof window === "undefined") return defaultValue;

    try {
      const storedValue = window.localStorage.getItem(storageKey);
      if (storedValue === null) return defaultValue;
      const parsed = schema.safeParse(parseStoredValue(storedValue));
      return parsed.success ? parsed.data : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Persistence is optional; keep the in-memory setting usable.
    }
  }, [storageKey, value]);

  return [value, setValue];
};
