import "./PuzzleSubmission.css";

import { faPaperPlane } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";

import { isApprovedPuzzleCreator } from "../../../shared/domain/puzzles/approvedPuzzleCreators";
import { PuzzleMotifsPanel } from "../../components/PuzzleMotifsPanel/PuzzleMotifsPanel";
import { PuzzleStartingFenWarning } from "../../components/PuzzleStartingFenWarning/PuzzleStartingFenWarning";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { announceCoinsEarned } from "../../lib/coins/coinEvents";
import {
  createEmptyPuzzleSubmission,
  type PuzzleSubmissionValue,
  validatePuzzleSubmission,
} from "../../lib/puzzles/puzzleSubmission";
import { submitPuzzle, submitPuzzleBatch } from "../../lib/supabase/puzzleQueue";
import { getErrorMessage } from "../../utils/errors";
import { normalizeUsername } from "../../utils/playerNames";
import { PuzzleEditor } from "./PuzzleEditor";

const AUTHOR_OVERRIDE_USERNAME = "seaside_tiramisu";

export const formatCreatedPuzzleIds = (puzzleIds: number[]): string => {
  const firstId = puzzleIds[0];
  const lastId = puzzleIds.at(-1);
  if (firstId === undefined || lastId === undefined) return "";
  return puzzleIds.length > 1
    ? `Puzzles ${firstId}–${lastId} created.`
    : `Puzzle ${firstId} created.`;
};

export const PuzzleSubmissionPage = () => {
  const { isAuthenticated, isLoading, user, login } = useAuth();
  const [value, setValue] = useState<PuzzleSubmissionValue>(createEmptyPuzzleSubmission);
  const [batchMode, setBatchMode] = useState(false);
  const [batchValues, setBatchValues] = useState<PuzzleSubmissionValue[]>([]);
  const [activeBatchIndex, setActiveBatchIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const publishesDirectly = isApprovedPuzzleCreator(user?.username ?? "");
  const canSetAuthor = normalizeUsername(user?.username) === AUTHOR_OVERRIDE_USERNAME;
  const [author, setAuthor] = useState("");
  const [keepAuthor, setKeepAuthor] = useState(false);

  const submit = async (): Promise<void> => {
    if (!user?.username) return;
    setSubmitting(true);
    setMessage("");
    setError("");
    try {
      const submissions = batchMode && batchValues.length > 1 ? batchValues : [value];
      const normalizedSubmissions = submissions.map((submission, index) => {
        try {
          return validatePuzzleSubmission(submission);
        } catch (validationError) {
          const detail = getErrorMessage(validationError, "Invalid puzzle.");
          throw new Error(submissions.length > 1 ? `Puzzle ${index + 1}: ${detail}` : detail);
        }
      });
      const options = { author: canSetAuthor ? author : undefined };
      const result =
        publishesDirectly || normalizedSubmissions.length > 1
          ? await submitPuzzleBatch(normalizedSubmissions, options)
          : await submitPuzzle(normalizedSubmissions[0]!, options);
      setValue(createEmptyPuzzleSubmission());
      setBatchValues([]);
      setActiveBatchIndex(0);
      setEditorVersion((version) => version + 1);
      if (!keepAuthor) setAuthor("");
      if (result.destination === "published") {
        const createdPuzzleIds = "puzzleIds" in result ? result.puzzleIds : [result.puzzleId];
        if ("coinAward" in result) announceCoinsEarned(result.coinAward ?? 0, "Puzzle created");
        setMessage(formatCreatedPuzzleIds(createdPuzzleIds));
      } else {
        const submittedCount = "puzzles" in result ? result.puzzles.length : 1;
        setMessage(
          submittedCount > 1
            ? `${submittedCount} puzzles submitted for review. They will be reviewed as a set.`
            : "Puzzle submitted for review. Thank you!",
        );
      }
    } catch (submitError) {
      setError(getErrorMessage(submitError, "Unable to submit puzzle."));
    } finally {
      setSubmitting(false);
    }
  };

  const changeSubmissionMode = (nextBatchMode: boolean): void => {
    if (nextBatchMode === batchMode) return;
    setBatchMode(nextBatchMode);
    setBatchValues([]);
    setActiveBatchIndex(0);
    setValue(createEmptyPuzzleSubmission());
    setMessage("");
    setError("");
    setEditorVersion((version) => version + 1);
  };

  const updateValue = (nextValue: PuzzleSubmissionValue): void => {
    setValue(nextValue);
    if (batchValues.length === 0) return;
    setBatchValues((current) =>
      current.map((item, index) => {
        if (nextValue.event !== value.event) return { ...item, event: nextValue.event };
        return index === activeBatchIndex ? nextValue : item;
      }),
    );
  };

  const loadBatch = (values: PuzzleSubmissionValue[]): void => {
    const commonEvent = value.event.trim();
    const nextValues = commonEvent
      ? values.map((item) => ({ ...item, event: commonEvent }))
      : values;
    setBatchValues(nextValues);
    setActiveBatchIndex(0);
    setValue(nextValues[0] ?? createEmptyPuzzleSubmission());
    setEditorVersion((version) => version + 1);
    setMessage(`${nextValues.length} puzzles loaded. Review them with Previous and Next.`);
    setError("");
  };

  const navigateBatch = (index: number): void => {
    const next = batchValues[index];
    if (!next) return;
    setActiveBatchIndex(index);
    setValue(next);
    setEditorVersion((version) => version + 1);
    setMessage("");
    setError("");
  };

  const currentLocation = `${window.location.pathname}${window.location.search}`;

  if (isLoading) return <RouteLoadingFallback />;

  return (
    <section className="puzzleQueuePage puzzleSubmissionPage">
      <Seo title="Submit a Puzzle" description="Submit an atomic chess puzzle for review." />
      <header className="puzzleQueueHeader">
        <h1>Submit a Puzzle</h1>
      </header>

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
        <>
          <div className="puzzleSubmissionToolbar">
            <div className="puzzleSubmissionMode" role="group" aria-label="Submission type">
              <button
                type="button"
                className={!batchMode ? "active" : ""}
                aria-pressed={!batchMode}
                onClick={() => changeSubmissionMode(false)}
                disabled={submitting}
              >
                Single puzzle
              </button>
              <button
                type="button"
                className={batchMode ? "active" : ""}
                aria-pressed={batchMode}
                onClick={() => changeSubmissionMode(true)}
                disabled={submitting}
              >
                Puzzle batch
              </button>
            </div>
            {batchMode ? <p>Paste consecutive PGNs below, then review each puzzle.</p> : null}
          </div>
          <PuzzleEditor
            busy={submitting}
            value={value}
            onChange={updateValue}
            resetKey={`${editorVersion}-${activeBatchIndex}`}
            showAnalysisEngine
            solutionPgnUnderBoard
            showExplanation={!batchMode}
            batchMode={batchMode}
            allowSolutionEditing={!batchMode}
            fieldsBeforeEvent={
              canSetAuthor ? (
                <div className="puzzleAuthorField">
                  <label>
                    <span>Puzzle author</span>
                    <input
                      type="text"
                      aria-label="Puzzle author"
                      value={author}
                      placeholder={user?.username ?? AUTHOR_OVERRIDE_USERNAME}
                      spellCheck={false}
                      onChange={(event) => setAuthor(event.target.value)}
                    />
                  </label>
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
            eventAside={
              <PuzzleMotifsPanel
                key={`${editorVersion}-${activeBatchIndex}-tags`}
                visible
                tags={value.tags ?? []}
                canManage={!submitting}
                onUpdate={(tags) => updateValue({ ...value, tags })}
              />
            }
            {...(batchValues.length > 1
              ? { batchPosition: { current: activeBatchIndex, total: batchValues.length } }
              : {})}
            onBatchLoad={loadBatch}
            onPreviousPuzzle={() => navigateBatch(activeBatchIndex - 1)}
            onNextPuzzle={() => navigateBatch(activeBatchIndex + 1)}
            feedback={
              error
                ? { tone: "error", text: error }
                : message
                  ? {
                      tone: "success",
                      text: message.includes("submitted for review") ? (
                        <>
                          {message} You can view your submission in the queue at{" "}
                          <a href="https://atomicpuzzles.org/puzzles/review">
                            atomicpuzzles.org/puzzles/review
                          </a>
                          .
                        </>
                      ) : (
                        message
                      ),
                    }
                  : undefined
            }
            beforeActions={<PuzzleStartingFenWarning fen={value.fen} />}
            actions={
              <div className="puzzleQueueSubmitRow">
                <span>
                  {canSetAuthor
                    ? `Creating for ${author.trim() || user?.username}`
                    : `Submitting as ${user?.username}`}
                </span>
                <button
                  type="button"
                  className="queuePrimaryButton puzzleSubmitReviewButton"
                  onClick={() => void submit()}
                >
                  <FontAwesomeIcon icon={faPaperPlane} aria-hidden="true" />
                  <span>
                    {submitting
                      ? publishesDirectly
                        ? "Creating…"
                        : "Submitting…"
                      : batchValues.length > 1
                        ? publishesDirectly
                          ? `Create ${batchValues.length} puzzles`
                          : `Submit ${batchValues.length} puzzles for review`
                        : publishesDirectly
                          ? "Create puzzle"
                          : "Submit for review"}
                  </span>
                </button>
              </div>
            }
          />
        </>
      )}
    </section>
  );
};
