import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { profileReactionsSchema } from "../../../shared/domain/community/schemas";
import { useAuth } from "../../context/AuthContext";
import { postApi } from "../../lib/api/postApi";
import {
  ReactionControls,
  type ReactionSelection,
  withReactionSelection,
} from "../ReactionControls/ReactionControls";

export const ProfileReactions = ({ username }: { username: string }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["profile-reactions", username, user?.username ?? null] as const;
  const reactions = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      postApi(
        "/api/puzzles/community",
        { action: "profileReactions", username },
        { signal, schema: profileReactionsSchema, errorMessage: "Unable to load reactions." },
      ),
    staleTime: 30_000,
  });
  const mutation = useMutation({
    mutationFn: ({
      selection,
      username,
    }: {
      selection: ReactionSelection;
      username: string;
      queryKey: typeof queryKey;
    }) =>
      postApi(
        "/api/puzzles/community",
        { action: "setProfileReaction", username, ...selection },
        { schema: profileReactionsSchema, errorMessage: "Unable to save reaction." },
      ),
    onMutate: ({ queryKey }) => queryClient.cancelQueries({ queryKey }),
    onSuccess: (data, { queryKey }) => {
      queryClient.setQueryData(queryKey, data);
    },
  });
  const pending =
    mutation.isPending &&
    mutation.variables.queryKey.every((value, index) => value === queryKey[index]);
  return (
    <ReactionControls
      label="Profile reactions"
      reactions={withReactionSelection(
        reactions.data?.reactions ?? [],
        pending ? mutation.variables.selection : undefined,
      )}
      pending={pending}
      error={mutation.isError}
      onOpen={() => mutation.reset()}
      onReact={(selection) => mutation.mutate({ selection, username, queryKey })}
    />
  );
};
