import { normalizeUsername } from "../../utils/playerNames";
import { getSupabaseClient } from "./client";
import type { SupabaseUser } from "./types";

export type { SupabaseUser } from "./types";

const USER_COLUMNS = "username, created_at";
const userLookupRequests = new Map<string, Promise<SupabaseUser | null>>();

const getUserByUsername = async (username: string): Promise<SupabaseUser | null> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select(USER_COLUMNS)
    .eq("username", username)
    .maybeSingle<SupabaseUser>();

  if (error) {
    throw new Error(`Unable to verify user record: ${error.message}`);
  }

  return data;
};

const fetchSupabaseUser = async (username: string): Promise<SupabaseUser | null> => {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return null;

  const inFlightRequest = userLookupRequests.get(normalizedUsername);
  if (inFlightRequest) {
    return inFlightRequest;
  }

  const request = getUserByUsername(normalizedUsername).finally(() => {
    if (userLookupRequests.get(normalizedUsername) === request) {
      userLookupRequests.delete(normalizedUsername);
    }
  });

  userLookupRequests.set(normalizedUsername, request);
  return request;
};

export const isRegisteredSiteUser = async (username: string): Promise<boolean> => {
  const user = await fetchSupabaseUser(username);
  return Boolean(user?.username);
};
