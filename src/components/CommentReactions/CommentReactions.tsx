import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { EmoteReaction } from "../../../shared/domain/community/schemas";
import { useAuth } from "../../context/AuthContext";
import {
  type CommunityTarget,
  saveCommunityCommentReaction,
} from "../../lib/community/puzzleCommunity";
import {
  ReactionControls,
  type ReactionSelection,
  withReactionSelection,
} from "../ReactionControls/ReactionControls";

const emptyReactions: EmoteReaction[] = [];

export const CommentReactions = ({
  commentId,
  target,
  reactions = emptyReactions,
}: {
  commentId: number;
  target: CommunityTarget;
  reactions?: EmoteReaction[] | undefined;
}) => {
  const { user } = useAuth();
  const viewer = user?.username ?? "anonymous";
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState<{
    source: EmoteReaction[];
    viewer: string;
    reactions: EmoteReaction[];
  } | null>(null);
  const matchesCache = (
    query: { queryKey: readonly unknown[]; state: { data: unknown } },
    selectedViewer = viewer,
  ) => {
    const key = query.queryKey;
    if (
      key[0] !== "community" ||
      !(
        (key[1] === "discussion" && key[5] === selectedViewer) ||
        (key[1] === "site-comments" && key[2] === selectedViewer)
      )
    )
      return false;
    return (
      (query.state.data as { comments?: Array<{ id: number }> } | undefined)?.comments?.some(
        (row) => row.id === commentId,
      ) ?? false
    );
  };
  const mutation = useMutation({
    mutationFn: ({
      selection,
    }: {
      selection: ReactionSelection;
      source: EmoteReaction[];
      viewer: string;
    }) => saveCommunityCommentReaction(target, commentId, selection.reaction, selection.reacted),
    onMutate: () => queryClient.cancelQueries({ predicate: matchesCache }),
    onSuccess: (data, variables) => {
      setConfirmed({
        source: variables.source,
        viewer: variables.viewer,
        reactions: data.reactions,
      });
      // Update the existing aggregate responses; reacting never needs a follow-up GET or a reactor list.
      queryClient.setQueriesData<{ comments: Array<{ id: number; reactions?: EmoteReaction[] }> }>(
        { predicate: (query) => matchesCache(query, variables.viewer) },
        (current) =>
          current && {
            ...current,
            comments: current.comments.map((row) =>
              row.id === commentId ? { ...row, reactions: data.reactions } : row,
            ),
          },
      );
    },
  });
  const current =
    confirmed?.source === reactions && confirmed.viewer === viewer
      ? confirmed.reactions
      : reactions;
  const pending = mutation.isPending && mutation.variables.viewer === viewer;
  return (
    <ReactionControls
      label="Comment reactions"
      reactions={withReactionSelection(current, pending ? mutation.variables.selection : undefined)}
      pending={pending}
      error={mutation.isError && mutation.variables.viewer === viewer}
      onOpen={() => mutation.reset()}
      onReact={(selection) => mutation.mutate({ selection, source: reactions, viewer })}
    />
  );
};
