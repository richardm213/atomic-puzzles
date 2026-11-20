import { faPuzzlePiece } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { FormEvent, MouseEventHandler, ReactNode, Ref } from "react";
import { useEffect, useRef, useState } from "react";

import { isApprovedPuzzleCreator } from "../../../shared/domain/puzzles/approvedPuzzleCreators";
import { PuzzleStartingFenWarning } from "../../components/PuzzleStartingFenWarning/PuzzleStartingFenWarning";
import { useAuth } from "../../context/AuthContext";
import {
  addMatchPuzzle,
  fetchMatchPuzzleContext,
  matchPuzzleContextKey,
} from "../../lib/puzzles/matchPuzzles";
import { puzzleQueryKeys } from "../../lib/puzzles/puzzleQueries";
import type {
  PuzzleCreationResult,
  PuzzlePositionHistory,
} from "../../lib/puzzles/puzzleSubmission";
import { submitPuzzle } from "../../lib/supabase/puzzleQueue";
import { getErrorMessage } from "../../utils/errors";
import { PuzzleDraftFields } from "./PuzzleDraftFields";

const usePuzzleSubmissionLabels = () => {
  const { user } = useAuth();
  return isApprovedPuzzleCreator(user?.username ?? "")
    ? { idle: "Create puzzle", pending: "Creating…" }
    : { idle: "Submit puzzle", pending: "Submitting…" };
};

export const PuzzleCreationConfirmation = ({
  result,
  className = "analysisPuzzleConfirmation",
}: {
  result: PuzzleCreationResult;
  className?: string;
}) => (
  <p className={className} role="status">
    {result.destination === "published" ? (
      <>
        Puzzle created.{" "}
        <Link to="/solve/$puzzleId" params={{ puzzleId: String(result.puzzleId) }}>
          View puzzle
        </Link>
      </>
    ) : (
      "Puzzle submitted for review."
    )}
  </p>
);

export const PuzzleComposerButton = ({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
}) => {
  const { idle: label } = usePuzzleSubmissionLabels();
  return (
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
};

export const PuzzleComposer = ({
  match,
  positionHistory,
  fen,
  solution,
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
  const [metadata, setMetadata] = useState({
    opaStyle: false,
    explanation: "",
    tags: [] as string[],
  });
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const checkingName = Boolean(match) && context.isPending;
  const setName = context.data?.setName;
  const canSave = Boolean(solution && (!match || context.data));
  const submitLabel = usePuzzleSubmissionLabels();

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    setError("");
  }, [solution]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave || savingRef.current) return;
    savingRef.current = true;
    onSavingChange(true);
    setError("");
    const puzzle = { fen, solution, ...metadata };
    try {
      const result = match
        ? await addMatchPuzzle({ gameId: match.gameId, ...positionHistory, ...puzzle })
        : await submitPuzzle({ ...puzzle, event: "" }, { positionHistory });
      if (result.destination === "published") {
        void queryClient.invalidateQueries({ queryKey: puzzleQueryKeys.catalog });
        onAdded({ destination: "published", puzzleId: result.puzzleId });
      } else {
        onAdded({ destination: "review" });
      }
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
        <PuzzleDraftFields
          value={metadata}
          disabled={saving}
          onChange={(changes) => setMetadata((current) => ({ ...current, ...changes }))}
        />
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
          <button type="submit" className="boardPuzzleComposerSubmit" disabled={!canSave || saving}>
            {saving ? submitLabel.pending : submitLabel.idle}
          </button>
        </div>
      </div>
    </form>
  );
};
