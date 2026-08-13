import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";

import type { TournamentMeta } from "../../lib/matches/tournaments";
import { appAssetPath } from "../../utils/appAssetPath";
import { normalizeUsername } from "../../utils/playerNames";
import styles from "./TournamentArchiveCard.module.css";

const tournamentSeriesName = (tournament: TournamentMeta): string => {
  if (tournament.id.startsWith("ahc")) return "Atomic Hyper Championship";
  if (tournament.id.startsWith("aoc")) return "Atomic Openings Championship";
  if (tournament.id.startsWith("ccac")) return "Chess.com Atomic Championship";
  return "Atomic World Championship";
};

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
  const showWinner = Boolean(champion) && tournament.id !== "awc2025";
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
        <h3>{tournamentSeriesName(tournament)}</h3>
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
        params={{ tournamentId: tournament.id }}
        aria-label={`Open ${tournamentSeriesName(tournament)} ${tournament.year} bracket`}
      >
        <span>Open bracket</span>
        <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
      </Link>
    </article>
  );
};
