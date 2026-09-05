import { defaultSourceFilters, knownSourceKeys, type SourceFilters } from "../../constants/matches";

const sourceFiltersStorageKey = "atomic-puzzles:source-filters";

export const normalizeSourceFilters = (value: unknown): SourceFilters => {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return Object.fromEntries(
    knownSourceKeys.map((key) => [
      key,
      typeof source[key] === "boolean" ? Boolean(source[key]) : defaultSourceFilters[key],
    ]),
  ) as SourceFilters;
};

export const readStoredSourceFilters = (): SourceFilters => {
  if (typeof window === "undefined") return { ...defaultSourceFilters };

  try {
    const stored = window.localStorage.getItem(sourceFiltersStorageKey);
    return stored ? normalizeSourceFilters(JSON.parse(stored)) : { ...defaultSourceFilters };
  } catch {
    return { ...defaultSourceFilters };
  }
};

export const writeStoredSourceFilters = (filters: SourceFilters): void => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      sourceFiltersStorageKey,
      JSON.stringify(normalizeSourceFilters(filters)),
    );
  } catch {
    // Local storage is a preference cache only; the current page state still applies.
  }
};
