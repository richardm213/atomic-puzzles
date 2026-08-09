import { postApi } from "../api/postApi";
import { normalizePuzzleMotifTags } from "./puzzleMotifs";

export const updatePuzzleTags = async (puzzleId: number, tags: string[]): Promise<string[]> => {
  const result = await postApi<{ puzzleId?: number; tags?: unknown }>(
    "/api/puzzles/tags",
    { puzzleId, tags },
    {
      errorMessage: "Unable to update puzzle motifs.",
      invalidMessage: "Unable to update puzzle motifs: the server returned no data.",
    },
  );

  if (result.puzzleId !== puzzleId || !Array.isArray(result.tags)) {
    throw new Error("Unable to update puzzle motifs: the server returned invalid data.");
  }
  return normalizePuzzleMotifTags(result.tags);
};
