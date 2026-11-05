import "./GameAnalysisBatchControl.css";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useMemo, useRef, useState } from "react";

import { useAuth } from "../../context/AuthContext";
import { coinQueryKeys, updateCachedCoinBalance } from "../../lib/coins/coinQueries";
import type { BatchAnalysisGame } from "../../lib/gameAnalysis/batch";
import {
  loadCoveredGameIds,
  parseGameNumberSelection,
  requestGameAnalysisBatch,
} from "../../lib/gameAnalysis/batch";
import { appAssetPath } from "../../utils/appAssetPath";

export const GameAnalysisBatchControl = ({
  games,
  triggerLabel,
  allowGameSelection = false,
  className = "",
}: {
  games: BatchAnalysisGame[];
  triggerLabel: string;
  allowGameSelection?: boolean;
  className?: string;
}) => {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selection, setSelection] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const uniqueGames = useMemo(
    () => [...new Map(games.map((game) => [game.id, game])).values()],
    [games],
  );
  const gameIds = useMemo(() => uniqueGames.map((game) => game.id).filter(Boolean), [uniqueGames]);
  const statusQuery = useQuery({
    queryKey: ["game-analysis-statuses", gameIds],
    queryFn: () => loadCoveredGameIds(gameIds),
    enabled: isAuthenticated && gameIds.length > 0,
    staleTime: 15_000,
  });
  const covered = statusQuery.data ?? new Set<string>();
  const remainingGames = uniqueGames.filter((game) => !covered.has(game.id));
  const parsedSelection = useMemo(() => {
    if (!allowGameSelection) return { numbers: null, error: "" };
    try {
      return {
        numbers: new Set(parseGameNumberSelection(selection, games.length)),
        error: "",
      };
    } catch (error) {
      return {
        numbers: new Set<number>(),
        error: error instanceof Error ? error.message : "Check the game selection.",
      };
    }
  }, [allowGameSelection, games.length, selection]);
  const selectedGames = useMemo(() => {
    if (!parsedSelection.numbers) return remainingGames;
    return remainingGames.filter((game) => parsedSelection.numbers?.has(game.number));
  }, [parsedSelection, remainingGames]);
  const mutation = useMutation({
    mutationFn: async (ids: string[]) => {
      setProgress({ completed: 0, total: ids.length });
      return requestGameAnalysisBatch(ids, (completed, total) => setProgress({ completed, total }));
    },
    onSuccess: async (result) => {
      if (result.balance !== null && user?.username) {
        updateCachedCoinBalance(queryClient, user.username, result.balance);
        void queryClient.invalidateQueries({ queryKey: coinQueryKeys.rankings });
      }
      await queryClient.invalidateQueries({ queryKey: ["game-analysis-statuses"] });
      for (const gameId of result.requestedGameIds) {
        void queryClient.invalidateQueries({ queryKey: ["game-analysis", gameId] });
      }
      if (result.failures.length === 0) dialogRef.current?.close();
    },
    onSettled: () => setProgress(null),
  });

  if (
    !isAuthenticated ||
    gameIds.length === 0 ||
    statusQuery.isError ||
    (!statusQuery.isPending && remainingGames.length === 0)
  ) {
    return null;
  }

  const openDialog = () => {
    setSelectionError("");
    mutation.reset();
    dialogRef.current?.showModal();
  };
  const closeDialog = () => {
    if (!mutation.isPending) dialogRef.current?.close();
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const numbers = allowGameSelection
        ? new Set(parseGameNumberSelection(selection, games.length))
        : null;
      const ids = remainingGames
        .filter((game) => !numbers || numbers.has(game.number))
        .map((game) => game.id);
      if (ids.length === 0) throw new Error("No unanalyzed games are selected.");
      setSelectionError("");
      mutation.mutate(ids);
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : "Check the game selection.");
    }
  };
  const failureMessage = mutation.data?.failures.length
    ? `${mutation.data.failures.length} game${mutation.data.failures.length === 1 ? "" : "s"} could not be requested.`
    : mutation.error instanceof Error
      ? mutation.error.message
      : "";
  const failedGames = mutation.data?.failures.map((failure) => ({
    ...failure,
    number: uniqueGames.find((game) => game.id === failure.gameId)?.number,
  }));

  return (
    <div className={`gameAnalysisBatchControl ${className}`.trim()}>
      <button
        type="button"
        className="gameAnalysisBatchTrigger"
        disabled={statusQuery.isPending}
        onClick={openDialog}
      >
        {statusQuery.isPending ? "Checking analyses…" : triggerLabel}
      </button>
      <dialog
        ref={dialogRef}
        className="gameAnalysisPurchaseDialog"
        aria-labelledby="batch-game-analysis-title"
        onCancel={(event) => {
          if (mutation.isPending) event.preventDefault();
          else closeDialog();
        }}
        onClickCapture={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
      >
        <form onSubmit={submit}>
          <div>
            <h2 id="batch-game-analysis-title">Request game analysis?</h2>
            <p>
              <img
                className="gameAnalysisCoinIcon"
                src={appAssetPath("/images/coins/gold-coin-stack-v2.png")}
                alt=""
                aria-hidden="true"
              />
              {selectedGames.length} Atomic Coin{selectedGames.length === 1 ? "" : "s"}
            </p>
          </div>
          {allowGameSelection ? (
            <label className="gameAnalysisSelectionField" htmlFor="game-analysis-selection">
              Games <span>(optional)</span>
              <input
                id="game-analysis-selection"
                className="gameAnalysisSelectionInput"
                type="text"
                inputMode="numeric"
                placeholder={`All remaining games (1-${games.length})`}
                value={selection}
                disabled={mutation.isPending}
                onChange={(event) => {
                  setSelection(event.target.value);
                  setSelectionError("");
                }}
              />
              <span className="gameAnalysisSelectionHint">
                Leave blank for all. Example: 1-3,6,8,10-15
              </span>
            </label>
          ) : null}
          <span className="gameAnalysisBatchStatus">
            {covered.size > 0
              ? `${covered.size} existing ${covered.size === 1 ? "analysis" : "analyses"} excluded.`
              : `${remainingGames.length} ${remainingGames.length === 1 ? "game" : "games"} selected.`}
          </span>
          {progress ? (
            <span className="gameAnalysisBatchStatus" aria-live="polite">
              Requesting {progress.completed} of {progress.total}…
            </span>
          ) : null}
          {selectionError || parsedSelection.error || (failureMessage && !failedGames?.length) ? (
            <p className="gameAnalysisBatchError" role="alert">
              {selectionError || parsedSelection.error || failureMessage}
            </p>
          ) : null}
          {failedGames?.length ? (
            <div className="gameAnalysisBatchFailures" role="alert">
              <p>{failureMessage}</p>
              <ul>
                {failedGames.map((failure) => (
                  <li key={failure.gameId}>
                    {failure.number ? `Game ${failure.number}` : failure.gameId}: {failure.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="gameAnalysisPurchaseActions">
            <button type="button" disabled={mutation.isPending} onClick={closeDialog}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                mutation.isPending || selectedGames.length === 0 || Boolean(parsedSelection.error)
              }
            >
              {mutation.isPending ? "Requesting…" : "Confirm"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
};
