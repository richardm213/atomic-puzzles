import { queryOptions } from "@tanstack/react-query";

import { fetchNotifications, fetchUnreadNotificationCount } from "./notifications";

const NOTIFICATIONS_STALE_TIME_MS = 30_000;

export const notificationQueryKeys = {
  all: ["notifications"] as const,
  list: (viewerKey: string) => ["notifications", viewerKey, "list"] as const,
  unreadCount: (viewerKey: string) => ["notifications", viewerKey, "unread-count"] as const,
};

export const notificationsQueryOptions = (viewerKey: string) =>
  queryOptions({
    queryKey: notificationQueryKeys.list(viewerKey),
    queryFn: fetchNotifications,
    staleTime: NOTIFICATIONS_STALE_TIME_MS,
  });

export const unreadNotificationCountQueryOptions = (viewerKey: string) =>
  queryOptions({
    queryKey: notificationQueryKeys.unreadCount(viewerKey),
    queryFn: fetchUnreadNotificationCount,
    refetchInterval: 60_000,
    staleTime: NOTIFICATIONS_STALE_TIME_MS,
  });
