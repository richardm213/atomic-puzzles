import "./CommentEditor.css";

import { faFaceSmile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { closeHistory } from "prosemirror-history";
import { Fragment } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";

import {
  type CommentEmoji,
  searchCommentEmojis,
  useNativeCommentEmojis,
} from "../../lib/community/commentEmojis";
import type { UsernameSearchSuggestion } from "../../lib/users/usernameSearch";
import { CommentEmojiIcon, CommentEmojiPicker } from "../CommentEmojiPicker/CommentEmojiPicker";
import { useCommentEditor } from "./useCommentEditor";

type Token = { kind: "mention" | "emoji"; start: number; end: number; query: string };
type Props = {
  id?: string;
  "aria-label": string;
  placeholder?: string;
  readOnly?: boolean;
  maxLength?: number;
  value: string;
  onValueChange: (value: string) => void;
  onEscape?: () => void;
};

const tokenAtCaret = ({ state }: EditorView): Token | null => {
  const { empty, $from } = state.selection;
  if (!empty || !$from.parent.isTextblock) return null;

  const line = $from.parent.textBetween(0, $from.parent.content.size, null, "\uFFFC");
  const prefix = line.slice(0, $from.parentOffset);
  const suffix = line.slice($from.parentOffset);
  const mention = prefix.match(/(?<![a-z0-9_-])@([a-z0-9_-]{3,})$/i)?.[1];
  const emoji = prefix.match(/(?<![\p{L}\p{N}_/]):([a-z0-9_+\-]{1,80})$/iu)?.[1];
  const query = mention ?? emoji;
  if (!query) return null;
  const tail = suffix.match(mention ? /^[a-z0-9_-]*/i : /^[a-z0-9_+\-]*:?/i)?.[0] ?? "";
  return {
    kind: mention ? "mention" : "emoji",
    start: $from.pos - query.length - 1,
    end: $from.pos + tail.length,
    query: query.toLowerCase(),
  };
};

const mentionName = (suggestion: UsernameSearchSuggestion): string =>
  (suggestion.accountUsername ?? suggestion.matchedName).toLowerCase();

const useMentionResults = (query: string | undefined) => {
  const [result, setResult] = useState<{
    query: string;
    status: "ready" | "error";
    suggestions: UsernameSearchSuggestion[];
  } | null>(null);

  useEffect(() => {
    if (!query) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void import("../../lib/users/usernameSearch")
        .then(({ searchUsernameSuggestions }) =>
          searchUsernameSuggestions(query, 8, { excludePyChessAliases: true }),
        )
        .then((matches) => {
          if (cancelled) return;
          const seen = new Set<string>();
          const suggestions = matches.filter((match) => {
            const name = mentionName(match);
            if (seen.has(name)) return false;
            seen.add(name);
            return true;
          });
          setResult({ query, status: "ready", suggestions });
        })
        .catch(() => {
          if (!cancelled) setResult({ query, status: "error", suggestions: [] });
        });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  return result?.query === query ? result : null;
};

export const CommentEditor = forwardRef<HTMLElement, Props>(
  (
    { value, onValueChange, id, placeholder, readOnly, maxLength, onEscape, "aria-label": label },
    ref,
  ) => {
    const resultsRef = useRef<HTMLDivElement>(null);
    const resultsId = useId();
    const pickerId = useId();
    const [token, setToken] = useState<Token | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [popupAbove, setPopupAbove] = useState(false);

    const enabled = !readOnly;
    const activeToken = enabled && !pickerOpen ? token : null;
    const mentionQuery = activeToken?.kind === "mention" ? activeToken.query : undefined;
    const emojiQuery = activeToken?.kind === "emoji" ? activeToken.query : undefined;
    const native = useNativeCommentEmojis(Boolean(enabled && (pickerOpen || emojiQuery)));
    const mentions = useMentionResults(mentionQuery);
    const emojiMatches = emojiQuery ? searchCommentEmojis(emojiQuery, native, 8) : null;
    const suggestions = emojiMatches
      ? [...emojiMatches.custom, ...emojiMatches.unicode].map((emoji) => ({
          key: emoji.kind === "native" ? emoji.unicode : emoji.code,
          text: emoji,
          label: `:${emoji.code}:`,
          detail: null,
          emoji,
        }))
      : (mentions?.suggestions ?? []).map((suggestion) => {
          const name = mentionName(suggestion);
          const matched = suggestion.matchedName.toLowerCase();
          return {
            key: name,
            text: `@${name}`,
            label: `@${matched}`,
            detail: matched === name ? null : `@${name}`,
            emoji: null,
          };
        });
    const selectedIndex = activeIndex < suggestions.length ? activeIndex : 0;

    useEffect(() => {
      if (activeToken)
        resultsRef.current?.children[selectedIndex]?.scrollIntoView?.({ block: "nearest" });
    }, [activeToken, selectedIndex, suggestions.length]);

    const positionPopup = (view: EditorView, height: number) => {
      const bounds = view.dom.getBoundingClientRect();
      const below = window.innerHeight - bounds.bottom;
      setPopupAbove(below < height && bounds.top > below);
    };

    const updateToken = (view: EditorView) => {
      if (!enabled || pickerOpen) return;
      const next = tokenAtCaret(view);
      if (next && next.kind !== token?.kind) positionPopup(view, 264);
      if (next?.query !== token?.query || next?.kind !== token?.kind) setActiveIndex(0);
      if (
        next?.start !== token?.start ||
        next?.end !== token?.end ||
        next?.query !== token?.query ||
        next?.kind !== token?.kind
      )
        setToken(next);
    };

    const insert = (
      view: EditorView,
      selection: string | CommentEmoji,
      start: number,
      end: number,
    ) => {
      const { doc, schema } = view.state;
      const before = doc.textBetween(0, start, "\n", "\uFFFC");
      const after = doc.textBetween(end, doc.content.size, "\n", "\uFFFC");
      const custom = typeof selection !== "string" && selection.kind === "custom";
      const fragment = Fragment.fromArray([
        ...(custom && /[\p{L}\p{N}_/]$/u.test(before) ? [schema.text(" ")] : []),
        typeof selection === "string"
          ? schema.text(selection)
          : selection.kind === "native"
            ? schema.text(selection.unicode)
            : schema.nodes.emote!.create({ source: `:${selection.code}:` }),
        ...(/^\s/.test(after) ? [] : [schema.text(" ")]),
      ]);
      const transaction = closeHistory(view.state.tr.replaceWith(start, end, fragment));
      transaction.setSelection(TextSelection.create(transaction.doc, start + fragment.size));
      view.dispatch(transaction.scrollIntoView());
      if (view.state.doc === doc) return;
      view.focus();
      setToken(null);
      setPickerOpen(false);
    };

    const { host, editor } = useCommentEditor({
      value,
      enabled,
      ...(maxLength === undefined ? {} : { maxLength }),
      attributes: {
        ...(id ? { id } : {}),
        ...(placeholder ? { "aria-placeholder": placeholder } : {}),
        ...(suggestions.length && activeToken
          ? {
              "aria-controls": resultsId,
              "aria-activedescendant": `${resultsId}-${selectedIndex}`,
            }
          : {}),
        class: "commentEditorInput",
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        "aria-autocomplete": "list",
        "aria-readonly": String(!enabled),
        "data-empty": String(!value),
      },
      onValueChange,
      onSelectionChange: updateToken,
      onBlur: () => setToken(null),
      onKeyDown: (view, event) => {
        if (event.isComposing) return false;
        if (event.key === "Escape") {
          if (activeToken) {
            setToken(null);
            return true;
          }
          onEscape?.();
          return Boolean(onEscape);
        }
        if (!activeToken || !suggestions.length) return false;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const direction = event.key === "ArrowDown" ? 1 : -1;
          setActiveIndex((selectedIndex + direction + suggestions.length) % suggestions.length);
          return true;
        }
        const selected = suggestions[selectedIndex];
        if (
          !selected ||
          !["Enter", "Tab"].includes(event.key) ||
          event.shiftKey ||
          event.ctrlKey ||
          event.altKey ||
          event.metaKey
        )
          return false;
        insert(view, selected.text, activeToken.start, activeToken.end);
        return true;
      },
    });
    useImperativeHandle(ref, () => editor.current!.dom);

    const closePicker = () => {
      editor.current?.focus();
      setPickerOpen(false);
    };

    const selectEmoji = (emoji: CommentEmoji) => {
      const view = editor.current;
      if (!view) return;
      const { from, to } = view.state.selection;
      insert(view, emoji, from, to);
    };

    return (
      <div
        className={popupAbove ? "commentEditor commentPopupAbove" : "commentEditor"}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setPickerOpen(false);
        }}
      >
        <div ref={host} />
        <button
          className="commentEmojiTrigger"
          type="button"
          aria-label="Choose an emote"
          aria-haspopup="dialog"
          aria-expanded={enabled && pickerOpen}
          aria-controls={enabled && pickerOpen ? pickerId : undefined}
          title="Choose an emote"
          disabled={!enabled}
          onClick={() => {
            setToken(null);
            if (pickerOpen) closePicker();
            else {
              if (editor.current)
                positionPopup(editor.current, Math.min(window.innerHeight * 0.38, 290) + 115);
              setPickerOpen(true);
            }
          }}
        >
          <FontAwesomeIcon icon={faFaceSmile} aria-hidden="true" />
        </button>
        {enabled && pickerOpen ? (
          <CommentEmojiPicker
            id={pickerId}
            native={native}
            onSelect={selectEmoji}
            onClose={closePicker}
          />
        ) : null}
        {activeToken ? (
          <div className="commentEditorPopup">
            {!suggestions.length ? (
              <div className="commentEditorStatus" role="status">
                {activeToken.kind === "emoji"
                  ? native
                    ? "No emotes found"
                    : "Loading emoji…"
                  : mentions?.status === "ready"
                    ? "No players found"
                    : mentions?.status === "error"
                      ? "Unable to load players"
                      : "Searching…"}
              </div>
            ) : (
              <div
                ref={resultsRef}
                id={resultsId}
                role="listbox"
                aria-label={emojiQuery ? "Matching emotes" : "Matching users"}
              >
                {suggestions.map(({ key, text, label, detail, emoji }, index) => (
                  <button
                    type="button"
                    role="option"
                    id={`${resultsId}-${index}`}
                    key={key}
                    className={emoji ? "commentEmojiSuggestion" : undefined}
                    aria-selected={index === selectedIndex}
                    tabIndex={-1}
                    onPointerMove={() => setActiveIndex(index)}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => {
                      if (editor.current)
                        insert(editor.current, text, activeToken.start, activeToken.end);
                    }}
                  >
                    {emoji ? <CommentEmojiIcon emoji={emoji} /> : null}
                    <span>{label}</span>
                    {detail ? <small>{detail}</small> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  },
);

CommentEditor.displayName = "CommentEditor";
