import { faArrowRightArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";

import { LichessGameLink } from "../../components/LichessGameLink/LichessGameLink";
import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import type { ArchiveGame } from "../../lib/archive/games";
import {
  loadRawMatchById,
  loadRawMatchesByMode,
  type ParsedMatch,
  type ParsedMatchGame,
} from "../../lib/matches/data";
import { formatLocalDateTime, formatScore } from "../../utils/formatters";

const scoreForPlayer = (game: ParsedMatchGame, username: string): number => {
  if (game.winner === "draw") return 0.5;
  const winner = game.winner === "white" ? game.white : game.black;
  return winner.toLowerCase() === username.toLowerCase() ? 1 : 0;
};

const resultLabel = (score: number): string => (score === 0.5 ? "½" : String(score));
const resultClass = (score: number): string =>
  score === 1 ? "score win" : score === 0 ? "score loss" : "score draw";

type CrosstableResult = {
  id: string;
  playerOne: number;
  playerTwo: number;
  link: ReactNode;
  current: boolean;
};

const matchResultForPlayers = (
  match: ParsedMatch,
  playerOne: string,
  playerTwo: string,
): [number, number] => {
  const gameScore = match.games.reduce<[number, number]>(
    (score, matchGame) => [
      score[0] + scoreForPlayer(matchGame, playerOne),
      score[1] + scoreForPlayer(matchGame, playerTwo),
    ],
    [0, 0],
  );
  if (gameScore[0] === gameScore[1]) return [0.5, 0.5];
  return gameScore[0] > gameScore[1] ? [1, 0] : [0, 1];
};

const Crosstable = ({
  playerOne,
  playerTwo,
  results,
  label,
  embedded,
  unit,
  matchId,
  onToggleUnit,
}: {
  playerOne: string;
  playerTwo: string;
  results: CrosstableResult[];
  label: string;
  embedded: boolean;
  unit: "games" | "matches";
  matchId: string;
  onToggleUnit: () => void;
}) => {
  const playerOneTotal = results.reduce((sum, result) => sum + result.playerOne, 0);
  const playerTwoTotal = results.reduce((sum, result) => sum + result.playerTwo, 0);
  const dense = results.length > 8;
  const nextUnitLabel = unit === "games" ? "matches in this mode" : "games in this match";
  const toolbar = (
    <div className="gameMatchCrosstableToolbar">
      <button
        type="button"
        className="gameMatchCrosstableToggle"
        aria-label={`Switch to ${nextUnitLabel}`}
        title={`Switch to ${nextUnitLabel}`}
        aria-pressed={unit === "matches"}
        onClick={onToggleUnit}
      >
        <FontAwesomeIcon icon={faArrowRightArrowLeft} aria-hidden="true" />
        <span>{unit === "games" ? "Games" : "Matches"}</span>
      </button>
      {matchId ? (
        <Link className="gameMatchCrosstableMatchLink" to="/matches/$matchId" params={{ matchId }}>
          View match
        </Link>
      ) : null}
    </div>
  );
  const content = (
    <>
      {!embedded ? (
        <div className="gameMatchCrosstableHeading">
          <h2 id="game-match-crosstable-title">Crosstable</h2>
          {toolbar}
        </div>
      ) : (
        toolbar
      )}
      <div className="gameMatchCrosstableScroll">
        <div
          className={`gameMatchCrosstableStrip${dense ? " dense" : ""}`}
          style={{ "--game-count": results.length } as CSSProperties}
        >
          <ol className="gameMatchResults" aria-label={label}>
            {results.map((result) => (
              <li key={result.id} className={result.current ? "current" : ""}>
                {result.link}
              </li>
            ))}
          </ol>
          <div className="gameMatchPlayers">
            <PlayerLink username={playerOne}>{playerOne}</PlayerLink>
            <PlayerLink username={playerTwo}>{playerTwo}</PlayerLink>
          </div>
          <div className="gameMatchTotals" aria-label="Crosstable score">
            <strong>{formatScore(playerOneTotal)}</strong>
            <strong>{formatScore(playerTwoTotal)}</strong>
          </div>
        </div>
      </div>
    </>
  );

  if (embedded) return <div className="gameMatchCrosstableEmbedded">{content}</div>;
  return (
    <section className="gameMatchCrosstable" aria-labelledby="game-match-crosstable-title">
      {content}
    </section>
  );
};

export const GameMatchCrosstable = ({
  game,
  embedded = false,
}: {
  game: ArchiveGame;
  embedded?: boolean;
}) => {
  const [unitSelection, setUnitSelection] = useState<{
    gameId: string;
    unit: "games" | "matches";
  }>({ gameId: game.game_id, unit: "games" });
  const matchQuery = useQuery({
    queryKey: ["games", "match-crosstable", game.external_match_id],
    queryFn: () => loadRawMatchById(game.external_match_id),
    enabled: Boolean(game.external_match_id),
    staleTime: 10 * 60 * 1_000,
  });
  const match = matchQuery.data;
  const unit = unitSelection.gameId === game.game_id ? unitSelection.unit : "games";
  const showMatchHistory = unit === "matches";
  const players: [string, string] = match?.players ?? [game.player_1, game.player_2];
  const historyQuery = useQuery({
    queryKey: ["games", "player-match-crosstable", game.mode, players[0], players[1]],
    queryFn: () =>
      loadRawMatchesByMode(game.mode, {
        filters: { usernamePair: [players[0], players[1]] },
        includeTotal: false,
      }),
    enabled: Boolean(players[0] && players[1]),
    staleTime: 10 * 60 * 1_000,
  });
  const toggleUnit = () => {
    const nextUnit = unit === "games" ? "matches" : "games";
    setUnitSelection({ gameId: game.game_id, unit: nextUnit });
  };

  if (!match && !showMatchHistory) {
    if (!embedded) return null;
    return (
      <p className="gameUnderboardState">
        {matchQuery.isError ? "Unable to load this match." : "Loading crosstable…"}
      </p>
    );
  }

  if (showMatchHistory) {
    if (!historyQuery.data) {
      if (!embedded) return null;
      return (
        <p className="gameUnderboardState">
          {historyQuery.isError ? "Unable to load match history." : "Loading crosstable…"}
        </p>
      );
    }
    const history = [...historyQuery.data]
      .filter((entry) => entry.games.length > 0)
      .sort((left, right) => left.start_ts - right.start_ts);
    if (!history.length) {
      return embedded ? (
        <p className="gameUnderboardState">
          No matches are archived for these players in this mode.
        </p>
      ) : null;
    }
    const results = history.map((historyMatch, index): CrosstableResult => {
      const [playerOne, playerTwo] = matchResultForPlayers(historyMatch, players[0], players[1]);
      const firstGameId = historyMatch.games[0]?.id ?? "";
      const date = formatLocalDateTime(historyMatch.start_ts);
      return {
        id: historyMatch.match_id || `${firstGameId}-${index}`,
        playerOne,
        playerTwo,
        current: historyMatch.match_id === game.external_match_id,
        link: (
          <Link
            to="/games/$gameId"
            params={{ gameId: firstGameId }}
            className="gameMatchResultLink"
            title={`Match ${index + 1} · ${date}`}
            aria-label={`Open the first game of match ${index + 1}, played ${date}`}
          >
            <span className={resultClass(playerOne)}>{resultLabel(playerOne)}</span>
            <span className={resultClass(playerTwo)}>{resultLabel(playerTwo)}</span>
          </Link>
        ),
      };
    });
    return (
      <Crosstable
        playerOne={players[0]}
        playerTwo={players[1]}
        results={results}
        label={`${results.length} ${results.length === 1 ? "match" : "matches"} in ${game.mode}`}
        embedded={embedded}
        unit={unit}
        matchId={game.external_match_id}
        onToggleUnit={toggleUnit}
      />
    );
  }

  if (!match) return null;
  const results = match.games.map((matchGame, index): CrosstableResult => {
    const playerOne = scoreForPlayer(matchGame, players[0]);
    const playerTwo = scoreForPlayer(matchGame, players[1]);
    return {
      id: matchGame.id,
      playerOne,
      playerTwo,
      current: matchGame.id === game.game_id,
      link: (
        <LichessGameLink
          gameId={matchGame.id}
          source={match.source}
          className="gameMatchResultLink"
          title={`Game ${index + 1}`}
        >
          <span className={resultClass(playerOne)}>{resultLabel(playerOne)}</span>
          <span className={resultClass(playerTwo)}>{resultLabel(playerTwo)}</span>
        </LichessGameLink>
      ),
    };
  });
  return (
    <Crosstable
      playerOne={players[0]}
      playerTwo={players[1]}
      results={results}
      label={`${results.length} games`}
      embedded={embedded}
      unit={unit}
      matchId={game.external_match_id}
      onToggleUnit={toggleUnit}
    />
  );
};
