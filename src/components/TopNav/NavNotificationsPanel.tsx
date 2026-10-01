import {
  faBell,
  faChartLine,
  faCheck,
  faCoins,
  faComment,
  faGift,
  faHandHoldingDollar,
  faReply,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";

import {
  notificationCopy,
  notificationMessage,
  rankingNotificationImage,
  type UserNotification,
} from "../../lib/community/notifications";
import { appAssetPath } from "../../utils/appAssetPath";
import { formatLocalDateTime } from "../../utils/formatters";

const notificationIcon = (notification: UserNotification) => {
  if (notification.notification_type === "coin_gift") return faCoins;
  if (notification.notification_type === "coin_request") return faHandHoldingDollar;
  if (notification.notification_type === "shop_redemption") return faGift;
  if (notification.notification_type === "puzzle_rating_added") return faChartLine;
  if (notification.notification_type === "puzzle_approved") return faCheck;
  if (notification.notification_type === "comment_reply") return faReply;
  return faComment;
};

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
                <span className="navNotificationIcon" aria-hidden="true">
                  {rankingNotificationImage(notification) ? (
                    <img src={appAssetPath(rankingNotificationImage(notification) ?? "")} alt="" />
                  ) : (
                    <FontAwesomeIcon icon={notificationIcon(notification)} />
                  )}
                </span>
                <span className="navNotificationCopy">
                  <strong>{notificationCopy(notification)}</strong>
                  {notificationMessage(notification) ? (
                    <span>“{notificationMessage(notification)}”</span>
                  ) : null}
                  <span>
                    {notification.notification_type === "coin_gift" ||
                    notification.notification_type === "coin_request"
                      ? `Coins · ${formatLocalDateTime(notification.created_at)}`
                      : notification.notification_type === "monthly_ranking"
                        ? `Monthly rankings · ${formatLocalDateTime(notification.created_at)}`
                        : notification.notification_type === "shop_redemption"
                          ? `Shop redemption · ${formatLocalDateTime(notification.created_at)}`
                          : notification.notification_type === "puzzle_rating_added"
                            ? `Puzzle rating · ${formatLocalDateTime(notification.created_at)}`
                            : `Puzzle #${notification.puzzle_id} · ${formatLocalDateTime(notification.created_at)}`}
                  </span>
                </span>
                {!notification.read_at ? <span className="navNotificationDot" /> : null}
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
