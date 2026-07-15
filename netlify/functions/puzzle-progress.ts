import { createClient } from "@supabase/supabase-js";

import { parseBearerToken, verifyLichessAccount } from "../lib/lichessAccount";

type NetlifyEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

type ProgressBody = {
  puzzleId?: unknown;
  puzzleCorrect?: unknown;
  incorrectMove?: unknown;
};

const jsonResponse = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const parseBody = (event: NetlifyEvent): ProgressBody | null => {
  try {
    const parsed = JSON.parse(event.body ?? "");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as ProgressBody)
      : null;
  } catch {
    return null;
  }
};

const getSupabase = () => {
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Puzzle progress service is not configured.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
};

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  const accessToken = parseBearerToken(event.headers);
  if (!accessToken) return jsonResponse(401, { error: "Log in with Lichess first." });

  const input = parseBody(event);
  const puzzleId = String(input?.puzzleId ?? "").trim();
  const puzzleCorrect = input?.puzzleCorrect;
  const incorrectMove =
    typeof input?.incorrectMove === "string" ? input.incorrectMove.trim().slice(0, 100) || null : null;
  if (!/^\d{1,20}$/.test(puzzleId) || typeof puzzleCorrect !== "boolean") {
    return jsonResponse(400, { error: "Invalid puzzle progress request." });
  }

  try {
    const account = await verifyLichessAccount(accessToken);
    const username = account?.username?.trim().toLowerCase() ?? "";
    if (!username) return jsonResponse(401, { error: "Your Lichess login is no longer valid." });

    const { error } = await getSupabase().rpc("record_first_puzzle_attempt", {
      p_username: username,
      p_puzzle_id: puzzleId,
      p_puzzle_correct: puzzleCorrect,
      p_incorrect_move: puzzleCorrect ? null : incorrectMove,
    });
    if (error) throw new Error(`Unable to record puzzle progress: ${error.message}`);

    return jsonResponse(200, { recorded: true, username });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to record puzzle progress.",
    });
  }
};
