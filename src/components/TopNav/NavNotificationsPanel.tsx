import { faBell, faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";

import type { UserNotification } from "../../lib/community/notifications";
import { NotificationContent } from "../NotificationContent/NotificationContent";

type NavNotificationsPanelProps = {
  notifications: UserNotification[];
  unreadCount: number;
  loading: boolean;
  updating: boolean;
  error: string;
  onMarkAllRead: () => void;
  onOpenNotification: (notification: UserNotification) => void;
  onClose: () => void;
};

export const NavNotificationsPanel = ({
  notifications,
  unreadCount,
  loading,
  updating,
  error,
  onMarkAllRead,
  onOpenNotification,
  onClose,
}: NavNotificationsPanelProps) => (
  <section
    className="navNotificationsPopup"
    role="dialog"
    aria-modal="false"
    aria-labelledby="nav-notifications-title"
  >
    <header className="navNotificationsHeader">
      <div>
        <span>Inbox</span>
        <h2 id="nav-notifications-title">Notifications</h2>
      </div>
      {unreadCount > 0 ? (
        <button type="button" disabled={updating} onClick={onMarkAllRead}>
          <FontAwesomeIcon icon={faCheck} />
          Mark all read
        </button>
      ) : null}
    </header>
    {loading ? <p className="navNotificationsStatus">Loading notifications…</p> : null}
    {error ? <p className="navNotificationsError">{error}</p> : null}
    {!loading && !error && notifications.length === 0 ? (
      <div className="navNotificationsEmpty">
        <FontAwesomeIcon icon={faBell} />
        <strong>You’re all caught up</strong>
      </div>
    ) : null}
    {notifications.length > 0 ? (
      <ol className="navNotificationList">
        {notifications.slice(0, 8).map((notification) => (
          <li key={notification.id}>
            <div className={`navNotificationRow ${notification.read_at ? "read" : "unread"}`}>
              <button
                type="button"
                className="navNotificationOpenButton"
                disabled={updating}
                onClick={() => onOpenNotification(notification)}
              >
                <NotificationContent notification={notification} variant="nav" />
              </button>
            </div>
          </li>
        ))}
      </ol>
    ) : null}
    <Link className="navNotificationsSeeAll" to="/notifications" onClick={onClose}>
      See all notifications
    </Link>
  </section>
);
