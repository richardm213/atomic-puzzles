import { postApi } from "../api/postApi";

export type NotificationType = "puzzle_comment" | "comment_reply" | "puzzle_approved";

export type UserNotification = {
  id: number;
  recipient_username: string;
  actor_username: string | null;
  notification_type: NotificationType;
  puzzle_id: number;
  comment_id: number | null;
  created_at: string;
  read_at: string | null;
};

export type NotificationResult = {
  notifications: UserNotification[];
  unreadCount: number;
};

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
