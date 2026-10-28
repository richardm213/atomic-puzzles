import {
  faArrowUpRightFromSquare,
  faCheck,
  faCircleInfo,
  faClockRotateLeft,
  faMagnifyingGlassChart,
  faUsers,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import type { FormEvent } from "react";

import { CommunityCommentsLink } from "../../components/CommunityCommentsLink/CommunityCommentsLink";
import {
  SolutionMoveTree,
  SolutionPlaybackControls,
} from "../../components/SolutionMoveNavigation/SolutionMoveNavigation";
import type { VariationOption } from "../../components/VariationTree/VariationTree";
import type { PuzzleProgressWithUsernameRow } from "../../lib/supabase/puzzleProgress";
import type { AsyncActionStatus } from "../../types/async";
import type { PlaybackCommand } from "../../types/chessboard";
import { formatElapsedDuration, formatLocalDateTime } from "../../utils/formatters";

export type PuzzleInfoTab = "solution" | "explanation" | "attempts" | "comments";
type SaveStatus = AsyncActionStatus;

type PuzzleInfoSectionProps = {
  mobile?: boolean;
  activeTab: PuzzleInfoTab | null;
  solution: {
    canReveal: boolean;
    buttonTitle: string;
    fen: string;
    currentFen: string;
    startAnalysisUrl: string;
    currentAnalysisUrl: string;
    canStart: boolean;
    canPrevious: boolean;
    canNext: boolean;
    canEnd: boolean;
    copyLabel: string;
    canCopy: boolean;
    hasLines: boolean;
    lines: string[][];
    options: VariationOption[];
    currentPly: number;
    activeLineIndex: number;
    onSelect: (lineIndex: number, moveIndex: number) => void;
    onNavigate: (command: PlaybackCommand) => void;
    onCopy: () => void;
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
  comments: { canView: boolean; puzzleId: number | undefined; onSelect: () => void };
};

const AnalysisLink = ({
  href,
  enabled,
  label,
  mobile,
}: {
  href: string;
  enabled: boolean;
  label: string;
  mobile: boolean;
}) => (
  <a
    className={`fenAnalyzeButton ${mobile ? "mobileAnalyzeButton" : ""} ${
      enabled ? "" : "disabled"
    }`}
    href={href}
    target="_blank"
    rel="noreferrer"
    aria-disabled={!enabled}
    onClick={(event) => {
      if (!enabled) event.preventDefault();
    }}
  >
    <span className="fenAnalyzeIcon" aria-hidden="true">
      <FontAwesomeIcon icon={faMagnifyingGlassChart} />
    </span>
    <span className="fenAnalyzeText">
      <span>Analyze</span>
      <strong>{label}</strong>
    </span>
    <FontAwesomeIcon className="fenAnalyzeExternalIcon" icon={faArrowUpRightFromSquare} />
  </a>
);

const AttemptsPanel = ({
  status,
  rows,
}: {
  status: PuzzleInfoSectionProps["attempts"]["status"];
  rows: PuzzleProgressWithUsernameRow[];
}) => (
  <div className="puzzleOtherAttemptsPanel" aria-live="polite">
    {status === "loading" ? (
      <div className="puzzleOtherAttemptsState">Loading attempts...</div>
    ) : status === "error" ? (
      <div className="puzzleOtherAttemptsState">Could not load attempts.</div>
    ) : rows.length > 0 ? (
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
                aria-hidden="true"
              />
              <span>{attempt.puzzle_correct ? "Correct" : "Incorrect"}</span>
              {attempt.rated === false ? (
                <span className="puzzleOtherAttemptRated">Unrated</span>
              ) : null}
              {attempt.puzzle_correct && attempt.correct_move ? (
                <span
                  className="puzzleOtherAttemptMove"
                  aria-label={`Played ${attempt.correct_move}`}
                >
                  {attempt.correct_move}
                </span>
              ) : null}
              {!attempt.puzzle_correct && attempt.incorrect_move ? (
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
    ) : (
      <div className="puzzleOtherAttemptsState">No other attempts yet.</div>
    )}
  </div>
);

export const PuzzleInfoSection = ({
  mobile = false,
  activeTab,
  solution,
  explanation,
  attempts,
  comments,
}: PuzzleInfoSectionProps) => {
  const showSolution = activeTab === "solution";
  const showExplanation = activeTab === "explanation";
  const showAttempts = activeTab === "attempts";
  const showComments = activeTab === "comments";
  let panel = null;

  if (showSolution && solution.canReveal) {
    panel = (
      <div className="puzzleInfoPanel">
        <div className={mobile ? "mobileAnalyzeActions" : "analysisButtonsRow"}>
          <AnalysisLink
            href={solution.startAnalysisUrl}
            enabled={Boolean(solution.fen)}
            label="Puzzle"
            mobile={mobile}
          />
          <AnalysisLink
            href={solution.currentAnalysisUrl}
            enabled={Boolean(solution.currentFen)}
            label="Current Position"
            mobile={mobile}
          />
        </div>
        <div className={mobile ? "lineBox mobileLineBox" : "lineBox"}>
          <div className="lineHeader">
            <div className="fenLabel">Solution</div>
            <div className="solutionHeaderActions">
              <SolutionPlaybackControls
                canStart={Boolean(solution.fen) && solution.canStart}
                canPrevious={Boolean(solution.fen) && solution.canPrevious}
                canNext={Boolean(solution.fen) && solution.canNext}
                canEnd={Boolean(solution.fen) && solution.canEnd}
                onNavigate={solution.onNavigate}
              />
              <button
                type="button"
                className="fenAnalyzeButton"
                onClick={solution.onCopy}
                disabled={!solution.canCopy}
              >
                {solution.copyLabel === "Copied" ? (
                  <FontAwesomeIcon className="copyPgnCheck" icon={faCheck} aria-hidden="true" />
                ) : null}
                {solution.copyLabel}
              </button>
            </div>
          </div>
          {solution.hasLines ? (
            <SolutionMoveTree
              lines={solution.lines}
              options={solution.options}
              currentPly={solution.currentPly}
              activeLineIndex={solution.activeLineIndex}
              onSelect={solution.onSelect}
            />
          ) : (
            <code>No solution available</code>
          )}
        </div>
      </div>
    );
  } else if (showAttempts && attempts.canView) {
    panel = (
      <div className="puzzleInfoPanel">
        <AttemptsPanel status={attempts.status} rows={attempts.rows} />
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
          <FontAwesomeIcon icon={faMagnifyingGlassChart} aria-hidden="true" />
          <span>Solution</span>
          {mobile && showSolution ? (
            <span className="puzzleInfoTabToggle" aria-hidden="true">
              ⌃
            </span>
          ) : null}
        </button>
        {explanation.available ? (
          <button
            type="button"
            role="tab"
            className={`puzzleInfoTab ${showExplanation ? "active" : ""}`}
            onClick={explanation.onToggle}
            disabled={!explanation.canView}
            aria-expanded={showExplanation}
            aria-selected={showExplanation}
            title={
              showExplanation
                ? "Hide the puzzle explanation"
                : !explanation.canView
                  ? "Attempt this puzzle before viewing or editing the explanation."
                  : explanation.canManage
                    ? explanation.hasContent
                      ? "View or edit the puzzle explanation"
                      : "Add a puzzle explanation"
                    : "View the puzzle explanation"
            }
          >
            <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
            <span>{mobile ? "Explain" : "Explanation"}</span>
            {mobile && showExplanation ? (
              <span className="puzzleInfoTabToggle" aria-hidden="true">
                ⌃
              </span>
            ) : null}
          </button>
        ) : null}
        <button
          type="button"
          role="tab"
          className={`puzzleInfoTab ${showAttempts ? "active" : ""}`}
          onClick={attempts.onToggle}
          disabled={!attempts.canView || !attempts.puzzleKey || attempts.status === "loading"}
          aria-expanded={showAttempts}
          aria-selected={showAttempts}
          title={
            showAttempts
              ? "Hide other attempts"
              : attempts.canView
                ? "View other attempts for this puzzle"
                : "Attempt this puzzle before viewing other attempts."
          }
        >
          <FontAwesomeIcon icon={faUsers} aria-hidden="true" />
          <span>{mobile ? "Attempts" : "Other attempts"}</span>
          {mobile && showAttempts ? (
            <span className="puzzleInfoTabToggle" aria-hidden="true">
              ⌃
            </span>
          ) : null}
        </button>
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
      </div>
      {panel}
    </div>
  );
};
