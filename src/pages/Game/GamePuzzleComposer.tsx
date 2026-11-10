import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
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
  onCancel,
  onAdded,
}: {
  gameId: string;
  matchId: string;
  fen: string;
  solution: string;
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
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const helpId = useId();
  const matchNameId = useId();
  const checkingName = context.isFetching && !context.data?.setName;
  const needsName = !checkingName && !context.isError && context.data?.setName === null;
  const canSave = Boolean(solution && (context.data?.setName || (needsName && matchName.trim())));
  const confirmDifferentStart = error === DIFFERENT_START_MOVE_CONFIRMATION;

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    // A confirmation applies only to the line that triggered it.
    setError("");
  }, [solution, matchName]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave || !context.data || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await addMatchPuzzle({
        gameId,
        fen,
        solution,
        matchName: matchName.trim(),
        allowDifferentStartMove: confirmDifferentStart,
      });
      queryClient.setQueryData(matchPuzzleContextKey(matchId), {
        ...context.data,
        setName: result.setName,
      });
      if (result.destination === "published") {
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
      aria-labelledby={titleId}
      onSubmit={(event) => void submit(event)}
    >
      <h2 id={titleId}>Create puzzle</h2>
      <p>Play the solution on the board.</p>
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
      {context.data?.setName ? <p>Set: {context.data.setName}</p> : null}
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
          {saving ? "Adding…" : confirmDifferentStart ? "Add anyway" : "Add puzzle"}
        </button>
      </div>
    </form>
  );
};
