import type { PuzzleQueueRow, PuzzleReviewQueueRow } from "../../types/supabase";
import { postApi } from "../api/postApi";

const reviewRequest = <T>(body: Record<string, unknown>): Promise<T> =>
  postApi("/api/puzzles/review", body, {
    errorMessage: "Unable to review puzzle.",
    invalidMessage: "Unable to review puzzle: the server returned no data.",
  });

export const submitPuzzleToQueue = async (input: {
  fen: string;
  solution: string;
  event: string;
  explanation: string;
}): Promise<PuzzleQueueRow> => {
  const body = await postApi<{ puzzle?: PuzzleQueueRow }>(
    "/api/puzzles/submit",
    {
      fen: input.fen.trim(),
      solution: input.solution.trim(),
      event: input.event.trim(),
      explanation: input.explanation.trim(),
    },
    {
      errorMessage: (response) =>
        `Unable to submit puzzle: submission service returned HTTP ${response.status}.`,
      invalidMessage: "Unable to submit puzzle: the submission service returned no data.",
    },
  );
  if (!body.puzzle) {
    throw new Error("Unable to submit puzzle: the submission service returned no puzzle data.");
  }
  return body.puzzle;
};

export const fetchPendingPuzzleQueue = async (): Promise<PuzzleReviewQueueRow[]> => {
  const result = await reviewRequest<{ puzzles: PuzzleReviewQueueRow[] }>({
    action: "list",
  });
  if (!Array.isArray(result.puzzles)) {
    throw new Error("Unable to load puzzle queue: no puzzle list was returned.");
  }
  return result.puzzles;
};

export const updateQueuedPuzzle = async (
  id: number,
  input: { fen: string; solution: string; event: string; explanation: string },
): Promise<PuzzleQueueRow> => {
  const result = await reviewRequest<{ puzzle: PuzzleQueueRow }>({
    action: "update",
    id,
    fen: input.fen.trim(),
    solution: input.solution.trim(),
    event: input.event.trim(),
    explanation: input.explanation.trim(),
  });
  if (!result.puzzle) {
    throw new Error("Unable to save queued puzzle: no queue row was returned.");
  }
  return result.puzzle;
};

export const approveQueuedPuzzle = async (id: number): Promise<number> => {
  const result = await reviewRequest<{ puzzleId: number }>({
    action: "approve",
    id,
  });
  if (!Number.isFinite(result.puzzleId)) {
    throw new Error("Unable to approve puzzle: no puzzle id was returned.");
  }
  return result.puzzleId;
};

export const rejectQueuedPuzzle = async (id: number): Promise<void> => {
  const result = await reviewRequest<{ rejected: boolean }>({
    action: "reject",
    id,
  });
  if (result.rejected !== true) {
    throw new Error("Unable to reject puzzle: the queue row was not removed.");
  }
};
