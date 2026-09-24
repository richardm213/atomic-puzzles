import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";

import { getTournamentRouteId, type TournamentMeta } from "../../lib/matches/tournaments";
import { appAssetPath } from "../../utils/appAssetPath";
import { normalizeUsername } from "../../utils/playerNames";
import styles from "./TournamentArchiveCard.module.css";

type TournamentArchiveCardProps = {
  tournament: TournamentMeta;
  champion: string;
  spotlight?: boolean;
};

export const TournamentArchiveCard = ({
  tournament,
  champion,
  spotlight = false,
}: TournamentArchiveCardProps) => {
  const showWinner = Boolean(champion) && tournament.showChampion;
  const isRoundArchive =
    tournament.seriesKey === "wolfarena" || tournament.id === "wr-arena2026";
  const cardClassName = spotlight ? `${styles.card} ${styles.spotlight}` : styles.card;

  return (
    <article className={cardClassName}>
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
            loading={spotlight ? "eager" : "lazy"}
            decoding="async"
          />
        ) : null}
      </div>

      <div className={styles.copy}>
        <h3>{tournament.seriesName}</h3>
        {showWinner ? (
          <div className={styles.champion}>
            <span>Champion</span>
            <Link
              className={styles.winnerLink}
              to="/@/$username"
              params={{ username: normalizeUsername(champion) }}
            >
              {champion}
            </Link>
          </div>
        ) : (
          <span className={styles.published}>Bracket published</span>
        )}
      </div>

      <Link
        className={styles.cardLink}
        to="/tournaments/$tournamentId"
        params={{ tournamentId: getTournamentRouteId(tournament.id) }}
        aria-label={`Open ${tournament.seriesName} ${tournament.year} ${isRoundArchive ? "round archive" : "bracket"}`}
      >
        <span>{isRoundArchive ? "Open rounds" : "Open bracket"}</span>
        <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
      </Link>
    </article>
  );
};
