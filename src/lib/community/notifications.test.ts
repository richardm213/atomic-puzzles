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
  created_at: "2026-09-21T00:00:00.000Z",
  read_at: null,
});

describe("notificationCopy", () => {
  it("describes puzzle comments in a way that applies to authors and prior commenters", () => {
    expect(notificationCopy(makeNotification("puzzle_comment"))).toBe(
      "bob commented on a puzzle you follow.",
    );
  });
});
