import { postApi } from "../api/postApi";
import { compactPuzzleSolution } from "../puzzles/puzzleSubmission";
import type { PuzzleQueueRow, PuzzleReviewQueueRow } from "./types";

const reviewRequest = <T>(body: Record<string, unknown>): Promise<T> =>
  postApi("/api/puzzles/review", body, {
    errorMessage: "Unable to review puzzle.",
    invalidMessage: "Unable to review puzzle: the server returned no data.",
  });

export type PuzzleSubmissionResult =
  | { destination: "review"; puzzle: PuzzleQueueRow }
  | { destination: "published"; puzzleId: number };

export const submitPuzzle = async (input: {
  fen: string;
  solution: string;
  event: string;
  explanation: string;
}): Promise<PuzzleSubmissionResult> => {
  const body = await postApi<Partial<PuzzleSubmissionResult>>(
    "/api/puzzles/submit",
    {
      fen: input.fen.trim(),
      solution: compactPuzzleSolution(input.solution),
      event: input.event.trim(),
      explanation: input.explanation.trim(),
    },
    {
      errorMessage: (response) =>
        `Unable to submit puzzle: submission service returned HTTP ${response.status}.`,
      invalidMessage: "Unable to submit puzzle: the submission service returned no data.",
    },
  );
  if (body.destination === "published" && Number.isSafeInteger(body.puzzleId)) {
    return { destination: "published", puzzleId: body.puzzleId as number };
  }
  if (body.destination === "review" && body.puzzle) {
    return { destination: "review", puzzle: body.puzzle };
  }
  throw new Error("Unable to submit puzzle: the submission service returned no puzzle data.");
};

/** @deprecated Prefer submitPuzzle, which also represents direct publication. */
export const submitPuzzleToQueue = async (
  input: Parameters<typeof submitPuzzle>[0],
): Promise<PuzzleQueueRow> => {
  const result = await submitPuzzle(input);
  if (result.destination !== "review") {
    throw new Error("The puzzle was published directly instead of entering the review queue.");
  }
  return result.puzzle;
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
  input: {
    fen: string;
    solution: string;
    event: string;
    explanation: string;
    author: string;
  },
): Promise<PuzzleQueueRow> => {
  const result = await reviewRequest<{ puzzle: PuzzleQueueRow }>({
    action: "update",
    id,
    fen: input.fen.trim(),
    solution: compactPuzzleSolution(input.solution),
    event: input.event.trim(),
    explanation: input.explanation.trim(),
    author: input.author.trim(),
  });
  if (!result.puzzle) {
    throw new Error("Unable to save queued puzzle: no queue row was returned.");
  }
  return result.puzzle;
};

export const approveQueuedPuzzle = async (id: number, puzzleId: number): Promise<number> => {
  const result = await reviewRequest<{ puzzleId: number }>({
    action: "approve",
    id,
    puzzleId,
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
