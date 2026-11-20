import { useEffect, useState } from "react";

import {
  PLAYER_IMAGE_FLAIR_GROUPS,
  type PlayerFlair,
  playerFlairLabel,
} from "../../../shared/domain/playerSocial";

type CustomEmoji = {
  kind: "custom";
  code: PlayerFlair;
  label: string;
  names: readonly string[];
};

export type NativeCommentEmoji = {
  kind: "native";
  code: string;
  label: string;
  names: readonly string[];
  unicode: string;
};

export type CommentEmoji = CustomEmoji | NativeCommentEmoji;
export type EmojiGroup = { label: string; emojis: readonly CommentEmoji[] };

export const customEmojiGroups: EmojiGroup[] = PLAYER_IMAGE_FLAIR_GROUPS.map(
  ({ label, flairs }) => ({
    label,
    emojis: flairs.map((code) => ({
      kind: "custom",
      code,
      label: playerFlairLabel(code),
      names: code === "peepobusiness" ? [code, "pepobusiness"] : [code],
    })),
  }),
);

const customEmojis = customEmojiGroups.flatMap(({ emojis }) => emojis);
const customByCode = new Map(
  customEmojis.flatMap((emoji) => emoji.names.map((name) => [name, emoji] as const)),
);

export const commentShortcode = /(?<![\p{L}\p{N}_/]):([a-z0-9_+\-]{1,80}):/giu;

export const commentEmojiByCode = (
  code: string,
  native: NativeEmojiCatalog | null,
): CommentEmoji | undefined =>
  customByCode.get(code.toLowerCase()) ?? native?.byCode.get(code.toLowerCase());

export type NativeEmojiCatalog = {
  groups: EmojiGroup[];
  emojis: NativeCommentEmoji[];
  byCode: Map<string, NativeCommentEmoji>;
};

let catalog: NativeEmojiCatalog | null = null;

export const useNativeCommentEmojis = (enabled: boolean) => {
  const [native, setNative] = useState(catalog);
  useEffect(() => {
    if (!enabled || native) return undefined;
    let active = true;
    void import("./nativeCommentEmojis")
      .then(({ nativeEmojiCatalog }) => {
        catalog = nativeEmojiCatalog;
        if (active) setNative(catalog);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [enabled, native]);
  return native;
};

const searchGroup = (emojis: readonly CommentEmoji[], query: string, limit: number) => {
  const exact: CommentEmoji[] = [];
  const prefix: CommentEmoji[] = [];
  const partial: CommentEmoji[] = [];
  for (const emoji of emojis) {
    if (emoji.names.includes(query)) exact.push(emoji);
    else if (emoji.names.some((name) => name.startsWith(query))) prefix.push(emoji);
    else if (
      emoji.names.some((name) => name.includes(query)) ||
      emoji.label.toLowerCase().includes(query.replaceAll("_", " "))
    )
      partial.push(emoji);
  }
  return [...exact, ...prefix, ...partial].slice(0, limit);
};

export const searchCommentEmojis = (
  query: string,
  native: NativeEmojiCatalog | null,
  limit: number,
) => {
  const name = query.trim().replace(/^:|:$/g, "").toLowerCase().replaceAll(" ", "_");
  const custom = searchGroup(customEmojis, name, limit);
  const unicode = searchGroup(native?.emojis ?? [], name, limit - custom.length);
  return { custom, unicode };
};
