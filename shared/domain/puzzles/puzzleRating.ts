export const PUZZLE_LEVEL_RATINGS = [1500, 1800, 2100, 2400, 2700, 3000] as const;

export type PuzzleLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type PuzzleRatingSource = "system" | "ai" | "human";

export const isPuzzleLevel = (value: unknown): value is PuzzleLevel =>
  Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 6;

export const normalizePuzzleLevel = (value: unknown): PuzzleLevel => {
  const parsed = Number(value);
  return isPuzzleLevel(parsed) ? parsed : 3;
};

export const normalizePuzzleRatingSource = (value: unknown): PuzzleRatingSource => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "human" || normalized === "ai") return normalized;
  return "system";
};

export const puzzleLevelLabel = (level: PuzzleLevel): `V${PuzzleLevel}` => `V${level}`;

export const puzzleRatingForLevel = (level: PuzzleLevel): number =>
  PUZZLE_LEVEL_RATINGS[level - 1] ?? PUZZLE_LEVEL_RATINGS[2];
