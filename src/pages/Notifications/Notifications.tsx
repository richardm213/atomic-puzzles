import "./Notifications.css";

import { faBell, faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { NotificationContent } from "../../components/NotificationContent/NotificationContent";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { useNotificationInbox } from "../../hooks/useNotificationInbox";

export const NotificationsPage = () => {
  const { isAuthenticated, isLoading, login, user } = useAuth();
  const { notifications, loading, marking, error, markRead, openNotification } =
    useNotificationInbox({ isAuthenticated, username: user?.username });
  const hasUnreadNotifications = notifications.some((notification) => !notification.read_at);

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
          {hasUnreadNotifications ? (
            <button type="button" disabled={marking} onClick={() => void markRead()}>
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
