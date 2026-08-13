import type { SupabaseClient } from "@supabase/supabase-js";

export class NotificationRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async countUnread(username: string): Promise<number> {
    const { count, error } = await this.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_username", username)
      .is("read_at", null);
    if (error) throw new Error(`Unable to count notifications: ${error.message}`);
    return count ?? 0;
  }

  async markRead(username: string, ids: number[]): Promise<void> {
    let query = this.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_username", username)
      .is("read_at", null);
    if (ids.length > 0) query = query.in("id", ids);
    const { error } = await query;
    if (error) throw new Error(`Unable to mark notifications read: ${error.message}`);
  }

  async delete(username: string, ids: number[]): Promise<void> {
    const { error } = await this.supabase
      .from("notifications")
      .delete()
      .eq("recipient_username", username)
      .in("id", ids);
    if (error) throw new Error(`Unable to delete notifications: ${error.message}`);
  }

  async list(username: string) {
    const { data, error } = await this.supabase
      .from("notifications")
      .select(
        "id, recipient_username, actor_username, notification_type, puzzle_id, comment_id, created_at, read_at",
      )
      .eq("recipient_username", username)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100);
    if (error) throw new Error(`Unable to load notifications: ${error.message}`);
    return data ?? [];
  }
}
