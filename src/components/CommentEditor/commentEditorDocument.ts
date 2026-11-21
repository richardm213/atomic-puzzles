import "../PlayerFlair/PlayerFlair.css";

import { fromMarkdown } from "mdast-util-from-markdown";
import { type Node, Schema } from "prosemirror-model";

import {
  isThemeAtomicLogo,
  playerFlairImagePath,
  playerFlairLabel,
} from "../../../shared/domain/playerSocial";
import { commentEmojiByCode, commentShortcode } from "../../lib/community/commentEmojis";
import { appAssetPath } from "../../utils/appAssetPath";

const emoteFromSource = (source: string) => {
  const emoji = commentEmojiByCode(source.slice(1, -1), null);
  return emoji?.kind === "custom" && /^:[a-z0-9_-]+:$/i.test(source) ? emoji : undefined;
};

export const commentEditorSchema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "inline*", parseDOM: [{ tag: "p" }], toDOM: () => ["p", 0] },
    text: { group: "inline" },
    emote: {
      inline: true,
      group: "inline",
      attrs: { source: { validate: "string" } },
      leafText: (node) => String(node.attrs.source),
      parseDOM: [
        {
          tag: "img[data-comment-emote]",
          getAttrs: (image) => {
            const source = image.getAttribute("data-comment-emote") ?? "";
            return emoteFromSource(source) ? { source } : false;
          },
        },
      ],
      toDOM: (node) => {
        const source = String(node.attrs.source);
        const emoji = emoteFromSource(source);
        const path = emoji && playerFlairImagePath(emoji.code);
        return path && emoji
          ? [
              "img",
              {
                src: appAssetPath(path),
                alt: playerFlairLabel(emoji.code),
                class: "playerFlairImage inlineEmoteImage",
                "data-comment-emote": source,
                "data-atomic-logo": isThemeAtomicLogo(emoji.code) ? emoji.code : null,
                draggable: "false",
              },
            ]
          : ["span", source];
      },
    },
  },
});

type MarkdownNode = ReturnType<typeof fromMarkdown>["children"][number];
export const commentEmoteRanges = (source: string) => {
  const ranges: Array<{ from: number; to: number; source: string }> = [];
  const visit = (node: MarkdownNode | ReturnType<typeof fromMarkdown>): void => {
    if (node.type === "text") {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start === undefined || end === undefined) return;
      for (const match of source.slice(start, end).matchAll(commentShortcode)) {
        const at = start + match.index;
        if (source[at - 1] !== "\\" && emoteFromSource(match[0])) {
          ranges.push({ from: at, to: at + match[0].length, source: match[0] });
        }
      }
    } else if (
      "children" in node &&
      !["link", "linkReference", "image", "imageReference"].includes(node.type)
    ) {
      node.children.forEach(visit);
    }
  };
  if (source.includes(":")) visit(fromMarkdown(source));
  return ranges;
};

export const createCommentDocument = (source: string) => {
  const { nodes } = commentEditorSchema;
  const lines: Node[][] = [[]];
  let offset = 0;
  const appendText = (text: string) => {
    const parts = text.split("\n");
    parts.forEach((part, index) => {
      if (index) lines.push([]);
      if (part) lines.at(-1)!.push(commentEditorSchema.text(part));
    });
  };
  for (const range of commentEmoteRanges(source)) {
    appendText(source.slice(offset, range.from));
    lines.at(-1)!.push(nodes.emote.create({ source: range.source }));
    offset = range.to;
  }
  appendText(source.slice(offset));
  return nodes.doc.create(
    null,
    lines.map((line) => nodes.paragraph.create(null, line)),
  );
};

export const commentDocumentText = (document: Node) =>
  document.textBetween(0, document.content.size, "\n");
