import "../PuzzleSubmission/PuzzleSubmission.css";

import {
  faArrowLeft,
  faArrowRight,
  faFloppyDisk,
  faPen,
  faRotateLeft,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import { PuzzleMotifsPanel } from "../../components/PuzzleMotifsPanel/PuzzleMotifsPanel";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { usePersistedState } from "../../hooks/usePersistedState";
import { normalizePuzzleMotifTags } from "../../lib/puzzles/puzzleMotifs";
import {
  createEmptyPuzzleSubmission,
  type PuzzleSubmissionValue,
} from "../../lib/puzzles/puzzleSubmission";
import {
  type AdminPuzzle,
  type AdminPuzzleResponse,
  deleteAdminPuzzle,
  fetchAdminPuzzle,
  restoreAdminPuzzle,
  updateAdminPuzzle,
} from "../../lib/supabase/puzzleAdmin";
import type { PuzzleProgressWithUsernameRow } from "../../lib/supabase/types";
import { getErrorMessage } from "../../utils/errors";
import { normalizeUsername } from "../../utils/playerNames";
import { PuzzleEditor } from "../PuzzleSubmission/PuzzleEditor";
import { PuzzleTagVoteHistory } from "./PuzzleTagVoteHistory";

const ADMIN = "seaside_tiramisu";

const puzzleValue = (puzzle: AdminPuzzle): PuzzleSubmissionValue => ({
  fen: puzzle.fen,
  solution: puzzle.solution,
  event: puzzle.event ?? "",
  whitePlayer: puzzle.white_player ?? "",
  blackPlayer: puzzle.black_player ?? "",
  explanation: puzzle.explanation ?? "",
  opaStyle: puzzle.opa_style === true,
});

const formatDuration = (duration: number | null | undefined): string => {
  if (typeof duration !== "number") return "";
  const seconds = Math.max(0, Math.round(duration / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

const Attempts = ({ rows }: { rows: PuzzleProgressWithUsernameRow[] }) => {
  const [open, setOpen] = usePersistedState(
    "atomic-puzzles.recent-puzzles.attempts-open",
    z.boolean(),
    false,
  );
  return (
    <details
      className="puzzleRecentAttempts"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Other attempts</summary>
      {rows.length ? (
        <ul>
          {rows.map((attempt) => (
            <li key={`${attempt.username}-${attempt.first_attempt_at}`}>
              <PlayerLink username={attempt.username} variant="puzzles">
                {attempt.username}
              </PlayerLink>
              <span className={attempt.puzzle_correct ? "correct" : "incorrect"}>
                {attempt.puzzle_correct ? "Correct" : "Incorrect"}
                {attempt.rated === false ? " · Unrated" : ""}
              </span>
              <span>{attempt.correct_move || attempt.incorrect_move || "—"}</span>
              <time dateTime={attempt.first_attempt_at}>
                {new Date(attempt.first_attempt_at).toLocaleString()}
              </time>
              <span>{formatDuration(attempt.first_attempt_duration_ms)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>No attempts yet.</p>
      )}
    </details>
  );
};

export const PuzzleRecentPage = () => {
  const { puzzleId: routePuzzleId } = useParams({ from: "/puzzles/recent/{-$puzzleId}" });
  const navigate = useNavigate();
  const { isLoading: authLoading, user } = useAuth();
  const isAdmin = normalizeUsername(user?.username) === ADMIN;
  const [response, setResponse] = useState<AdminPuzzleResponse | null>(null);
  const [value, setValue] = useState<PuzzleSubmissionValue>(createEmptyPuzzleSubmission);
  const [author, setAuthor] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [jumpId, setJumpId] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editorRevision, setEditorRevision] = useState(0);

  const applyResponse = useCallback((next: AdminPuzzleResponse): void => {
    setResponse(next);
    if (next.puzzle) {
      setValue(puzzleValue(next.puzzle));
      setAuthor(next.puzzle.author ?? "");
      setTags(normalizePuzzleMotifTags(next.puzzle.tags));
      setJumpId(String(next.puzzle.id));
    }
    setEditing(false);
    setEditorRevision((current) => current + 1);
  }, []);

  const loadedPuzzleId = response?.puzzle?.id;
  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    const puzzleId = routePuzzleId === undefined ? undefined : Number(routePuzzleId);
    if (puzzleId !== undefined && (!Number.isSafeInteger(puzzleId) || puzzleId < 1)) {
      setError("Enter a valid puzzle ID.");
      setLoading(false);
      return;
    }
    setError("");
    setMessage("");
    if (loadedPuzzleId && (puzzleId === undefined || puzzleId === loadedPuzzleId)) {
      if (routePuzzleId !== String(loadedPuzzleId)) {
        void navigate({
          to: "/puzzles/recent/{-$puzzleId}",
          params: { puzzleId: String(loadedPuzzleId) },
          replace: true,
        });
      }
      setLoading(false);
      return;
    }
    let current = true;
    setLoading(true);
    void fetchAdminPuzzle(puzzleId, puzzleId === undefined ? "latest" : "exact")
      .then((next) => {
        if (!current) return;
        if (!next.puzzle) throw new Error("Puzzle not found.");
        applyResponse(next);
      })
      .catch((loadError) => {
        if (current) setError(getErrorMessage(loadError, "Unable to load puzzle."));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [applyResponse, authLoading, isAdmin, loadedPuzzleId, navigate, routePuzzleId]);

  const selectPuzzle = (puzzleId: number | null | undefined): void => {
    if (!puzzleId || loading || saving) return;
    void navigate({ to: "/puzzles/recent/{-$puzzleId}", params: { puzzleId: String(puzzleId) } });
  };

  const resetDraft = (): void => {
    if (!response?.puzzle) return;
    setValue(puzzleValue(response.puzzle));
    setAuthor(response.puzzle.author ?? "");
    setTags(normalizePuzzleMotifTags(response.puzzle.tags));
    setEditing(false);
    setError("");
    setEditorRevision((current) => current + 1);
  };

  const save = async (): Promise<void> => {
    if (!response?.puzzle || saving || loading) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const next = await updateAdminPuzzle(response.puzzle.id, value, author, tags);
      applyResponse(next);
      setMessage(`Puzzle #${response.puzzle.id} saved.`);
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Unable to save puzzle."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    const puzzle = response?.puzzle;
    if (!puzzle || !window.confirm(`Delete puzzle #${puzzle.id}? It can be restored later.`))
      return;
    setSaving(true);
    setError("");
    try {
      applyResponse(await deleteAdminPuzzle(puzzle.id));
      setMessage(`Puzzle #${puzzle.id} deleted.`);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Unable to delete puzzle."));
    } finally {
      setSaving(false);
    }
  };

  const restore = async (): Promise<void> => {
    const puzzle = response?.puzzle;
    if (!puzzle) return;
    setSaving(true);
    setError("");
    try {
      applyResponse(await restoreAdminPuzzle(puzzle.id));
      setMessage(`Puzzle #${puzzle.id} restored.`);
    } catch (restoreError) {
      setError(getErrorMessage(restoreError, "Unable to restore puzzle."));
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || (isAdmin && loading && !response)) return <RouteLoadingFallback />;

  if (!isAdmin) {
    return (
      <section className="puzzleQueuePage">
        <Seo title="Recent puzzles" description="Administer recent atomic chess puzzles." />
        <header className="puzzleQueueHeader">
          <h1>Recent puzzles</h1>
        </header>
        <p className="queueMessage error">This page is restricted.</p>
      </section>
    );
  }

  const puzzle = response?.puzzle ?? null;
  const deleted = Boolean(puzzle?.deleted_at);
  const explanation = puzzle?.explanation?.trim();

  return (
    <section className="puzzleQueuePage puzzleRecentPage">
      <Seo title="Recent puzzles" description="Administer recent atomic chess puzzles." />
      <header className="puzzleQueueHeader puzzleAdminHeader">
        <div className="puzzleRecentHeaderMain">
          <div className="puzzleRecentNavigation" aria-label="Puzzle navigation">
            <button
              type="button"
              className="queueSecondaryButton"
              aria-label="Previous puzzle"
              disabled={loading || saving || !response?.olderPuzzleId}
              onClick={() => selectPuzzle(response?.olderPuzzleId)}
            >
              <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
            </button>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const id = Number(jumpId);
                if (!Number.isSafeInteger(id) || id < 1) {
                  setError("Enter a valid puzzle ID.");
                  return;
                }
                selectPuzzle(id);
              }}
            >
              <label htmlFor="recent-puzzle-id">Puzzle ID</label>
              <input
                id="recent-puzzle-id"
                type="number"
                min={1}
                step={1}
                value={jumpId}
                disabled={saving || loading}
                onChange={(event) => setJumpId(event.target.value)}
              />
              <button type="submit" className="queueSecondaryButton" disabled={loading || saving}>
                Go
              </button>
            </form>
            <button
              type="button"
              className="queueSecondaryButton"
              aria-label="Next puzzle"
              disabled={loading || saving || !response?.newerPuzzleId}
              onClick={() => selectPuzzle(response?.newerPuzzleId)}
            >
              <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`queueSecondaryButton puzzleRecentEditToggle${editing ? " active" : ""}`}
              aria-label={editing ? "Return to view mode" : "Edit puzzle"}
              aria-pressed={editing}
              disabled={loading || saving || deleted}
              onClick={() => {
                if (editing) resetDraft();
                else {
                  setEditing(true);
                  setMessage("");
                  setError("");
                }
              }}
            >
              <FontAwesomeIcon icon={faPen} aria-hidden="true" />
            </button>
          </div>
        </div>
        <Link className="queueSecondaryButton" to="/puzzles/review">
          Review queue
        </Link>
      </header>

      {puzzle ? (
        <div className="puzzleReviewEditor">
          <div className="puzzleRecentMeta">
            <span>{new Date(puzzle.created_at).toLocaleString()}</span>
            {deleted ? <strong>Deleted by {puzzle.deleted_by}</strong> : null}
          </div>
          <PuzzleEditor
            busy={saving || loading}
            value={value}
            onChange={setValue}
            resetKey={`${puzzle.id}-${editorRevision}`}
            allowSolutionEditing={editing}
            readOnly={!editing || deleted}
            showAnalysisEngine
            showExplanation={false}
            showSolutionPgnField={editing}
            showMetadataFields={editing}
            analysisFooter={
              !editing ? (
                <div className="puzzleRecentSummary">
                  <div>
                    <div className="puzzleHeaderMetadata">
                      <div className="puzzleHeaderMeta" title={author}>
                        <span>Created by</span>
                        {author ? (
                          <Link
                            className="puzzleHeaderAuthorLink"
                            to="/@/$username/puzzles"
                            params={{ username: normalizeUsername(author) }}
                          >
                            {author}
                          </Link>
                        ) : (
                          <strong>Unknown</strong>
                        )}
                      </div>
                      {value.event ? (
                        <div className="puzzleHeaderEvent" title={value.event}>
                          {value.event}
                        </div>
                      ) : null}
                      {value.opaStyle ? <span className="puzzleOpaBadge">OPA style</span> : null}
                    </div>
                    {value.whitePlayer || value.blackPlayer ? (
                      <section className="puzzlePlayers hasPlayerNames" aria-label="Game players">
                        {(["white", "black"] as const).map((side) => {
                          const player = side === "white" ? value.whitePlayer : value.blackPlayer;
                          if (!player) return null;
                          return (
                            <div className="puzzlePlayer hasPlayerName" key={side}>
                              <span className={`playerColorMarker ${side}`} aria-hidden="true" />
                              <PlayerLink
                                className="puzzlePlayerLink"
                                username={normalizeUsername(player)}
                                variant="puzzles"
                              >
                                {player}
                              </PlayerLink>
                            </div>
                          );
                        })}
                      </section>
                    ) : null}
                  </div>
                  <PuzzleMotifsPanel
                    key={`${puzzle.id}-${editorRevision}-view-tags`}
                    visible
                    tags={tags}
                    canManage={false}
                    onUpdate={() => undefined}
                  />
                </div>
              ) : null
            }
            boardFooter={
              editing ? (
                <label className="puzzleReviewBoardExplanation">
                  <span>Explanation</span>
                  <textarea
                    value={value.explanation}
                    rows={5}
                    readOnly={!editing || deleted}
                    onChange={(event) => setValue({ ...value, explanation: event.target.value })}
                  />
                </label>
              ) : explanation ? (
                <section
                  className="puzzleReviewBoardExplanation"
                  aria-labelledby="recent-puzzle-explanation-heading"
                >
                  <h2 id="recent-puzzle-explanation-heading">Explanation</h2>
                  <p>{explanation}</p>
                </section>
              ) : null
            }
            fieldsBeforeEvent={
              editing ? (
                <>
                  <label className="puzzleReviewField">
                    <span>Author</span>
                    <input
                      type="text"
                      value={author}
                      readOnly={!editing || deleted}
                      onChange={(event) => setAuthor(event.target.value)}
                    />
                  </label>
                  <PuzzleMotifsPanel
                    key={`${puzzle.id}-${editorRevision}-tags`}
                    visible
                    tags={tags}
                    canManage={editing && !deleted && !saving && !loading}
                    onUpdate={setTags}
                  />
                </>
              ) : null
            }
          />

          {error ? <p className="queueMessage error">{error}</p> : null}
          {message ? <p className="queueMessage success">{message}</p> : null}

          <div className="puzzleRecentActions">
            {deleted ? (
              <button
                type="button"
                className="queuePrimaryButton"
                disabled={saving || loading}
                onClick={() => void restore()}
              >
                <FontAwesomeIcon icon={faRotateLeft} aria-hidden="true" />
                Restore puzzle
              </button>
            ) : editing ? (
              <>
                <button
                  type="button"
                  className="queueSecondaryButton"
                  disabled={saving || loading}
                  onClick={resetDraft}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="queuePrimaryButton"
                  disabled={saving || loading}
                  onClick={() => void save()}
                >
                  <FontAwesomeIcon icon={faFloppyDisk} aria-hidden="true" />
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="queueDangerButton"
                disabled={saving || loading}
                onClick={() => void remove()}
              >
                <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
                Delete puzzle
              </button>
            )}
          </div>

          <PuzzleTagVoteHistory key={puzzle.id} puzzleId={puzzle.id} />
          <Attempts rows={response?.attempts ?? []} />
        </div>
      ) : error ? (
        <p className="queueMessage error">{error}</p>
      ) : null}
    </section>
  );
};
