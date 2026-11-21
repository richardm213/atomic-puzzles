import "prosemirror-view/style/prosemirror.css";

import { baseKeymap, splitBlock } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { Slice } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { type EditorProps, EditorView } from "prosemirror-view";
import { useLayoutEffect, useRef } from "react";

import { MAX_COMMENT_LENGTH } from "../../../shared/domain/community/schemas";
import { commentEmojiByCode, commentShortcode } from "../../lib/community/commentEmojis";
import {
  commentDocumentText,
  commentEmoteRanges,
  createCommentDocument,
} from "./commentEditorDocument";

const createState = (source: string) =>
  EditorState.create({
    doc: createCommentDocument(source),
    plugins: [
      history(),
      keymap({ "Mod-z": undo, "Shift-Mod-z": redo, "Mod-y": redo, "Shift-Enter": splitBlock }),
      keymap(baseKeymap),
    ],
  });

type CommentEditorOptions = {
  value: string;
  enabled: boolean;
  maxLength?: number;
  attributes: Record<string, string>;
  onValueChange: (source: string) => void;
  onSelectionChange: (view: EditorView) => void;
  onBlur: () => void;
  onKeyDown: NonNullable<EditorProps["handleKeyDown"]>;
};

export const useCommentEditor = (options: CommentEditorOptions) => {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const current = useRef(options);

  useLayoutEffect(() => {
    current.current = options;
    const view = editor.current;
    if (!view) return;
    view.setProps({ attributes: options.attributes, editable: () => options.enabled });
    if (commentDocumentText(view.state.doc) !== options.value) {
      view.updateState(createState(options.value));
    }
  });

  useLayoutEffect(() => {
    if (!host.current) return;
    const initial = current.current;
    const view = new EditorView(host.current, {
      state: createState(initial.value),
      attributes: initial.attributes,
      editable: () => current.current.enabled,
      handleKeyDown: (editor, event) => current.current.onKeyDown(editor, event),
      handleDOMEvents: {
        click: (editor) => {
          current.current.onSelectionChange(editor);
        },
        focus: (editor) => {
          current.current.onSelectionChange(editor);
        },
        blur: () => {
          current.current.onBlur();
        },
      },
      handlePaste: (editor, event) => {
        if (!event.clipboardData) return false;
        const text = event.clipboardData.getData("text/plain");
        if (text) {
          const parsed = createCommentDocument(text.replace(/\r\n?/g, "\n"));
          editor.dispatch(
            editor.state.tr.replaceSelection(Slice.maxOpen(parsed.content)).scrollIntoView(),
          );
        }
        return true;
      },
      clipboardTextSerializer: ({ content }) => content.textBetween(0, content.size, "\n"),
      dispatchTransaction(transaction) {
        // Normalize completed shortcodes after input, including mobile keyboards and paste.
        // Only inspect text immediately before the caret, never an existing emote node.
        if (
          transaction.docChanged &&
          !view.composing &&
          transaction.selection.empty &&
          transaction.selection.$from.nodeBefore?.isText &&
          transaction.selection.$from.nodeBefore.text?.endsWith(":")
        ) {
          const caret = transaction.selection.from;
          const before = transaction.doc.textBetween(0, caret, "\n");
          const match = before.endsWith(":")
            ? Array.from(before.matchAll(commentShortcode)).find(
                (match) => match.index + match[0].length === before.length,
              )
            : undefined;
          if (match && commentEmojiByCode(match[1]!, null)?.kind === "custom") {
            let openCode = 0;
            for (const run of before.matchAll(/(?<!\\)`+/g)) {
              if (!openCode) openCode = run[0].length;
              else if (openCode === run[0].length) openCode = 0;
            }
            if (
              !openCode &&
              commentEmoteRanges(commentDocumentText(transaction.doc)).some(
                (range) => range.to === before.length,
              )
            ) {
              transaction.replaceWith(
                caret - match[0].length,
                caret,
                transaction.doc.type.schema.nodes.emote!.create({ source: match[0] }),
              );
            }
          }
        }
        const before = transaction.docChanged ? commentDocumentText(view.state.doc) : "";
        const after = transaction.docChanged ? commentDocumentText(transaction.doc) : "";
        if (
          after.length > (current.current.maxLength ?? MAX_COMMENT_LENGTH) &&
          after.length > before.length
        ) {
          view.updateState(view.state);
          return;
        }
        view.updateState(view.state.apply(transaction));
        if (after !== before) current.current.onValueChange(after);
        if (view.hasFocus() && !view.composing) current.current.onSelectionChange(view);
      },
    });
    editor.current = view;
    return () => {
      view.destroy();
      editor.current = null;
    };
  }, []);

  return { host, editor };
};
