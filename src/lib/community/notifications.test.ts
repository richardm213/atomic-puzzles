import { describe, expect, it } from "vitest";

import { notificationCopy, type UserNotification } from "./notifications";

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
});
