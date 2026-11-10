import { faPencil, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent, ReactNode, Ref } from "react";
import { useEffect, useId, useRef, useState } from "react";

import {
  addMatchPuzzle,
  fetchMatchPuzzleContext,
  matchPuzzleContextKey,
  type MatchPuzzleResult,
} from "../../lib/puzzles/matchPuzzles";
import { puzzleQueryKeys } from "../../lib/puzzles/puzzleQueries";
import { DIFFERENT_START_MOVE_CONFIRMATION } from "../../lib/supabase/puzzleQueue";
import { getErrorMessage } from "../../utils/errors";

export const GamePuzzleComposer = ({
  gameId,
  matchId,
  fen,
  solution,
  children,
  moveContentRef,
  onCancel,
  onAdded,
}: {
  gameId: string;
  matchId: string;
  fen: string;
  solution: string;
  children: ReactNode;
  moveContentRef: Ref<HTMLDivElement>;
  onCancel: () => void;
  onAdded: (result: MatchPuzzleResult) => void;
}) => {
  const queryClient = useQueryClient();
  const context = useQuery({
    queryKey: matchPuzzleContextKey(matchId),
    queryFn: () => fetchMatchPuzzleContext(gameId),
    refetchOnWindowFocus: false,
  });
  const [matchName, setMatchName] = useState("");
  const [renameFrom, setRenameFrom] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const editNameRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const helpId = useId();
  const matchNameId = useId();
  const checkingName = context.isFetching && !context.data?.setName;
  const needsName = !checkingName && !context.isError && context.data?.setName === null;
  const setName = context.data?.setName;
  const canSave = Boolean(solution && (renameFrom || needsName ? matchName.trim() : setName));
  const confirmDifferentStart = error === DIFFERENT_START_MOVE_CONFIRMATION;

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!renameFrom) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renameFrom]);

  useEffect(() => {
    // A confirmation applies only to the line that triggered it.
    setError("");
  }, [solution, matchName]);

  const cancelRename = () => {
    setRenameFrom(null);
    setMatchName("");
    requestAnimationFrame(() => editNameRef.current?.focus());
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave || !context.data || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    const newName = matchName.trim();
    const renaming = Boolean(renameFrom && renameFrom !== newName);
    try {
      const result = await addMatchPuzzle({
        gameId,
        fen,
        solution,
        matchName: renaming || needsName ? newName : "",
        ...(renaming && renameFrom ? { renameFrom } : {}),
        allowDifferentStartMove: confirmDifferentStart,
      });
      queryClient.setQueryData(matchPuzzleContextKey(matchId), {
        ...context.data,
        setName: result.setName,
        canRenameSet: context.data.canRenameSet && result.setName.includes(matchId),
      });
      if (result.destination === "published" || renaming) {
        void queryClient.invalidateQueries({ queryKey: puzzleQueryKeys.catalog });
      }
      onAdded(result);
    } catch (submitError) {
      setError(getErrorMessage(submitError, "Unable to add puzzle. Try again."));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <form
      className="gamePuzzleComposer"
      aria-label="Puzzle draft"
      onSubmit={(event) => void submit(event)}
    >
      <div className="analysisMoveContent gamePuzzleComposerBody" ref={moveContentRef}>
        {checkingName ? <p role="status">Loading match set…</p> : null}
        {context.isError ? (
          <div className="gamePuzzleComposerRetry">
            <p role="alert">{getErrorMessage(context.error, "Unable to load the match set.")}</p>
            <button
              type="button"
              onClick={() => void context.refetch()}
              disabled={context.isFetching}
            >
              Retry
            </button>
          </div>
        ) : null}
        {needsName && context.data ? (
          <div className="gamePuzzleComposerField">
            <label htmlFor={matchNameId}>Match name</label>
            <p id={helpId}>We’ll save {context.data.players.join(" vs ")} with this name.</p>
            <input
              id={matchNameId}
              type="text"
              maxLength={100}
              required
              aria-describedby={helpId}
              placeholder="Scam match"
              value={matchName}
              onChange={(event) => setMatchName(event.target.value)}
              disabled={saving}
            />
          </div>
        ) : null}
        {children}
      </div>
      <div className="gamePuzzleComposerFooter">
        {renameFrom ? (
          <div className="gamePuzzleSetName">
            <div className="gamePuzzleComposerField">
              <label htmlFor={matchNameId}>Set name</label>
              <input
                id={matchNameId}
                ref={renameInputRef}
                value={matchName}
                maxLength={100}
                required
                disabled={saving}
                onChange={(event) => setMatchName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  event.stopPropagation();
                  cancelRename();
                }}
              />
            </div>
            <button
              className="gamePuzzleSetEdit"
              type="button"
              aria-label="Keep current set name"
              title="Keep current set name"
              onClick={cancelRename}
              disabled={saving}
            >
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            </button>
          </div>
        ) : setName ? (
          <div className="gamePuzzleSetName">
            <p>Set: {setName}</p>
            {context.data?.canRenameSet ? (
              <button
                className="gamePuzzleSetEdit"
                ref={editNameRef}
                type="button"
                aria-label="Edit set name"
                title="Edit set name"
                disabled={saving}
                onClick={() => {
                  setRenameFrom(setName);
                  setMatchName(setName);
                }}
              >
                <FontAwesomeIcon icon={faPencil} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p className="gamePuzzleComposerError" role="alert">
            {error}
          </p>
        ) : null}
        <div className="gamePuzzleComposerActions">
          <button type="button" ref={cancelRef} disabled={saving} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" disabled={!canSave || saving}>
            {saving ? "Creating…" : confirmDifferentStart ? "Create anyway" : "Create puzzle"}
          </button>
        </div>
      </div>
    </form>
  );
};
