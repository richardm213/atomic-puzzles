export type MatchSource = "arena" | "friend" | "lobby" | "unknown";

const firstNonEmptyValue = (...values: unknown[]): unknown =>
  values.find((value) => value !== undefined && value !== null && String(value).trim().length > 0);

export const parseDateInputBoundary = (
  value: string | null | undefined,
  boundary: "start" | "end",
): number => {
  if (!value) {
    return boundary === "end" ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER;
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return boundary === "end" ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER;
  }
  if (boundary === "end") {
    parsed.setHours(23, 59, 59, 999);
  }
  return parsed.getTime();
};

export const sourceValueFromValues = (...values: unknown[]): string => {
  const sourceValue = firstNonEmptyValue(...values);
  return sourceValue === undefined ||
    sourceValue === null ||
    String(sourceValue).trim().length === 0
    ? "—"
    : String(sourceValue);
};

export const matchSourceFromValues = (...values: unknown[]): MatchSource => {
  const sourceValue = firstNonEmptyValue(...values);

  if (
    sourceValue === undefined ||
    sourceValue === null ||
    String(sourceValue).trim().length === 0
  ) {
    return "unknown";
  }

  const normalizedSource = String(sourceValue).toLowerCase();
  if (normalizedSource.includes("arena")) return "arena";
  if (normalizedSource.includes("friend")) return "friend";
  if (normalizedSource.includes("lobby")) return "lobby";
  return "unknown";
};
