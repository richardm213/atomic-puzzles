import "./PuzzleSubmission.css";

import { faPaperPlane } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { INITIAL_FEN as STARTING_FEN } from "chessops/fen";
import { useState } from "react";

import { isApprovedPuzzleCreator } from "../../../shared/domain/puzzles/approvedPuzzleCreators";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import {
  type PuzzleSubmissionValue,
  validatePuzzleSubmission,
} from "../../lib/puzzles/puzzleSubmission";
import {
  DIFFERENT_START_MOVE_CONFIRMATION,
  submitPuzzle,
  submitPuzzleBatch,
} from "../../lib/supabase/puzzleQueue";
import { PuzzleAnalysisInstructions } from "./PuzzleAnalysisInstructions";
import { PuzzleEditor } from "./PuzzleEditor";

const SUBMISSION_STEPS = [
  "Set up the position on the Lichess analysis board",
  "Write the complete solution there",
  "Copy and paste the PGN below",
];
const BATCH_SUBMISSION_STEPS = [
  "Create each position and complete solution on Lichess",
  "Copy the complete PGN for each puzzle",
  "Paste all consecutive PGNs into the box below",
];

const emptyPuzzleSubmission = (): PuzzleSubmissionValue => ({
  fen: STARTING_FEN,
  solution: "",
  event: "",
  explanation: "",
});

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
  const [value, setValue] = useState<PuzzleSubmissionValue>(emptyPuzzleSubmission);
  const [batchMode, setBatchMode] = useState(false);
  const [batchValues, setBatchValues] = useState<PuzzleSubmissionValue[]>([]);
  const [activeBatchIndex, setActiveBatchIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmDifferentStartMove, setConfirmDifferentStartMove] = useState(false);
  const publishesDirectly = isApprovedPuzzleCreator(user?.username ?? "");

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
          const detail =
            validationError instanceof Error ? validationError.message : "Invalid puzzle.";
          throw new Error(submissions.length > 1 ? `Puzzle ${index + 1}: ${detail}` : detail);
        }
      });
      if (publishesDirectly) {
        const result = await submitPuzzleBatch(normalizedSubmissions, {
          allowDifferentStartMove,
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
        for (const normalized of normalizedSubmissions) {
          await submitPuzzle(normalized, { allowDifferentStartMove });
          submittedCount += 1;
        }
      }
      setValue(emptyPuzzleSubmission());
      setBatchValues([]);
      setActiveBatchIndex(0);
      setEditorVersion((version) => version + 1);
      setConfirmDifferentStartMove(false);
      if (publishesDirectly && !allowDifferentStartMove) {
        setMessage(formatCreatedPuzzleIds(createdPuzzleIds));
      } else {
        setMessage(
          submittedCount > 1
            ? `${submittedCount} puzzles submitted for review. They will be reviewed as a set.`
            : "Puzzle submitted for review. Thank you!",
        );
      }
    } catch (submitError) {
      const detail =
        submitError instanceof Error ? submitError.message : "Unable to submit puzzle.";
      if (submittedCount > 0 && batchValues.length > submittedCount) {
        const remaining = batchValues.slice(submittedCount);
        setBatchValues(remaining);
        setActiveBatchIndex(0);
        setValue(remaining[0] ?? emptyPuzzleSubmission());
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
    setValue(emptyPuzzleSubmission());
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
    setValue(nextValues[0] ?? emptyPuzzleSubmission());
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
    <section className="puzzleQueuePage">
      <Seo title="Submit a Puzzle" description="Submit an atomic chess puzzle for review." />
      <header className="puzzleQueueHeader">
        <p className="puzzleQueueEyebrow">Community puzzles</p>
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
          <PuzzleAnalysisInstructions
            title={
              batchMode ? "Create the puzzle batch on Lichess" : "Create the solution on Lichess"
            }
            steps={batchMode ? BATCH_SUBMISSION_STEPS : SUBMISSION_STEPS}
          />
          <PuzzleEditor
            value={value}
            onChange={updateValue}
            resetKey={`${editorVersion}-${activeBatchIndex}`}
            showExplanation={!batchMode}
            batchMode={batchMode}
            allowSolutionEditing={!batchMode}
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
