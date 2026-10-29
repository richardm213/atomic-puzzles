import {
  faMagnifyingGlass,
  faPuzzlePiece,
  faTrophy,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import type { UsernameSearchSuggestion } from "../../lib/users/usernameSearch";
import { PlayerLink } from "../PlayerLink/PlayerLink";
import { TournamentPlayerLink } from "../TournamentPlayerLink/TournamentPlayerLink";

const MIN_QUERY_LENGTH = 3;
const SUGGESTION_DELAY_MS = 150;

export const NavPlayerSearch = ({ onNavigate }: { onNavigate: () => void }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [navigationPending, setNavigationPending] = useState(false);
  const [suggestionsPending, setSuggestionsPending] = useState(false);
  const [suggestionsSearched, setSuggestionsSearched] = useState(false);
  const [suggestions, setSuggestions] = useState<UsernameSearchSuggestion[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const formRef = useRef<HTMLFormElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestIdRef = useRef(0);
  const trimmedQuery = query.trim();
  const busy = navigationPending || suggestionsPending;
  const showSuggestions =
    open &&
    trimmedQuery.length >= MIN_QUERY_LENGTH &&
    (suggestionsPending || suggestionsSearched || suggestions.length > 0);

  const reset = () => {
    setQuery("");
    setSuggestions([]);
    setSuggestionsSearched(false);
    setActiveSuggestionIndex(-1);
    setOpen(false);
    onNavigate();
  };

  const navigateToProfile = async (username: string): Promise<void> => {
    if (navigationPending) return;
    setNavigationPending(true);
    try {
      await navigate({ to: "/@/$username", params: { username } });
      reset();
    } finally {
      setNavigationPending(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    void import("../../lib/users/usernameSearch");
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsideInteraction = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && !formRef.current?.contains(target)) setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideInteraction, true);
    document.addEventListener("mousedown", closeOnOutsideInteraction, true);
    document.addEventListener("touchstart", closeOnOutsideInteraction, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideInteraction, true);
      document.removeEventListener("mousedown", closeOnOutsideInteraction, true);
      document.removeEventListener("touchstart", closeOnOutsideInteraction, true);
    };
  }, [open]);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setActiveSuggestionIndex(-1);
    setSuggestionsSearched(false);
    setSuggestionsPending(false);

    if (!open || navigationPending || trimmedQuery.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setSuggestionsPending(true);
      void import("../../lib/users/usernameSearch")
        .then(({ searchUsernameSuggestions }) => searchUsernameSuggestions(trimmedQuery))
        .then((results) => {
          if (requestId !== requestIdRef.current) return;
          setSuggestions(results);
          setSuggestionsSearched(true);
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) return;
          setSuggestions([]);
          setSuggestionsSearched(true);
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setSuggestionsPending(false);
        });
    }, SUGGESTION_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [navigationPending, open, trimmedQuery]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (trimmedQuery) void navigateToProfile(trimmedQuery);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (suggestions.length > 0) {
        event.preventDefault();
        setSuggestions([]);
        setSuggestionsSearched(false);
        setActiveSuggestionIndex(-1);
      } else {
        setOpen(false);
        inputRef.current?.blur();
      }
      return;
    }

    if (suggestions.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveSuggestionIndex(
        (current) => (current + direction + suggestions.length) % suggestions.length,
      );
      return;
    }

    if (event.key === "Enter" && activeSuggestionIndex >= 0) {
      event.preventDefault();
      const suggestion = suggestions[activeSuggestionIndex];
      if (suggestion) void navigateToProfile(suggestion.matchedName);
    }
  };

  const closeIfFocusOutside = (event: FocusEvent<HTMLFormElement>) => {
    if (navigationPending) return;
    const nextFocusedElement = event.relatedTarget;

    // Safari and some touch browsers report a null relatedTarget while a link is
    // being pressed. Keep the results mounted so the subsequent click can fire;
    // outside pointer interactions are handled by the document listener above.
    if (nextFocusedElement === null) return;
    if (!event.currentTarget.contains(nextFocusedElement)) setOpen(false);
  };

  return (
    <div className="navSearchSlot">
      <form
        ref={formRef}
        className={`navSearch ${open ? "open" : ""} ${navigationPending ? "pending" : ""} ${suggestionsPending ? "suggesting" : ""}`}
        onSubmit={submit}
        onMouseEnter={() => !navigationPending && setOpen(true)}
        onMouseLeave={() => {
          if (navigationPending) return;
          setOpen(false);
          inputRef.current?.blur();
        }}
        onFocusCapture={() => !navigationPending && setOpen(true)}
        onBlurCapture={closeIfFocusOutside}
      >
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Search player"
          aria-label="Search player username"
          aria-busy={busy}
          aria-controls={showSuggestions ? "nav-search-results" : undefined}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={navigationPending}
          tabIndex={open ? 0 : -1}
        />
        <div className="navSearchStatus" aria-hidden={!busy}>
          <span className="navSearchProgress" />
        </div>
        <button
          className="navSearchIcon"
          type={open ? "submit" : "button"}
          aria-label={navigationPending ? "Searching for player" : "Search player"}
          disabled={navigationPending}
          onClick={() => setOpen(true)}
        >
          <FontAwesomeIcon icon={faMagnifyingGlass} />
        </button>
        {showSuggestions ? (
          <div
            className="navSearchResults"
            id="nav-search-results"
            role="list"
            aria-label="Player search results"
          >
            {suggestionsPending ? (
              <div className="navSearchResultsHint" role="status">
                Searching...
              </div>
            ) : null}
            {!suggestionsPending && suggestions.length === 0 ? (
              <div className="navSearchResultsHint" role="status">
                No players found
              </div>
            ) : null}
            {!suggestionsPending
              ? suggestions.map((suggestion, index) => (
                  <div
                    className={`navSearchResult ${index === activeSuggestionIndex ? "active" : ""}`}
                    id={`nav-search-result-${index}`}
                    key={`${suggestion.username}-${suggestion.matchedName}`}
                    role="listitem"
                    onMouseEnter={() => setActiveSuggestionIndex(index)}
                  >
                    <span className="navSearchResultPrimary">
                      <span className="navSearchResultName">{suggestion.matchedName}</span>
                    </span>
                    <PlayerLink
                      className="navSearchResultDefault"
                      username={suggestion.matchedName}
                      aria-label={`Open ${suggestion.matchedName}'s profile`}
                      onClick={reset}
                    />
                    <div
                      className="navSearchResultActions"
                      role="group"
                      aria-label={`${suggestion.matchedName} links`}
                    >
                      {suggestion.accountUsername ? (
                        <Link
                          className="navSearchResultAction"
                          to="/@/$username/puzzles"
                          params={{ username: suggestion.accountUsername }}
                          aria-label={`Open ${suggestion.matchedName}'s puzzle dashboard`}
                          title="Puzzle dashboard"
                          onClick={reset}
                        >
                          <FontAwesomeIcon icon={faPuzzlePiece} aria-hidden="true" />
                        </Link>
                      ) : null}
                      <TournamentPlayerLink
                        className="navSearchResultAction"
                        username={suggestion.matchedName}
                        aria-label={`Open ${suggestion.matchedName}'s tournament history`}
                        title="Tournament history"
                        onClick={reset}
                      >
                        <FontAwesomeIcon icon={faTrophy} aria-hidden="true" />
                      </TournamentPlayerLink>
                      <PlayerLink
                        className="navSearchResultAction"
                        username={suggestion.matchedName}
                        aria-label={`Open ${suggestion.matchedName}'s profile`}
                        title="Profile"
                        onClick={reset}
                      >
                        <FontAwesomeIcon icon={faUser} aria-hidden="true" />
                      </PlayerLink>
                    </div>
                  </div>
                ))
              : null}
          </div>
        ) : null}
      </form>
    </div>
  );
};
