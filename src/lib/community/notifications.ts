import { postApi } from "../api/postApi";

export type NotificationType =
  | "puzzle_comment"
  | "comment_reply"
  | "puzzle_approved"
  | "puzzle_rating_added"
  | "shop_redemption"
  | "coin_gift"
  | "coin_request"
  | "coin_policy_update"
  | "monthly_ranking"
  | "feature";

export type UserNotification = {
  id: number;
  recipient_username: string;
  actor_username: string | null;
  notification_type: NotificationType;
  puzzle_id: number | null;
  comment_id: number | null;
  rating: number | null;
  rating_deviation: number | null;
  shop_item_key?: string | null;
  redemption_id?: number | null;
  coin_amount?: number | null;
  coin_message?: string | null;
  coin_transfer_id?: number | null;
  coin_request_id?: number | null;
  ranking_period?: string | null;
  ranking_mode?: "blitz" | "bullet" | "hyperbullet" | null;
  ranking_position?: number | null;
  feature_key?: string | null;
  feature_message?: string | null;
  feature_path?: string | null;
  created_at: string;
  read_at: string | null;
};

export type NotificationResult = {
  notifications: UserNotification[];
  unreadCount: number;
};

export const isPredictionOrderFillNotification = (notification: UserNotification): boolean =>
  notification.notification_type === "feature" &&
  notification.feature_key?.startsWith("prediction-order-filled:") === true;

export const isPredictionPayoutNotification = (notification: UserNotification): boolean =>
  notification.notification_type === "feature" &&
  notification.feature_key?.startsWith("prediction-market-payout:") === true;

export const notificationCategory = (notification: UserNotification): string => {
  if (isPredictionOrderFillNotification(notification)) return "Prediction order";
  if (isPredictionPayoutNotification(notification)) return "Prediction payout";
  if (
    notification.notification_type === "coin_gift" ||
    notification.notification_type === "coin_request"
  ) {
    return "Coins";
  }
  if (notification.notification_type === "coin_policy_update") return "Coin rules";
  if (notification.notification_type === "monthly_ranking") return "Monthly rankings";
  if (notification.notification_type === "feature") return "New feature";
  if (notification.notification_type === "shop_redemption") return "Shop purchase";
  if (notification.notification_type === "puzzle_rating_added") return "Puzzle rating";
  if (notification.notification_type === "puzzle_approved") return "10 coins";
  return `Puzzle #${notification.puzzle_id}`;
};

export const notificationCopy = (notification: UserNotification): string => {
  if (notification.notification_type === "feature") {
    return notification.feature_message?.trim() || "Check out a new Atomic Puzzles feature.";
  }
  if (notification.notification_type === "coin_policy_update") {
    return (
      notification.coin_message?.trim() ??
      "Puzzle speed penalties are now active. See the Earn Coins page for details."
    );
  }
  if (notification.notification_type === "monthly_ranking") {
    const period = notification.ranking_period
      ? new Date(`${notification.ranking_period.slice(0, 10)}T00:00:00Z`).toLocaleString("en-US", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })
      : "Monthly";
    const modeLabels = {
      blitz: "Blitz",
      bullet: "Bullet",
      hyperbullet: "Hyper",
    } as const;
    const mode = notification.ranking_mode ? modeLabels[notification.ranking_mode] : "Atomic";
    return notification.ranking_position
      ? `You finished ${period} ranked #${notification.ranking_position} in ${mode}.`
      : `You did not place in the ${period} ${mode} rankings.`;
  }
  if (notification.notification_type === "coin_gift") {
    return `${notification.actor_username ?? "Someone"} gave you ${notification.coin_amount ?? 0} coins.`;
  }
  if (notification.notification_type === "coin_request") {
    return `${notification.actor_username ?? "Someone"} requested ${notification.coin_amount ?? 0} coins.`;
  }
  if (notification.notification_type === "shop_redemption") {
    if (notification.shop_item_key === "username_change") {
      return `${notification.actor_username ?? "Someone"} requested a username change.`;
    }
    if (notification.shop_item_key === "atomicdb_analysis_12h") {
      return `${notification.actor_username ?? "Someone"} requested a 12-hour AtomicDB opening analysis.`;
    }
    const itemNames: Record<string, string> = {
      discord_nitro_month: "1 month Discord Nitro",
      discord_nitro_year: "1 year Discord Nitro",
      flowers_500: "500 Flowers",
      lichess_patron_month: "1 month Lichess Patron",
      next_prize_tournament_format: "the next 100$+ prize tournament format choice",
    };
    return `${notification.actor_username ?? "Someone"} bought ${itemNames[notification.shop_item_key ?? ""] ?? "a shop item"}.`;
  }
  if (notification.notification_type === "puzzle_rating_added") {
    return `Puzzle ratings have been added to the site! Yours is ${notification.rating} with RD ${notification.rating_deviation}`;
  }
  if (notification.notification_type === "puzzle_approved") {
    return `Your puzzle #${notification.puzzle_id} was approved.`;
  }
  if (notification.notification_type === "comment_reply") {
    return `${notification.actor_username ?? "Someone"} replied to your comment.`;
  }
  return `${notification.actor_username ?? "Someone"} commented on a puzzle you follow.`;
};

export const notificationMessage = (notification: UserNotification): string =>
  notification.notification_type === "coin_policy_update" ||
  notification.notification_type === "feature"
    ? ""
    : (notification.coin_message?.trim() ?? "");

export const rankingNotificationImage = (notification: UserNotification): string | null =>
  notification.notification_type !== "monthly_ranking" || !notification.ranking_position
    ? null
    : notification.ranking_position === 1
      ? "/images/atomic-rank-trophies/top-1.png"
      : notification.ranking_position === 2
        ? "/images/atomic-rank-trophies/top-2.png"
        : notification.ranking_position <= 10
          ? "/images/atomic-rank-trophies/top-10.png"
          : null;

const notificationRequest = <T>(body: Record<string, unknown>): Promise<T> =>
  postApi("/api/notifications", body, {
    errorMessage: "Unable to load notifications.",
    invalidMessage: "The notification service returned no data.",
  });

export const fetchNotifications = (): Promise<NotificationResult> =>
  notificationRequest({ action: "list" });

export const fetchUnreadNotificationCount = async (): Promise<number> => {
  const result = await notificationRequest<{ unreadCount: number }>({
    action: "count",
  });
  return Number(result.unreadCount) || 0;
};

export const markNotificationsRead = (ids: number[] = []): Promise<NotificationResult> =>
  notificationRequest({ action: "markRead", ids });
