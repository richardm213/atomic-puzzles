import "./ReactionControls.css";

import { faEllipsisVertical, faFaceSmile, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useId, useRef, useState } from "react";

import type { EmoteReaction } from "../../../shared/domain/community/schemas";
import { useAuth } from "../../context/AuthContext";
import { commentEmojiByCode, useNativeCommentEmojis } from "../../lib/community/commentEmojis";
import { CommentEmojiPicker } from "../CommentEmojiPicker/CommentEmojiPicker";
import { PlayerFlairIcon } from "../PlayerFlair/PlayerFlair";
export type ReactionSelection = Pick<EmoteReaction, "reaction" | "reacted">;
export const withReactionSelection = (
  reactions: EmoteReaction[],
  selection?: ReactionSelection,
) => {
  if (!selection) return reactions;
  const existing = reactions.find(({ reaction }) => reaction === selection.reaction);
  if (!existing) return selection.reacted ? [...reactions, { ...selection, count: 1 }] : reactions;
  if (existing.reacted === selection.reacted) return reactions;
  const count = existing.count + (selection.reacted ? 1 : -1);
  return reactions.flatMap((row) =>
    row !== existing ? [row] : count ? [{ ...selection, count }] : [],
  );
};

export const ReactionControls = ({
  reactions,
  pending,
  error,
  onReact,
  onOpen,
  label,
  commentActions,
}: {
  reactions: EmoteReaction[];
  pending: boolean;
  error: boolean;
  onReact: (selection: ReactionSelection) => void;
  onOpen?: () => void;
  label: string;
  commentActions?: { onEdit?: (() => void) | undefined; editDisabled?: boolean };
}) => {
  const { isAuthenticated, login } = useAuth();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerAbove, setPickerAbove] = useState(false);
  const pickerId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const native = useNativeCommentEmojis(pickerOpen);
  const canReact = () => {
    if (isAuthenticated) return true;
    void login(window.location.pathname + window.location.search + window.location.hash);
    return false;
  };
  const closePicker = () => {
    setPickerOpen(false);
    trigger.current?.focus();
  };
  const triggerLabel = commentActions ? "Comment actions" : "Add reaction";
  return (
    <div
      className={pickerAbove ? "reactionControls reactionPickerAbove" : "reactionControls"}
      role="group"
      aria-label={label}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPickerOpen(false);
      }}
    >
      {reactions.map(({ reaction, reacted, count }) => {
        const emoji = commentEmojiByCode(reaction, null);
        const label = emoji?.label ?? reaction;
        return (
          <button
            key={reaction}
            className="reactionButton"
            type="button"
            title={label}
            aria-label={`${label}, ${count} ${count === 1 ? "reaction" : "reactions"}`}
            aria-pressed={reacted}
            aria-disabled={pending}
            onClick={() => {
              if (!pending && canReact()) onReact({ reaction, reacted: !reacted });
            }}
          >
            {emoji?.kind === "custom" ? (
              <PlayerFlairIcon flair={emoji.code} decorative />
            ) : (
              <span aria-hidden="true">{reaction}</span>
            )}
            <span className="reactionCount">{count}</span>
          </button>
        );
      })}
      <button
        ref={trigger}
        className={`reactionButton reactionAdd${commentActions ? " commentActionsTrigger" : ""}`}
        type="button"
        title={triggerLabel}
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
        aria-controls={pickerOpen ? pickerId : undefined}
        aria-disabled={pending}
        onClick={(event) => {
          if (pending || (!commentActions && !canReact())) return;
          if (pickerOpen) {
            closePicker();
            return;
          }
          const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
          const below = window.innerHeight - (bounds?.bottom ?? 0);
          setPickerAbove(below < 395 && (bounds?.top ?? 0) > below);
          onOpen?.();
          setPickerOpen(true);
        }}
      >
        {commentActions ? (
          <FontAwesomeIcon icon={faEllipsisVertical} aria-hidden="true" />
        ) : (
          <>
            <FontAwesomeIcon icon={faFaceSmile} aria-hidden="true" />
            <FontAwesomeIcon icon={faPlus} aria-hidden="true" />
          </>
        )}
      </button>
      {pickerOpen ? (
        <CommentEmojiPicker
          id={pickerId}
          native={native}
          onClose={closePicker}
          {...(commentActions?.onEdit
            ? {
                onEdit: () => {
                  closePicker();
                  commentActions.onEdit?.();
                },
                editDisabled: Boolean(commentActions.editDisabled),
              }
            : {})}
          onSelect={(emoji) => {
            const reaction = emoji.kind === "custom" ? emoji.code : emoji.unicode;
            closePicker();
            if (
              !pending &&
              canReact() &&
              !reactions.some((row) => row.reaction === reaction && row.reacted)
            ) {
              onReact({ reaction, reacted: true });
            }
          }}
        />
      ) : null}
      {error ? (
        <span className="reactionError" role="alert">
          Unable to save reaction.
        </span>
      ) : null}
    </div>
  );
};
