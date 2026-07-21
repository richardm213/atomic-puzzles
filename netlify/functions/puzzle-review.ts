import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  compactPuzzleSolution,
  type PuzzleSubmissionValue,
  validatePuzzleSubmission,
} from "../../src/lib/puzzles/puzzleSubmission";
import { isSameOriginRequest, resolveSiteIdentity } from "../lib/siteSession";

type NetlifyEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

const REVIEWER = "seaside_tiramisu";
const MAX_FEN_LENGTH = 200;
const MAX_SOLUTION_LENGTH = 10_000;
const MAX_EVENT_LENGTH = 200;
const MAX_EXPLANATION_LENGTH = 5_000;
const MAX_AUTHOR_LENGTH = 200;

const jsonResponse = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const puzzleFieldsSchema = z.object({
  fen: z.string().trim().min(1).max(MAX_FEN_LENGTH),
  solution: z.string().trim().min(1).max(MAX_SOLUTION_LENGTH),
  event: z.string().trim().max(MAX_EVENT_LENGTH).default(""),
  explanation: z.string().trim().max(MAX_EXPLANATION_LENGTH),
  author: z.string().trim().min(1).max(MAX_AUTHOR_LENGTH),
});
const reviewBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("reject"), id: z.number().int().positive() }),
  z.object({
    action: z.literal("approve"),
    id: z.number().int().positive(),
    puzzleId: z.number().int().positive(),
  }),
  puzzleFieldsSchema.extend({ action: z.literal("update"), id: z.number().int().positive() }),
]);
type ReviewBody = z.infer<typeof reviewBodySchema>;

const parseBody = (event: NetlifyEvent): ReviewBody | null => {
  try {
    const result = reviewBodySchema.safeParse(JSON.parse(event.body ?? ""));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }
  if (!isSameOriginRequest(event.headers)) {
    return jsonResponse(403, { error: "Cross-site puzzle reviews are not allowed." });
  }

  const body = parseBody(event);
  if (!body) {
    return jsonResponse(400, { error: "Invalid review action." });
  }
  const { action } = body;

  try {
    if (action !== "list") {
      const identity = await resolveSiteIdentity(event.headers);
      if (!identity.username) {
        return jsonResponse(401, { error: "Log in with Lichess to review puzzles." });
      }
      if (identity.username !== REVIEWER) {
        return jsonResponse(403, { error: "This review queue is restricted." });
      }
    }

    let queuedPuzzleId: number | null = null;
    let normalizedPuzzle: (PuzzleSubmissionValue & { submitted_by: string }) | null = null;
    if (action !== "list") queuedPuzzleId = body.id;
    if (action === "update") {
      const validatedPuzzle = validatePuzzleSubmission({
        fen: body.fen,
        solution: compactPuzzleSolution(body.solution),
        event: body.event,
        explanation: body.explanation,
      });
      normalizedPuzzle = {
        ...validatedPuzzle,
        solution: compactPuzzleSolution(validatedPuzzle.solution),
        submitted_by: body.author,
      };
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

    const fetchNextPuzzleId = async (): Promise<number> => {
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
      return highestPuzzleId + 1;
    };

    if (action === "list") {
      const { data, error } = await supabase
        .from("puzzles_queue")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw new Error(`Unable to load puzzle queue: ${error.message}`);
      if (!data?.length) return jsonResponse(200, { puzzles: [] });

      const nextPuzzleId = await fetchNextPuzzleId();
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
      p_puzzle_id: body.action === "approve" ? body.puzzleId : null,
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
