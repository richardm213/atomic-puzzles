import { faPlus, faThumbsDown, faThumbsUp, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { InlineState } from "../../components/InlineState/InlineState";
import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import {
  type MarketSuggestion,
  suggestMarket,
  voteOnMarketSuggestion,
} from "../../lib/betting/betting";
import { bettingQueryKeys, marketSuggestionsQueryOptions } from "../../lib/betting/bettingQueries";
import { getErrorMessage } from "../../utils/errors";
import { formatLocalDateTime } from "../../utils/formatters";

type SuggestionDraftOutcome = { label: string; odds: string };

const defaultSuggestionOutcomes = (): SuggestionDraftOutcome[] => [
  { label: "", odds: "50" },
  { label: "", odds: "50" },
];

const MarketSuggestionList = ({
  suggestions,
  isAuthenticated,
  votingSuggestionId,
  onLogin,
  onVote,
}: {
  suggestions: MarketSuggestion[];
  isAuthenticated: boolean;
  votingSuggestionId: number | undefined;
  onLogin: () => void;
  onVote: (suggestion: MarketSuggestion, vote: -1 | 1) => void;
}) => {
  if (!suggestions.length) {
    return <InlineState kind="empty">No markets have been suggested yet.</InlineState>;
  }

  return (
    <div className="marketSuggestionList">
      {suggestions.map((suggestion) => (
        <article className="marketSuggestionCard" key={suggestion.id}>
          <div className="marketSuggestionContent">
            <div className="marketSuggestionMeta">
              <PlayerLink username={suggestion.username}>{suggestion.username}</PlayerLink>
              <span aria-hidden="true">·</span>
              <time dateTime={suggestion.createdAt}>
                {formatLocalDateTime(suggestion.createdAt)}
              </time>
            </div>
            <h3>{suggestion.question}</h3>
            <div className="marketSuggestionOutcomes" aria-label="Proposed outcomes">
              {suggestion.outcomes.map((outcome) => (
                <span key={`${outcome.label}-${outcome.odds}`}>
                  {outcome.label}
                  <strong>{outcome.odds}%</strong>
                </span>
              ))}
            </div>
          </div>
          <div className="marketSuggestionVotes" aria-label={`Votes: ${suggestion.score}`}>
            <button
              type="button"
              className={suggestion.userVote === 1 ? "isSelected" : ""}
              aria-label={`Upvote suggestion by ${suggestion.username}`}
              aria-pressed={suggestion.userVote === 1}
              disabled={votingSuggestionId === suggestion.id}
              onClick={() => (isAuthenticated ? onVote(suggestion, 1) : onLogin())}
            >
              <FontAwesomeIcon icon={faThumbsUp} aria-hidden="true" />
              <span>{suggestion.upvotes}</span>
            </button>
            <strong aria-label={`${suggestion.score} net votes`}>{suggestion.score}</strong>
            <button
              type="button"
              className={suggestion.userVote === -1 ? "isSelected" : ""}
              aria-label={`Downvote suggestion by ${suggestion.username}`}
              aria-pressed={suggestion.userVote === -1}
              disabled={votingSuggestionId === suggestion.id}
              onClick={() => (isAuthenticated ? onVote(suggestion, -1) : onLogin())}
            >
              <FontAwesomeIcon icon={faThumbsDown} aria-hidden="true" />
              <span>{suggestion.downvotes}</span>
            </button>
          </div>
        </article>
      ))}
    </div>
  );
};

export const BettingSuggestions = ({
  isAuthenticated,
  authLoading,
  onLogin,
}: {
  isAuthenticated: boolean;
  authLoading: boolean;
  onLogin: () => void;
}) => {
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState("");
  const [outcomes, setOutcomes] = useState<SuggestionDraftOutcome[]>(defaultSuggestionOutcomes);
  const [submitted, setSubmitted] = useState(false);
  const suggestionsQuery = useQuery(marketSuggestionsQueryOptions());
  const suggestMutation = useMutation({
    mutationFn: suggestMarket,
    onSuccess: async () => {
      setQuestion("");
      setOutcomes(defaultSuggestionOutcomes());
      setSubmitted(true);
      await queryClient.invalidateQueries({ queryKey: bettingQueryKeys.suggestions });
    },
  });
  const voteMutation = useMutation({
    mutationFn: voteOnMarketSuggestion,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: bettingQueryKeys.suggestions });
    },
  });

  const updateOutcome = (index: number, field: keyof SuggestionDraftOutcome, value: string) => {
    setSubmitted(false);
    setOutcomes((current) =>
      current.map((outcome, outcomeIndex) =>
        outcomeIndex === index ? { ...outcome, [field]: value } : outcome,
      ),
    );
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedOutcomes = outcomes.map((outcome) => ({
      label: outcome.label.trim(),
      odds: Number(outcome.odds),
    }));
    if (
      question.trim().length < 8 ||
      normalizedOutcomes.some(
        (outcome) =>
          !outcome.label ||
          !Number.isInteger(outcome.odds) ||
          outcome.odds < 1 ||
          outcome.odds > 99,
      )
    )
      return;
    setSubmitted(false);
    suggestMutation.mutate({ question: question.trim(), outcomes: normalizedOutcomes });
  };

  const vote = (suggestion: MarketSuggestion, nextVote: -1 | 1) => {
    voteMutation.mutate({
      suggestionId: suggestion.id,
      vote: suggestion.userVote === nextVote ? 0 : nextVote,
    });
  };

  return (
    <section className="marketSuggestions" role="tabpanel">
      <div className="marketSuggestionFormPanel">
        <h2>Suggest a market</h2>
        {isAuthenticated ? (
          <form onSubmit={submit}>
            <label htmlFor="market-suggestion-question">Market question</label>
            <input
              id="market-suggestion-question"
              type="text"
              minLength={8}
              maxLength={160}
              required
              value={question}
              onChange={(event) => {
                setQuestion(event.target.value);
                setSubmitted(false);
              }}
              placeholder="Will a player reach the AWC final?"
            />
            <fieldset>
              <legend>Outcomes and proposed odds</legend>
              <div className="marketSuggestionOutcomeFields">
                {outcomes.map((outcome, index) => (
                  <div className="marketSuggestionOutcomeField" key={index}>
                    <label>
                      <span>Outcome {index + 1}</span>
                      <input
                        type="text"
                        maxLength={60}
                        required
                        value={outcome.label}
                        onChange={(event) => updateOutcome(index, "label", event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Odds</span>
                      <span className="marketSuggestionOddsField">
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max="99"
                          step="1"
                          required
                          value={outcome.odds}
                          onChange={(event) => updateOutcome(index, "odds", event.target.value)}
                        />
                        <b>%</b>
                      </span>
                    </label>
                    {outcomes.length > 2 ? (
                      <button
                        type="button"
                        className="marketSuggestionRemoveOutcome"
                        aria-label={`Remove outcome ${index + 1}`}
                        onClick={() =>
                          setOutcomes((current) =>
                            current.filter((_, outcomeIndex) => outcomeIndex !== index),
                          )
                        }
                      >
                        <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </fieldset>
            {outcomes.length < 6 ? (
              <button
                type="button"
                className="marketSuggestionAddOutcome"
                onClick={() => setOutcomes((current) => [...current, { label: "", odds: "50" }])}
              >
                <FontAwesomeIcon icon={faPlus} aria-hidden="true" />
                Add outcome
              </button>
            ) : null}
            {suggestMutation.error ? (
              <InlineState kind="error">
                {getErrorMessage(suggestMutation.error, "Unable to submit this market suggestion.")}
              </InlineState>
            ) : null}
            {submitted ? (
              <InlineState kind="success">Market suggestion published.</InlineState>
            ) : null}
            <button
              type="submit"
              className="marketSuggestionSubmit"
              disabled={suggestMutation.isPending}
            >
              {suggestMutation.isPending ? "Publishing…" : "Publish suggestion"}
            </button>
          </form>
        ) : (
          <div className="marketSuggestionLogin">
            <p>Log in with Lichess to suggest a market or vote.</p>
            <button type="button" disabled={authLoading} onClick={onLogin}>
              Log in with Lichess
            </button>
          </div>
        )}
      </div>
      <div className="marketSuggestionFeed">
        <h2>Suggested markets</h2>
        {suggestionsQuery.error ? (
          <InlineState kind="error">
            {getErrorMessage(suggestionsQuery.error, "Unable to load market suggestions.")}
          </InlineState>
        ) : suggestionsQuery.isPending ? (
          <RouteLoadingFallback />
        ) : (
          <MarketSuggestionList
            suggestions={suggestionsQuery.data ?? []}
            isAuthenticated={isAuthenticated}
            votingSuggestionId={voteMutation.variables?.suggestionId}
            onLogin={onLogin}
            onVote={vote}
          />
        )}
        {voteMutation.error ? (
          <InlineState kind="error">
            {getErrorMessage(voteMutation.error, "Unable to record your vote.")}
          </InlineState>
        ) : null}
      </div>
    </section>
  );
};
