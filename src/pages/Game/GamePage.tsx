import "./GamePage.css";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { INITIAL_FEN } from "chessops/fen";
import { useMemo } from "react";

import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { gameDetailQueryOptions } from "../../lib/games/queries";
import { buildChessComGameUrl } from "../../lib/matches/routes";
import { serializeUciLinesToPgn } from "../../lib/puzzles/solutionPgn";
import { getErrorMessage } from "../../utils/errors";
import { AnalysisPage } from "../Analysis/Analysis";

const decodeParam = (value: unknown): string => {
  try {
    return decodeURIComponent(String(value ?? ""));
  } catch {
    return String(value ?? "");
  }
};

export const GamePage = () => {
  const { gameId: gameIdParam } = useParams({ strict: false });
  const gameId = decodeParam(gameIdParam)
    .replace(/^(?:chesscom|pychess):/i, "")
    .trim();
  const gameQuery = useQuery({ ...gameDetailQueryOptions(gameId), enabled: Boolean(gameId) });
  const game = gameQuery.data;
  const pgn = useMemo(
    () =>
      game?.moves?.length
        ? serializeUciLinesToPgn(INITIAL_FEN, [
            game.moves.map((uci) => ({ uci, key: uci, annotation: "", retry: false })),
          ])
        : "",
    [game?.moves],
  );

  if (gameQuery.isPending) return <RouteLoadingFallback />;

  if (!game || !pgn) {
    const message = gameQuery.error
      ? getErrorMessage(gameQuery.error, "Unable to load this game.")
      : "Move-by-move analysis is not available for this archived game.";
    return (
      <div className="rankingsPage">
        <div className="panel gameUnavailablePanel">
          <h1>Game unavailable</h1>
          <p>{message}</p>
          {gameId ? (
            <a href={buildChessComGameUrl(gameId)} target="_blank" rel="noreferrer">
              View on Chess.com
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  return <AnalysisPage game={game} initialPgn={pgn} />;
};
