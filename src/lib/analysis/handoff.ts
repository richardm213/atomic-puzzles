const STORAGE_PREFIX = "atomic-puzzles:analysis-handoff:";
const HANDOFF_MAX_AGE_MS = 10 * 60 * 1000;

export type AnalysisHandoff = {
  fen: string;
  pgn: string;
  line: number;
  ply: number;
  orientation: "white" | "black";
  createdAt: number;
};

export const createAnalysisHandoffId = (): string => {
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const analysisHandoffUrl = (fen: string, handoffId: string): string =>
  `/analysis/${fen.replaceAll(" ", "_")}?handoff=${encodeURIComponent(handoffId)}`;

export const saveAnalysisHandoff = (
  handoffId: string,
  handoff: Omit<AnalysisHandoff, "createdAt">,
): void => {
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${handoffId}`,
      JSON.stringify({ ...handoff, createdAt: Date.now() } satisfies AnalysisHandoff),
    );
  } catch {
    // The route still opens at the puzzle FEN when storage is unavailable.
  }
};

export const readAnalysisHandoff = (search: string): AnalysisHandoff | null => {
  const handoffId = new URLSearchParams(search).get("handoff")?.trim();
  if (!handoffId) return null;

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${handoffId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AnalysisHandoff>;
    if (
      typeof parsed.fen !== "string" ||
      !parsed.fen.trim() ||
      typeof parsed.pgn !== "string" ||
      !parsed.pgn.trim() ||
      !Number.isInteger(parsed.line) ||
      Number(parsed.line) < 0 ||
      !Number.isInteger(parsed.ply) ||
      Number(parsed.ply) < 0 ||
      (parsed.orientation !== "white" && parsed.orientation !== "black") ||
      typeof parsed.createdAt !== "number" ||
      Date.now() - parsed.createdAt > HANDOFF_MAX_AGE_MS
    ) {
      return null;
    }

    return parsed as AnalysisHandoff;
  } catch {
    return null;
  }
};
