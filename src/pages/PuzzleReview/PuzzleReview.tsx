import "../PuzzleSubmission/PuzzleSubmission.css";

import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { INITIAL_FEN as STARTING_FEN } from "chessops/fen";
import { useEffect, useState } from "react";

import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import {
  type PuzzleSubmissionValue,
  validatePuzzleSubmission,
} from "../../lib/puzzles/puzzleSubmission";
import {
  approveQueuedPuzzle,
  fetchPendingPuzzleQueue,
  rejectQueuedPuzzle,
  updateQueuedPuzzle,
} from "../../lib/supabase/supabasePuzzleQueue";
import type { PuzzleQueueRow, PuzzleReviewQueueRow } from "../../types/supabase";
import { normalizeUsername } from "../../utils/playerNames";
import { PuzzleAnalysisInstructions } from "../PuzzleSubmission/PuzzleAnalysisInstructions";
import { PuzzleEditor } from "../PuzzleSubmission/PuzzleEditor";

const REVIEWER = "seaside_tiramisu";
const REVIEW_STEPS = [
  "Copy and paste the PGN into the Atomic analysis board",
  "Verify every solution line is correct and no lines are missing",
  "Check that decent moves that are not as good as the solution are marked with ? (for example Nf3?)",
];

const emptyPuzzleSubmission = (): PuzzleSubmissionValue => ({
  fen: STARTING_FEN,
  solution: "",
  event: "",
  explanation: "",
});

const queueRowValue = (row: PuzzleQueueRow): PuzzleSubmissionValue => ({
  fen: row.fen,
  solution: row.solution,
  event: row.event ?? "",
  explanation: row.explanation ?? "",
});

export const PuzzleReviewPage = () => {
  const { isLoading, user } = useAuth();
  const [queue, setQueue] = useState<PuzzleReviewQueueRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [value, setValue] = useState<PuzzleSubmissionValue>(emptyPuzzleSubmission);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [puzzleIdInput, setPuzzleIdInput] = useState("");
  const [authorInput, setAuthorInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
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
          setValue(queueRowValue(first));
          setPuzzleIdInput(String(first.next_puzzle_id));
          setAuthorInput(first.submitted_by);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load puzzle queue.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingQueue(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectQueuedPuzzle = (row: PuzzleReviewQueueRow): void => {
    setValue(queueRowValue(row));
    setAuthorInput(row.submitted_by);
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
    setValue(queueRowValue(saved));
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
      const puzzleId = await approveQueuedPuzzle(selectedId, requestedPuzzleId);
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
      setError(approveError instanceof Error ? approveError.message : "Unable to approve puzzle.");
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
      setError(rejectError instanceof Error ? rejectError.message : "Unable to reject puzzle.");
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
      <PuzzleAnalysisInstructions
        aria-label="Review checklist"
        title="Review each solution on Lichess"
        review
        steps={REVIEW_STEPS}
      />

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
              {isReviewer ? (
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
                <div className="puzzleReviewMeta">
                  <span>Author: {selected.submitted_by}</span>
                  <span>Puzzle ID: {selected.next_puzzle_id}</span>
                </div>
              )}
              <PuzzleEditor
                value={value}
                onChange={setValue}
                resetKey={selected.id}
                showCopyPgn
                allowSolutionEditing
                readOnly={!isReviewer}
              />
              {error ? <p className="queueMessage error">{error}</p> : null}
              {isReviewer ? (
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
