import { appAssetPath } from "../../utils/appAssetPath";

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

type NotificationResult = {
  notifications: UserNotification[];
  unreadCount: number;
};

const notificationRequest = async <T>(
  accessToken: string,
  body: Record<string, unknown>,
): Promise<T> => {
  if (!accessToken) throw new Error("Log in to view notifications.");
  const response = await fetch(appAssetPath("/api/notifications"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(result?.error || "Unable to load notifications.");
  if (!result) throw new Error("The notification service returned no data.");
  return result;
};

export const fetchNotifications = (accessToken: string): Promise<NotificationResult> =>
  notificationRequest(accessToken, { action: "list" });

export const fetchUnreadNotificationCount = async (accessToken: string): Promise<number> => {
  const result = await notificationRequest<{ unreadCount: number }>(accessToken, {
    action: "count",
  });
  return Number(result.unreadCount) || 0;
};

export const markNotificationsRead = (
  accessToken: string,
  ids: number[] = [],
): Promise<NotificationResult> => notificationRequest(accessToken, { action: "markRead", ids });
