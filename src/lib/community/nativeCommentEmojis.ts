import data from "emojibase-data/en/compact.json";
import messages from "emojibase-data/en/messages.json";
import shortcodes from "emojibase-data/en/shortcodes/joypixels.json";

import type { NativeCommentEmoji, NativeEmojiCatalog } from "./commentEmojis";

const emojis: NativeCommentEmoji[] = [];
const byCode = new Map<string, NativeCommentEmoji>();
const groups = new Map(
  messages.groups.map(({ message, order }) => [
    order,
    { label: message, emojis: [] as NativeCommentEmoji[] },
  ]),
);
const components = groups.get(2);

const addEmoji = (entry: (typeof data)[number]) => {
  const fallback = entry.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_$/, "");
  const aliases = shortcodes[entry.hexcode] ?? [];
  const names = [...new Set([...[aliases].flat(), fallback])];
  const emoji: NativeCommentEmoji = {
    kind: "native",
    code: names[0] ?? fallback,
    label: entry.label,
    names,
    unicode: entry.unicode,
  };
  emojis.push(emoji);
  for (const name of names) if (!byCode.has(name)) byCode.set(name, emoji);
  return emoji;
};

for (const entry of data) {
  const group = entry.group === undefined ? components : groups.get(entry.group);
  group?.emojis.push(addEmoji(entry));
  // Keep tone variants searchable in both pickers without repeating them in the default grids.
  for (const skin of entry.skins ?? []) addEmoji(skin);
}

export const nativeEmojiCatalog: NativeEmojiCatalog = {
  groups: [...groups.values()].filter(({ emojis }) => emojis.length > 0),
  emojis,
  byCode,
};
