import "./PuzzleSubmission.css";

import { faPaperPlane } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";

import { isApprovedPuzzleCreator } from "../../../shared/domain/puzzles/approvedPuzzleCreators";
import { PuzzleMotifsPanel } from "../../components/PuzzleMotifsPanel/PuzzleMotifsPanel";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { announceCoinsEarned } from "../../lib/coins/coinEvents";
import {
  createEmptyPuzzleSubmission,
  type PuzzleSubmissionValue,
  validatePuzzleSubmission,
} from "../../lib/puzzles/puzzleSubmission";
import {
  DIFFERENT_START_MOVE_CONFIRMATION,
  submitPuzzle,
  submitPuzzleBatch,
} from "../../lib/supabase/puzzleQueue";
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
  const [confirmDifferentStartMove, setConfirmDifferentStartMove] = useState(false);
  const publishesDirectly = isApprovedPuzzleCreator(user?.username ?? "");
  const canSetAuthor = normalizeUsername(user?.username) === AUTHOR_OVERRIDE_USERNAME;
  const [author, setAuthor] = useState("");
  const [keepAuthor, setKeepAuthor] = useState(false);

  const submit = async (allowDifferentStartMove = false): Promise<void> => {
    if (!user?.username) return;
    setSubmitting(true);
    setMessage("");
    setError("");
    if (!allowDifferentStartMove) setConfirmDifferentStartMove(false);
    let submittedCount = 0;
    const createdPuzzleIds: number[] = [];
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
      if (publishesDirectly) {
        const result = await submitPuzzleBatch(normalizedSubmissions, {
          allowDifferentStartMove,
          author: canSetAuthor ? author : undefined,
        });
        if (allowDifferentStartMove) {
          if (result.destination !== "review") {
            throw new Error("The alternate starting move was not sent for review.");
          }
          submittedCount = result.puzzles.length;
        } else {
          if (result.destination !== "published") {
            throw new Error("Approved creator submission did not publish directly.");
          }
          createdPuzzleIds.push(...result.puzzleIds);
          submittedCount = result.puzzleIds.length;
        }
      } else {
        if (normalizedSubmissions.length > 1) {
          const result = await submitPuzzleBatch(normalizedSubmissions, {
            allowDifferentStartMove,
            author: canSetAuthor ? author : undefined,
          });
          if (result.destination !== "review") {
            throw new Error("Puzzle batch was not sent for review.");
          }
          submittedCount = result.puzzles.length;
        } else {
          const normalized = normalizedSubmissions[0];
          if (!normalized) throw new Error("No puzzle was available to submit.");
          await submitPuzzle(normalized, {
            allowDifferentStartMove,
            author: canSetAuthor ? author : undefined,
          });
          submittedCount = 1;
        }
      }
      setValue(createEmptyPuzzleSubmission());
      setBatchValues([]);
      setActiveBatchIndex(0);
      setEditorVersion((version) => version + 1);
      setConfirmDifferentStartMove(false);
      if (!keepAuthor) setAuthor("");
      if (publishesDirectly && !allowDifferentStartMove) {
        announceCoinsEarned(createdPuzzleIds.length * 10, "Puzzle created");
        setMessage(formatCreatedPuzzleIds(createdPuzzleIds));
      } else {
        setMessage(
          submittedCount > 1
            ? `${submittedCount} puzzles submitted for review. They will be reviewed as a set.`
            : "Puzzle submitted for review. Thank you!",
        );
      }
    } catch (submitError) {
      const detail = getErrorMessage(submitError, "Unable to submit puzzle.");
      if (submittedCount > 0 && batchValues.length > submittedCount) {
        const remaining = batchValues.slice(submittedCount);
        setBatchValues(remaining);
        setActiveBatchIndex(0);
        setValue(remaining[0] ?? createEmptyPuzzleSubmission());
        setEditorVersion((version) => version + 1);
      }
      if (detail === DIFFERENT_START_MOVE_CONFIRMATION) {
        setConfirmDifferentStartMove(true);
        return;
      }
      setError(
        submittedCount > 0
          ? publishesDirectly && !allowDifferentStartMove
            ? `${formatCreatedPuzzleIds(createdPuzzleIds).replace(/\.$/, "")} before an error: ${detail}`
            : `${submittedCount} puzzle${submittedCount === 1 ? " was" : "s were"} submitted before an error: ${detail}`
          : detail,
      );
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
    setConfirmDifferentStartMove(false);
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
    setConfirmDifferentStartMove(false);
  };

  const navigateBatch = (index: number): void => {
    const next = batchValues[index];
    if (!next) return;
    setActiveBatchIndex(index);
    setValue(next);
    setEditorVersion((version) => version + 1);
    setMessage("");
    setError("");
    setConfirmDifferentStartMove(false);
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
              >
                Single puzzle
              </button>
              <button
                type="button"
                className={batchMode ? "active" : ""}
                aria-pressed={batchMode}
                onClick={() => changeSubmissionMode(true)}
              >
                Puzzle batch
              </button>
            </div>
            {batchMode ? <p>Paste consecutive PGNs below, then review each puzzle.</p> : null}
          </div>
          <PuzzleEditor
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
              confirmDifferentStartMove
                ? { tone: "warning", text: DIFFERENT_START_MOVE_CONFIRMATION }
                : error
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
            actions={
              <div className="puzzleQueueSubmitRow">
                <span>Submitting as {user?.username}</span>
                {confirmDifferentStartMove ? (
                  <button
                    type="button"
                    className="queueSecondaryButton"
                    disabled={submitting}
                    onClick={() => setConfirmDifferentStartMove(false)}
                  >
                    Cancel
                  </button>
                ) : null}
                <button
                  type="button"
                  className="queuePrimaryButton puzzleSubmitReviewButton"
                  disabled={submitting}
                  onClick={() => void submit(confirmDifferentStartMove)}
                >
                  <FontAwesomeIcon icon={faPaperPlane} aria-hidden="true" />
                  <span>
                    {submitting
                      ? publishesDirectly
                        ? confirmDifferentStartMove
                          ? "Sending…"
                          : "Creating…"
                        : "Submitting…"
                      : confirmDifferentStartMove
                        ? "Send to review"
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
