import { postApi } from "../api/postApi";

export const updatePuzzleExplanation = async (
  puzzleId: number,
  explanation: string,
): Promise<string> => {
  const result = await postApi<{ puzzleId?: number; explanation?: unknown }>(
    "/api/puzzles/explanation",
    { puzzleId, explanation },
    {
      errorMessage: "Unable to update puzzle explanation.",
      invalidMessage: "Unable to update puzzle explanation: the server returned no data.",
    },
  );

  if (result.puzzleId !== puzzleId || typeof result.explanation !== "string") {
    throw new Error("Unable to update puzzle explanation: the server returned invalid data.");
  }

  return result.explanation.trim();
};
