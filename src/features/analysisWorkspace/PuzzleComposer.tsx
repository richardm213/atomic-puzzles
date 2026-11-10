import "./PuzzleComposer.css";

import { faPencil, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent, ReactNode, Ref } from "react";
import { useEffect, useId, useRef, useState } from "react";

import { PuzzleStartingFenWarning } from "../../components/PuzzleStartingFenWarning/PuzzleStartingFenWarning";
import {
  addMatchPuzzle,
  fetchMatchPuzzleContext,
  matchPuzzleContextKey,
} from "../../lib/puzzles/matchPuzzles";
import { puzzleQueryKeys } from "../../lib/puzzles/puzzleQueries";
import { DIFFERENT_START_MOVE_CONFIRMATION, submitPuzzle } from "../../lib/supabase/puzzleQueue";
import { getErrorMessage } from "../../utils/errors";

export type PuzzleCreationResult =
  | { destination: "published"; puzzleId: number }
  | {
      destination: "review";
    };

export const PuzzleComposer = ({
  match,
  fen,
  solution,
  publishesDirectly,
  children,
  moveContentRef,
  onCancel,
  onAdded,
}: {
  match?: { gameId: string; matchId: string };
  fen: string;
  solution: string;
  publishesDirectly: boolean;
  children: ReactNode;
  moveContentRef?: Ref<HTMLDivElement>;
  onCancel: () => void;
  onAdded: (result: PuzzleCreationResult) => void;
}) => {
  const queryClient = useQueryClient();
  const context = useQuery({
    queryKey: matchPuzzleContextKey(match?.matchId ?? ""),
    queryFn: match ? () => fetchMatchPuzzleContext(match.gameId) : skipToken,
    refetchOnWindowFocus: false,
  });
  const [matchName, setMatchName] = useState("");
  const [renameFrom, setRenameFrom] = useState<string | null>(null);
  const [opaStyle, setOpaStyle] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const editNameRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const helpId = useId();
  const matchNameId = useId();
  const explanationId = useId();
  const checkingName = context.isFetching && !context.data?.setName;
  const needsName = !checkingName && !context.isError && context.data?.setName === null;
  const setName = context.data?.setName;
  const canSave = Boolean(
    solution && (!match || (renameFrom || needsName ? matchName.trim() : setName)),
  );
  const confirmDifferentStart = error === DIFFERENT_START_MOVE_CONFIRMATION;
  const submitLabel = publishesDirectly
    ? { idle: "Create puzzle", pending: "Creating…", confirm: "Create anyway" }
    : { idle: "Submit puzzle", pending: "Submitting…", confirm: "Submit anyway" };

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
    if (!canSave || (match && !context.data) || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    const newName = matchName.trim();
    const renaming = Boolean(renameFrom && renameFrom !== newName);
    try {
      let result: PuzzleCreationResult;
      if (match && context.data) {
        const matchResult = await addMatchPuzzle({
          gameId: match.gameId,
          fen,
          solution,
          opaStyle,
          explanation,
          matchName: renaming || needsName ? newName : "",
          ...(renaming && renameFrom ? { renameFrom } : {}),
          allowDifferentStartMove: confirmDifferentStart,
        });
        queryClient.setQueryData(matchPuzzleContextKey(match.matchId), {
          ...context.data,
          setName: matchResult.setName,
          canRenameSet: context.data.canRenameSet && matchResult.setName.includes(match.matchId),
        });
        result = matchResult;
      } else {
        result = await submitPuzzle(
          { fen, solution, event: "", explanation: "" },
          { allowDifferentStartMove: confirmDifferentStart },
        );
      }
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
      className="boardPuzzleComposer"
      aria-label="Puzzle draft"
      onSubmit={(event) => void submit(event)}
    >
      <div className="analysisMoveContent boardPuzzleComposerBody" ref={moveContentRef}>
        {checkingName ? <p role="status">Loading match set…</p> : null}
        {context.isError ? (
          <div className="boardPuzzleComposerRetry">
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
          <div className="boardPuzzleComposerField">
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
        {match ? (
          <div className="boardPuzzleComposerMetadata">
            <label className="boardPuzzleComposerCheckbox">
              <input
                type="checkbox"
                checked={opaStyle}
                onChange={(event) => setOpaStyle(event.target.checked)}
                disabled={saving}
              />
              OPA style
            </label>
            <div className="boardPuzzleComposerField">
              <label htmlFor={explanationId}>Explanation</label>
              <textarea
                id={explanationId}
                rows={2}
                maxLength={5000}
                value={explanation}
                onChange={(event) => setExplanation(event.target.value)}
                disabled={saving}
              />
            </div>
          </div>
        ) : null}
      </div>
      <div className="boardPuzzleComposerFooter">
        {renameFrom ? (
          <div className="boardPuzzleSetName">
            <div className="boardPuzzleComposerField">
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
              className="boardPuzzleSetEdit"
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
          <div className="boardPuzzleSetName">
            <p>Set: {setName}</p>
            {context.data?.canRenameSet ? (
              <button
                className="boardPuzzleSetEdit"
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
          <p className="boardPuzzleComposerError" role="alert">
            {error}
          </p>
        ) : null}
        <PuzzleStartingFenWarning fen={fen} />
        <div className="boardPuzzleComposerActions">
          <button type="button" ref={cancelRef} disabled={saving} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" disabled={!canSave || saving}>
            {saving
              ? submitLabel.pending
              : confirmDifferentStart
                ? submitLabel.confirm
                : submitLabel.idle}
          </button>
        </div>
      </div>
    </form>
  );
};
