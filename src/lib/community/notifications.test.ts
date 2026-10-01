import { describe, expect, it } from "vitest";

import { notificationCopy, rankingNotificationImage, type UserNotification } from "./notifications";

const makeNotification = (
  notificationType: UserNotification["notification_type"],
): UserNotification => ({
  id: 1,
  recipient_username: "alice",
  actor_username: "bob",
  notification_type: notificationType,
  puzzle_id: 42,
  comment_id: 7,
  rating: null,
  rating_deviation: null,
  created_at: "2026-09-21T00:00:00.000Z",
  read_at: null,
});

describe("notificationCopy", () => {
  it("shows a personalized puzzle rating announcement", () => {
    expect(
      notificationCopy({
        ...makeNotification("puzzle_rating_added"),
        rating: 2142,
        rating_deviation: 87,
      }),
    ).toBe("Puzzle ratings have been added to the site! Yours is 2142 with RD 87");
  });

  it("describes puzzle comments in a way that applies to authors and prior commenters", () => {
    expect(notificationCopy(makeNotification("puzzle_comment"))).toBe(
      "bob commented on a puzzle you follow.",
    );
  });

  it("describes a separate monthly placement for each time control", () => {
    expect(
      notificationCopy({
        ...makeNotification("monthly_ranking"),
        ranking_period: "2026-09-01",
        ranking_mode: "hyperbullet",
        ranking_position: 7,
      }),
    ).toBe("You finished September 2026 ranked #7 in Hyper.");
  });

  it("tells a registered user when they did not place", () => {
    expect(
      notificationCopy({
        ...makeNotification("monthly_ranking"),
        ranking_period: "2026-09-01",
        ranking_mode: "blitz",
        ranking_position: null,
      }),
    ).toBe("You did not place in the September 2026 Blitz rankings.");
  });

  it("uses only the trophy earned by the placement", () => {
    const rankingNotification = {
      ...makeNotification("monthly_ranking"),
      ranking_period: "2026-09-01",
      ranking_mode: "bullet" as const,
    };

    expect(rankingNotificationImage({ ...rankingNotification, ranking_position: 1 })).toBe(
      "/images/atomic-rank-trophies/top-1.png",
    );
    expect(rankingNotificationImage({ ...rankingNotification, ranking_position: 2 })).toBe(
      "/images/atomic-rank-trophies/top-2.png",
    );
    expect(rankingNotificationImage({ ...rankingNotification, ranking_position: 10 })).toBe(
      "/images/atomic-rank-trophies/top-10.png",
    );
    expect(rankingNotificationImage({ ...rankingNotification, ranking_position: 11 })).toBeNull();
  });
});
