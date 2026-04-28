import { getSupabaseClient } from "./supabaseClient";
import { normalizeUsername } from "../../utils/playerNames";
import type { SupabaseUser } from "../../types/supabase";

export type { SupabaseUser } from "../../types/supabase";

const USER_COLUMNS = "username, created_at";
const USER_CONFLICT_COLUMNS = "username";
const userEnsureRequests = new Map<string, Promise<{ user: SupabaseUser; created: boolean }>>();
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

const ensureSupabaseUserRecord = async (
  normalizedUsername: string,
): Promise<{ user: SupabaseUser; created: boolean }> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .upsert(
      { username: normalizedUsername },
      { onConflict: USER_CONFLICT_COLUMNS, ignoreDuplicates: true },
    )
    .select(USER_COLUMNS)
    .maybeSingle<SupabaseUser>();

  if (error) {
    throw new Error(`Unable to save user record: ${error.message}`);
  }

  if (data) {
    return { user: data, created: true };
  }

  const existingUser = await getUserByUsername(normalizedUsername);
  if (existingUser) {
    return { user: existingUser, created: false };
  }

  throw new Error("Unable to save user record: user was not returned after upsert.");
};

export const ensureSupabaseUser = async (
  username: string,
): Promise<{ user: SupabaseUser; created: boolean }> => {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    throw new Error("Missing Lichess username.");
  }

  const inFlightRequest = userEnsureRequests.get(normalizedUsername);
  if (inFlightRequest) {
    return inFlightRequest;
  }

  const request = ensureSupabaseUserRecord(normalizedUsername).finally(() => {
    if (userEnsureRequests.get(normalizedUsername) === request) {
      userEnsureRequests.delete(normalizedUsername);
    }
  });

  userEnsureRequests.set(normalizedUsername, request);
  return request;
};
