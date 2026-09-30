import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";

import {
  type BadgeCategory,
  badgeCategoryLabels,
  type BadgeTier,
} from "../../../shared/domain/badges";
import { BadgeMedallion } from "../../components/Badges/BadgeMedallion";
import { BadgeTierIcon } from "../../components/Badges/BadgeTierIcon";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { usePersistedState } from "../../hooks/usePersistedState";
import { badgeSummaryQueryOptions } from "../../lib/badges/badgeQueries";
import { normalizeUsername } from "../../utils/playerNames";
import styles from "./Achievements.module.css";

type BadgeFilter = "all" | "puzzles" | "ratings";

const categoryOrder: BadgeCategory[] = [
  "attempted",
  "correct",
  "created",
  "blitz",
  "bullet",
  "hyperbullet",
];

const filterCategories: Record<BadgeFilter, BadgeCategory[]> = {
  all: categoryOrder,
  puzzles: ["attempted", "correct", "created"],
  ratings: ["blitz", "bullet", "hyperbullet"],
};

export const AchievementsPage = ({ username }: { username?: string }) => {
  const { isLoading: authLoading, login, user } = useAuth();
  const requestedUsername = normalizeUsername(username || user?.username);
  const displayUsername = String(username || user?.username || "").trim();
  const [filter, setFilter] = usePersistedState<BadgeFilter>(
    "atomic-badge-filter",
    z.enum(["all", "puzzles", "ratings"]),
    "all",
  );
  const [tierFilter, setTierFilter] = usePersistedState<BadgeTier | null>(
    "atomic-badge-tier-filter",
    z.enum(["meteorite", "moon", "planet", "sun", "eclipse", "nova", "black_hole"]).nullable(),
    null,
  );
  const [showLocked, setShowLocked] = usePersistedState(
    "atomic-badge-show-locked",
    z.boolean(),
    true,
  );
  const summary = useQuery({
    ...badgeSummaryQueryOptions(requestedUsername),
    enabled: Boolean(requestedUsername),
  });
  const earnedByKey = useMemo(
    () => new Map(summary.data?.earned.map((badge) => [badge.badgeKey, badge.earnedAt]) ?? []),
    [summary.data?.earned],
  );
  const catalog = summary.data?.catalog ?? [];
  const earnedCount = earnedByKey.size;
  const puzzleBadgeCount = catalog.filter((badge) =>
    (["attempted", "correct", "created"] as BadgeCategory[]).includes(badge.category),
  ).length;
  const puzzleEarnedCount = catalog.filter(
    (badge) =>
      (["attempted", "correct", "created"] as BadgeCategory[]).includes(badge.category) &&
      earnedByKey.has(badge.key),
  ).length;
  const ratingEarnedCount = earnedCount - puzzleEarnedCount;

  if (authLoading && !username) return <RouteLoadingFallback />;

  if (!requestedUsername) {
    return (
      <main className={`sitePage ${styles.page}`}>
        <Seo
          title="Achievements"
          description="Collect permanent Atomic Chess puzzle and rating badges."
          path="/achievements"
        />
        <section className={`panel ${styles.loginPanel}`}>
          <h1>Achievements</h1>
          <p>Log in to view your badge collection and progress.</p>
          <button type="button" onClick={() => void login("/achievements")}>
            Log in with Lichess
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={`sitePage ${styles.page}`}>
      <Seo
        title={`${displayUsername || requestedUsername} achievements`}
        description={`View ${displayUsername || requestedUsername}'s permanent Atomic Chess badges.`}
        path={
          username ? `/@/${encodeURIComponent(requestedUsername)}/achievements` : "/achievements"
        }
      />

      <header className={styles.header}>
        <div>
          <h1>{displayUsername || requestedUsername}&apos;s badges</h1>
        </div>
        {username ? (
          <Link to="/@/$username" params={{ username: requestedUsername }}>
            View profile
          </Link>
        ) : null}
      </header>

      {summary.isPending ? <RouteLoadingFallback showText /> : null}
      {summary.isError ? (
        <section className={`panel ${styles.errorPanel}`} role="alert">
          <h2>Achievements unavailable</h2>
          <p>{summary.error instanceof Error ? summary.error.message : "Please try again."}</p>
          <button type="button" onClick={() => void summary.refetch()}>
            Try again
          </button>
        </section>
      ) : null}

      {summary.data ? (
        <>
          <section className={styles.summary} aria-label="Badge collection summary">
            <div>
              <strong>{earnedCount}</strong>
              <span>of {catalog.length} earned</span>
            </div>
            <div>
              <strong>{puzzleEarnedCount}</strong>
              <span>of {puzzleBadgeCount} puzzle badges</span>
            </div>
            <div>
              <strong>{ratingEarnedCount}</strong>
              <span>of {catalog.length - puzzleBadgeCount} rating badges</span>
            </div>
          </section>

          <section className={styles.tierSystem} aria-labelledby="badge-tiers-title">
            <h2 id="badge-tiers-title">Badge tiers</h2>
            <ol>
              {summary.data.tiers.map((tier) => (
                <li key={tier.key} data-tier={tier.key}>
                  <button
                    type="button"
                    className={tierFilter === tier.key ? styles.selectedTier : ""}
                    aria-pressed={tierFilter === tier.key}
                    title={tier.description}
                    onClick={() =>
                      setTierFilter((selectedTier) => (selectedTier === tier.key ? null : tier.key))
                    }
                  >
                    <span className={styles.tierIcon} aria-hidden="true">
                      <BadgeTierIcon tier={tier.key} />
                    </span>
                    <span>{tier.name}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>

          <div className={styles.controls}>
            <div className={styles.filters} role="group" aria-label="Badge category">
              {(["all", "puzzles", "ratings"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={filter === option ? styles.active : ""}
                  aria-pressed={filter === option}
                  onClick={() => setFilter(option)}
                >
                  {option === "all" ? "All" : option === "puzzles" ? "Puzzles" : "Ratings"}
                </button>
              ))}
            </div>
            <label className={styles.lockedToggle}>
              <input
                type="checkbox"
                checked={showLocked}
                onChange={(event) => setShowLocked(event.target.checked)}
              />
              Show locked
            </label>
          </div>

          <div className={styles.collections}>
            {filterCategories[filter].map((category) => {
              const badges = catalog.filter(
                (badge) =>
                  badge.category === category &&
                  (!tierFilter || badge.tier === tierFilter) &&
                  (showLocked || earnedByKey.has(badge.key)),
              );
              const categoryTotal = catalog.filter(
                (badge) =>
                  badge.category === category && (!tierFilter || badge.tier === tierFilter),
              ).length;
              const categoryEarned = catalog.filter(
                (badge) =>
                  badge.category === category &&
                  (!tierFilter || badge.tier === tierFilter) &&
                  earnedByKey.has(badge.key),
              ).length;
              return (
                <section className={styles.collection} key={category}>
                  <div className={styles.collectionHeader}>
                    <h2>{badgeCategoryLabels[category]}</h2>
                    <span>
                      {categoryEarned} / {categoryTotal}
                    </span>
                  </div>
                  {badges.length ? (
                    <div className={styles.badgeGrid}>
                      {badges.map((badge) => {
                        const earnedAt = earnedByKey.get(badge.key);
                        return (
                          <BadgeMedallion
                            key={badge.key}
                            badge={badge}
                            value={summary.data.stats[category]}
                            {...(earnedAt ? { earnedAt } : {})}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <p className={styles.emptyCollection}>
                      {tierFilter && showLocked
                        ? "No badges in this tier."
                        : "No badges earned in this collection yet."}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        </>
      ) : null}
    </main>
  );
};
