import { HttpError } from "../../platform/errors";
import type { NotificationRepository } from "./repository";

export type NotificationAction = "list" | "count" | "markRead" | "delete";

export class NotificationService {
  constructor(private readonly repository: NotificationRepository) {}

  async execute(action: NotificationAction, username: string, ids: number[] = []) {
    if (action === "count") {
      return { unreadCount: await this.repository.countUnread(username) };
    }

    if (action === "markRead") await this.repository.markRead(username, ids);
    if (action === "delete") {
      if (ids.length === 0) {
        throw new HttpError(400, "Select at least one notification to delete.");
      }
      await this.repository.delete(username, ids);
    }

    const notifications = await this.repository.list(username);
    return {
      notifications,
      unreadCount: notifications.filter((notification) => !notification.read_at).length,
    };
  }
}
