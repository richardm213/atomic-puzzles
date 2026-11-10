import "./GamePage.css";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { INITIAL_FEN } from "chessops/fen";
import { useMemo } from "react";

import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { inferAtomic960InitialFen } from "../../lib/games/initialFen";
import { gameDetailQueryOptions } from "../../lib/games/queries";
import {
  buildExternalGameUrl,
  decodeRouteParam,
  inferExternalGameSource,
  isChessComSource,
  isPyChessSource,
} from "../../lib/matches/routes";
import { getErrorMessage } from "../../utils/errors";
import { AnalysisPage } from "../Analysis/Analysis";

export const GamePage = () => {
  const { gameId: gameIdParam } = useParams({ strict: false });
  const decodedGameId = decodeRouteParam(gameIdParam);
  const gameId = decodedGameId.replace(/^(?:chesscom|pychess):/i, "").trim();
  const hasValidGameId = Boolean(gameId);
  const gameQuery = useQuery({ ...gameDetailQueryOptions(gameId), enabled: hasValidGameId });
  const game = gameQuery.data;
  const initialFen = useMemo(() => {
    const storedFen = game?.initial_fen?.trim();
    if (storedFen) return storedFen;
    if (game?.mode === "atomic960") return inferAtomic960InitialFen(game.moves);
    return INITIAL_FEN;
  }, [game?.initial_fen, game?.mode, game?.moves]);
  if (hasValidGameId && gameQuery.isPending) return <RouteLoadingFallback />;

  if (!game || !initialFen || !game.moves?.length) {
    const externalSource =
      game?.source ??
      (isPyChessSource(decodedGameId) ? "pychess" : inferExternalGameSource(decodedGameId));
    const externalUrl = buildExternalGameUrl(gameId, { source: externalSource });
    const externalLabel = isChessComSource(externalSource)
      ? "View on Chess.com"
      : isPyChessSource(externalSource)
        ? "View on PyChess"
        : "View on Lichess";
    const message = !hasValidGameId
      ? "This game link is missing a valid game id."
      : gameQuery.error
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

  return (
    <AnalysisPage
      key={game.game_id}
      game={game}
      initialFen={initialFen}
      initialMoves={game.moves}
    />
  );
};
