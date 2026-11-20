import "./CommentMarkdown.css";

import type { Element, Root, RootContent, Text } from "hast";
import Markdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import {
  commentEmojiByCode,
  commentShortcode,
  type NativeEmojiCatalog,
  useNativeCommentEmojis,
} from "../../lib/community/commentEmojis";
import { PlayerFlairIcon } from "../PlayerFlair/PlayerFlair";
import { PlayerLink } from "../PlayerLink/PlayerLink";

const inlinePattern = new RegExp(`(?<![a-z0-9_-])@([a-z0-9_-]+)|${commentShortcode.source}`, "giu");

const renderInlineContent =
  ({ emotes, native }: { emotes: boolean; native: NativeEmojiCatalog | null }) =>
  (root: Root) => {
    const visit = (parent: Root | Element): void => {
      parent.children = parent.children.flatMap((node): RootContent[] => {
        if (node.type === "element" && !["a", "code", "pre"].includes(node.tagName)) visit(node);
        if (node.type !== "text") return [node];

        const parts: Array<Element | Text> = [];
        let cursor = 0;
        for (const match of node.value.matchAll(inlinePattern)) {
          const [text, username, shortcode] = match;
          const emoji = emotes && shortcode ? commentEmojiByCode(shortcode, native) : undefined;
          if (!username && !emoji) continue;

          parts.push({ type: "text", value: node.value.slice(cursor, match.index) });
          if (username) {
            parts.push({
              type: "element",
              tagName: "a",
              properties: { href: `/@/${username.toLowerCase()}`, dataCommentMention: username },
              children: [{ type: "text", value: text }],
            });
          } else if (emoji?.kind === "custom") {
            parts.push({
              type: "element",
              tagName: "span",
              properties: { dataCommentEmoji: emoji.code },
              children: [{ type: "text", value: text }],
            });
          } else if (emoji) {
            parts.push({ type: "text", value: emoji.unicode });
          }
          cursor = match.index + text.length;
        }
        if (!parts.length) return [node];
        return [...parts, { type: "text", value: node.value.slice(cursor) }];
      });
    };
    visit(root);
  };

const components: Components = {
  a: ({ node, children, href, title }) => {
    const mention = node?.properties.dataCommentMention;
    if (typeof mention === "string") {
      return (
        <PlayerLink className="commentMention" username={mention.toLowerCase()}>
          {children}
        </PlayerLink>
      );
    }
    if (!href) return <span>{children}</span>;
    return (
      <a href={href} title={title}>
        {children}
      </a>
    );
  },
  span: ({ node, children }) => {
    const code = node?.properties.dataCommentEmoji;
    const emoji = typeof code === "string" ? commentEmojiByCode(code, null) : undefined;
    return emoji?.kind === "custom" ? (
      <PlayerFlairIcon className="commentEmoteImage" flair={emoji.code} />
    ) : (
      <span>{children}</span>
    );
  },
  // Don't make visitors' browsers load remote images from untrusted comment text.
  img: ({ alt }) => <span>{alt}</span>,
  table: ({ children }) => (
    <div className="commentMarkdownTable">
      <table>{children}</table>
    </div>
  ),
};

export const CommentMarkdown = ({
  body,
  className,
  emotes = true,
}: {
  body: string;
  className: string;
  emotes?: boolean;
}) => {
  const hasNativeShortcode =
    emotes &&
    [...body.matchAll(commentShortcode)].some(
      ([, code]) => code && !commentEmojiByCode(code, null),
    );
  const native = useNativeCommentEmojis(hasNativeShortcode);

  return (
    <div className={`commentMarkdown ${className}`}>
      <Markdown
        skipHtml
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[[renderInlineContent, { emotes, native }]]}
        components={components}
      >
        {body}
      </Markdown>
    </div>
  );
};
