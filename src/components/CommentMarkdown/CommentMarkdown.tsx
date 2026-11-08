import "./CommentMarkdown.css";

import type { Element, Root, RootContent, Text } from "hast";
import Markdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { PlayerLink } from "../PlayerLink/PlayerLink";

const mentionPattern = /(^|[^a-z0-9_-])@([a-z0-9_-]+)/gi;

const linkMentions = () => (root: Root) => {
  const visit = (parent: Root | Element): void => {
    parent.children = parent.children.flatMap((node): RootContent[] => {
      if (node.type === "element" && !["a", "code", "pre"].includes(node.tagName)) visit(node);
      if (node.type !== "text") return [node];

      const parts: Array<Element | Text> = [];
      let cursor = 0;
      for (const match of node.value.matchAll(mentionPattern)) {
        const [, prefix = "", username] = match;
        if (!username) continue;
        const start = match.index + prefix.length;
        parts.push({ type: "text", value: node.value.slice(cursor, start) });
        parts.push({
          type: "element",
          tagName: "a",
          properties: { href: `/@/${username.toLowerCase()}`, dataCommentMention: username },
          children: [{ type: "text", value: `@${username}` }],
        });
        cursor = start + username.length + 1;
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
  // Don't make visitors' browsers load remote images from untrusted comment text.
  img: ({ alt }) => <span>{alt}</span>,
  table: ({ children }) => (
    <div className="commentMarkdownTable">
      <table>{children}</table>
    </div>
  ),
};

export const CommentMarkdown = ({ body, className }: { body: string; className: string }) => (
  <div className={`commentMarkdown ${className}`}>
    <Markdown
      skipHtml
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[linkMentions]}
      components={components}
    >
      {body}
    </Markdown>
  </div>
);
