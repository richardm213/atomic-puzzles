import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { parsePuzzlePgnInput } from "../../src/lib/puzzles/puzzleSubmission";
import {
  createAtomicPosition,
  normalizeSolutionPgn,
  parseSolutionUciLines,
} from "../../src/lib/puzzles/solutionPgn";
import { isSameOriginRequest, resolveSiteIdentity } from "../lib/siteSession";

type NetlifyEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

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

const submissionBodySchema = z.object({
  fen: z.string().trim().min(1).max(MAX_FEN_LENGTH),
  solution: z.string().trim().min(1).max(MAX_SOLUTION_LENGTH),
  event: z.string().trim().max(MAX_EVENT_LENGTH).default(""),
  explanation: z.string().trim().max(MAX_EXPLANATION_LENGTH),
});

const parseBody = (event: NetlifyEvent): z.infer<typeof submissionBodySchema> | null => {
  try {
    const result = submissionBodySchema.safeParse(JSON.parse(event.body ?? ""));
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
    return jsonResponse(403, { error: "Cross-site puzzle submissions are not allowed." });
  }

  const input = parseBody(event);
  if (!input) {
    return jsonResponse(400, { error: "Invalid puzzle submission." });
  }
  const { fen: submittedFen, solution: submittedPgn, event: submittedEvent, explanation } = input;

  try {
    const identity = await resolveSiteIdentity(event.headers);
    if (!identity.username) {
      return jsonResponse(401, { error: "Log in with Lichess to submit a puzzle." });
    }
    const parsedPgn = parsePuzzlePgnInput(submittedPgn, submittedFen);
    const fen = parsedPgn.fen;
    const solution = parsedPgn.solution;
    const eventName = parsedPgn.event || submittedEvent;
    createAtomicPosition(fen);
    if (parseSolutionUciLines(fen, solution).length === 0) {
      return jsonResponse(400, { error: "The moves are not legal from this atomic position." });
    }

    const supabaseUrl =
      process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || "";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Puzzle submission service is not configured.");
    }

    const username = identity.username;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { error: userError } = await supabase
      .from("users")
      .upsert({ username }, { onConflict: "username", ignoreDuplicates: true });
    if (userError) throw new Error(`Unable to verify account: ${userError.message}`);

    const { data, error } = await supabase
      .rpc("enqueue_puzzle_submission", {
        p_fen: fen,
        p_solution: normalizeSolutionPgn(fen, solution),
        p_event: eventName,
        p_explanation: explanation,
        p_submitted_by: username,
      })
      .single();
    if (error?.message.includes("Puzzle FEN already exists in queue")) {
      return jsonResponse(409, { error: "A puzzle with this FEN is already pending review." });
    }
    if (error?.message.includes("Puzzle FEN already exists")) {
      return jsonResponse(409, { error: "A puzzle with this FEN already exists." });
    }
    if (error) throw new Error(`Unable to submit puzzle: ${error.message}`);

    return jsonResponse(201, { puzzle: data });
  } catch (error) {
    if (
      error instanceof Error &&
      /^(Invalid (FEN|atomic position|PGN)|Enter PGN|The PGN)/.test(error.message)
    ) {
      return jsonResponse(400, { error: error.message });
    }
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to submit puzzle.",
    });
  }
};
