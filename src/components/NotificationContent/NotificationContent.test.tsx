import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import type { UserNotification } from "../../lib/community/notifications";
import { NotificationContent } from "./NotificationContent";

const notification: UserNotification = {
  id: 1,
  recipient_username: "seaside_tiramisu",
  actor_username: null,
  notification_type: "feature",
  puzzle_id: null,
  comment_id: null,
  rating: null,
  rating_deviation: null,
  feature_message: ":peepolove:",
  feature_path: "/@/seaside_tiramisu",
  created_at: "2026-11-20T00:00:00Z",
  read_at: null,
};

it("renders a feature notification as an emote alone beneath its category", () => {
  const { container } = render(<NotificationContent notification={notification} variant="nav" />);
  expect(screen.getByText(/New feature/)).toBeVisible();
  expect(screen.getByRole("img", { name: "peepolove" })).toHaveAttribute(
    "src",
    expect.stringContaining("/images/flairs/peepolove.webp"),
  );
  expect(container.querySelector("strong")?.textContent).toBe("");
});
