import { faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { BadgeDefinition } from "../../../shared/domain/badges";
import { appAssetPath } from "../../utils/appAssetPath";
import styles from "./BadgeMedallion.module.css";

const formatDate = (value: string): string => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Earned";
  return `Earned ${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
};

const formatDescription = (value: string): string => value.replace(/\bdistinct\s+/gi, "");

export const BadgeMedallion = ({
  badge,
  earnedAt,
  value,
  compact = false,
}: {
  badge: BadgeDefinition;
  earnedAt?: string;
  value: number;
  compact?: boolean;
}) => {
  const earned = Boolean(earnedAt);
  const progress = Math.min(100, Math.max(0, (value / badge.threshold) * 100));
  const progressLabel = `${Math.min(value, badge.threshold).toLocaleString("en-US")} / ${badge.threshold.toLocaleString("en-US")}`;

  return (
    <article
      className={`${styles.card} ${compact ? styles.compact : ""} ${earned ? styles.earned : styles.locked}`}
      data-tier={badge.tier}
      data-category={badge.category}
      aria-label={`${badge.name}. ${formatDescription(badge.description)} ${
        earned ? formatDate(earnedAt ?? "") : `Locked. ${progressLabel}`
      }`}
    >
      <div className={styles.medallion} aria-hidden="true">
        <span className={styles.medallionInset}>
          <img src={appAssetPath(`/images/badges/${badge.iconKey}.png`)} alt="" />
        </span>
        {!earned ? (
          <span className={styles.stateIcon}>
            <FontAwesomeIcon icon={faLock} />
          </span>
        ) : null}
      </div>
      <div className={styles.copy}>
        <h3>{badge.name}</h3>
        <p className={styles.badgeMeta}>
          <span>
            {badge.tierName}
            {badge.tierLevel > 1 ? ` ${badge.tierLevel}` : ""}
          </span>
          <span aria-hidden="true">·</span>
          <span>{formatDescription(badge.description)}</span>
        </p>
        {earned ? (
          <span className={styles.earnedDate}>{formatDate(earnedAt ?? "")}</span>
        ) : !compact ? (
          <div className={styles.progressBlock}>
            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-label={`Progress toward ${badge.name}`}
              aria-valuemin={0}
              aria-valuemax={badge.threshold}
              aria-valuenow={Math.min(value, badge.threshold)}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <span>{progressLabel}</span>
          </div>
        ) : null}
      </div>
    </article>
  );
};
