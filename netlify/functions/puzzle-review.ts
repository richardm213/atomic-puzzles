import { createClient } from "@supabase/supabase-js";

import {
  type PuzzleSubmissionValue,
  validatePuzzleSubmission,
} from "../../src/lib/puzzles/puzzleSubmission";
import { parseBearerToken, verifyLichessAccount } from "../lib/lichessAccount";

type NetlifyEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

type ReviewBody = {
  action?: unknown;
  id?: unknown;
  fen?: unknown;
  solution?: unknown;
  event?: unknown;
  explanation?: unknown;
};

const REVIEWER = "seaside_tiramisu";
const MAX_FEN_LENGTH = 200;
const MAX_SOLUTION_LENGTH = 10_000;
const MAX_EVENT_LENGTH = 200;
const MAX_EXPLANATION_LENGTH = 5_000;

const jsonResponse = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const parseBody = (event: NetlifyEvent): ReviewBody | null => {
  try {
    const parsed = JSON.parse(event.body ?? "");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as ReviewBody)
      : null;
  } catch {
    return null;
  }
};

const readString = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : null;
};

const readId = (value: unknown): number | null => {
  const id = typeof value === "number" ? value : Number.NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const readPuzzle = (body: ReviewBody): PuzzleSubmissionValue | null => {
  const fen = readString(body.fen, MAX_FEN_LENGTH);
  const solution = readString(body.solution, MAX_SOLUTION_LENGTH);
  const event = readString(body.event ?? "", MAX_EVENT_LENGTH);
  const explanation = readString(body.explanation, MAX_EXPLANATION_LENGTH);
  if (!fen || !solution || event === null || explanation === null) return null;
  return { fen, solution, event, explanation };
};

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const accessToken = parseBearerToken(event.headers);
  if (!accessToken) {
    return jsonResponse(401, { error: "Log in with Lichess to review puzzles." });
  }

  const body = parseBody(event);
  const action = body?.action;
  if (action !== "list" && action !== "update" && action !== "approve" && action !== "reject") {
    return jsonResponse(400, { error: "Invalid review action." });
  }

  try {
    const account = await verifyLichessAccount(accessToken);
    if (!account?.username) {
      return jsonResponse(401, { error: "Your Lichess login is no longer valid." });
    }
    if (account.username.trim().toLowerCase() !== REVIEWER) {
      return jsonResponse(403, { error: "This review queue is restricted." });
    }

    let queuedPuzzleId: number | null = null;
    let normalizedPuzzle: PuzzleSubmissionValue | null = null;
    if (action !== "list") {
      queuedPuzzleId = readId(body?.id);
      if (queuedPuzzleId === null) {
        return jsonResponse(400, { error: "Invalid queued puzzle id." });
      }
    }
    if (action === "update") {
      const submittedPuzzle = body ? readPuzzle(body) : null;
      if (!submittedPuzzle) {
        return jsonResponse(400, { error: "Invalid queued puzzle." });
      }
      normalizedPuzzle = validatePuzzleSubmission(submittedPuzzle);
    }
    const supabaseUrl =
      process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || "";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Puzzle review service is not configured.");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    if (action === "list") {
      const { data, error } = await supabase
        .from("puzzles_queue")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw new Error(`Unable to load puzzle queue: ${error.message}`);
      if (!data?.length) return jsonResponse(200, { puzzles: [] });

      const { data: latestPuzzles, error: latestPuzzleError } = await supabase
        .from("puzzles")
        .select("id")
        .order("id", { ascending: false })
        .limit(1);
      if (latestPuzzleError) {
        throw new Error(`Unable to determine the next puzzle id: ${latestPuzzleError.message}`);
      }
      const highestPuzzleId = Number(latestPuzzles?.[0]?.id ?? 0);
      if (!Number.isSafeInteger(highestPuzzleId) || highestPuzzleId < 0) {
        throw new Error("Unable to determine the next puzzle id.");
      }
      const nextPuzzleId = highestPuzzleId + 1;
      const puzzles = data.map((row) => ({ ...row, next_puzzle_id: nextPuzzleId }));
      return jsonResponse(200, { puzzles });
    }

    if (queuedPuzzleId === null) {
      throw new Error("Unable to review puzzle: no queued puzzle id was provided.");
    }

    if (action === "update") {
      if (!normalizedPuzzle) {
        throw new Error("Unable to save queued puzzle: no puzzle data was provided.");
      }
      const { data, error } = await supabase
        .from("puzzles_queue")
        .update(normalizedPuzzle)
        .eq("id", queuedPuzzleId)
        .select("*")
        .single();
      if (error) throw new Error(`Unable to save queued puzzle: ${error.message}`);
      if (!data) throw new Error("Unable to save queued puzzle: no queue row was returned.");
      return jsonResponse(200, { puzzle: data });
    }

    if (action === "reject") {
      const { error } = await supabase.from("puzzles_queue").delete().eq("id", queuedPuzzleId);
      if (error) throw new Error(`Unable to reject queued puzzle: ${error.message}`);
      return jsonResponse(200, { rejected: true });
    }

    const { data, error } = await supabase.rpc("approve_queued_puzzle", {
      p_queue_id: queuedPuzzleId,
      p_reviewer: REVIEWER,
    });
    if (error) {
      const missingApprovalFunction = /could not find the function.*approve_queued_puzzle/i.test(
        error.message,
      );
      if (missingApprovalFunction) {
        return jsonResponse(503, {
          error:
            "Puzzle approval is not configured yet. Run the latest puzzles_queue.sql in Supabase.",
        });
      }
      const conflict = /puzzle id .* already exists/i.test(error.message);
      return jsonResponse(conflict ? 409 : 500, {
        error: conflict ? error.message : `Unable to approve puzzle: ${error.message}`,
      });
    }
    const puzzleId = Number(data);
    if (!Number.isFinite(puzzleId)) {
      throw new Error("Unable to approve puzzle: no puzzle id was returned.");
    }
    return jsonResponse(200, { puzzleId });
  } catch (error) {
    if (
      error instanceof Error &&
      /^(Invalid (FEN|atomic position|PGN)|Enter PGN|The PGN|The moves)/.test(error.message)
    ) {
      return jsonResponse(400, { error: error.message });
    }
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to review puzzle.",
    });
  }
};
