import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";

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

  useEffect(() => {
    setBrowserStorageJson("local", storageKey, value);
  }, [storageKey, value]);

  return [value, setValue];
};
