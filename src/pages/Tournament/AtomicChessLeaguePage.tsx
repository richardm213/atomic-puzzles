import "./AtomicChessLeaguePage.css";

import {
  faArrowLeft,
  faArrowRight,
  faArrowUpRightFromSquare,
  faCheck,
  faComment,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { CommunityDiscussion } from "../../components/PuzzleCommunity/PuzzleCommunity";
import { Seo } from "../../components/Seo/Seo";
import {
  type AtomicChessLeagueBoardMatch,
  type AtomicChessLeagueDivision,
  type AtomicChessLeagueSeason,
  type AtomicChessLeagueTeam,
  type AtomicChessLeagueTeamMatch,
  getAtomicChessLeaguePlayerName,
  getAtomicChessLeagueSeason,
} from "../../lib/matches/atomicChessLeague";
import { appAssetPath } from "../../utils/appAssetPath";

type RoundNumber = 1 | 2 | 3;
type ArchiveView = "standings" | "matches";

type SavedView = {
  division?: AtomicChessLeagueDivision["id"];
  rounds?: Partial<Record<AtomicChessLeagueDivision["id"], RoundNumber>>;
  view?: ArchiveView;
};

const readSavedView = (seasonNumber: AtomicChessLeagueSeason["number"]): SavedView => {
  if (typeof window === "undefined") return {};
  try {
    const value: unknown = JSON.parse(
      window.sessionStorage.getItem(`tournament-view:acl-s${seasonNumber}`) ?? "{}",
    );
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};

const PlayerLink = ({ player }: { player: string }) => (
  <Link to="/@/$username" params={{ username: getAtomicChessLeaguePlayerName(player) }}>
    {getAtomicChessLeaguePlayerName(player)}
  </Link>
);

const TeamStanding = ({ team }: { team: AtomicChessLeagueTeam }) => (
  <article className={`aclTeam${team.rank === 1 ? " isChampion" : ""}`}>
    <header className="aclTeamHeader">
      <span className="aclRank" aria-label={`Rank ${team.rank}`}>
        {team.rank}
      </span>
      <div className="aclTeamIdentity">
        <h3>{team.name}</h3>
        <span
          className="aclTeamRecord"
          aria-label={`Record: ${team.wins} wins and ${team.rounds.length - team.wins} losses`}
        >
          {team.wins}–{team.rounds.length - team.wins}
        </span>
      </div>
      {team.rank === 1 ? (
        <span className="aclChampionMark">
          <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
          Champion
        </span>
      ) : null}
    </header>

    <div className="aclRoundResults" aria-label={`${team.name} round results`}>
      {team.rounds.map((round, index) => (
        <div key={`${team.name}-${index}`} className={`aclRoundResult is${round.result}`}>
          <span>R{index + 1}</span>
          <strong>{round.result}</strong>
          <small>{round.score}</small>
        </div>
      ))}
    </div>

    <div className="aclRoster">
      <FontAwesomeIcon icon={faUsers} aria-hidden="true" />
      <div>
        {team.players.map((player) => (
          <PlayerLink key={player} player={player} />
        ))}
      </div>
    </div>
  </article>
);

const seasonDateFormatter = new Intl.DateTimeFormat("en", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const formatSeasonDate = (date: string): string =>
  seasonDateFormatter.format(new Date(`${date}T00:00:00Z`));

const boardStatusLabel = (board: AtomicChessLeagueBoardMatch): string => {
  if (board.status === "forfeit") return "Forfeit";
  if (board.status === "declared") return "Declared draw";
  if (board.status === "unplayed") return "Not played";
  if (board.status === "unarchived") return "Not archived";
  return "";
};

const numericScore = (score: string): number | null => {
  if (score === "½") return 0.5;
  const value = Number.parseFloat(score.replace("%", ""));
  return Number.isFinite(value) ? value : null;
};

const BoardMatchContent = ({ board }: { board: AtomicChessLeagueBoardMatch }) => {
  const player1 = board.player1 ? getAtomicChessLeaguePlayerName(board.player1) : "—";
  const player2 = board.player2 ? getAtomicChessLeaguePlayerName(board.player2) : "—";
  const score1 = numericScore(board.score1);
  const score2 = numericScore(board.score2);
  const player1Won = score1 !== null && score2 !== null && score1 > score2;
  const player2Won = score1 !== null && score2 !== null && score2 > score1;

  return (
    <>
      <span className="aclBoardTime">{board.timeControl}</span>
      <span
        className={`aclBoardPlayer${player1Won ? " isWinner" : ""}`}
        aria-label={`${player1}${player1Won ? ", winner" : ""}`}
      >
        <span>{player1}</span>
        {player1Won ? <FontAwesomeIcon icon={faCheck} aria-hidden="true" /> : null}
      </span>
      <strong className="aclBoardScore">
        <span>{board.score1 || "—"}</span>
        <i>–</i>
        <span>{board.score2 || "—"}</span>
      </strong>
      <span
        className={`aclBoardPlayer isSecond${player2Won ? " isWinner" : ""}`}
        aria-label={`${player2}${player2Won ? ", winner" : ""}`}
      >
        <span>{player2}</span>
        {player2Won ? <FontAwesomeIcon icon={faCheck} aria-hidden="true" /> : null}
      </span>
      {board.matchId ? (
        <span className="aclBoardOpen">
          Open
          <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
        </span>
      ) : (
        <span className="aclBoardStatus">{boardStatusLabel(board)}</span>
      )}
    </>
  );
};

const BoardMatchRow = ({ board }: { board: AtomicChessLeagueBoardMatch }) => {
  const label = `${board.player1 ? getAtomicChessLeaguePlayerName(board.player1) : "Unassigned"} ${board.score1 || ""}–${board.score2 || ""} ${board.player2 ? getAtomicChessLeaguePlayerName(board.player2) : "Unassigned"}`;
  const className = `aclBoardMatch${board.matchId ? " isLinked" : ""}`;

  if (board.matchId) {
    return (
      <Link
        className={className}
        to="/matches/$matchId"
        params={{ matchId: board.matchId }}
        aria-label={`Open ${label}`}
      >
        <BoardMatchContent board={board} />
      </Link>
    );
  }

  return (
    <div className={className} aria-label={label}>
      <BoardMatchContent board={board} />
    </div>
  );
};

const TeamMatchCard = ({ matchup }: { matchup: AtomicChessLeagueTeamMatch }) => (
  <article className="aclMatchup">
    <header className="aclMatchupHeader">
      <span>{matchup.team1}</span>
      <strong className="aclMatchupScore">
        <span>{matchup.score1}</span>
        <i>–</i>
        <span>{matchup.score2}</span>
        {matchup.tiebreak ? <small> TB</small> : null}
      </strong>
      <span>{matchup.team2}</span>
    </header>
    <div className="aclBoardList">
      {matchup.boards.map((board, index) => (
        <BoardMatchRow key={`${board.timeControl}-${board.player1}-${index}`} board={board} />
      ))}
    </div>
  </article>
);

const handleTabKeyDown = <T extends string | number>(
  event: KeyboardEvent<HTMLButtonElement>,
  values: readonly T[],
  activeValue: T,
  selectValue: (value: T) => void,
  refs: Map<T, HTMLButtonElement>,
): void => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const currentIndex = values.indexOf(activeValue);
  let nextIndex = currentIndex;
  if (event.key === "ArrowLeft") nextIndex = Math.max(0, currentIndex - 1);
  if (event.key === "ArrowRight") nextIndex = Math.min(values.length - 1, currentIndex + 1);
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = values.length - 1;
  const nextValue = values[nextIndex];
  if (nextValue === undefined) return;
  selectValue(nextValue);
  window.requestAnimationFrame(() => refs.get(nextValue)?.focus());
};

export const AtomicChessLeaguePage = ({
  seasonNumber,
}: {
  seasonNumber: AtomicChessLeagueSeason["number"];
}) => {
  const season = getAtomicChessLeagueSeason(seasonNumber);
  const savedViewRef = useRef(readSavedView(seasonNumber));
  const [divisionId, setDivisionId] = useState<AtomicChessLeagueDivision["id"]>(
    savedViewRef.current.division ?? "elite",
  );
  const [roundByDivision, setRoundByDivision] = useState<
    Partial<Record<AtomicChessLeagueDivision["id"], RoundNumber>>
  >(savedViewRef.current.rounds ?? {});
  const [view, setView] = useState<ArchiveView>(savedViewRef.current.view ?? "standings");
  const division =
    season.divisions.find((entry) => entry.id === divisionId) ?? season.divisions[0]!;
  const roundNumber = roundByDivision[division.id] ?? 1;
  const round =
    division.rounds.find((entry) => entry.number === roundNumber) ?? division.rounds[0]!;
  const divisionButtonsRef = useRef(new Map<AtomicChessLeagueDivision["id"], HTMLButtonElement>());
  const viewButtonsRef = useRef(new Map<ArchiveView, HTMLButtonElement>());
  const roundButtonsRef = useRef(new Map<RoundNumber, HTMLButtonElement>());
  const otherSeason = season.number === 2 ? 1 : 2;

  useEffect(() => {
    window.sessionStorage.setItem(
      `tournament-view:acl-s${season.number}`,
      JSON.stringify({ division: division.id, rounds: roundByDivision, view }),
    );
  }, [division.id, roundByDivision, season.number, view]);

  const selectRound = (nextRound: RoundNumber): void => {
    setRoundByDivision((current) => ({ ...current, [division.id]: nextRound }));
  };

  const trophyAssetPath =
    season.number === 1
      ? "/images/acl-trophies/team-orbit.png"
      : "/images/acl-trophies/league-reactor-v2.png";

  return (
    <div className="tournamentPage aclPage">
      <Seo
        title={`Atomic Chess League Season ${season.number} archive`}
        description={`Browse team standings, rosters, and every round from Atomic Chess League Season ${season.number}.`}
        path={`/tournaments/acl-s${season.number}`}
      />

      <section className="aclHero">
        <div className="aclHeroTopRow">
          <Link className="aclBackLink" to="/tournaments">
            <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
            Tournaments
          </Link>
          <Link
            className="aclSeasonSwitch"
            to="/tournaments/$tournamentId"
            params={{ tournamentId: `acl-s${otherSeason}` }}
          >
            Season {otherSeason}
            <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
          </Link>
        </div>
        <div className="aclHeroMain">
          <div className="aclHeroCopy">
            <h1>
              Atomic Chess League <span>Season {season.number}</span>
            </h1>
            <p className="aclSeasonDates">
              <time dateTime={season.startDate}>{formatSeasonDate(season.startDate)}</time>
              <span aria-hidden="true">–</span>
              <time dateTime={season.endDate}>{formatSeasonDate(season.endDate)}</time>
            </p>
          </div>
          <img
            className="aclTrophy"
            src={appAssetPath(trophyAssetPath)}
            alt={`Atomic Chess League Season ${season.number} trophy`}
          />
        </div>
      </section>

      <section className="aclSeasonPanel" aria-label={`Season ${season.number}`}>
        <div className="aclPanelHeader">
          <div className="aclDivisionTabs" role="tablist" aria-label="Select a league">
            {season.divisions.map((entry) => (
              <button
                key={entry.id}
                ref={(element) => {
                  if (element) divisionButtonsRef.current.set(entry.id, element);
                  else divisionButtonsRef.current.delete(entry.id);
                }}
                type="button"
                role="tab"
                aria-selected={entry.id === division.id}
                aria-controls="acl-division-panel"
                tabIndex={entry.id === division.id ? 0 : -1}
                className={entry.id === division.id ? "isActive" : ""}
                onClick={() => setDivisionId(entry.id)}
                onKeyDown={(event) =>
                  handleTabKeyDown(
                    event,
                    season.divisions.map((item) => item.id),
                    division.id,
                    setDivisionId,
                    divisionButtonsRef.current,
                  )
                }
              >
                {entry.name}
              </button>
            ))}
          </div>
          <div className="aclPanelActions">
            <a href={season.resultsUrl} target="_blank" rel="noreferrer">
              Official results
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} aria-hidden="true" />
            </a>
            <a href="#tournament-comments">
              <FontAwesomeIcon icon={faComment} aria-hidden="true" />
              Comments
            </a>
          </div>
        </div>

        <div id="acl-division-panel" role="tabpanel" aria-label={division.name}>
          <div className="aclViewBar">
            <div className="aclViewTabs" role="tablist" aria-label="Choose archive view">
              {(["standings", "matches"] as const).map((entry) => (
                <button
                  key={entry}
                  ref={(element) => {
                    if (element) viewButtonsRef.current.set(entry, element);
                    else viewButtonsRef.current.delete(entry);
                  }}
                  type="button"
                  role="tab"
                  aria-selected={entry === view}
                  aria-controls="acl-view-panel"
                  tabIndex={entry === view ? 0 : -1}
                  className={entry === view ? "isActive" : ""}
                  onClick={() => setView(entry)}
                  onKeyDown={(event) =>
                    handleTabKeyDown(
                      event,
                      ["standings", "matches"],
                      view,
                      setView,
                      viewButtonsRef.current,
                    )
                  }
                >
                  {entry === "standings" ? "Standings" : "Matches"}
                </button>
              ))}
            </div>
            {view === "matches" ? (
              <div className="aclRoundTabs" role="tablist" aria-label="Select a round">
                {division.rounds.map((entry) => (
                  <button
                    key={entry.number}
                    ref={(element) => {
                      if (element) roundButtonsRef.current.set(entry.number, element);
                      else roundButtonsRef.current.delete(entry.number);
                    }}
                    type="button"
                    role="tab"
                    aria-selected={entry.number === round.number}
                    aria-controls="acl-round-panel"
                    tabIndex={entry.number === round.number ? 0 : -1}
                    className={entry.number === round.number ? "isActive" : ""}
                    onClick={() => selectRound(entry.number)}
                    onKeyDown={(event) =>
                      handleTabKeyDown(
                        event,
                        division.rounds.map((item) => item.number),
                        round.number,
                        selectRound,
                        roundButtonsRef.current,
                      )
                    }
                  >
                    R{entry.number}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div id="acl-view-panel" role="tabpanel">
            {view === "standings" ? (
              <div className="aclTeamList">
                {division.teams.map((team) => (
                  <TeamStanding key={team.name} team={team} />
                ))}
              </div>
            ) : (
              <section className="aclSchedule" aria-label={`${division.name} matches`}>
                <div id="acl-round-panel" className="aclMatchupList" role="tabpanel">
                  {round.matchups.map((matchup) => (
                    <TeamMatchCard key={`${matchup.team1}-${matchup.team2}`} matchup={matchup} />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>

        <footer className="aclSeasonFooter">
          <a href={season.teamsUrl} target="_blank" rel="noreferrer">
            Teams and rules
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} aria-hidden="true" />
          </a>
        </footer>
      </section>

      <div id="tournament-comments" className="tournamentCommentsSection">
        <CommunityDiscussion target={{ type: "tournament", id: `acl-s${season.number}` }} />
      </div>
    </div>
  );
};
