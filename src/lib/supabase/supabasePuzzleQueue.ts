import type { PuzzleQueueRow, PuzzleReviewQueueRow } from "../../types/supabase";
import { appAssetPath } from "../../utils/appAssetPath";
import { invalidateLichessSessionForResponse } from "../auth/lichessAuth";

const reviewRequest = async <T>(accessToken: string, body: Record<string, unknown>): Promise<T> => {
  if (!accessToken) throw new Error("Log in with Lichess to review puzzles.");

  const response = await fetch(appAssetPath("/api/puzzles/review"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  invalidateLichessSessionForResponse(response, accessToken);
  const result = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(result?.error || "Unable to review puzzle.");
  if (!result) throw new Error("Unable to review puzzle: the server returned no data.");
  return result;
};

export const submitPuzzleToQueue = async (input: {
  fen: string;
  solution: string;
  event: string;
  explanation: string;
  accessToken: string;
}): Promise<PuzzleQueueRow> => {
  if (!input.accessToken) throw new Error("Log in with Lichess to submit a puzzle.");

  const response = await fetch(appAssetPath("/api/puzzles/submit"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fen: input.fen.trim(),
      solution: input.solution.trim(),
      event: input.event.trim(),
      explanation: input.explanation.trim(),
    }),
  });
  invalidateLichessSessionForResponse(response, input.accessToken);
  const responseText = await response.text();
  let body: { puzzle?: PuzzleQueueRow; error?: string } | null = null;
  try {
    body = JSON.parse(responseText) as { puzzle?: PuzzleQueueRow; error?: string };
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new Error(
      body?.error ||
        `Unable to submit puzzle: submission service returned HTTP ${response.status}.`,
    );
  }
  if (!body?.puzzle) {
    throw new Error("Unable to submit puzzle: the submission service returned no puzzle data.");
  }
  return body.puzzle;
};

export const fetchPendingPuzzleQueue = async (
  accessToken: string,
): Promise<PuzzleReviewQueueRow[]> => {
  const result = await reviewRequest<{ puzzles: PuzzleReviewQueueRow[] }>(accessToken, {
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
  accessToken: string,
): Promise<PuzzleQueueRow> => {
  const result = await reviewRequest<{ puzzle: PuzzleQueueRow }>(accessToken, {
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

export const approveQueuedPuzzle = async (id: number, accessToken: string): Promise<number> => {
  const result = await reviewRequest<{ puzzleId: number }>(accessToken, {
    action: "approve",
    id,
  });
  if (!Number.isFinite(result.puzzleId)) {
    throw new Error("Unable to approve puzzle: no puzzle id was returned.");
  }
  return result.puzzleId;
};

export const rejectQueuedPuzzle = async (id: number, accessToken: string): Promise<void> => {
  const result = await reviewRequest<{ rejected: boolean }>(accessToken, {
    action: "reject",
    id,
  });
  if (result.rejected !== true) {
    throw new Error("Unable to reject puzzle: the queue row was not removed.");
  }
};
