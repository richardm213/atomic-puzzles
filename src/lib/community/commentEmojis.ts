import { useEffect, useState } from "react";

import {
  isThemeAtomicLogo,
  PLAYER_IMAGE_FLAIR_GROUPS,
  type PlayerFlair,
  playerFlairLabel,
  themeAtomicLogo,
} from "../../../shared/domain/playerSocial";
import { type ColorMode, useColorMode } from "../../context/AppSettings";

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

const customEmojiGroups = PLAYER_IMAGE_FLAIR_GROUPS.map(({ label, flairs }) => ({
  label,
  emojis: flairs.map((code): CustomEmoji => ({
    kind: "custom",
    code,
    label: playerFlairLabel(code),
    names: code === "peepobusiness" ? [code, "pepobusiness"] : [code],
  })),
}));

const groupsForMode = (mode: ColorMode) =>
  customEmojiGroups.map(({ label, emojis }) => ({
    label,
    emojis: emojis.filter(({ code }) => !isThemeAtomicLogo(code) || code === themeAtomicLogo(mode)),
  }));

const themedEmojiGroups = { light: groupsForMode("light"), dark: groupsForMode("dark") };

export const useCustomEmojiGroups = () => themedEmojiGroups[useColorMode()];

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

export const hasNativeEmojiShortcode = (text: string) =>
  Array.from(text.matchAll(commentShortcode)).some(
    ([, code]) => code && !commentEmojiByCode(code, null),
  );

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
  groups: readonly EmojiGroup[],
) => {
  const name = query.trim().replace(/^:|:$/g, "").toLowerCase().replaceAll(" ", "_");
  const custom = searchGroup(
    groups.flatMap(({ emojis }) => emojis),
    name,
    limit,
  );
  const unicode = searchGroup(native?.emojis ?? [], name, limit - custom.length);
  return { custom, unicode };
};
