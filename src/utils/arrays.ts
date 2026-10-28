export const toggleArrayValue = <T>(values: readonly T[], value: T): T[] =>
  values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];

export const isOneOf = <T>(values: readonly T[], value: unknown): value is T =>
  values.includes(value as T);
