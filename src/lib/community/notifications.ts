import { postApi } from "../api/postApi";

export type NotificationType =
  | "puzzle_comment"
  | "comment_reply"
  | "puzzle_approved"
  | "puzzle_rating_added"
  | "shop_redemption"
  | "coin_gift"
  | "coin_request";

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
  created_at: string;
  read_at: string | null;
};

export type NotificationResult = {
  notifications: UserNotification[];
  unreadCount: number;
};

export const notificationCopy = (notification: UserNotification): string => {
  if (notification.notification_type === "coin_gift") {
    return `${notification.actor_username ?? "Someone"} gave you ${notification.coin_amount ?? 0} coins.`;
  }
  if (notification.notification_type === "coin_request") {
    return `${notification.actor_username ?? "Someone"} requested ${notification.coin_amount ?? 0} coins.`;
  }
  if (notification.notification_type === "shop_redemption") {
    const itemNames: Record<string, string> = {
      discord_nitro_month: "1 month Discord Nitro",
      discord_nitro_year: "1 year Discord Nitro",
      flowers_500: "500 Flowers",
      lichess_patron_month: "1 month Lichess Patron",
      next_prize_tournament_format: "the next 100$+ prize tournament format choice",
      atomicdb_analysis_12h: "a 12-hour AtomicDB opening analysis",
    };
    return `${notification.actor_username ?? "Someone"} redeemed ${itemNames[notification.shop_item_key ?? ""] ?? "a shop item"}.`;
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
  notification.coin_message?.trim() ?? "";

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
