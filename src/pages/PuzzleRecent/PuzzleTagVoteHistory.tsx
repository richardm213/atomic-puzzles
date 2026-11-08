import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import type { z } from "zod";

import type { puzzleTagVoteEventsPageSchema } from "../../../shared/domain/puzzles/puzzleTagVotes";
import { InlineState } from "../../components/InlineState/InlineState";
import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import { puzzleMotifs } from "../../lib/puzzles/puzzleMotifs";
import {
  fetchAdminPuzzleTagVotes,
  markAdminPuzzleTagVoteIncorrect,
} from "../../lib/supabase/puzzleAdmin";
import { getErrorMessage } from "../../utils/errors";
import { formatLocalDateTime } from "../../utils/formatters";
import styles from "./PuzzleTagVoteHistory.module.css";

type VotePage = z.infer<typeof puzzleTagVoteEventsPageSchema>;

const tagNames = new Map(puzzleMotifs.map(({ tag, name }) => [tag, name]));
const directionLabel = { "-1": "Downvoted", 0: "Withdrew vote", 1: "Upvoted" } as const;

export const PuzzleTagVoteHistory = ({ puzzleId }: { puzzleId: number }) => {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = ["admin-puzzle-tag-votes", puzzleId] as const;
  const votes = useInfiniteQuery({
    queryKey,
    enabled: open,
    initialPageParam: null as number | null,
    queryFn: ({ pageParam, signal }) => fetchAdminPuzzleTagVotes(puzzleId, pageParam, signal),
    getNextPageParam: (lastPage) => lastPage.nextBeforeId,
  });
  const review = useMutation({
    mutationFn: (voteId: number) => markAdminPuzzleTagVoteIncorrect(puzzleId, voteId),
    onSuccess: ({ reviewedAt }, voteId) => {
      queryClient.setQueryData<InfiniteData<VotePage>>(queryKey, (current) =>
        current
          ? {
              ...current,
              pages: current.pages.map((page) => ({
                ...page,
                events: page.events.map((vote) =>
                  vote.id === voteId ? { ...vote, reviewed_at: reviewedAt } : vote,
                ),
              })),
            }
          : current,
      );
      void queryClient.invalidateQueries({ queryKey: ["coins"] });
    },
  });
  const events = votes.data?.pages.flatMap((page) => page.events) ?? [];

  return (
    <details className={styles.history} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Tag vote history</summary>
      {open ? (
        <div className={styles.content}>
          {votes.isPending && !votes.isError ? (
            <InlineState role="status">Loading tag votes…</InlineState>
          ) : null}
          {votes.isError ? (
            <InlineState kind="error">
              {getErrorMessage(votes.error, "Unable to load tag votes.")}
              <button
                type="button"
                className="queueSecondaryButton"
                onClick={() => void votes.refetch()}
              >
                Retry
              </button>
            </InlineState>
          ) : null}
          {votes.isSuccess && events.length === 0 ? (
            <InlineState kind="empty">No tag votes recorded.</InlineState>
          ) : null}
          {events.length ? (
            <ul className={styles.events}>
              {events.map((vote) => {
                const tag = tagNames.get(vote.tag) ?? vote.tag;
                return (
                  <li key={vote.id}>
                    <div className={styles.vote}>
                      <strong>{tag}</strong>
                      <span>
                        {directionLabel[vote.direction]} by
                        <PlayerLink username={vote.voter} variant="puzzles">
                          {vote.voter}
                        </PlayerLink>
                      </span>
                      {vote.occurred_at ? (
                        <time dateTime={vote.occurred_at}>
                          {formatLocalDateTime(vote.occurred_at)}
                        </time>
                      ) : (
                        <span>Recorded before vote history</span>
                      )}
                    </div>
                    {vote.reviewed_at ? (
                      <span className={styles.incorrect}>Marked incorrect</span>
                    ) : vote.direction !== 0 ? (
                      <button
                        type="button"
                        className={`queueSecondaryButton ${styles.action}`}
                        aria-label={`Mark ${vote.voter}’s ${tag} vote incorrect`}
                        disabled={review.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Mark ${vote.voter}’s vote on ${tag} incorrect? This deducts up to 1 coin without changing the vote.`,
                            )
                          )
                            review.mutate(vote.id);
                        }}
                      >
                        {review.isPending && review.variables === vote.id
                          ? "Marking…"
                          : "Mark incorrect"}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {review.isError ? (
            <InlineState kind="error">
              {getErrorMessage(review.error, "Unable to mark vote incorrect.")}
            </InlineState>
          ) : null}
          {review.isSuccess ? (
            <span className={styles.incorrect} role="status">
              Vote marked incorrect.
            </span>
          ) : null}
          {votes.hasNextPage ? (
            <button
              type="button"
              className={`queueSecondaryButton ${styles.action}`}
              disabled={votes.isFetching}
              onClick={() => void votes.fetchNextPage()}
            >
              {votes.isFetchingNextPage ? "Loading…" : "Load older votes"}
            </button>
          ) : null}
        </div>
      ) : null}
    </details>
  );
};
