export const LOCAL_ANALYSIS_ENGINES = ["atomic-stockfish", "fairy-stockfish-14"] as const;

export type LocalAnalysisEngine = (typeof LOCAL_ANALYSIS_ENGINES)[number];

export const DEFAULT_LOCAL_ANALYSIS_ENGINE: LocalAnalysisEngine = "atomic-stockfish";
export const LOCAL_ANALYSIS_ENGINE_STORAGE_KEY = "atomic-puzzles.local-analysis-engine";

export const isLocalAnalysisEngine = (value: unknown): value is LocalAnalysisEngine =>
  typeof value === "string" && LOCAL_ANALYSIS_ENGINES.includes(value as LocalAnalysisEngine);

export const localAnalysisEngineLabel = (engine: LocalAnalysisEngine): string =>
  engine === "fairy-stockfish-14" ? "Fairy-Stockfish 14" : "Atomic-Stockfish";

export const readLocalAnalysisEngine = (): LocalAnalysisEngine => {
  if (typeof window === "undefined") return DEFAULT_LOCAL_ANALYSIS_ENGINE;
  try {
    const stored = JSON.parse(window.localStorage.getItem(LOCAL_ANALYSIS_ENGINE_STORAGE_KEY) ?? "");
    return isLocalAnalysisEngine(stored) ? stored : DEFAULT_LOCAL_ANALYSIS_ENGINE;
  } catch {
    return DEFAULT_LOCAL_ANALYSIS_ENGINE;
  }
};
