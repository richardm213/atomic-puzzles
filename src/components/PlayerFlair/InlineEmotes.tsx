import type { ReactNode } from "react";

import {
  commentEmojiByCode,
  commentShortcode,
  hasNativeEmojiShortcode,
  useNativeCommentEmojis,
} from "../../lib/community/commentEmojis";
import { PlayerFlairIcon } from "./PlayerFlair";

export const InlineEmotes = ({ text }: { text: string }) => {
  const native = useNativeCommentEmojis(hasNativeEmojiShortcode(text));
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(commentShortcode)) {
    const code = match[1];
    const emoji = code ? commentEmojiByCode(code, native) : undefined;
    if (!emoji) continue;
    parts.push(text.slice(cursor, match.index));
    parts.push(
      emoji.kind === "custom" ? (
        <PlayerFlairIcon key={match.index} className="inlineEmoteImage" flair={emoji.code} />
      ) : (
        emoji.unicode
      ),
    );
    cursor = match.index + match[0].length;
  }

  return (
    <>
      {parts}
      {text.slice(cursor)}
    </>
  );
};
