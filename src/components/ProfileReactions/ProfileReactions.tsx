import "./ProfileReactions.css";

import { faFaceSmile, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";

import {
  type ProfileReaction,
  profileReactionsSchema,
} from "../../../shared/domain/community/schemas";
import { useAuth } from "../../context/AuthContext";
import { postApi } from "../../lib/api/postApi";
import { commentEmojiByCode, useNativeCommentEmojis } from "../../lib/community/commentEmojis";
import { CommentEmojiPicker } from "../CommentEmojiPicker/CommentEmojiPicker";
import { PlayerFlairIcon } from "../PlayerFlair/PlayerFlair";

type Selection = Pick<ProfileReaction, "reaction" | "reacted">;

const withSelection = (reactions: ProfileReaction[], selection?: Selection) => {
  if (!selection) return reactions;
  const existing = reactions.find(({ reaction }) => reaction === selection.reaction);
  if (!existing) return selection.reacted ? [...reactions, { ...selection, count: 1 }] : reactions;
  if (existing.reacted === selection.reacted) return reactions;
  const count = existing.count + (selection.reacted ? 1 : -1);
  return reactions.flatMap((row) =>
    row !== existing ? [row] : count ? [{ ...selection, count }] : [],
  );
};

export const ProfileReactions = ({ username }: { username: string }) => {
  const { isAuthenticated, login, user } = useAuth();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerAbove, setPickerAbove] = useState(false);
  const pickerId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const native = useNativeCommentEmojis(pickerOpen);
  const queryClient = useQueryClient();
  const queryKey = ["profile-reactions", username, user?.username ?? null] as const;

  const reactions = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      postApi(
        "/api/puzzles/community",
        { action: "profileReactions", username },
        {
          signal,
          schema: profileReactionsSchema,
          errorMessage: "Unable to load reactions.",
        },
      ),
    staleTime: 30_000,
  });
  const mutation = useMutation({
    mutationFn: (selection: Selection) =>
      postApi(
        "/api/puzzles/community",
        { action: "setProfileReaction", username, ...selection },
        {
          schema: profileReactionsSchema,
          errorMessage: "Unable to save reaction.",
        },
      ),
    onMutate: () => queryClient.cancelQueries({ queryKey }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
    },
  });

  const canReact = () => {
    if (isAuthenticated) return true;
    void login(window.location.pathname + window.location.search + window.location.hash);
    return false;
  };
  const closePicker = () => {
    setPickerOpen(false);
    trigger.current?.focus();
  };
  const displayed = withSelection(
    reactions.data?.reactions ?? [],
    mutation.isPending ? mutation.variables : undefined,
  );

  return (
    <div
      className={pickerAbove ? "profileReactions profileReactionsPickerAbove" : "profileReactions"}
      role="group"
      aria-label="Profile reactions"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPickerOpen(false);
      }}
    >
      {displayed.map(({ reaction, reacted, count }) => {
        const emoji = commentEmojiByCode(reaction, null);
        const label = emoji?.label ?? reaction;
        return (
          <button
            key={reaction}
            className="profileReactionButton"
            type="button"
            title={label}
            aria-label={`${label}, ${count} ${count === 1 ? "reaction" : "reactions"}`}
            aria-pressed={reacted}
            aria-disabled={mutation.isPending}
            onClick={() => {
              if (!mutation.isPending && canReact())
                mutation.mutate({ reaction, reacted: !reacted });
            }}
          >
            {emoji?.kind === "custom" ? (
              <PlayerFlairIcon flair={emoji.code} decorative />
            ) : (
              <span aria-hidden="true">{reaction}</span>
            )}
            <span className="profileReactionCount">{count}</span>
          </button>
        );
      })}
      <button
        ref={trigger}
        className="profileReactionButton profileReactionAdd"
        type="button"
        title="Add reaction"
        aria-label="Add reaction"
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
        aria-controls={pickerOpen ? pickerId : undefined}
        aria-disabled={mutation.isPending}
        onClick={(event) => {
          if (mutation.isPending || !canReact()) return;
          if (pickerOpen) {
            closePicker();
            return;
          }
          const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
          const below = window.innerHeight - (bounds?.bottom ?? 0);
          setPickerAbove(below < 395 && (bounds?.top ?? 0) > below);
          mutation.reset();
          setPickerOpen(true);
        }}
      >
        <FontAwesomeIcon icon={faFaceSmile} aria-hidden="true" />
        <FontAwesomeIcon icon={faPlus} aria-hidden="true" />
      </button>
      {pickerOpen ? (
        <CommentEmojiPicker
          id={pickerId}
          native={native}
          onClose={closePicker}
          onSelect={(emoji) => {
            const reaction = emoji.kind === "custom" ? emoji.code : emoji.unicode;
            closePicker();
            if (
              isAuthenticated &&
              !displayed.some((row) => row.reaction === reaction && row.reacted)
            ) {
              mutation.mutate({ reaction, reacted: true });
            }
          }}
        />
      ) : null}
      {mutation.isError ? (
        <span className="profileReactionError" role="alert">
          Unable to save reaction.
        </span>
      ) : null}
    </div>
  );
};
