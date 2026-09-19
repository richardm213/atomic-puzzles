import "./CustomPuzzleSets.css";

import {
  faCircleQuestion,
  faPen,
  faPlay,
  faPlus,
  faRotateLeft,
  faSliders,
  faTrash,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";

import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import {
  createCustomPuzzleSet,
  type CustomPuzzleSet,
  deleteCustomPuzzleSet,
  listCustomPuzzleSets,
  renameCustomPuzzleSet,
  resetCustomPuzzleSetProgress,
} from "../../lib/puzzles/customPuzzleSets";
import {
  puzzleCatalogQueryOptions,
  puzzleProgressForUserQueryOptions,
} from "../../lib/puzzles/puzzleQueries";
import { normalizeUsername } from "../../utils/playerNames";
import { DashboardTagFilter, getPuzzleTagName } from "../PuzzleDashboard/DashboardTagFilter";

const customSetQueryKey = ["custom-puzzle-sets"] as const;
const emptySets: CustomPuzzleSet[] = [];

export const CustomPuzzleSetsPage = () => {
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: isAuthLoading, login, user } = useAuth();
  const username = normalizeUsername(user?.username);
  const manageDialogRef = useRef<HTMLDialogElement | null>(null);
  const [name, setName] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [author, setAuthor] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "saving" | "saved">("idle");
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [confirmResetId, setConfirmResetId] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");

  const catalogQuery = useQuery(puzzleCatalogQueryOptions());
  const progressQuery = useQuery({
    ...puzzleProgressForUserQueryOptions(username),
    enabled: Boolean(username),
  });
  const setsQuery = useQuery({
    queryKey: customSetQueryKey,
    queryFn: listCustomPuzzleSets,
    enabled: isAuthenticated,
  });
  const sets = setsQuery.data ?? emptySets;
  const attemptedIds = useMemo(
    () => new Set((progressQuery.data ?? []).map((row) => String(row.puzzle_id))),
    [progressQuery.data],
  );
  const attemptedPuzzles = useMemo(
    () => (catalogQuery.data ?? []).filter((puzzle) => attemptedIds.has(String(puzzle.puzzleId))),
    [attemptedIds, catalogQuery.data],
  );
  const authors = useMemo(
    () =>
      [
        ...new Set(
          attemptedPuzzles.map((puzzle) => String(puzzle.author ?? "").trim()).filter(Boolean),
        ),
      ].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" })),
    [attemptedPuzzles],
  );
  const matchingPuzzles = useMemo(
    () =>
      attemptedPuzzles.filter((puzzle) => {
        if (author && String(puzzle.author ?? "").trim() !== author) return false;
        const tags = new Set(puzzle.tags ?? []);
        return selectedTags.every((tag) => tags.has(tag));
      }),
    [attemptedPuzzles, author, selectedTags],
  );
  const pageLoading =
    isAuthLoading || catalogQuery.isPending || (Boolean(username) && progressQuery.isPending);
  const queryError = catalogQuery.error ?? progressQuery.error ?? setsQuery.error;
  const error = message || (queryError instanceof Error ? queryError.message : "");

  const refreshSets = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: customSetQueryKey });
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setMessage("");
    setSubmitState("saving");
    try {
      await createCustomPuzzleSet({ name, tags: selectedTags, author });
      setName("");
      setSelectedTags([]);
      setAuthor("");
      setSubmitState("saved");
      await refreshSets();
      window.setTimeout(() => setSubmitState("idle"), 2500);
    } catch (createError) {
      setMessage(createError instanceof Error ? createError.message : "Unable to create the set.");
      setSubmitState("idle");
    }
  };

  const runSetAction = async (key: string, action: () => Promise<void>): Promise<void> => {
    setMessage("");
    setPendingAction(key);
    try {
      await action();
      await refreshSets();
    } catch (actionError) {
      setMessage(actionError instanceof Error ? actionError.message : "Unable to update the set.");
    } finally {
      setPendingAction("");
    }
  };

  const formatFilters = (set: CustomPuzzleSet): string => {
    const parts = [
      set.author ? `Author: ${set.author}` : "All authors",
      set.tags.length ? set.tags.map(getPuzzleTagName).join(" + ") : "All tags",
    ];
    return parts.join(" · ");
  };

  if (isAuthLoading || (isAuthenticated && pageLoading && !catalogQuery.data)) {
    return <RouteLoadingFallback />;
  }

  return (
    <div className="customSetsPage">
      <Seo
        title="Custom Puzzle Sets"
        description="Build and track custom training sets from puzzles you have already attempted."
        path="/solve/custom-sets"
      />
      <div className="customSetsShell">
        <header className="customSetsHeader">
          <div>
            <h1>Custom Puzzle Sets</h1>
            <div className="customSetsHelp">
              <button type="button" aria-describedby="custom-sets-help-text">
                How do custom sets work?
                <FontAwesomeIcon icon={faCircleQuestion} aria-hidden="true" />
              </button>
              <p id="custom-sets-help-text" role="tooltip">
                Custom sets can only include puzzles you have already completed. Choose an author or
                tags to narrow that history, then work through the saved set at your own pace.
              </p>
            </div>
          </div>
          <div className="customSetsHeaderActions">
            <button
              type="button"
              className="customSetsButton secondary"
              onClick={() => manageDialogRef.current?.showModal()}
              disabled={!isAuthenticated}
            >
              <FontAwesomeIcon icon={faSliders} aria-hidden="true" />
              Manage sets
            </button>
            <Link className="customSetsButton secondary" to="/dashboard">
              Dashboard
            </Link>
          </div>
        </header>

        {!isAuthenticated && !isAuthLoading ? (
          <section className="customSetsState">
            <h2>Log in to build custom sets</h2>
            <p>Your sets and their progress are saved to your account.</p>
            <button
              type="button"
              className="customSetsButton primary"
              onClick={() => void login("/solve/custom-sets")}
            >
              Log in with Lichess
            </button>
          </section>
        ) : null}

        {isAuthenticated ? (
          <>
            <section className="customSetsBuilder">
              <div className="customSetsSectionHeading">
                <div>
                  <h2>Create a set</h2>
                  <p>
                    {matchingPuzzles.length} of your {attemptedPuzzles.length} completed puzzles
                    match
                  </p>
                </div>
              </div>
              <form onSubmit={(event) => void handleCreate(event)}>
                <label className="customSetsField customSetsNameField">
                  <span>Set name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={80}
                    placeholder="e.g. Forks I missed"
                    required
                    disabled={submitState === "saving"}
                  />
                </label>
                <label className="customSetsField">
                  <span>Author</span>
                  <select
                    value={author}
                    onChange={(event) => setAuthor(event.target.value)}
                    disabled={submitState === "saving"}
                  >
                    <option value="">All authors</option>
                    {authors.map((authorName) => (
                      <option key={authorName} value={authorName}>
                        {authorName}
                      </option>
                    ))}
                  </select>
                </label>
                <DashboardTagFilter
                  disabled={submitState === "saving"}
                  selectedTags={selectedTags}
                  onChange={setSelectedTags}
                />
                <div className="customSetsCreateRow">
                  <p aria-live="polite">Only previously completed puzzles are considered.</p>
                  <button
                    type="submit"
                    className="customSetsButton primary"
                    disabled={
                      submitState === "saving" || !name.trim() || matchingPuzzles.length === 0
                    }
                  >
                    <FontAwesomeIcon icon={faPlus} aria-hidden="true" />
                    {submitState === "saving"
                      ? "Creating…"
                      : submitState === "saved"
                        ? "Set created"
                        : "Create set"}
                  </button>
                </div>
              </form>
            </section>

            {error ? (
              <div className="customSetsMessage error" role="alert">
                {error}
              </div>
            ) : null}

            <section className="customSetsLibrary">
              <div className="customSetsSectionHeading">
                <div>
                  <h2>Your sets</h2>
                  <p>
                    {sets.length} saved set{sets.length === 1 ? "" : "s"}
                  </p>
                </div>
                {sets.length > 0 ? (
                  <button
                    type="button"
                    className="customSetsTextButton"
                    onClick={() => manageDialogRef.current?.showModal()}
                  >
                    Manage
                  </button>
                ) : null}
              </div>
              {setsQuery.isPending ? (
                <div className="customSetsState">Loading your sets…</div>
              ) : sets.length ? (
                <div className="customSetsGrid">
                  {sets.map((set) => {
                    const total = set.puzzleIds.length;
                    const percent = total ? Math.round((set.completedCount / total) * 100) : 0;
                    const startPuzzleId = set.nextPuzzleId ?? set.puzzleIds[0];
                    return (
                      <article key={set.id} className="customSetCard">
                        <div className="customSetCardTop">
                          <div>
                            <h3>{set.label}</h3>
                            <p>{formatFilters(set)}</p>
                          </div>
                          <strong>{percent}%</strong>
                        </div>
                        <div
                          className="customSetProgress"
                          aria-label={`${set.completedCount} of ${total} puzzles completed`}
                        >
                          <span style={{ width: `${percent}%` }} />
                        </div>
                        <div className="customSetStats">
                          <span>
                            <strong>{set.completedCount}</strong> completed
                          </span>
                          <span>
                            <strong>{total - set.completedCount}</strong> remaining
                          </span>
                          <span>
                            <strong>{set.correctCount}</strong> correct
                          </span>
                        </div>
                        {startPuzzleId ? (
                          <Link
                            className="customSetsButton primary"
                            to="/solve/custom/$setId/$puzzleId"
                            params={{ setId: set.id, puzzleId: String(startPuzzleId) }}
                          >
                            <FontAwesomeIcon icon={faPlay} aria-hidden="true" />
                            {set.completedCount ? "Continue set" : "Start set"}
                          </Link>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="customSetsState compact">
                  Your custom sets will appear here after you create one.
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>

      <dialog ref={manageDialogRef} className="customSetsDialog">
        <div className="customSetsDialogPanel">
          <header>
            <div>
              <h2>Manage custom sets</h2>
              <p>Rename, reset progress, or delete a set.</p>
            </div>
            <button
              type="button"
              className="customSetsIconButton"
              aria-label="Close set manager"
              onClick={() => manageDialogRef.current?.close()}
            >
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            </button>
          </header>
          <div className="customSetsManageList">
            {message ? (
              <div className="customSetsDialogMessage" role="alert">
                {message}
              </div>
            ) : null}
            {sets.length ? (
              sets.map((set) => (
                <article key={set.id} className="customSetsManageRow">
                  <div className="customSetsManageName">
                    {editingId === set.id ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void runSetAction(`rename-${set.id}`, async () => {
                            await renameCustomPuzzleSet(set.id, editingName);
                            setEditingId("");
                          });
                        }}
                      >
                        <label>
                          <span className="srOnly">New name for {set.label}</span>
                          <input
                            autoFocus
                            value={editingName}
                            maxLength={80}
                            onChange={(event) => setEditingName(event.target.value)}
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={!editingName.trim() || Boolean(pendingAction)}
                        >
                          Save
                        </button>
                        <button type="button" onClick={() => setEditingId("")}>
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <>
                        <strong>{set.label}</strong>
                        <span>
                          {set.completedCount} / {set.puzzleIds.length} completed
                        </span>
                      </>
                    )}
                  </div>
                  {editingId !== set.id ? (
                    <div className="customSetsManageActions">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(set.id);
                          setEditingName(set.label);
                        }}
                        disabled={Boolean(pendingAction)}
                      >
                        <FontAwesomeIcon icon={faPen} aria-hidden="true" /> Rename
                      </button>
                      {confirmResetId === set.id ? (
                        <span className="customSetsDeleteConfirm">
                          Reset all progress?
                          <button
                            type="button"
                            onClick={() =>
                              void runSetAction(`reset-${set.id}`, async () => {
                                await resetCustomPuzzleSetProgress(set.id);
                                setConfirmResetId("");
                              })
                            }
                          >
                            Reset
                          </button>
                          <button type="button" onClick={() => setConfirmResetId("")}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmResetId(set.id)}
                          disabled={Boolean(pendingAction) || set.completedCount === 0}
                        >
                          <FontAwesomeIcon icon={faRotateLeft} aria-hidden="true" /> Reset
                        </button>
                      )}
                      {confirmDeleteId === set.id ? (
                        <span className="customSetsDeleteConfirm">
                          Delete permanently?
                          <button
                            type="button"
                            className="danger"
                            onClick={() =>
                              void runSetAction(`delete-${set.id}`, async () => {
                                await deleteCustomPuzzleSet(set.id);
                                setConfirmDeleteId("");
                              })
                            }
                          >
                            Delete
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteId("")}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="danger"
                          onClick={() => setConfirmDeleteId(set.id)}
                          disabled={Boolean(pendingAction)}
                        >
                          <FontAwesomeIcon icon={faTrash} aria-hidden="true" /> Delete
                        </button>
                      )}
                    </div>
                  ) : null}
                </article>
              ))
            ) : (
              <div className="customSetsState compact">No custom sets to manage.</div>
            )}
          </div>
        </div>
      </dialog>
    </div>
  );
};
