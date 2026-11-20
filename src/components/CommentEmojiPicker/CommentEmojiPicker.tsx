import "./CommentEmojiPicker.css";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import {
  type CommentEmoji,
  customEmojiGroups,
  type NativeEmojiCatalog,
  searchCommentEmojis,
} from "../../lib/community/commentEmojis";
import { PlayerFlairIcon } from "../PlayerFlair/PlayerFlair";

export const CommentEmojiIcon = ({ emoji }: { emoji: CommentEmoji }) =>
  emoji.kind === "custom" ? (
    <PlayerFlairIcon flair={emoji.code} decorative />
  ) : (
    <span aria-hidden="true">{emoji.unicode}</span>
  );

export const CommentEmojiPicker = ({
  id,
  native,
  onSelect,
  onClose,
}: {
  id: string;
  native: NativeEmojiCatalog | null;
  onSelect: (emoji: CommentEmoji) => void;
  onClose: () => void;
}) => {
  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const searching = Boolean(query.trim());
  const matches = searching ? searchCommentEmojis(query, native, 120) : null;
  const groups = matches
    ? [
        { label: "Emotes and Atomic logos", emojis: matches.custom },
        { label: "Native emoji", emojis: matches.unicode },
      ]
    : [
        ...customEmojiGroups,
        ...(native?.groups.filter(({ label }) => label === (category || native.groups[0]?.label)) ??
          []),
      ];
  const first = groups.find(({ emojis }) => emojis.length)?.emojis[0];

  useEffect(() => searchRef.current?.focus(), []);

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return false;
    event.preventDefault();
    event.stopPropagation();
    onClose();
    return true;
  };

  const handleGridKeys = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (closeOnEscape(event) || !event.key.startsWith("Arrow")) return;
    const button = event.currentTarget;
    const buttons = [...(button.parentElement?.querySelectorAll("button") ?? [])];
    const index = buttons.indexOf(button);
    let next: HTMLButtonElement | undefined;
    if (event.key === "ArrowLeft") next = buttons[index - 1];
    if (event.key === "ArrowRight") next = buttons[index + 1];
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const direction = event.key === "ArrowUp" ? -1 : 1;
      const row = buttons
        .filter((item) => (item.offsetTop - button.offsetTop) * direction > 0)
        .sort(
          (a, b) =>
            (a.offsetTop - b.offsetTop) * direction ||
            Math.abs(a.offsetLeft - button.offsetLeft) - Math.abs(b.offsetLeft - button.offsetLeft),
        );
      next = row[0];
    }
    if (next) {
      event.preventDefault();
      next.focus();
    }
  };

  return (
    <div id={id} className="commentEmojiPicker" role="dialog" aria-label="Choose an emote">
      <div className="commentEmojiPickerControls">
        <input
          ref={searchRef}
          type="search"
          aria-label="Search emotes"
          placeholder="Search emotes"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (bodyRef.current) bodyRef.current.scrollTop = 0;
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || closeOnEscape(event)) return;
            if (event.key === "ArrowDown" && first) {
              event.preventDefault();
              bodyRef.current?.querySelector("button")?.focus();
            } else if (event.key === "Enter" && first) {
              event.preventDefault();
              onSelect(first);
            }
          }}
        />
        {!searching && native ? (
          <select
            aria-label="Native emoji category"
            value={category || native.groups[0]?.label}
            onChange={(event) => {
              setCategory(event.target.value);
              if (bodyRef.current) bodyRef.current.scrollTop = 0;
            }}
            onKeyDown={closeOnEscape}
          >
            {native.groups.map(({ label }) => (
              <option key={label}>{label}</option>
            ))}
          </select>
        ) : null}
      </div>
      <div ref={bodyRef} className="commentEmojiPickerBody">
        {groups.map(({ label, emojis }) =>
          emojis.length ? (
            <section key={label} aria-label={label}>
              <h3>{label}</h3>
              <div className="commentEmojiGrid">
                {emojis.map((emoji) => (
                  <button
                    key={emoji.kind === "native" ? emoji.unicode : emoji.code}
                    type="button"
                    title={`:${emoji.code}:`}
                    aria-label={`:${emoji.code}:`}
                    onClick={() => onSelect(emoji)}
                    onKeyDown={handleGridKeys}
                  >
                    <CommentEmojiIcon emoji={emoji} />
                  </button>
                ))}
              </div>
            </section>
          ) : null,
        )}
        {!first && native ? <p role="status">No emotes found</p> : null}
      </div>
    </div>
  );
};
