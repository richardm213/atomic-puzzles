import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isPuzzleMotifTag, normalizePuzzleMotifTags } from "../../src/lib/puzzles/puzzleMotifs";
import { isSameOriginRequest, resolveSiteIdentity } from "../lib/siteSession";

type NetlifyEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

const TAG_EDITOR = "seaside_tiramisu";

const jsonResponse = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const updateTagsSchema = z
  .object({
    puzzleId: z.number().int().positive(),
    tags: z.array(z.string()),
  })
  .refine(({ tags }) => tags.every(isPuzzleMotifTag), { message: "Unknown puzzle motif." })
  .refine(({ tags }) => new Set(tags).size === tags.length, {
    message: "Puzzle motifs must be unique.",
  });

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }
  if (!isSameOriginRequest(event.headers)) {
    return jsonResponse(403, { error: "Cross-site puzzle tag changes are not allowed." });
  }

  let input: z.infer<typeof updateTagsSchema>;
  try {
    const parsed = updateTagsSchema.safeParse(JSON.parse(event.body ?? ""));
    if (!parsed.success) return jsonResponse(400, { error: "Invalid puzzle motifs." });
    input = parsed.data;
  } catch {
    return jsonResponse(400, { error: "Invalid puzzle motifs." });
  }

  try {
    const identity = await resolveSiteIdentity(event.headers);
    if (!identity.username) {
      return jsonResponse(401, { error: "Log in with Lichess to edit puzzle motifs." });
    }
    if (identity.username !== TAG_EDITOR) {
      return jsonResponse(403, { error: "Only seaside_tiramisu can edit puzzle motifs." });
    }

    const supabaseUrl =
      process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || "";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Puzzle motif service is not configured.");
    }

    const tags = normalizePuzzleMotifTags(input.tags);
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { data, error } = await supabase
      .from("puzzles")
      .update({ tags })
      .eq("id", input.puzzleId)
      .select("id,tags")
      .single();

    if (error) throw new Error(`Unable to update puzzle motifs: ${error.message}`);
    if (!data) return jsonResponse(404, { error: "Puzzle not found." });

    return jsonResponse(200, {
      puzzleId: Number(data.id),
      tags: normalizePuzzleMotifTags(data.tags),
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to update puzzle motifs.",
    });
  }
};
