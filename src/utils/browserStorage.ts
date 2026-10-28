type BrowserStorageKind = "local" | "session";

const getStorage = (kind: BrowserStorageKind): Storage | null => {
  if (typeof window === "undefined") return null;
  return kind === "local" ? window.localStorage : window.sessionStorage;
};

export const getBrowserStorageItem = (kind: BrowserStorageKind, key: string): string | null => {
  try {
    return getStorage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

export const setBrowserStorageItem = (
  kind: BrowserStorageKind,
  key: string,
  value: string,
): boolean => {
  try {
    const storage = getStorage(kind);
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const removeBrowserStorageItem = (kind: BrowserStorageKind, key: string): boolean => {
  try {
    const storage = getStorage(kind);
    if (!storage) return false;
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

export const getBrowserStorageJson = <T>(
  kind: BrowserStorageKind,
  key: string,
  fallback: T,
): T => {
  const value = getBrowserStorageItem(kind, key);
  if (value === null) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const setBrowserStorageJson = (
  kind: BrowserStorageKind,
  key: string,
  value: unknown,
): boolean => {
  try {
    return setBrowserStorageItem(kind, key, JSON.stringify(value));
  } catch {
    return false;
  }
};
