import { useCallback, useMemo, useSyncExternalStore } from "react";

import { useAuth } from "../../context/AuthContext";
import { getBrowserStorageItem, setBrowserStorageJson } from "../../utils/browserStorage";
import { puzzleMotifs } from "./puzzleMotifs";

export const PUZZLE_MOTIF_NAME_MAX_LENGTH = 64;

const storagePrefix = "atomic-puzzles:puzzle-motif-names:";
const changeEvent = "atomic-puzzles:puzzle-motif-names-changed";
const defaultNames = new Map(puzzleMotifs.map(({ tag, name }) => [tag, name]));
const emptySnapshot = () => null;

const parseNames = (raw: string | null): Map<string, string> => {
  const names = new Map<string, string>();
  if (!raw) return names;

  try {
    const stored: unknown = JSON.parse(raw);
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return names;
    for (const [tag, value] of Object.entries(stored)) {
      if (defaultNames.has(tag) && typeof value === "string") {
        const name = value.trim();
        if (name && name.length <= PUZZLE_MOTIF_NAME_MAX_LENGTH) names.set(tag, name);
      }
    }
  } catch {
    // Invalid preferences must not prevent the canonical names from rendering.
  }
  return names;
};

export const usePuzzleMotifNames = () => {
  const { isAuthenticated, user } = useAuth();
  const username = isAuthenticated ? user?.username.toLowerCase() : undefined;
  const key = username ? `${storagePrefix}${username}` : null;

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!key) return () => {};
      const onStorage = (event: StorageEvent) => {
        if (event.key === key || event.key === null) onChange();
      };
      const onLocalChange = (event: Event) => {
        if ((event as CustomEvent<string>).detail === key) onChange();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener(changeEvent, onLocalChange);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(changeEvent, onLocalChange);
      };
    },
    [key],
  );
  const read = useCallback(() => (key ? getBrowserStorageItem("local", key) : null), [key]);
  const raw = useSyncExternalStore(subscribe, read, emptySnapshot);
  const names = useMemo(() => parseNames(raw), [raw]);
  const getName = useCallback(
    (tag: string) => names.get(tag) ?? defaultNames.get(tag) ?? tag,
    [names],
  );

  const saveName = (tag: string, value: string | null): boolean => {
    const name = value?.trim();
    if (!key || !defaultNames.has(tag)) return false;
    if (value !== null && (!name || name.length > PUZZLE_MOTIF_NAME_MAX_LENGTH)) return false;

    // Read the latest snapshot so saving a tag preserves any other edits.
    const updatedNames = parseNames(read());
    if (!name || name === defaultNames.get(tag)) updatedNames.delete(tag);
    else updatedNames.set(tag, name);
    if (!setBrowserStorageJson("local", key, Object.fromEntries(updatedNames))) return false;

    window.dispatchEvent(new CustomEvent(changeEvent, { detail: key }));
    return true;
  };

  return { canRename: Boolean(key), getName, saveName };
};
