import "./PuzzleComposer.css";

import { faPuzzlePiece } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent, MouseEventHandler, ReactNode, Ref } from "react";
import { useEffect, useId, useRef, useState } from "react";

import { PuzzleMotifsPanel } from "../../components/PuzzleMotifsPanel/PuzzleMotifsPanel";
import { PuzzleStartingFenWarning } from "../../components/PuzzleStartingFenWarning/PuzzleStartingFenWarning";
import {
  addMatchPuzzle,
  fetchMatchPuzzleContext,
  matchPuzzleContextKey,
} from "../../lib/puzzles/matchPuzzles";
import { puzzleQueryKeys } from "../../lib/puzzles/puzzleQueries";
import type { PuzzlePositionHistory } from "../../lib/puzzles/puzzleSubmission";
import { submitPuzzle } from "../../lib/supabase/puzzleQueue";
import { getErrorMessage } from "../../utils/errors";

export type PuzzleCreationResult =
  | { destination: "published"; puzzleId: number }
  | {
      destination: "review";
    };

export const PuzzleComposerButton = ({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
}) => (
  <button
    type="button"
    className="atomicDbSettingsButton"
    aria-label={label}
    title={disabled ? "Choose a playable position" : label}
    disabled={disabled}
    onClick={onClick}
  >
    <FontAwesomeIcon icon={faPuzzlePiece} aria-hidden="true" />
  </button>
);

export const PuzzleComposer = ({
  match,
  positionHistory,
  fen,
  solution,
  publishesDirectly,
  children,
  moveContentRef,
  onCancel,
  onAdded,
  saving,
  onSavingChange,
}: {
  match?: { gameId: string; matchId: string };
  positionHistory: PuzzlePositionHistory;
  fen: string;
  solution: string;
  publishesDirectly: boolean;
  children: ReactNode;
  moveContentRef?: Ref<HTMLDivElement>;
  onCancel: () => void;
  onAdded: (result: PuzzleCreationResult) => void;
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
}) => {
  const queryClient = useQueryClient();
  const context = useQuery({
    queryKey: matchPuzzleContextKey(match?.matchId ?? ""),
    queryFn: match ? () => fetchMatchPuzzleContext(match.gameId) : skipToken,
    refetchOnWindowFocus: false,
  });
  const [opaStyle, setOpaStyle] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const explanationId = useId();
  const checkingName = Boolean(match) && context.isPending;
  const setName = context.data?.setName;
  const canSave = Boolean(solution && (!match || context.data));
  const submitLabel = publishesDirectly
    ? { idle: "Create puzzle", pending: "Creating…" }
    : { idle: "Submit puzzle", pending: "Submitting…" };

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    setError("");
  }, [solution]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave || (match && !context.data) || savingRef.current) return;
    savingRef.current = true;
    onSavingChange(true);
    setError("");
    const puzzle = { fen, solution, opaStyle, explanation, tags };
    try {
      let result: PuzzleCreationResult;
      if (match && context.data) {
        const matchResult = await addMatchPuzzle({
          gameId: match.gameId,
          ...positionHistory,
          ...puzzle,
        });
        result = matchResult;
      } else {
        result = await submitPuzzle({ ...puzzle, event: "" }, { positionHistory });
      }
      if (result.destination === "published") {
        void queryClient.invalidateQueries({ queryKey: puzzleQueryKeys.catalog });
      }
      onAdded(result);
    } catch (submitError) {
      setError(getErrorMessage(submitError, "Unable to add puzzle. Try again."));
    } finally {
      savingRef.current = false;
      onSavingChange(false);
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
        {children}
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
          <PuzzleMotifsPanel visible tags={tags} canManage={!saving} onUpdate={setTags} />
        </div>
      </div>
      <div className="boardPuzzleComposerFooter">
        {setName ? <p>Set: {setName}</p> : null}
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
            {saving ? submitLabel.pending : submitLabel.idle}
          </button>
        </div>
      </div>
    </form>
  );
};
