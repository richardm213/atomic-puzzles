import "../PuzzleSubmission/PuzzleSubmission.css";

import {
  faCheck,
  faClockRotateLeft,
  faRotateLeft,
  faRotateRight,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import {
  createEmptyPuzzleSubmission,
  type PuzzleSubmissionValue,
  validatePuzzleSubmission,
} from "../../lib/puzzles/puzzleSubmission";
import {
  approveQueuedPuzzle,
  fetchPendingPuzzleQueue,
  rejectQueuedPuzzle,
  updateQueuedPuzzle,
} from "../../lib/supabase/puzzleQueue";
import type { PuzzleQueueRow, PuzzleReviewQueueRow } from "../../lib/supabase/types";
import { getErrorMessage } from "../../utils/errors";
import { normalizeUsername } from "../../utils/playerNames";
import { PuzzleEditor } from "../PuzzleSubmission/PuzzleEditor";

const REVIEWER = "seaside_tiramisu";
const HISTORY_LIMIT = 5;
const HISTORY_GROUP_DELAY_MS = 700;

const queueRowValue = (row: PuzzleQueueRow): PuzzleSubmissionValue => ({
  fen: row.fen,
  solution: row.solution,
  event: row.event ?? "",
  whitePlayer: row.white_player ?? "",
  blackPlayer: row.black_player ?? "",
  explanation: row.explanation ?? "",
  opaStyle: row.opa_style === true,
});

export const PuzzleReviewPage = () => {
  const { isLoading, user } = useAuth();
  const [queue, setQueue] = useState<PuzzleReviewQueueRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [value, setValue] = useState<PuzzleSubmissionValue>(createEmptyPuzzleSubmission);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [puzzleIdInput, setPuzzleIdInput] = useState("");
  const [authorInput, setAuthorInput] = useState("");
  const [complexityBonus, setComplexityBonus] = useState(true);
  const [explanationBonus, setExplanationBonus] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editorRevision, setEditorRevision] = useState(0);
  const [valueHistory, setValueHistory] = useState<{
    past: PuzzleSubmissionValue[];
    future: PuzzleSubmissionValue[];
  }>({ past: [], future: [] });
  const valueRef = useRef(value);
  const originalValueRef = useRef(value);
  const historyGroupTimerRef = useRef<number | null>(null);
  const isReviewer = normalizeUsername(user?.username) === REVIEWER;

  useEffect(() => {
    let cancelled = false;
    setLoadingQueue(true);
    setError("");
    void fetchPendingPuzzleQueue()
      .then((rows) => {
        if (cancelled) return;
        const first = rows[0] ?? null;
        setQueue(rows);
        setSelectedId(first?.id ?? null);
        if (first) {
          const firstValue = queueRowValue(first);
          valueRef.current = firstValue;
          originalValueRef.current = firstValue;
          setValue(firstValue);
          setValueHistory({ past: [], future: [] });
          setPuzzleIdInput(String(first.next_puzzle_id));
          setAuthorInput(first.author || first.submitted_by);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(getErrorMessage(loadError, "Unable to load puzzle queue."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingQueue(false);
      });

    return () => {
      cancelled = true;
      if (historyGroupTimerRef.current !== null) {
        window.clearTimeout(historyGroupTimerRef.current);
      }
    };
  }, []);

  const clearHistoryGroup = (): void => {
    if (historyGroupTimerRef.current !== null) {
      window.clearTimeout(historyGroupTimerRef.current);
      historyGroupTimerRef.current = null;
    }
  };

  const replaceValue = (nextValue: PuzzleSubmissionValue): void => {
    clearHistoryGroup();
    valueRef.current = nextValue;
    setValue(nextValue);
  };

  const resetValueHistory = (nextValue: PuzzleSubmissionValue): void => {
    replaceValue(nextValue);
    originalValueRef.current = nextValue;
    setValueHistory({ past: [], future: [] });
  };

  const changeValue = (nextValue: PuzzleSubmissionValue): void => {
    const currentValue = valueRef.current;
    if (JSON.stringify(currentValue) === JSON.stringify(nextValue)) return;

    if (historyGroupTimerRef.current === null) {
      setValueHistory((current) => ({
        past: [...current.past, currentValue].slice(-HISTORY_LIMIT),
        future: [],
      }));
    }
    valueRef.current = nextValue;
    setValue(nextValue);
    if (historyGroupTimerRef.current !== null) {
      window.clearTimeout(historyGroupTimerRef.current);
    }
    historyGroupTimerRef.current = window.setTimeout(() => {
      historyGroupTimerRef.current = null;
    }, HISTORY_GROUP_DELAY_MS);
  };

  const undoValue = (): void => {
    const previous = valueHistory.past.at(-1);
    if (!previous) return;
    const currentValue = valueRef.current;
    replaceValue(previous);
    setEditorRevision((current) => current + 1);
    setValueHistory({
      past: valueHistory.past.slice(0, -1),
      future: [currentValue, ...valueHistory.future].slice(0, HISTORY_LIMIT),
    });
  };

  const redoValue = (): void => {
    const next = valueHistory.future[0];
    if (!next) return;
    const currentValue = valueRef.current;
    replaceValue(next);
    setEditorRevision((current) => current + 1);
    setValueHistory({
      past: [...valueHistory.past, currentValue].slice(-HISTORY_LIMIT),
      future: valueHistory.future.slice(1),
    });
  };

  const resetValue = (): void => {
    const originalValue = originalValueRef.current;
    const currentValue = valueRef.current;
    if (JSON.stringify(currentValue) === JSON.stringify(originalValue)) return;
    replaceValue(originalValue);
    setEditorRevision((current) => current + 1);
    setValueHistory({
      past: [...valueHistory.past, currentValue].slice(-HISTORY_LIMIT),
      future: [],
    });
  };

  const selectQueuedPuzzle = (row: PuzzleReviewQueueRow): void => {
    resetValueHistory(queueRowValue(row));
    setAuthorInput(row.submitted_by);
    setComplexityBonus(true);
    setExplanationBonus(false);
    setSelectedId(row.id);
    setMessage("");
    setError("");
  };

  const saveBeforeApproval = async (queueId: number): Promise<void> => {
    const author = authorInput.trim();
    if (!author) throw new Error("Enter an author.");
    const normalized = validatePuzzleSubmission(value);
    const saved = await updateQueuedPuzzle(queueId, { ...normalized, author });
    setQueue((rows) =>
      rows.map((row) =>
        row.id === saved.id ? { ...saved, next_puzzle_id: row.next_puzzle_id } : row,
      ),
    );
    replaceValue(queueRowValue(saved));
    setAuthorInput(saved.submitted_by);
  };

  const approve = async (): Promise<void> => {
    if (selectedId === null) return;
    const requestedPuzzleId = Number(puzzleIdInput);
    if (!Number.isSafeInteger(requestedPuzzleId) || requestedPuzzleId < 1) {
      setError("Puzzle ID must be a positive integer.");
      return;
    }
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await saveBeforeApproval(selectedId);
      const puzzleId = await approveQueuedPuzzle(selectedId, requestedPuzzleId, {
        complexity: complexityBonus,
        explanation: explanationBonus,
      });
      const nextPuzzleId = puzzleId + 1;
      const nextQueue = queue
        .filter((row) => row.id !== selectedId)
        .map((row) => ({ ...row, next_puzzle_id: nextPuzzleId }));
      setQueue(nextQueue);
      setPuzzleIdInput(String(nextPuzzleId));
      const next = nextQueue[0];
      if (next) {
        selectQueuedPuzzle(next);
      } else {
        setSelectedId(null);
        setPuzzleIdInput("");
        setAuthorInput("");
      }
      setMessage(`Approved and added as puzzle #${puzzleId}.`);
    } catch (approveError) {
      setError(getErrorMessage(approveError, "Unable to approve puzzle."));
    } finally {
      setSaving(false);
    }
  };

  const reject = async (): Promise<void> => {
    if (selectedId === null) return;
    if (!window.confirm("Reject this puzzle and permanently remove it from the review queue?")) {
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");
    try {
      await rejectQueuedPuzzle(selectedId);
      const nextQueue = queue.filter((row) => row.id !== selectedId);
      setQueue(nextQueue);
      const next = nextQueue[0];
      if (next) {
        selectQueuedPuzzle(next);
      } else {
        setSelectedId(null);
        setPuzzleIdInput("");
        setAuthorInput("");
      }
      setMessage("Puzzle rejected and removed from the queue.");
    } catch (rejectError) {
      setError(getErrorMessage(rejectError, "Unable to reject puzzle."));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || (loadingQueue && queue.length === 0)) {
    return <RouteLoadingFallback />;
  }

  const selected = queue.find((row) => row.id === selectedId) ?? null;
  return (
    <section className="puzzleQueuePage">
      <Seo title="Puzzle review queue" description="Review submitted atomic chess puzzles." />
      {isReviewer ? (
        <header className="puzzleQueueHeader puzzleAdminHeader">
          <h1>Puzzle review queue</h1>
          <Link className="queueSecondaryButton" to="/puzzles/recent">
            Recent puzzles
          </Link>
        </header>
      ) : null}
      <div className="puzzleReviewLayout">
        <aside className="puzzleQueueList" aria-label="Pending submissions">
          {queue.map((row) => (
            <button
              key={row.id}
              type="button"
              className={row.id === selectedId ? "active" : ""}
              onClick={() => selectQueuedPuzzle(row)}
            >
              <strong>
                Puzzle {row.id === selectedId && puzzleIdInput ? puzzleIdInput : row.next_puzzle_id}
              </strong>
              <small>{new Date(row.created_at).toLocaleDateString()}</small>
            </button>
          ))}
        </aside>

        <div className="puzzleReviewEditor">
          {selected ? (
            <>
              <div className="puzzleReviewMeta">
                <span>{new Date(selected.created_at).toLocaleString()}</span>
              </div>
              <PuzzleEditor
                value={value}
                onChange={changeValue}
                resetKey={`${selected.id}-${editorRevision}`}
                allowSolutionEditing
                readOnly={!isReviewer}
                showAnalysisEngine
                showExplanation={false}
                showSolutionPgnField={false}
                boardFooter={
                  <>
                    <label className="puzzleReviewBoardExplanation">
                      <span>Explanation</span>
                      <textarea
                        value={value.explanation}
                        rows={5}
                        spellCheck
                        readOnly={!isReviewer}
                        onChange={(event) =>
                          changeValue({ ...value, explanation: event.target.value })
                        }
                      />
                    </label>
                    {isReviewer ? (
                      <div className="puzzleReviewHistory" aria-label="Edit history">
                        <button
                          type="button"
                          aria-label="Undo"
                          title="Undo"
                          disabled={valueHistory.past.length === 0}
                          onClick={undoValue}
                        >
                          <FontAwesomeIcon icon={faRotateLeft} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label="Redo"
                          title="Redo"
                          disabled={valueHistory.future.length === 0}
                          onClick={redoValue}
                        >
                          <FontAwesomeIcon icon={faRotateRight} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="reset"
                          disabled={
                            JSON.stringify(value) === JSON.stringify(originalValueRef.current)
                          }
                          onClick={resetValue}
                        >
                          <FontAwesomeIcon icon={faClockRotateLeft} aria-hidden="true" />
                          Reset
                        </button>
                      </div>
                    ) : null}
                  </>
                }
                fieldsBeforeEvent={
                  isReviewer ? (
                    <div className="puzzleReviewFields">
                      <label className="puzzleReviewField">
                        <span>Author</span>
                        <input
                          type="text"
                          value={authorInput}
                          disabled={saving}
                          onChange={(event) => setAuthorInput(event.target.value)}
                        />
                      </label>
                      <label className="puzzleReviewField">
                        <span>Puzzle ID</span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={puzzleIdInput}
                          disabled={saving}
                          onChange={(event) => setPuzzleIdInput(event.target.value)}
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="puzzleReviewMeta puzzleReviewFieldMeta">
                      <span>Author: {selected.submitted_by}</span>
                      <span>Puzzle ID: {selected.next_puzzle_id}</span>
                    </div>
                  )
                }
              />
              {error ? <p className="queueMessage error">{error}</p> : null}
              {isReviewer ? (
                <div className="puzzleReviewDecisionRow">
                  <fieldset className="puzzleReviewBonuses" disabled={saving}>
                    <legend>Bonuses beyond the +5 base reward</legend>
                    <div className="puzzleReviewBonusOptions">
                      <label>
                        <input
                          type="checkbox"
                          checked={complexityBonus}
                          onChange={(event) => setComplexityBonus(event.target.checked)}
                        />
                        <span>+3 Not overly simplistic</span>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={explanationBonus}
                          onChange={(event) => setExplanationBonus(event.target.checked)}
                        />
                        <span>+2 Explanation</span>
                      </label>
                    </div>
                    <output>
                      Total +{5 + (complexityBonus ? 3 : 0) + (explanationBonus ? 2 : 0)}
                    </output>
                  </fieldset>
                  <div className="puzzleReviewActions">
                    <button
                      type="button"
                      className="queueDangerButton puzzleReviewRejectButton"
                      disabled={saving}
                      onClick={() => void reject()}
                    >
                      <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                      Reject
                    </button>
                    <button
                      type="button"
                      className="queuePrimaryButton puzzleReviewApproveButton"
                      disabled={saving}
                      onClick={() => void approve()}
                    >
                      <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
                      {saving ? "Working…" : "Approve"}
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
          {!selected && error ? <p className="queueMessage error">{error}</p> : null}
          {message || (!loadingQueue && queue.length === 0) ? (
            <p className="queueMessage success">
              {message}
              {!loadingQueue && queue.length === 0 ? (
                <>{message ? " " : ""}The queue is clear.</>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
};
