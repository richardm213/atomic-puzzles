import type { SupabaseClient } from "@supabase/supabase-js";

export const loadPuzzlePublicationAwards = async (
  supabase: SupabaseClient,
  username: string,
  puzzleIds: number[],
): Promise<Map<number, number>> => {
  const awards = new Map<number, number>();
  if (!puzzleIds.length) return awards;

  try {
    const ids = [...new Set(puzzleIds)];
    const creationIds = new Map(ids.map((id) => [`puzzle:${id}`, id]));
    const { data, error } = await supabase
      .from("coin_transactions")
      .select("reason, source_key, amount, metadata")
      .eq("username", username)
      .or(
        `and(reason.eq.puzzle_created,source_key.in.(${[...creationIds.keys()].join(",")})),` +
          `and(reason.eq.puzzle_tagging,metadata->>submission.eq.true,metadata->>action.eq.proposed,metadata->>puzzleId.in.(${ids.join(",")}))`,
      );
    if (error) throw error;

    const tagRewards = new Map<number, number>();
    for (const receipt of data ?? []) {
      if (receipt.reason === "puzzle_created") {
        const id = creationIds.get(receipt.source_key);
        if (id !== undefined) awards.set(id, receipt.amount);
      } else if (receipt.reason === "puzzle_tagging") {
        const id = Number(receipt.metadata?.puzzleId);
        tagRewards.set(id, (tagRewards.get(id) ?? 0) + receipt.amount);
      }
    }
    // Submission tag credits belong to the approval only when a creation receipt exists.
    for (const [id, amount] of awards) {
      awards.set(id, amount + (tagRewards.get(id) ?? 0));
    }
  } catch (error) {
    // Award lookup must not turn a completed publication into a retryable failure.
    console.error("Unable to read puzzle publication coin receipts", error);
  }
  return awards;
};
