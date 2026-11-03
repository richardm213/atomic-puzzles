import { z } from "zod";

import {
  authenticateRequest,
  identityResponse,
  requireSameOrigin,
} from "../platform/authentication";
import { defineFunction, type FunctionEvent } from "../platform/defineFunction";
import { createServerSupabase } from "../platform/environment";
import { HttpError } from "../platform/errors";
import { parseJsonBody } from "../platform/validation";

const modeSchema = z.enum([
  "pawn-duel",
  "blockade",
  "two-queens",
  "rook-vs-pawn",
  "rook-bishop-vs-king",
  "rook-pawn-vs-pawn",
]);
const categorySchema = z.union([
  z.literal("no-pawn"),
  z.string().regex(/^(rook|knight|regular)-file:rank-(3|regular|7)$/),
]);
const requestSchema = z.object({
  action: z.enum(["load", "record"]),
  mode: modeSchema,
  category: categorySchema,
  guestId: z.string().uuid(),
  guestName: z.string().trim().min(1).max(24),
  durationMs: z.number().int().min(100).max(3_600_000).optional(),
});

type Row = {
  id: number;
  player_name: string;
  duration_ms: number;
  completed_at: string;
  player_key?: string;
};

const responseRow = (row: Row) => ({
  id: String(row.id),
  player: row.player_name,
  durationMs: row.duration_ms,
  completedAt: row.completed_at,
});

export const endgamePracticeRoute = async (event: FunctionEvent) => {
  requireSameOrigin(event.headers, "Cross-site endgame requests are not allowed.");
  const input = parseJsonBody(event, requestSchema, "Invalid endgame-practice request.");
  const usesPawnCategories =
    input.mode === "pawn-duel" || input.mode === "blockade" || input.mode === "rook-pawn-vs-pawn";
  if (usesPawnCategories === (input.category === "no-pawn")) {
    throw new HttpError(400, "Choose a valid endgame category.");
  }
  const identity = await authenticateRequest(event.headers, true);
  const playerName = identity.username ?? input.guestName;
  const playerKey = identity.username ? `user:${identity.username}` : `guest:${input.guestId}`;
  const supabase = createServerSupabase("Endgame practice service");

  if (input.action === "record") {
    if (input.durationMs === undefined) throw new HttpError(400, "A solve time is required.");
    const { error } = await supabase.rpc("record_endgame_practice_best", {
      p_player_key: playerKey,
      p_player_name: playerName,
      p_mode: input.mode,
      p_category: input.category,
      p_duration_ms: input.durationMs,
    });
    if (error) throw new Error(`Unable to save endgame time: ${error.message}`);
  }

  const [{ data: rows, error: rowsError }, { data: ownRows, error: ownError }] = await Promise.all([
    supabase
      .from("endgame_practice_bests")
      .select("id,player_name,duration_ms,completed_at")
      .eq("mode", input.mode)
      .eq("category", input.category)
      .order("duration_ms", { ascending: true })
      .limit(10),
    supabase
      .from("endgame_practice_bests")
      .select("id,player_name,duration_ms,completed_at")
      .eq("player_key", playerKey)
      .eq("mode", input.mode)
      .eq("category", input.category)
      .limit(1),
  ]);
  if (rowsError || ownError) throw new Error("Unable to load endgame times.");
  const ownBest = (ownRows as Row[] | null)?.[0] ?? null;
  return identityResponse(identity, 200, {
    entries: ((rows ?? []) as Row[]).map(responseRow),
    ownBest: ownBest ? responseRow(ownBest) : null,
  });
};

export const handler = defineFunction(endgamePracticeRoute, {
  methods: ["POST"],
  fallbackMessage: "Unable to update endgame practice.",
});

export const config = {
  path: "/api/endgame-practice",
  rateLimit: { windowLimit: 90, windowSize: 60, aggregateBy: ["ip", "domain"] },
} as const;
