import { describe, expect, it } from "vitest";

import {
  notificationCopy,
  notificationMessage,
  rankingNotificationImage,
  type UserNotification,
} from "./notifications";

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
  it("shows a reusable feature announcement without quoted detail text", () => {
    const notification = {
      ...makeNotification("feature"),
      feature_key: "tournament-history-launch",
      feature_message: "Check out the new tournament history page.",
      feature_path: "/tournaments/players/alice",
    };

    expect(notificationCopy(notification)).toBe("Check out the new tournament history page.");
  });

  it("shows a personalized puzzle rating announcement", () => {
    expect(
      notificationCopy({
        ...makeNotification("puzzle_rating_added"),
        rating: 2142,
        rating_deviation: 87,
      }),
    ).toBe("Puzzle ratings have been added to the site! Yours is 2142 with RD 87");
  });

  it("describes comments for prior discussion participants without implying a follow feature", () => {
    expect(notificationCopy(makeNotification("puzzle_comment"))).toBe(
      "bob commented on a puzzle you previously commented on.",
    );
  });

  it("distinguishes previous attempts from comments on a created puzzle", () => {
    expect(notificationCopy(makeNotification("puzzle_attempt_comment"))).toBe(
      "bob commented on a puzzle you previously attempted.",
    );
    expect(notificationCopy(makeNotification("puzzle_author_comment"))).toBe(
      "bob commented on your puzzle.",
    );
  });

  it("previews comment text only when the API marks it as visible", () => {
    const attemptedPuzzleNotification = {
      ...makeNotification("puzzle_attempt_comment"),
      comment_body: "That defensive move is easy to miss.",
    };

    expect(notificationCopy(attemptedPuzzleNotification)).toBe("bob commented:");
    expect(notificationMessage(attemptedPuzzleNotification)).toBe(
      "That defensive move is easy to miss.",
    );
    expect(notificationMessage(makeNotification("puzzle_author_comment"))).toBe("");
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
