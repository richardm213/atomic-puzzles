import {
  faCheck,
  faCircleInfo,
  faClockRotateLeft,
  faFlag,
  faMagnifyingGlassChart,
  faUsers,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useState } from "react";

import { CommunityCommentsLink } from "../../components/CommunityCommentsLink/CommunityCommentsLink";
import type { PuzzleProgressWithUsernameRow } from "../../lib/supabase/puzzleProgress";
import type { AsyncActionStatus } from "../../types/async";
import { formatElapsedDuration, formatLocalDateTime } from "../../utils/formatters";

export type PuzzleInfoTab = "solution" | "explanation" | "attempts" | "comments";
type SaveStatus = AsyncActionStatus;

type PuzzleInfoSectionProps = {
  mobile?: boolean;
  lockedDetailsHint?: string;
  activeTab: PuzzleInfoTab | null;
  solution: {
    canReveal: boolean;
    canGiveUp: boolean;
    buttonTitle: string;
    mobileAnalysis?: ReactNode;
    onToggle: () => void;
  };
  explanation: {
    available: boolean;
    canView: boolean;
    canManage: boolean;
    hasContent: boolean;
    content: string;
    editorOpen: boolean;
    draft: string;
    puzzleId: number | undefined;
    saveStatus: SaveStatus;
    onToggle: () => void;
    onOpenEditor: () => void;
    onCancelEditor: () => void;
    onDraftChange: (value: string) => void;
    onSave: (event: FormEvent<HTMLFormElement>) => void;
  };
  attempts: {
    canView: boolean;
    puzzleKey: string;
    status: "idle" | "loading" | "loaded" | "error";
    rows: PuzzleProgressWithUsernameRow[];
    onToggle: () => void;
  };
  comments: { canView: boolean; puzzleId: number | undefined; onSelect: () => void } | null;
};

const AttemptsPanel = ({
  status,
  rows,
  onRetry,
}: {
  status: PuzzleInfoSectionProps["attempts"]["status"];
  rows: PuzzleProgressWithUsernameRow[];
  onRetry: () => void;
}) => {
  const [hideAnswers, setHideAnswers] = useState(false);

  return (
    <div className="puzzleOtherAttemptsPanel" aria-live="polite">
      {status === "loading" ? (
        <div className="puzzleOtherAttemptsState">Loading attempts...</div>
      ) : status === "error" ? (
        <div className="puzzleOtherAttemptsState">
          <span>Could not load attempts.</span>
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : rows.length > 0 ? (
        <>
          <div className="puzzleOtherAttemptsControls">
            <label>
              <input
                type="checkbox"
                checked={hideAnswers}
                onChange={(event) => setHideAnswers(event.target.checked)}
              />
              Hide answers
            </label>
          </div>
          <ul className="puzzleOtherAttemptsList" aria-label="Other puzzle attempts">
            {rows.map((attempt) => (
              <li
                key={`${attempt.username}-${attempt.first_attempt_at}`}
                className={`puzzleOtherAttemptRow ${attempt.puzzle_correct ? "correct" : "incorrect"}`}
              >
                <Link
                  className="puzzleOtherAttemptUser"
                  to="/@/$username/puzzles"
                  params={{ username: attempt.username }}
                >
                  {attempt.username}
                </Link>
                <span
                  className={`puzzleOtherAttemptResult ${
                    attempt.puzzle_correct ? "correct" : "incorrect"
                  }`}
                >
                  <FontAwesomeIcon
                    icon={attempt.puzzle_correct ? faCheck : faXmark}
                    aria-hidden={hideAnswers}
                    aria-label={
                      hideAnswers ? undefined : attempt.puzzle_correct ? "Correct" : "Incorrect"
                    }
                  />
                  {hideAnswers ? (
                    <span>{attempt.puzzle_correct ? "Correct" : "Incorrect"}</span>
                  ) : null}
                  {attempt.rated === false ? (
                    <span className="puzzleOtherAttemptRated">Unrated</span>
                  ) : null}
                  {!hideAnswers && attempt.puzzle_correct && attempt.correct_move ? (
                    <span
                      className="puzzleOtherAttemptMove"
                      aria-label={`Played ${attempt.correct_move}`}
                    >
                      {attempt.correct_move}
                    </span>
                  ) : null}
                  {!hideAnswers && !attempt.puzzle_correct && attempt.incorrect_move ? (
                    <span
                      className="puzzleOtherAttemptMove"
                      aria-label={`Played ${attempt.incorrect_move}`}
                    >
                      {attempt.incorrect_move}
                    </span>
                  ) : null}
                </span>
                <time className="puzzleOtherAttemptTime" dateTime={attempt.first_attempt_at}>
                  {formatLocalDateTime(attempt.first_attempt_at)}
                </time>
                {typeof attempt.first_attempt_duration_ms === "number" ? (
                  <span
                    className="puzzleOtherAttemptDuration"
                    aria-label={`Attempt time ${formatElapsedDuration(attempt.first_attempt_duration_ms)}`}
                  >
                    <FontAwesomeIcon icon={faClockRotateLeft} aria-hidden="true" />
                    {formatElapsedDuration(attempt.first_attempt_duration_ms)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="puzzleOtherAttemptsState">No other attempts yet.</div>
      )}
    </div>
  );
};

export const PuzzleInfoSection = ({
  mobile = false,
  lockedDetailsHint,
  activeTab,
  solution,
  explanation,
  attempts,
  comments,
}: PuzzleInfoSectionProps) => {
  const showSolution = mobile && activeTab === "solution";
  const showExplanation = activeTab === "explanation";
  const showAttempts = activeTab === "attempts";
  const showComments = activeTab === "comments";
  let panel = null;

  if (showSolution && solution.canReveal) {
    panel = <div className="puzzleInfoPanel">{solution.mobileAnalysis}</div>;
  } else if (showAttempts && attempts.canView) {
    panel = (
      <div className="puzzleInfoPanel">
        <AttemptsPanel status={attempts.status} rows={attempts.rows} onRetry={attempts.onToggle} />
      </div>
    );
  } else if (showExplanation && explanation.canView) {
    panel = (
      <div className="puzzleInfoPanel">
        <section className="puzzleExplanation" aria-live="polite">
          <div className="puzzleExplanationHeader">
            <strong>Explanation</strong>
            {explanation.canManage && !explanation.editorOpen ? (
              <button
                type="button"
                className="puzzleExplanationEditButton"
                onClick={explanation.onOpenEditor}
              >
                {explanation.hasContent ? "Edit" : "Add explanation"}
              </button>
            ) : null}
          </div>
          {explanation.editorOpen ? (
            <form className="puzzleExplanationForm" onSubmit={explanation.onSave}>
              <label htmlFor={`puzzle-explanation-${explanation.puzzleId}`}>
                Puzzle explanation
              </label>
              <textarea
                id={`puzzle-explanation-${explanation.puzzleId}`}
                value={explanation.draft}
                maxLength={5000}
                rows={5}
                onChange={(event) => explanation.onDraftChange(event.target.value)}
                disabled={explanation.saveStatus.state === "saving"}
              />
              <div className="puzzleExplanationFormActions">
                <button
                  type="button"
                  onClick={explanation.onCancelEditor}
                  disabled={explanation.saveStatus.state === "saving"}
                >
                  Cancel
                </button>
                <button type="submit" disabled={explanation.saveStatus.state === "saving"}>
                  {explanation.saveStatus.state === "saving" ? "Saving…" : "Save explanation"}
                </button>
              </div>
            </form>
          ) : explanation.hasContent ? (
            <p>{explanation.content}</p>
          ) : (
            <p className="puzzleExplanationEmpty">No explanation has been added yet.</p>
          )}
          {explanation.saveStatus.state === "saved" ? (
            <span className="puzzleExplanationMessage success">Explanation saved.</span>
          ) : null}
          {explanation.saveStatus.state === "error" ? (
            <span className="puzzleExplanationMessage error" role="alert">
              {explanation.saveStatus.message}
            </span>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div className={`puzzleInfoStack ${panel ? "hasContent" : ""}`}>
      <div className="puzzleInfoTabs" role="tablist" aria-label="Puzzle details">
        {mobile ? (
          <button
            type="button"
            role="tab"
            className={`puzzleInfoTab ${showSolution ? "active" : ""}`}
            onClick={solution.onToggle}
            disabled={!solution.canReveal}
            aria-selected={showSolution}
            aria-expanded={showSolution}
            title={showSolution ? "Hide the solution panel" : solution.buttonTitle}
          >
            <FontAwesomeIcon
              icon={solution.canGiveUp ? faFlag : faMagnifyingGlassChart}
              aria-hidden="true"
            />
            <span>{solution.canGiveUp ? "Give up" : "Solution"}</span>
            {showSolution ? (
              <span className="puzzleInfoTabToggle" aria-hidden="true">
                ⌃
              </span>
            ) : null}
          </button>
        ) : null}
        {explanation.available ? (
          <button
            type="button"
            role="tab"
            className={`puzzleInfoTab ${showExplanation ? "active" : ""}`}
            onClick={explanation.onToggle}
            disabled={!explanation.canView}
            aria-label={mobile ? "Explain" : "Explanation"}
            aria-expanded={showExplanation}
            aria-selected={showExplanation}
            title={
              showExplanation
                ? "Hide the puzzle explanation"
                : !explanation.canView
                  ? (lockedDetailsHint ??
                    "Attempt this puzzle before viewing or editing the explanation.")
                  : explanation.canManage
                    ? explanation.hasContent
                      ? "View or edit the puzzle explanation"
                      : "Add a puzzle explanation"
                    : "View the puzzle explanation"
            }
          >
            <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
            <span className="puzzleInfoTabLabel">{mobile ? "Explain" : "Explanation"}</span>
          </button>
        ) : null}
        <button
          type="button"
          role="tab"
          className={`puzzleInfoTab ${showAttempts ? "active" : ""}`}
          onClick={attempts.onToggle}
          disabled={!attempts.canView || !attempts.puzzleKey || attempts.status === "loading"}
          aria-label={mobile ? "Attempts" : "Other attempts"}
          aria-expanded={showAttempts}
          aria-selected={showAttempts}
          title={
            showAttempts
              ? attempts.status === "error"
                ? "Retry loading other attempts"
                : "Hide other attempts"
              : attempts.canView
                ? "View other attempts for this puzzle"
                : (lockedDetailsHint ?? "Attempt this puzzle before viewing other attempts.")
          }
        >
          <FontAwesomeIcon icon={faUsers} aria-hidden="true" />
          <span className="puzzleInfoTabLabel">{mobile ? "Attempts" : "Other attempts"}</span>
        </button>
        {comments ? (
          <CommunityCommentsLink
            target={{ type: "puzzle", id: String(comments.puzzleId ?? "") }}
            href="#puzzle-community"
            hideWhenEmpty
            role="tab"
            className={`puzzleInfoTab ${showComments ? "active" : ""}`}
            onClick={(event) => {
              if (!comments.canView) {
                event.preventDefault();
                return;
              }
              comments.onSelect();
            }}
            aria-disabled={!comments.canView}
            aria-selected={showComments}
            title={
              comments.canView
                ? "Jump to the puzzle discussion"
                : "Attempt this puzzle before viewing comments."
            }
          />
        ) : null}
      </div>
      {panel}
    </div>
  );
};
