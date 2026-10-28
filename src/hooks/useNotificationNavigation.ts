import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { safeNotificationPath, type UserNotification } from "../lib/community/notifications";

export const useNotificationNavigation = () => {
  const navigate = useNavigate();

  return useCallback(
    (notification: UserNotification): void => {
      if (
        (notification.notification_type === "feature" ||
          notification.notification_type === "comment_mention") &&
        notification.feature_path
      ) {
        const path = safeNotificationPath(notification.feature_path);
        if (path) window.location.assign(path);
        return;
      }
      if (
        (notification.notification_type === "coin_gift" ||
          notification.notification_type === "coin_request") &&
        notification.actor_username
      ) {
        void navigate({
          to: "/@/$username",
          params: { username: notification.actor_username },
        });
        return;
      }
      if (notification.notification_type === "shop_redemption") {
        void navigate({ to: "/shop" });
        return;
      }
      if (notification.notification_type === "coin_policy_update") {
        void navigate({ to: "/shop/how-coins-work" });
        return;
      }
      if (notification.notification_type === "puzzle_rating_added") {
        void navigate({ to: "/dashboard" });
        return;
      }
      if (notification.notification_type === "monthly_ranking") {
        const rankingDate = new Date(
          `${notification.ranking_period?.slice(0, 10) ?? ""}T00:00:00Z`,
        );
        void navigate({
          to: "/rankings",
          search: {
            year: Number.isNaN(rankingDate.getTime()) ? "" : String(rankingDate.getUTCFullYear()),
            month: Number.isNaN(rankingDate.getTime())
              ? ""
              : rankingDate.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
            mode: notification.ranking_mode ?? "blitz",
          },
        });
        return;
      }
      void navigate({
        to: "/solve/$puzzleId",
        params: { puzzleId: String(notification.puzzle_id ?? "") },
        ...(notification.comment_id ? { hash: `comment-${notification.comment_id}` } : {}),
      });
    },
    [navigate],
  );
};
