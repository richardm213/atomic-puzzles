import { defaultSourceFilters, knownSourceKeys, type SourceFilters } from "../../constants/matches";
import { getBrowserStorageJson, setBrowserStorageJson } from "../../utils/browserStorage";

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
  const stored = getBrowserStorageJson<unknown>("local", sourceFiltersStorageKey, null);
  return stored ? normalizeSourceFilters(stored) : { ...defaultSourceFilters };
};

export const writeStoredSourceFilters = (filters: SourceFilters): void => {
  setBrowserStorageJson("local", sourceFiltersStorageKey, normalizeSourceFilters(filters));
};
