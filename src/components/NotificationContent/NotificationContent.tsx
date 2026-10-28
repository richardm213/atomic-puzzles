import {
  faAt,
  faBullhorn,
  faChartLine,
  faCheck,
  faCoins,
  faComment,
  faGaugeHigh,
  faGift,
  faHandHoldingDollar,
  faReply,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  isCommentMentionNotification,
  isPredictionOrderFillNotification,
  isPredictionPayoutNotification,
  notificationCategory,
  notificationCopy,
  notificationMessage,
  rankingNotificationImage,
  type UserNotification,
} from "../../lib/community/notifications";
import { appAssetPath } from "../../utils/appAssetPath";
import { formatLocalDateTime } from "../../utils/formatters";

const notificationIcon = (notification: UserNotification) => {
  if (isCommentMentionNotification(notification)) return faAt;
  if (isPredictionOrderFillNotification(notification)) return faCheck;
  if (isPredictionPayoutNotification(notification)) return faCoins;
  if (notification.notification_type === "feature") return faBullhorn;
  if (notification.notification_type === "coin_policy_update") return faGaugeHigh;
  if (notification.notification_type === "coin_gift") return faCoins;
  if (notification.notification_type === "coin_request") return faHandHoldingDollar;
  if (notification.notification_type === "shop_redemption") return faGift;
  if (notification.notification_type === "puzzle_rating_added") return faChartLine;
  if (notification.notification_type === "puzzle_approved") return faCheck;
  if (notification.notification_type === "comment_reply") return faReply;
  return faComment;
};

const variantClasses = {
  page: {
    icon: "notificationItemIcon",
    copy: "notificationItemCopy",
    dot: "notificationUnreadDot",
  },
  nav: {
    icon: "navNotificationIcon",
    copy: "navNotificationCopy",
    dot: "navNotificationDot",
  },
} as const;

export const NotificationContent = ({
  notification,
  variant,
}: {
  notification: UserNotification;
  variant: keyof typeof variantClasses;
}) => {
  const classes = variantClasses[variant];
  const image = rankingNotificationImage(notification);
  const message = notificationMessage(notification);

  return (
    <>
      <span className={classes.icon} aria-hidden="true">
        {image ? (
          <img src={appAssetPath(image)} alt="" />
        ) : (
          <FontAwesomeIcon icon={notificationIcon(notification)} />
        )}
      </span>
      <span className={classes.copy}>
        <strong>{notificationCopy(notification)}</strong>
        {message ? <span>“{message}”</span> : null}
        <span>
          {notificationCategory(notification)} ·&nbsp;
          <time dateTime={notification.created_at}>
            {formatLocalDateTime(notification.created_at)}
          </time>
        </span>
      </span>
      {!notification.read_at ? <span className={classes.dot} /> : null}
    </>
  );
};
