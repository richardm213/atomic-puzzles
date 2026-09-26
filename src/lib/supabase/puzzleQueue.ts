import { normalizePuzzlePlayers } from "../../../shared/domain/puzzles/puzzleSetMetadata";
import { postApi } from "../api/postApi";
import { compactPuzzleSolution } from "../puzzles/puzzleSubmission";
import type { PuzzleQueueRow, PuzzleReviewQueueRow } from "./types";

export { DIFFERENT_START_MOVE_CONFIRMATION } from "../../../shared/domain/puzzles/submissionDuplicates";

const reviewRequest = <T>(body: Record<string, unknown>): Promise<T> =>
  postApi("/api/puzzles/review", body, {
    errorMessage: "Unable to review puzzle.",
    invalidMessage: "Unable to review puzzle: the server returned no data.",
  });

export type PuzzleSubmissionResult =
  | { destination: "review"; puzzle: PuzzleQueueRow }
  | { destination: "published"; puzzleId: number };

export type PuzzleBatchSubmissionResult =
  | { destination: "review"; puzzles: PuzzleQueueRow[] }
  | { destination: "published"; puzzleIds: number[] };

type PuzzleSubmissionInput = {
  fen: string;
  solution: string;
  event: string;
  whitePlayer?: string;
  blackPlayer?: string;
  explanation: string;
  opaStyle?: boolean;
};

type PuzzleSubmissionOptions = {
  allowDifferentStartMove?: boolean;
};

const submissionPlayers = (input: Pick<PuzzleSubmissionInput, "whitePlayer" | "blackPlayer">) =>
  normalizePuzzlePlayers([input.whitePlayer, input.blackPlayer]);

export const submitPuzzle = async (
  input: PuzzleSubmissionInput,
  options: PuzzleSubmissionOptions = {},
): Promise<PuzzleSubmissionResult> => {
  const body = await postApi<Partial<PuzzleSubmissionResult>>(
    "/api/puzzles/submit",
    {
      fen: input.fen.trim(),
      solution: compactPuzzleSolution(input.solution),
      event: input.event.trim(),
      eventName: "",
      eventDate: "",
      players: submissionPlayers(input),
      whitePlayer: input.whitePlayer?.trim() ?? "",
      blackPlayer: input.blackPlayer?.trim() ?? "",
      explanation: input.explanation.trim(),
      opaStyle: input.opaStyle === true,
      allowDifferentStartMove: options.allowDifferentStartMove ?? false,
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

export const submitPuzzleBatch = async (
  inputs: PuzzleSubmissionInput[],
  options: PuzzleSubmissionOptions = {},
): Promise<PuzzleBatchSubmissionResult> => {
  const body = await postApi<Partial<PuzzleBatchSubmissionResult>>(
    "/api/puzzles/submit",
    {
      submissions: inputs.map((input) => ({
        fen: input.fen.trim(),
        solution: compactPuzzleSolution(input.solution),
        event: input.event.trim(),
        eventName: "",
        eventDate: "",
        players: submissionPlayers(input),
        whitePlayer: input.whitePlayer?.trim() ?? "",
        blackPlayer: input.blackPlayer?.trim() ?? "",
        explanation: input.explanation.trim(),
        opaStyle: input.opaStyle === true,
      })),
      allowDifferentStartMove: options.allowDifferentStartMove ?? false,
    },
    {
      errorMessage: (response) =>
        `Unable to submit puzzles: submission service returned HTTP ${response.status}.`,
      invalidMessage: "Unable to submit puzzles: the submission service returned no data.",
    },
  );
  if (
    body.destination === "published" &&
    Array.isArray(body.puzzleIds) &&
    body.puzzleIds.every((id) => Number.isSafeInteger(id))
  ) {
    return { destination: "published", puzzleIds: body.puzzleIds };
  }
  if (body.destination === "review" && Array.isArray(body.puzzles)) {
    return { destination: "review", puzzles: body.puzzles };
  }
  throw new Error("Unable to submit puzzles: the submission service returned no puzzle data.");
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
    whitePlayer?: string;
    blackPlayer?: string;
    explanation: string;
    opaStyle?: boolean;
    author: string;
  },
): Promise<PuzzleQueueRow> => {
  const result = await reviewRequest<{ puzzle: PuzzleQueueRow }>({
    action: "update",
    id,
    fen: input.fen.trim(),
    solution: compactPuzzleSolution(input.solution),
    event: input.event.trim(),
    eventName: "",
    eventDate: "",
    players: submissionPlayers(input),
    whitePlayer: input.whitePlayer?.trim() ?? "",
    blackPlayer: input.blackPlayer?.trim() ?? "",
    explanation: input.explanation.trim(),
    opaStyle: input.opaStyle === true,
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
