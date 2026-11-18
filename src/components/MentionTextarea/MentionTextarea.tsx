import "./MentionTextarea.css";

import {
  forwardRef,
  type TextareaHTMLAttributes,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import type { UsernameSearchSuggestion } from "../../lib/users/usernameSearch";

type Mention = { start: number; end: number; query: string };
type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
};

const mentionAtCaret = (value: string, start: number, end: number): Mention | null => {
  if (start !== end) return null;
  const match = value.slice(0, start).match(/(?:^|[^a-z0-9_-])@([a-z0-9_-]{3,})$/i);
  if (!match?.[1]) return null;
  const suffix = value.slice(start).match(/^[a-z0-9_-]*/i)?.[0] ?? "";
  return {
    start: start - match[1].length - 1,
    end: start + suffix.length,
    query: match[1].toLowerCase(),
  };
};

const mentionName = (suggestion: UsernameSearchSuggestion): string =>
  (suggestion.accountUsername ?? suggestion.matchedName).toLowerCase();

export const MentionTextarea = forwardRef<HTMLTextAreaElement, Props>(
  (
    { value, onValueChange, onFocus, onBlur, onClick, onKeyDown, onKeyUp, ...props },
    forwardedRef,
  ) => {
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const resultsRef = useRef<HTMLDivElement>(null);
    const resultsId = useId();
    const [mention, setMention] = useState<Mention | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [result, setResult] = useState<{
      query: string;
      status: "loading" | "ready" | "error";
      suggestions: UsernameSearchSuggestion[];
    } | null>(null);
    useImperativeHandle(forwardedRef, () => inputRef.current!);
    const query = !props.disabled && !props.readOnly ? mention?.query : undefined;
    const suggestions = result && result.query === query ? result.suggestions : [];
    const status = result && result.query === query ? result.status : "loading";
    const open = Boolean(query);

    useEffect(() => {
      if (!query) return undefined;
      let cancelled = false;
      setActiveIndex(0);
      setResult({ query, status: "loading", suggestions: [] });
      const timer = window.setTimeout(() => {
        void import("../../lib/users/usernameSearch")
          .then(({ searchUsernameSuggestions }) =>
            searchUsernameSuggestions(query, 8, { excludePyChessAliases: true }),
          )
          .then((matches) => {
            if (cancelled) return;
            const seen = new Set<string>();
            const unique = matches.filter((match) => {
              const name = mentionName(match);
              if (seen.has(name)) return false;
              seen.add(name);
              return true;
            });
            setResult({ query, status: "ready", suggestions: unique });
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

    useEffect(() => {
      if (open) resultsRef.current?.children[activeIndex]?.scrollIntoView?.({ block: "nearest" });
    }, [activeIndex, open]);

    const updateMention = (input: HTMLTextAreaElement) => {
      setMention(mentionAtCaret(input.value, input.selectionStart, input.selectionEnd));
    };

    const insertMention = (suggestion: UsernameSearchSuggestion) => {
      if (!mention) return;
      const suffix = value.slice(mention.end);
      const replacement = `@${mentionName(suggestion)}${/^\s/.test(suffix) ? "" : " "}`;
      const caret = mention.start + replacement.length;
      onValueChange(value.slice(0, mention.start) + replacement + suffix);
      setMention(null);
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(caret, caret);
      });
    };

    return (
      <div className="mentionTextarea">
        <textarea
          {...props}
          ref={inputRef}
          value={value}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-controls={open && suggestions.length ? resultsId : undefined}
          aria-activedescendant={
            open && suggestions.length ? `${resultsId}-${activeIndex}` : undefined
          }
          onChange={(event) => {
            onValueChange(event.target.value);
            updateMention(event.target);
          }}
          onFocus={(event) => {
            updateMention(event.currentTarget);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setMention(null);
            onBlur?.(event);
          }}
          onClick={(event) => {
            updateMention(event.currentTarget);
            onClick?.(event);
          }}
          onKeyUp={(event) => {
            if (!["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key))
              updateMention(event.currentTarget);
            onKeyUp?.(event);
          }}
          onKeyDown={(event) => {
            if (open && !event.nativeEvent.isComposing) {
              if (event.key === "Escape") {
                event.preventDefault();
                setMention(null);
                return;
              }
              if (suggestions.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                event.preventDefault();
                const direction = event.key === "ArrowDown" ? 1 : -1;
                setActiveIndex(
                  (current) => (current + direction + suggestions.length) % suggestions.length,
                );
                return;
              }
              if (
                suggestions.length &&
                (event.key === "Enter" || event.key === "Tab") &&
                !event.shiftKey &&
                !event.ctrlKey &&
                !event.altKey &&
                !event.metaKey
              ) {
                const selected = suggestions[activeIndex];
                if (selected) {
                  event.preventDefault();
                  insertMention(selected);
                  return;
                }
              }
            }
            onKeyDown?.(event);
          }}
        />
        {open ? (
          <div className="mentionTextareaPopup">
            {status !== "ready" || !suggestions.length ? (
              <div className="mentionTextareaStatus" role="status">
                {status === "loading"
                  ? "Searching…"
                  : status === "error"
                    ? "Unable to load players"
                    : "No players found"}
              </div>
            ) : (
              <div ref={resultsRef} id={resultsId} role="listbox" aria-label="Matching users">
                {suggestions.map((suggestion, index) => {
                  const name = mentionName(suggestion);
                  const matched = suggestion.matchedName.toLowerCase();
                  return (
                    <button
                      type="button"
                      role="option"
                      id={`${resultsId}-${index}`}
                      key={name}
                      aria-selected={index === activeIndex}
                      tabIndex={-1}
                      onMouseEnter={() => setActiveIndex(index)}
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => insertMention(suggestion)}
                    >
                      <span>@{matched}</span>
                      {matched !== name ? <small>@{name}</small> : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  },
);

MentionTextarea.displayName = "MentionTextarea";
