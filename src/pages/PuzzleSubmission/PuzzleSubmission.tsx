import "./PuzzleSubmission.css";

import { faFloppyDisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { type ReactNode, useRef, useState } from "react";

import { isApprovedPuzzleCreator } from "../../../shared/domain/puzzles/approvedPuzzleCreators";
import { PUZZLE_ADMIN_USERNAME } from "../../../shared/domain/puzzles/puzzleAdmin";
import { PuzzleStartingFenWarning } from "../../components/PuzzleStartingFenWarning/PuzzleStartingFenWarning";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { PuzzleDraftField } from "../../features/analysisWorkspace/PuzzleDraftFields";
import { announceCoinsEarned } from "../../lib/coins/coinEvents";
import {
  createEmptyPuzzleSubmission,
  type PuzzleSubmissionValue,
  validatePuzzleSubmission,
} from "../../lib/puzzles/puzzleSubmission";
import { submitPuzzle } from "../../lib/supabase/puzzleQueue";
import { appAssetPath } from "../../utils/appAssetPath";
import { getErrorMessage } from "../../utils/errors";
import { normalizeUsername } from "../../utils/playerNames";
import { PuzzleEditor } from "./PuzzleEditor";

export const PuzzleSubmissionPage = () => {
  const { isAuthenticated, isLoading, user, login } = useAuth();
  const [value, setValue] = useState<PuzzleSubmissionValue>(createEmptyPuzzleSubmission);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; text: ReactNode }>();
  const publishesDirectly = isApprovedPuzzleCreator(user?.username ?? "");
  const canSetAuthor = normalizeUsername(user?.username) === PUZZLE_ADMIN_USERNAME;
  const [author, setAuthor] = useState("");
  const [keepAuthor, setKeepAuthor] = useState(false);

  const submit = async (): Promise<void> => {
    if (!user?.username || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setFeedback(undefined);
    try {
      const submission = validatePuzzleSubmission(value);
      const result = await submitPuzzle(submission, { author: canSetAuthor ? author : undefined });
      setValue(createEmptyPuzzleSubmission());
      setEditorVersion((version) => version + 1);
      if (!keepAuthor) setAuthor("");
      if (result.destination === "published") {
        announceCoinsEarned(result.coinAward ?? 0, "Puzzle created");
        setFeedback({ tone: "success", text: `Puzzle ${result.puzzleId} created.` });
      } else {
        setFeedback({
          tone: "success",
          text: (
            <>
              Puzzle submitted for review.{" "}
              <a href={appAssetPath("/puzzles/review")}>View the review queue</a>.
            </>
          ),
        });
      }
    } catch (submitError) {
      setFeedback({
        tone: "error",
        text: getErrorMessage(submitError, "Unable to submit puzzle."),
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const currentLocation = `${window.location.pathname}${window.location.search}`;

  if (isLoading) return <RouteLoadingFallback />;

  return (
    <section className="puzzleQueuePage puzzleSubmissionPage">
      <Seo title="Submit a Puzzle" description="Submit an atomic chess puzzle for review." />

      {!isAuthenticated ? (
        <div className="puzzleQueueGate">
          <p>Log in with Lichess to submit a puzzle.</p>
          <button
            type="button"
            className="queuePrimaryButton"
            onClick={() => login(currentLocation)}
          >
            Log in with Lichess
          </button>
        </div>
      ) : (
        <PuzzleEditor
          busy={submitting}
          value={value}
          onChange={setValue}
          resetKey={String(editorVersion)}
          submissionWorkspace
          showAnalysisEngine
          allowSolutionEditing
          additionalMetadata={
            canSetAuthor ? (
              <div className="puzzleAuthorField">
                <PuzzleDraftField label="Puzzle author">
                  <input
                    type="text"
                    value={author}
                    placeholder={user?.username ?? PUZZLE_ADMIN_USERNAME}
                    spellCheck={false}
                    onChange={(event) => setAuthor(event.target.value)}
                  />
                </PuzzleDraftField>
                <label className="puzzleAuthorKeep" title="Keep author for next puzzle">
                  <input
                    type="checkbox"
                    aria-label="Keep author for next puzzle"
                    checked={keepAuthor}
                    onChange={(event) => setKeepAuthor(event.target.checked)}
                  />
                </label>
              </div>
            ) : null
          }
          feedback={feedback}
          beforeActions={<PuzzleStartingFenWarning fen={value.fen} />}
          actions={(disabled) => (
            <div className="puzzleSubmissionActions">
              <span>
                {canSetAuthor
                  ? `Creating for ${author.trim() || user?.username}`
                  : `Submitting as ${user?.username}`}
              </span>
              <button
                type="button"
                className="queuePrimaryButton"
                disabled={disabled}
                onClick={() => void submit()}
              >
                <FontAwesomeIcon icon={faFloppyDisk} aria-hidden="true" />
                {submitting
                  ? publishesDirectly
                    ? "Creating…"
                    : "Submitting…"
                  : publishesDirectly
                    ? "Create puzzle"
                    : "Submit for review"}
              </button>
            </div>
          )}
        />
      )}
    </section>
  );
};
