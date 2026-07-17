import "./PuzzleSubmission.css";

import { faCheck, faCopy, faPaperPlane, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";

import { Chessboard } from "../../components/Chessboard/Chessboard";
import { Seo } from "../../components/Seo/Seo";
import {
  continuationOptionsAt,
  SolutionMoveTree,
  SolutionPlaybackControls,
} from "../../components/SolutionMoveNavigation/SolutionMoveNavigation";
import { useAuth } from "../../context/AuthContext";
import {
  ensurePuzzlePgnHeaders,
  parsePuzzlePgnInput,
  type PuzzleSubmissionValue,
  validatePuzzleSubmission,
} from "../../lib/puzzles/puzzleSubmission";
import { convertUciLineToSan, parseSolutionUciLines } from "../../lib/puzzles/solutionPgn";
import {
  approveQueuedPuzzle,
  fetchPendingPuzzleQueue,
  rejectQueuedPuzzle,
  submitPuzzleToQueue,
  updateQueuedPuzzle,
} from "../../lib/supabase/supabasePuzzleQueue";
import type { ChessboardState, PlaybackCommand, SolutionNavigation } from "../../types/chessboard";
import type { PuzzleQueueRow, PuzzleReviewQueueRow } from "../../types/supabase";
import { copyTextToClipboard } from "../../utils/clipboard";
import { normalizeUsername } from "../../utils/playerNames";
import { PuzzleAnalysisInstructions } from "./PuzzleAnalysisInstructions";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const REVIEWER = "seaside_tiramisu";
const SUBMISSION_STEPS = [
  "Set up the position on the Lichess analysis board",
  "Write the complete solution there",
  "Copy and paste the PGN below",
];
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

const combinePgnHeadersAndMoves = (headers: string, moves: string): string =>
  headers && moves ? `${headers}\n\n${moves}` : headers || moves;

const editorPgnState = (solution: string, fallbackFen: string) => {
  try {
    const parsed = parsePuzzlePgnInput(solution, fallbackFen);
    const fen = parsed.fen || fallbackFen;
    const headers = ensurePuzzlePgnHeaders(parsed.headerText, fen);
    return {
      fen,
      draft: combinePgnHeadersAndMoves(headers, parsed.solution),
    };
  } catch {
    return { fen: fallbackFen, draft: solution };
  }
};

type PuzzleEditorFeedback = {
  tone: "error" | "success";
  text: string;
};

type PuzzleEditorProps = {
  value: PuzzleSubmissionValue;
  onChange: (value: PuzzleSubmissionValue) => void;
  resetKey: string | number;
  actions?: ReactNode;
  feedback?: PuzzleEditorFeedback | undefined;
  showCopyPgn?: boolean;
};

export const PuzzleEditor = ({
  value,
  onChange,
  resetKey,
  actions,
  feedback,
  showCopyPgn = false,
}: PuzzleEditorProps) => {
  const initialPgnState = editorPgnState(value.solution, value.fen || STARTING_FEN);
  const [appliedFen, setAppliedFen] = useState(initialPgnState.fen);
  const [solutionDraft, setSolutionDraft] = useState(initialPgnState.draft);
  const [orientation, setOrientation] = useState<"white" | "black">(
    (value.fen || STARTING_FEN).split(" ")[1] === "b" ? "black" : "white",
  );
  const [navigation, setNavigation] = useState<SolutionNavigation | null>(null);
  const [boardState, setBoardState] = useState<ChessboardState | null>(null);
  const [editorError, setEditorError] = useState("");
  const [activeLineIndex, setActiveLineIndex] = useState(0);
  const [copyPgnLabel, setCopyPgnLabel] = useState("Copy PGN");
  const copyResetTimerRef = useRef<number | null>(null);
  const solutionInputId = useId();
  const solutionLocked = Boolean(value.solution.trim());

  const solutionMovetext = useMemo(() => {
    try {
      return parsePuzzlePgnInput(value.solution, appliedFen).solution;
    } catch {
      return value.solution;
    }
  }, [appliedFen, value.solution]);

  const solutionLines = useMemo(
    () =>
      parseSolutionUciLines(appliedFen, solutionMovetext)
        .map((line) => convertUciLineToSan(appliedFen, line))
        .filter((line) => line.length > 0),
    [appliedFen, solutionMovetext],
  );

  useEffect(() => {
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = null;
    }
    setCopyPgnLabel("Copy PGN");
    const nextPgnState = editorPgnState(value.solution, value.fen || STARTING_FEN);
    const nextFen = nextPgnState.fen;
    setAppliedFen(nextFen);
    setSolutionDraft(nextPgnState.draft);
    setOrientation(nextFen.split(" ")[1] === "b" ? "black" : "white");
    setEditorError("");
    setActiveLineIndex(0);
    setNavigation(
      value.solution.trim()
        ? {
            type: "solution",
            line: 0,
            ply: parseSolutionUciLines(nextFen, value.solution)[0]?.length ?? 0,
          }
        : { type: "reset", fen: nextFen },
    );
    // resetKey intentionally identifies a newly selected submission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(
    () => () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    },
    [],
  );

  const applySolutionDraft = (): void => {
    try {
      const parsed = parsePuzzlePgnInput(solutionDraft, appliedFen);
      const nextFen = parsed.fen || appliedFen;
      const nextHeaders = ensurePuzzlePgnHeaders(parsed.headerText, nextFen);

      if (!parsed.solution) {
        onChange({ ...value, fen: nextFen, solution: "" });
        setAppliedFen(nextFen);
        setOrientation(nextFen.split(" ")[1] === "b" ? "black" : "white");
        setNavigation({ type: "reset", fen: nextFen });
        setEditorError("Enter at least one move.");
        return;
      }

      const normalized = validatePuzzleSubmission({ ...value, solution: solutionDraft });
      onChange(normalized);
      setSolutionDraft(combinePgnHeadersAndMoves(nextHeaders, parsed.solution));
      setAppliedFen(normalized.fen);
      setOrientation(normalized.fen.split(" ")[1] === "b" ? "black" : "white");
      setEditorError("");
      setNavigation({
        type: "solution",
        line: 0,
        ply: 0,
      });
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Invalid move line.");
    }
  };

  const handleSolutionChange = (solution: string): void => {
    setSolutionDraft(solution);
    setEditorError("");
  };

  const copyPgn = async (): Promise<void> => {
    const copied = await copyTextToClipboard(solutionDraft);
    setCopyPgnLabel(copied ? "Copied" : "Copy failed");
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = window.setTimeout(() => {
      setCopyPgnLabel("Copy PGN");
      copyResetTimerRef.current = null;
    }, 1_500);
  };

  const navigate = (command: PlaybackCommand): void => {
    setNavigation({ type: "command", command });
  };

  const navigateToMove = (lineIndex: number, moveIndex: number): void => {
    const line = solutionLines[lineIndex];
    if (!line) return;

    setActiveLineIndex(lineIndex);
    setNavigation({ type: "solution", line: lineIndex, ply: moveIndex + 1 });
  };

  const handleBoardState = (state: ChessboardState): void => {
    setBoardState(state);
    if (state.viewingSolution) setActiveLineIndex(state.solutionLineIndex ?? 0);
    if (state.error) {
      setEditorError(state.error);
    }
  };

  const currentPly = boardState?.lineIndex ?? 0;
  const moveCount = boardState?.lineMoves?.length ?? 0;
  const currentMoves = useMemo(
    () => boardState?.lineMoves?.slice(0, currentPly) ?? [],
    [boardState?.lineMoves, currentPly],
  );
  const variationOptionList = useMemo(
    () => continuationOptionsAt(solutionLines, currentMoves),
    [currentMoves, solutionLines],
  );

  return (
    <div className="puzzleEditor">
      <div className="puzzleEditorBoard">
        <Chessboard
          puzzleId={`queue-editor-${resetKey}`}
          fen={appliedFen}
          orientation={orientation}
          coordinates
          solution={value.solution}
          showSolution={false}
          analysisMode
          captureNavigationShortcuts
          preserveAnalysisHistoryOnSolutionChange
          restrictMovesToSolution
          solutionNavigation={navigation}
          onNavigateHandled={() => {
            setNavigation(null);
          }}
          onStateChange={handleBoardState}
        />
        {solutionLines.length ? (
          <section className="puzzleEditorMoves" aria-label="Solution moves">
            <div className="puzzleEditorMovesHeader">
              <div>
                <strong>Moves</strong>
                <span>
                  {solutionLines.length > 1 ? `${solutionLines.length} solutions` : "1 solution"}
                </span>
              </div>
              <div className="puzzleEditorPlayback">
                <SolutionPlaybackControls
                  canStart={currentPly > 0}
                  canPrevious={currentPly > 0}
                  canNext={currentPly < moveCount}
                  canEnd={currentPly < moveCount}
                  onNavigate={navigate}
                />
              </div>
            </div>
            <SolutionMoveTree
              lines={solutionLines}
              options={variationOptionList}
              currentPly={currentPly}
              activeLineIndex={activeLineIndex}
              onSelect={navigateToMove}
            />
          </section>
        ) : null}
      </div>

      <div className="puzzleEditorFields">
        <div className="puzzleEditorSolutionField">
          <div className="puzzleEditorFieldHeader">
            <label htmlFor={solutionInputId}>Solution PGN</label>
            {showCopyPgn ? (
              <button type="button" className="puzzleCopyPgnButton" onClick={() => void copyPgn()}>
                <FontAwesomeIcon
                  icon={copyPgnLabel === "Copied" ? faCheck : faCopy}
                  aria-hidden="true"
                />
                {copyPgnLabel}
              </button>
            ) : null}
          </div>
          <textarea
            id={solutionInputId}
            value={solutionDraft}
            rows={6}
            required
            readOnly={solutionLocked}
            spellCheck={false}
            placeholder={`[Variant "Atomic"]
[FEN "rnbqkbnr/ppppp1pp/5p2/8/8/4P3/PPPP1PPP/RNBQKBNR w KQkq - 0 2"]

2. Qh5+ g6 3. Qd5 d6 4. Qf7+ Kd7 5. Qxe7#

Put alternate solutions in parentheses, for example (2. Qg4)
Mark try-again moves with ?, for example Nf3?`}
            onChange={(event) => handleSolutionChange(event.target.value)}
            onBlur={solutionLocked ? undefined : applySolutionDraft}
          />
        </div>

        <label>
          <span>Event</span>
          <input
            type="text"
            value={value.event}
            placeholder="Only for special tournament events or matches; otherwise leave empty"
            onChange={(event) => onChange({ ...value, event: event.target.value })}
          />
        </label>

        <label className="puzzleEditorExplanationField">
          <span>Explanation</span>
          <textarea
            value={value.explanation}
            rows={5}
            spellCheck
            onChange={(event) => onChange({ ...value, explanation: event.target.value })}
          />
        </label>
        {editorError ? <p className="queueMessage error">{editorError}</p> : null}
        {!editorError && feedback ? (
          <p className={`queueMessage ${feedback.tone}`}>{feedback.text}</p>
        ) : null}
        {actions}
      </div>
    </div>
  );
};

export const PuzzleSubmissionPage = () => {
  const { accessToken, isAuthenticated, isLoading, user, login } = useAuth();
  const [value, setValue] = useState<PuzzleSubmissionValue>(emptyPuzzleSubmission);
  const [submitting, setSubmitting] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (): Promise<void> => {
    if (!user?.username) return;
    setSubmitting(true);
    setMessage("");
    setError("");
    try {
      const normalized = validatePuzzleSubmission(value);
      await submitPuzzleToQueue({ ...normalized, accessToken });
      setValue(emptyPuzzleSubmission());
      setEditorVersion((version) => version + 1);
      setMessage("Puzzle submitted for review. Thank you!");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit puzzle.");
    } finally {
      setSubmitting(false);
    }
  };

  const currentLocation = `${window.location.pathname}${window.location.search}`;

  return (
    <section className="puzzleQueuePage">
      <Seo title="Submit a Puzzle" description="Submit an atomic chess puzzle for review." />
      <header className="puzzleQueueHeader">
        <p className="puzzleQueueEyebrow">Community puzzles</p>
        <h1>Submit a Puzzle</h1>
      </header>

      {!isAuthenticated ? (
        <div className="puzzleQueueGate">
          <p>{isLoading ? "Checking your login…" : "Log in with Lichess to submit a puzzle."}</p>
          {!isLoading ? (
            <button
              type="button"
              className="queuePrimaryButton"
              onClick={() => login(currentLocation)}
            >
              Log in with Lichess
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <PuzzleAnalysisInstructions
            title="Create the solution on Lichess"
            steps={SUBMISSION_STEPS}
          />
          <PuzzleEditor
            value={value}
            onChange={setValue}
            resetKey={editorVersion}
            feedback={
              error
                ? { tone: "error", text: error }
                : message
                  ? { tone: "success", text: message }
                  : undefined
            }
            actions={
              <div className="puzzleQueueSubmitRow">
                <span>Submitting as {user?.username}</span>
                <button
                  type="button"
                  className="queuePrimaryButton puzzleSubmitReviewButton"
                  disabled={submitting}
                  onClick={() => void submit()}
                >
                  <FontAwesomeIcon icon={faPaperPlane} aria-hidden="true" />
                  <span>{submitting ? "Submitting…" : "Submit for review"}</span>
                </button>
              </div>
            }
          />
        </>
      )}
    </section>
  );
};

export const PuzzleReviewPage = () => {
  const { accessToken, isAuthenticated, isLoading, user, login } = useAuth();
  const [queue, setQueue] = useState<PuzzleReviewQueueRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [value, setValue] = useState<PuzzleSubmissionValue>(emptyPuzzleSubmission);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const isReviewer = normalizeUsername(user?.username) === REVIEWER;

  useEffect(() => {
    if (!isReviewer) return;

    let cancelled = false;
    setLoadingQueue(true);
    setError("");
    void fetchPendingPuzzleQueue(accessToken)
      .then((rows) => {
        if (cancelled) return;
        const first = rows[0] ?? null;
        setQueue(rows);
        setSelectedId(first?.id ?? null);
        if (first) setValue(queueRowValue(first));
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
  }, [accessToken, isReviewer]);

  const saveBeforeApproval = async (queueId: number): Promise<void> => {
    const normalized = validatePuzzleSubmission(value);
    const saved = await updateQueuedPuzzle(queueId, normalized, accessToken);
    setQueue((rows) =>
      rows.map((row) =>
        row.id === saved.id ? { ...saved, next_puzzle_id: row.next_puzzle_id } : row,
      ),
    );
    setValue(queueRowValue(saved));
  };

  const approve = async (): Promise<void> => {
    if (selectedId === null) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await saveBeforeApproval(selectedId);
      const puzzleId = await approveQueuedPuzzle(selectedId, accessToken);
      const nextQueue = queue
        .filter((row) => row.id !== selectedId)
        .map((row) => ({ ...row, next_puzzle_id: puzzleId + 1 }));
      setQueue(nextQueue);
      setSelectedId(nextQueue[0]?.id ?? null);
      if (nextQueue[0]) setValue(queueRowValue(nextQueue[0]));
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
      await rejectQueuedPuzzle(selectedId, accessToken);
      const nextQueue = queue.filter((row) => row.id !== selectedId);
      setQueue(nextQueue);
      setSelectedId(nextQueue[0]?.id ?? null);
      if (nextQueue[0]) setValue(queueRowValue(nextQueue[0]));
      setMessage("Puzzle rejected and removed from the queue.");
    } catch (rejectError) {
      setError(rejectError instanceof Error ? rejectError.message : "Unable to reject puzzle.");
    } finally {
      setSaving(false);
    }
  };

  const currentLocation = `${window.location.pathname}${window.location.search}`;
  if (!isLoading && (!isAuthenticated || !isReviewer)) {
    return (
      <section className="puzzleQueuePage compact">
        <Seo title="Puzzle review queue" description="Review submitted atomic chess puzzles." />
        <div className="puzzleQueueGate">
          <h1>Puzzle review queue</h1>
          {isAuthenticated ? <p>This page is available to seaside_tiramisu.</p> : null}
          {!isAuthenticated ? (
            <button
              type="button"
              className="queuePrimaryButton"
              onClick={() => login(currentLocation)}
            >
              Log in with Lichess
            </button>
          ) : null}
        </div>
      </section>
    );
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
              onClick={() => {
                setValue(queueRowValue(row));
                setSelectedId(row.id);
                setMessage("");
                setError("");
              }}
            >
              <strong>Puzzle {row.next_puzzle_id}</strong>
              <small>{new Date(row.created_at).toLocaleDateString()}</small>
            </button>
          ))}
        </aside>

        <div className="puzzleReviewEditor">
          {selected ? (
            <>
              <div className="puzzleReviewMeta">
                <span>
                  Submitted by <strong>{selected.submitted_by}</strong>
                </span>
                <span>{new Date(selected.created_at).toLocaleString()}</span>
              </div>
              <PuzzleEditor value={value} onChange={setValue} resetKey={selected.id} showCopyPgn />
              {error ? <p className="queueMessage error">{error}</p> : null}
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
