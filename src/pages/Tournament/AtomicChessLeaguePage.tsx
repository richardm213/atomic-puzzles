import "./AtomicChessLeaguePage.css";

import {
  faArrowLeft,
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
  type AtomicChessLeagueDivision,
  type AtomicChessLeagueSeason,
  atomicChessLeagueSeasons,
  type AtomicChessLeagueTeam,
  getAtomicChessLeagueSeason,
} from "../../lib/matches/atomicChessLeague";
import { normalizeUsername } from "../../utils/playerNames";

const STORAGE_KEY = "tournament-view:acl";

type SavedView = {
  season?: number;
  divisions?: Partial<Record<AtomicChessLeagueSeason["number"], AtomicChessLeagueDivision["id"]>>;
};

const readSavedView = (): SavedView => {
  if (typeof window === "undefined") return {};
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};

const PlayerLink = ({ player }: { player: string }) => (
  <Link to="/@/$username" params={{ username: normalizeUsername(player) }}>
    {player}
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
        <span>{team.wins === 1 ? "1 win" : `${team.wins} wins`}</span>
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

const SeasonFacts = ({ season }: { season: AtomicChessLeagueSeason }) => (
  <dl className="aclSeasonFacts">
    <div>
      <dt>Played</dt>
      <dd>{season.dates}</dd>
    </div>
    <div>
      <dt>Format</dt>
      <dd>8 teams · 2 leagues · 3 rounds</dd>
    </div>
    <div>
      <dt>Boards</dt>
      <dd>
        {season.boardCount} · {season.timeControls.join(" · ")}
      </dd>
    </div>
  </dl>
);

export const AtomicChessLeaguePage = () => {
  const savedViewRef = useRef(readSavedView());
  const [seasonNumber, setSeasonNumber] = useState(savedViewRef.current.season ?? 2);
  const [divisionBySeason, setDivisionBySeason] = useState<
    Partial<Record<AtomicChessLeagueSeason["number"], AtomicChessLeagueDivision["id"]>>
  >(savedViewRef.current.divisions ?? {});
  const season = getAtomicChessLeagueSeason(seasonNumber);
  const divisionId = divisionBySeason[season.number] ?? "elite";
  const division =
    season.divisions.find((entry) => entry.id === divisionId) ?? season.divisions[0]!;
  const seasonButtonsRef = useRef(new Map<number, HTMLButtonElement>());
  const divisionButtonsRef = useRef(new Map<AtomicChessLeagueDivision["id"], HTMLButtonElement>());

  useEffect(() => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ season: season.number, divisions: divisionBySeason }),
    );
  }, [divisionBySeason, season.number]);

  const selectDivision = (nextDivision: AtomicChessLeagueDivision["id"]): void => {
    setDivisionBySeason((current) => ({ ...current, [season.number]: nextDivision }));
  };

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

  return (
    <div className="tournamentPage aclPage">
      <Seo
        title="Atomic Chess League archive"
        description="Browse team standings, rosters, and round results from Atomic Chess League Seasons 1 and 2."
        path="/tournaments/atomicchessleague"
      />

      <section className="aclHero">
        <Link className="aclBackLink" to="/tournaments">
          <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
          Tournaments
        </Link>
        <div className="aclHeroMain">
          <h1>Atomic Chess League</h1>
          <div className="aclSeasonTabs" role="tablist" aria-label="Select a season">
            {atomicChessLeagueSeasons.map((entry) => (
              <button
                key={entry.number}
                ref={(element) => {
                  if (element) seasonButtonsRef.current.set(entry.number, element);
                  else seasonButtonsRef.current.delete(entry.number);
                }}
                type="button"
                role="tab"
                aria-selected={entry.number === season.number}
                aria-controls="acl-season-panel"
                tabIndex={entry.number === season.number ? 0 : -1}
                className={entry.number === season.number ? "isActive" : ""}
                onClick={() => setSeasonNumber(entry.number)}
                onKeyDown={(event) =>
                  handleTabKeyDown(
                    event,
                    atomicChessLeagueSeasons.map((item) => item.number),
                    season.number,
                    setSeasonNumber,
                    seasonButtonsRef.current,
                  )
                }
              >
                Season {entry.number}
                <span>{entry.year}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section
        id="acl-season-panel"
        className="aclSeasonPanel"
        role="tabpanel"
        aria-label={`Season ${season.number}`}
      >
        <SeasonFacts season={season} />

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
                onClick={() => selectDivision(entry.id)}
                onKeyDown={(event) =>
                  handleTabKeyDown(
                    event,
                    season.divisions.map((item) => item.id),
                    division.id,
                    selectDivision,
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
          <div className="aclStandingsHeading">
            <h2>{division.name}</h2>
            <span>Final standings</span>
          </div>
          <div className="aclTeamList">
            {division.teams.map((team) => (
              <TeamStanding key={team.name} team={team} />
            ))}
          </div>
        </div>

        <footer className="aclSeasonFooter">
          <p>{season.scoring}</p>
          <a href={season.teamsUrl} target="_blank" rel="noreferrer">
            Teams and rules
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} aria-hidden="true" />
          </a>
        </footer>
      </section>

      <div id="tournament-comments" className="tournamentCommentsSection">
        <CommunityDiscussion target={{ type: "tournament", id: `acl-season-${season.number}` }} />
      </div>
    </div>
  );
};
