import { Link } from "@tanstack/react-router";

import { getTournamentRouteId, type TournamentMeta } from "../../lib/matches/tournaments";
import { appAssetPath } from "../../utils/appAssetPath";
import { formatCalendarDate } from "../../utils/formatters";
import { normalizeUsername } from "../../utils/playerNames";
import styles from "./TournamentArchiveCard.module.css";

type TournamentArchiveCardProps = {
  tournament: TournamentMeta;
  champion: string;
};

export const TournamentArchiveCard = ({ tournament, champion }: TournamentArchiveCardProps) => {
  const showWinner = Boolean(champion) && tournament.showChampion;
  const archiveLabel =
    tournament.seriesKey === "acl" || tournament.id === "acl"
      ? "team archive"
      : tournament.seriesKey === "wolfarena" || tournament.id === "wr-arena2026"
        ? "round archive"
        : "bracket";
  return (
    <article className={styles.card}>
      <div className={styles.edition}>
        <span>{tournament.year}</span>
      </div>

      <div className={styles.art} aria-hidden="true">
        {tournament.trophyAssetPath ? (
          <img
            src={appAssetPath(tournament.trophyAssetPath)}
            alt=""
            width="112"
            height="112"
            loading="lazy"
            decoding="async"
          />
        ) : null}
      </div>

      <div className={styles.copy}>
        <h3>{tournament.seriesName}</h3>
        {tournament.startDate ? (
          <time dateTime={tournament.startDate}>
            Started {formatCalendarDate(tournament.startDate)}
          </time>
        ) : null}
      </div>

      {showWinner ? (
        <div className={styles.champion}>
          <Link
            className={styles.winnerLink}
            to="/@/$username"
            params={{ username: normalizeUsername(champion) }}
          >
            {champion}
          </Link>
        </div>
      ) : null}

      <Link
        className={styles.cardLink}
        to="/tournaments/$tournamentId"
        params={{ tournamentId: getTournamentRouteId(tournament.id) }}
        aria-label={`Open ${tournament.seriesName} ${tournament.year} ${archiveLabel}`}
      ></Link>
    </article>
  );
};
