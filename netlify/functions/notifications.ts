import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isSameOriginRequest, resolveSiteIdentity } from "../lib/siteSession";

type NetlifyEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

const jsonResponse = (
  statusCode: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...headers,
  },
  body: JSON.stringify(body),
});

const notificationBodySchema = z.object({
  action: z.enum(["list", "count", "markRead", "delete"]),
  ids: z.array(z.number().int().positive()).optional(),
});

const parseBody = (event: NetlifyEvent): z.infer<typeof notificationBodySchema> | null => {
  try {
    const result = notificationBodySchema.safeParse(JSON.parse(event.body ?? ""));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

const getSupabase = () => {
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Notification service is not configured.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
};

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const input = parseBody(event);
  const action = input?.action;
  if (!input) {
    return jsonResponse(400, { error: "Invalid notification request." });
  }
  if (["markRead", "delete"].includes(String(action)) && !isSameOriginRequest(event.headers)) {
    return jsonResponse(403, { error: "Cross-site notification requests are not allowed." });
  }

  try {
    const identity = await resolveSiteIdentity(event.headers);
    if (!identity.username) {
      return jsonResponse(401, { error: "Your Lichess login is no longer valid." });
    }
    const username = identity.username;
    const respond = (statusCode: number, body: Record<string, unknown>) =>
      jsonResponse(
        statusCode,
        body,
        identity.setCookie ? { "Set-Cookie": identity.setCookie } : {},
      );
    const supabase = getSupabase();

    if (action === "count") {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_username", username)
        .is("read_at", null);
      if (error) throw new Error(`Unable to count notifications: ${error.message}`);
      return respond(200, { unreadCount: count ?? 0 });
    }

    if (action === "markRead") {
      const ids = input.ids ?? [];
      let query = supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_username", username)
        .is("read_at", null);
      if (ids.length > 0) query = query.in("id", ids);
      const { error } = await query;
      if (error) throw new Error(`Unable to mark notifications read: ${error.message}`);
    }

    if (action === "delete") {
      const ids = input.ids ?? [];
      if (ids.length === 0) {
        return respond(400, { error: "Select at least one notification to delete." });
      }

      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("recipient_username", username)
        .in("id", ids);
      if (error) throw new Error(`Unable to delete notification: ${error.message}`);
    }

    const { data, error } = await supabase
      .from("notifications")
      .select(
        "id, recipient_username, actor_username, notification_type, puzzle_id, comment_id, created_at, read_at",
      )
      .eq("recipient_username", username)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100);
    if (error) throw new Error(`Unable to load notifications: ${error.message}`);

    const notifications = data ?? [];
    const unreadCount = notifications.filter((notification) => !notification.read_at).length;
    return respond(200, { notifications, unreadCount });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to load notifications.",
    });
  }
};
