import "./GamePage.css";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { INITIAL_FEN } from "chessops/fen";
import { useMemo } from "react";

import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { gameDetailQueryOptions } from "../../lib/games/queries";
import {
  buildExternalGameUrl,
  inferExternalGameSource,
  isChessComSource,
  isPyChessSource,
} from "../../lib/matches/routes";
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
  const decodedGameId = decodeParam(gameIdParam);
  const gameId = decodedGameId.replace(/^(?:chesscom|pychess):/i, "").trim();
  const gameQuery = useQuery({ ...gameDetailQueryOptions(gameId), enabled: Boolean(gameId) });
  const game = gameQuery.data;
  const initialFen = game?.initial_fen?.trim() || INITIAL_FEN;
  const pgn = useMemo(
    () =>
      game?.moves?.length
        ? serializeUciLinesToPgn(initialFen, [
            game.moves.map((uci) => ({ uci, key: uci, annotation: "", retry: false })),
          ])
        : "",
    [game?.moves, initialFen],
  );

  if (gameQuery.isPending) return <RouteLoadingFallback />;

  if (!game || !pgn) {
    const externalSource =
      game?.source ??
      (isPyChessSource(decodedGameId) ? "pychess" : inferExternalGameSource(decodedGameId));
    const externalUrl = buildExternalGameUrl(gameId, { source: externalSource });
    const externalLabel = isChessComSource(externalSource)
      ? "View on Chess.com"
      : isPyChessSource(externalSource)
        ? "View on PyChess"
        : "View on Lichess";
    const message = gameQuery.error
      ? getErrorMessage(gameQuery.error, "Unable to load this game.")
      : "Move-by-move analysis is not available for this archived game.";
    return (
      <div className="rankingsPage">
        <div className="panel gameUnavailablePanel">
          <h1>Game unavailable</h1>
          <p>{message}</p>
          {externalUrl ? (
            <a href={externalUrl} target="_blank" rel="noreferrer">
              {externalLabel}
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  return <AnalysisPage game={game} initialFen={initialFen} initialPgn={pgn} />;
};
