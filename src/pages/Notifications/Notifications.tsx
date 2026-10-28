import "./Notifications.css";

import { faBell, faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { NotificationContent } from "../../components/NotificationContent/NotificationContent";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { useNotificationNavigation } from "../../hooks/useNotificationNavigation";
import {
  notificationQueryKeys,
  notificationsQueryOptions,
} from "../../lib/community/notificationQueries";
import { markNotificationsRead, type UserNotification } from "../../lib/community/notifications";
import { getErrorMessage } from "../../utils/errors";

export const NotificationsPage = () => {
  const navigateToNotification = useNotificationNavigation();
  const { isAuthenticated, isLoading, login, user } = useAuth();
  const queryClient = useQueryClient();
  const viewerKey = isAuthenticated ? (user?.username ?? "authenticated") : "anonymous";
  const notificationsQuery = useQuery({
    ...notificationsQueryOptions(viewerKey),
    enabled: isAuthenticated,
  });
  const markReadMutation = useMutation({
    mutationFn: markNotificationsRead,
    onSuccess: (result) => {
      queryClient.setQueryData(notificationQueryKeys.list(viewerKey), result);
      queryClient.setQueryData(notificationQueryKeys.unreadCount(viewerKey), result.unreadCount);
    },
  });
  const notifications = notificationsQuery.data?.notifications ?? [];
  const loading = notificationsQuery.isFetching;
  const marking = markReadMutation.isPending;
  const errorValue = notificationsQuery.error ?? markReadMutation.error;
  const error = errorValue ? getErrorMessage(errorValue, "Unable to update notifications.") : "";

  const unreadNotifications = notifications.filter((notification) => !notification.read_at);

  const markRead = async (ids: number[]) => {
    if (!isAuthenticated || marking) return;
    try {
      await markReadMutation.mutateAsync(ids);
    } catch {
      // The mutation error is rendered inline.
    }
  };

  const openNotification = async (notification: UserNotification) => {
    if (!notification.read_at) await markRead([notification.id]);
    navigateToNotification(notification);
  };

  if (isLoading || (isAuthenticated && loading && notifications.length === 0)) {
    return <RouteLoadingFallback />;
  }

  return (
    <div className="page notificationsPage">
      <Seo
        title="Notifications"
        description="Your Atomic Puzzles comments, replies, and puzzle approval notifications."
        path="/notifications"
      />
      <section className="panel notificationsPanel">
        <header className="notificationsHeader">
          <div>
            <span>Inbox</span>
            <h1>Community Notifications</h1>
          </div>
          {unreadNotifications.length > 0 ? (
            <button type="button" disabled={marking} onClick={() => void markRead([])}>
              <FontAwesomeIcon icon={faCheck} />
              Mark all read
            </button>
          ) : null}
        </header>

        {!isAuthenticated && !isLoading ? (
          <div className="notificationsSignIn">
            <FontAwesomeIcon icon={faBell} />
            <h2>Log in to see your notifications</h2>
            <p>Replies, comments on your puzzles, and approvals will appear here.</p>
            <button type="button" onClick={() => void login("/notifications")}>
              Log in with Lichess
            </button>
          </div>
        ) : null}

        {error ? <p className="notificationsError">{error}</p> : null}
        {!loading && isAuthenticated && notifications.length === 0 ? (
          <div className="notificationsEmpty">
            <FontAwesomeIcon icon={faBell} />
            <h2>You’re all caught up</h2>
            <p>New puzzle activity will appear here.</p>
          </div>
        ) : null}

        {notifications.length > 0 ? (
          <ol className="notificationList">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <div className={`notificationItem ${notification.read_at ? "read" : "unread"}`}>
                  <button
                    className="notificationOpenButton"
                    type="button"
                    onClick={() => void openNotification(notification)}
                  >
                    <NotificationContent notification={notification} variant="page" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
    </div>
  );
};
