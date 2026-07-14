import { createClient } from "@supabase/supabase-js";

import { parseBearerToken, verifyLichessAccount } from "../lib/lichessAccount";

type NetlifyEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

type NotificationBody = {
  action?: unknown;
  ids?: unknown;
};

const jsonResponse = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const parseBody = (event: NetlifyEvent): NotificationBody | null => {
  try {
    const parsed = JSON.parse(event.body ?? "");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as NotificationBody)
      : null;
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

  const accessToken = parseBearerToken(event.headers);
  if (!accessToken) return jsonResponse(401, { error: "Log in to view notifications." });

  const input = parseBody(event);
  const action = input?.action;
  if (!input || !["list", "count", "markRead"].includes(String(action))) {
    return jsonResponse(400, { error: "Invalid notification request." });
  }

  try {
    const account = await verifyLichessAccount(accessToken);
    if (!account?.username) {
      return jsonResponse(401, { error: "Your Lichess login is no longer valid." });
    }
    const username = account.username.trim().toLowerCase();
    const supabase = getSupabase();

    if (action === "count") {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_username", username)
        .is("read_at", null);
      if (error) throw new Error(`Unable to count notifications: ${error.message}`);
      return jsonResponse(200, { unreadCount: count ?? 0 });
    }

    if (action === "markRead") {
      const ids = Array.isArray(input.ids)
        ? input.ids.filter((id): id is number => Number.isSafeInteger(id) && Number(id) > 0)
        : [];
      let query = supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_username", username)
        .is("read_at", null);
      if (ids.length > 0) query = query.in("id", ids);
      const { error } = await query;
      if (error) throw new Error(`Unable to mark notifications read: ${error.message}`);
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
    return jsonResponse(200, { notifications, unreadCount });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to load notifications.",
    });
  }
};
