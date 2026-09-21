import "./CustomPuzzleSetEdit.css";

import { faArrowLeft, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import {
  fetchCustomPuzzleSet,
  fetchCustomPuzzleSetAttempts,
  refreshCustomPuzzleSet,
  removePuzzleFromCustomSet,
} from "../../lib/puzzles/customPuzzleSets";
import { puzzleCatalogQueryOptions } from "../../lib/puzzles/puzzleQueries";
import { getPuzzleTagName } from "../PuzzleDashboard/DashboardTagFilter";

const SET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CustomPuzzleSetEditPage = () => {
  const queryClient = useQueryClient();
  const { setId = "" } = useParams({ strict: false });
  const { isAuthenticated, isLoading: isAuthLoading, login } = useAuth();
  const validSetId = SET_ID_PATTERN.test(setId);
  const [pendingPuzzleId, setPendingPuzzleId] = useState("");
  const [addingPuzzles, setAddingPuzzles] = useState(false);
  const [message, setMessage] = useState<{ type: "status" | "error"; text: string } | null>(null);

  const setQuery = useQuery({
    queryKey: ["custom-puzzle-sets", setId],
    queryFn: () => fetchCustomPuzzleSet(setId),
    enabled: isAuthenticated && validSetId,
    retry: false,
  });
  const attemptsQuery = useQuery({
    queryKey: ["custom-puzzle-sets", setId, "attempts"],
    queryFn: () => fetchCustomPuzzleSetAttempts(setId),
    enabled: isAuthenticated && validSetId,
    retry: false,
  });
  const catalogQuery = useQuery(puzzleCatalogQueryOptions());
  const customSet = setQuery.data;
  const puzzlesById = useMemo(
    () =>
      new Map(
        (catalogQuery.data ?? []).map((puzzle) => [String(puzzle.puzzleId), puzzle] as const),
      ),
    [catalogQuery.data],
  );
  const attemptsByPuzzleId = useMemo(
    () =>
      new Map(
        (attemptsQuery.data ?? []).map((attempt) => [String(attempt.puzzleId), attempt] as const),
      ),
    [attemptsQuery.data],
  );

  const updateSetCaches = (nextSet: NonNullable<typeof customSet>): void => {
    queryClient.setQueryData(["custom-puzzle-sets", setId], nextSet);
    void queryClient.invalidateQueries({ queryKey: ["custom-puzzle-sets"] });
  };

  const handleRemove = async (puzzleId: number): Promise<void> => {
    setPendingPuzzleId(String(puzzleId));
    setMessage(null);
    try {
      updateSetCaches(await removePuzzleFromCustomSet(setId, puzzleId));
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to remove this puzzle.",
      });
    } finally {
      setPendingPuzzleId("");
    }
  };

  const handleAddMatching = async (): Promise<void> => {
    if (!customSet?.tags.length) return;
    setAddingPuzzles(true);
    setMessage(null);
    try {
      const result = await refreshCustomPuzzleSet(setId);
      updateSetCaches(result.set);
      setMessage({
        type: "status",
        text: result.addedPuzzleIds.length
          ? `Added ${result.addedPuzzleIds.length} puzzle${result.addedPuzzleIds.length === 1 ? "" : "s"}.`
          : "Every completed puzzle with these tags is already in the set.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to add matching puzzles.",
      });
    } finally {
      setAddingPuzzles(false);
    }
  };

  if (isAuthLoading || (isAuthenticated && (setQuery.isPending || catalogQuery.isPending))) {
    return <RouteLoadingFallback />;
  }

  const queryError = setQuery.error ?? attemptsQuery.error ?? catalogQuery.error;
  const errorText = queryError instanceof Error ? queryError.message : "";

  return (
    <div className="customSetEditPage">
      <Seo
        title={customSet ? `Edit ${customSet.label}` : "Edit Custom Puzzle Set"}
        description="Edit the puzzles included in a custom atomic chess training set."
        path={`/solve/custom-sets/${encodeURIComponent(setId)}/edit`}
      />
      <main className="customSetEditShell">
        <header className="customSetEditHeader">
          <div>
            <Link className="customSetEditBack" to="/solve/custom-sets">
              <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
              Custom sets
            </Link>
            <h1>{customSet ? `Edit ${customSet.label}` : "Edit custom set"}</h1>
          </div>
          {customSet ? (
            <button
              type="button"
              className="customSetEditAddButton"
              onClick={() => void handleAddMatching()}
              disabled={addingPuzzles || customSet.tags.length === 0}
              title={customSet.tags.length ? undefined : "This set has no tag filters."}
            >
              <FontAwesomeIcon icon={faPlus} aria-hidden="true" />
              {addingPuzzles ? "Adding…" : "Add all matching tag puzzles"}
            </button>
          ) : null}
        </header>

        {!isAuthenticated ? (
          <section className="customSetEditState">
            <p>Log in with Lichess to edit this custom set.</p>
            <button type="button" onClick={() => void login(window.location.pathname)}>
              Log in with Lichess
            </button>
          </section>
        ) : null}

        {isAuthenticated && (!validSetId || errorText) ? (
          <section className="customSetEditState error" role="alert">
            {errorText || "This custom set link is invalid."}
          </section>
        ) : null}

        {isAuthenticated && customSet ? (
          <>
            <section className="customSetEditSummary" aria-label="Set tag filters">
              <strong>
                {customSet.puzzleIds.length} puzzle{customSet.puzzleIds.length === 1 ? "" : "s"}
              </strong>
              <div className="customSetEditFilterTags">
                {customSet.tags.length ? (
                  customSet.tags.map((tag) => <span key={tag}>{getPuzzleTagName(tag)}</span>)
                ) : (
                  <span>No tag filters</span>
                )}
              </div>
            </section>

            {message ? (
              <div
                className={`customSetEditMessage ${message.type}`}
                role={message.type === "error" ? "alert" : "status"}
              >
                {message.text}
              </div>
            ) : null}

            <section className="customSetEditList" aria-label="Puzzles in this custom set">
              {customSet.puzzleIds.length ? (
                customSet.puzzleIds.map((puzzleId) => {
                  const puzzle = puzzlesById.get(String(puzzleId));
                  const attempt = attemptsByPuzzleId.get(String(puzzleId));
                  return (
                    <article className="customSetEditRow" key={puzzleId}>
                      <Link to="/solve/$puzzleId" params={{ puzzleId: String(puzzleId) }}>
                        Puzzle #{puzzleId}
                      </Link>
                      <div className="customSetEditPuzzleTags" aria-label="Puzzle tags">
                        {puzzle?.tags?.length ? (
                          puzzle.tags.map((tag) => <span key={tag}>{getPuzzleTagName(tag)}</span>)
                        ) : (
                          <span className="empty">No tags</span>
                        )}
                      </div>
                      {attempt ? (
                        <span
                          className={`customSetEditResult ${attempt.puzzleCorrect ? "correct" : "incorrect"}`}
                        >
                          {attempt.puzzleCorrect ? "Correct" : "Incorrect"}
                        </span>
                      ) : (
                        <span className="customSetEditResult pending">Not attempted</span>
                      )}
                      <button
                        type="button"
                        className="customSetEditRemove"
                        onClick={() => void handleRemove(puzzleId)}
                        disabled={Boolean(pendingPuzzleId) || addingPuzzles}
                        aria-label={`Remove puzzle ${puzzleId} from this set`}
                      >
                        <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
                        {pendingPuzzleId === String(puzzleId) ? "Removing…" : "Remove"}
                      </button>
                    </article>
                  );
                })
              ) : (
                <div className="customSetEditEmpty">This set has no puzzles.</div>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
};
