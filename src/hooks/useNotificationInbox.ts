import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  notificationQueryKeys,
  notificationsQueryOptions,
  unreadNotificationCountQueryOptions,
} from "../lib/community/notificationQueries";
import { markNotificationsRead, type UserNotification } from "../lib/community/notifications";
import { getErrorMessage } from "../utils/errors";
import { useNotificationNavigation } from "./useNotificationNavigation";

export const useNotificationInbox = ({
  isAuthenticated,
  username,
  listOpen = true,
  pollUnread = false,
}: {
  isAuthenticated: boolean;
  username: string | undefined;
  listOpen?: boolean;
  pollUnread?: boolean;
}) => {
  const queryClient = useQueryClient();
  const navigateToNotification = useNotificationNavigation();
  const viewerKey = isAuthenticated ? (username ?? "authenticated") : "anonymous";
  const list = useQuery({
    ...notificationsQueryOptions(viewerKey),
    enabled: isAuthenticated && listOpen,
  });
  const unread = useQuery({
    ...unreadNotificationCountQueryOptions(viewerKey),
    enabled: isAuthenticated && pollUnread,
  });
  const markReadMutation = useMutation({
    mutationFn: markNotificationsRead,
    onSuccess: (result) => {
      queryClient.setQueryData(notificationQueryKeys.list(viewerKey), result);
      queryClient.setQueryData(notificationQueryKeys.unreadCount(viewerKey), result.unreadCount);
    },
  });

  const markRead = async (ids: number[] = []): Promise<void> => {
    if (!isAuthenticated || markReadMutation.isPending) return;
    try {
      await markReadMutation.mutateAsync(ids);
    } catch {
      // The caller renders the mutation error from this hook.
    }
  };

  const openNotification = async (
    notification: UserNotification,
    beforeNavigate?: () => void,
  ): Promise<void> => {
    if (!notification.read_at) await markRead([notification.id]);
    beforeNavigate?.();
    navigateToNotification(notification);
  };

  const error = list.error ?? markReadMutation.error;
  return {
    notifications: list.data?.notifications ?? [],
    unreadCount: unread.data ?? list.data?.unreadCount ?? 0,
    loading: list.isFetching,
    marking: markReadMutation.isPending,
    error: error ? getErrorMessage(error, "Unable to update notifications.") : "",
    markRead,
    openNotification,
  };
};
