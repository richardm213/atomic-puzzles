export type PracticeStyle = {
  kingPressure: number;
  material: number;
  simplification: number;
  counterplay: number;
};
export const PRACTICE_PRESETS = {
  balanced: { label: "Balanced", style: [0, 0, 0, 0], spread: 1 },
  varied: { label: "Varied", style: [0, 0, 0, 0], spread: 1.8 },
  patient: { label: "Patient", style: [-0.2, 0.2, -0.5, -0.3], spread: 1 },
  solid: { label: "Solid", style: [-0.8, 0.2, 0.3, -0.4], spread: 1 },
  resourceful: { label: "Resourceful", style: [0.2, -0.2, -0.3, 1], spread: 1.2 },
  attacking: { label: "Attacking", style: [1, -0.4, -0.5, 0.5], spread: 1 },
  counterattacking: { label: "Counterattacking", style: [0.5, 0.1, -0.2, 1], spread: 1 },
  quiet: { label: "Quiet", style: [-0.6, 0, 0, -0.8], spread: 1 },
  simplifying: { label: "Simplifying", style: [-0.2, 0.3, 1, -0.2], spread: 1 },
  complicated: { label: "Complicated", style: [0.4, -0.2, -1, 0.7], spread: 1.4 },
  materialist: { label: "Materialist", style: [0, 1, 0.2, 0], spread: 1 },
} as const;
export type PracticePreset = keyof typeof PRACTICE_PRESETS;
export type PracticeAdvanced = PracticeStyle & {
  variety: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
};
export type PracticeEngineSettings = {
  strength: number;
  speed: number;
  minGames: number;
  preset: PracticePreset;
  maxThinkTimeMs: number;
  advanced: PracticeAdvanced;
};
export const PRACTICE_SEARCH_LIMITS = [
  { timeMs: 150, depth: 4 },
  { timeMs: 250, depth: 6 },
  { timeMs: 400, depth: 8 },
  { timeMs: 700, depth: 10 },
  { timeMs: 1200, depth: 13 },
  { timeMs: 2000, depth: 16 },
  { timeMs: 3500, depth: 20 },
  { timeMs: 6000, depth: 26 },
] as const;
const bounded = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
export const strengthDefaults = (strength: number) => {
  const weakness = (12 - strength) / 11;
  return {
    variety: 0.25 + weakness * 0.65,
    inaccuracy: Math.round(30 * weakness),
    mistake: Math.round(24 * weakness ** 1.5),
    blunder: Math.round(16 * weakness ** 2),
  };
};
export const presetDefaults = (preset: PracticePreset): PracticeStyle => {
  const [kingPressure, material, simplification, counterplay] = PRACTICE_PRESETS[preset].style;
  return { kingPressure, material, simplification, counterplay };
};
export const normalizePracticeEngineSettings = (input: unknown): PracticeEngineSettings => {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const strength = Math.round(bounded(raw.strength, 9, 1, 12));
  const speed = Math.round(bounded(raw.speed, 4, 1, 8));
  const preset =
    typeof raw.preset === "string" && Object.hasOwn(PRACTICE_PRESETS, raw.preset)
      ? (raw.preset as PracticePreset)
      : "balanced";
  const defaults = { ...strengthDefaults(strength), ...presetDefaults(preset) };
  const advanced = { ...defaults };
  const stored =
    raw.advanced && typeof raw.advanced === "object"
      ? (raw.advanced as Record<string, unknown>)
      : {};
  for (const k of Object.keys(defaults) as Array<keyof PracticeAdvanced>) {
    advanced[k] = bounded(
      stored[k],
      defaults[k],
      k === "variety" ? 0.05 : k in presetDefaults(preset) ? -1 : 0,
      k === "variety" || k in presetDefaults(preset) ? 1 : 100,
    );
  }
  const sum = advanced.inaccuracy + advanced.mistake + advanced.blunder;
  if (sum > 100)
    for (const k of ["inaccuracy", "mistake", "blunder"] as const) advanced[k] *= 100 / sum;
  return {
    strength,
    speed,
    preset,
    advanced,
    minGames: Math.round(bounded(raw.minGames, 1, 1, 10000)),
    maxThinkTimeMs: Math.round(
      bounded(raw.maxThinkTimeMs, PRACTICE_SEARCH_LIMITS[speed - 1]!.timeMs, 50, 12000),
    ),
  };
};

// A handoff belongs to a branch prefix, not just a ply number or a transposed FEN.
export type PracticeHandoff = { prefix: string[] };
export const handoffApplies = (
  handoff: PracticeHandoff | null,
  moves: readonly string[],
): boolean =>
  handoff !== null &&
  moves.length >= handoff.prefix.length &&
  handoff.prefix.every((move, i) => moves[i] === move);
export const shouldUsePracticeEngine = (games: number, minGames: number): boolean =>
  games < minGames;
