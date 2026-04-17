import { getSupabaseClient } from "./supabaseClient";
import { normalizeUsername } from "../utils/playerNames";

const USERS_TABLE = import.meta.env.VITE_SUPABASE_USERS_TABLE?.trim() || "users";
const USER_COLUMNS = "username, created_at";
const USER_CONFLICT_COLUMNS = "username";
const userEnsureRequests = new Map();
const userLookupRequests = new Map();

const getUserByUsername = async (username) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(USERS_TABLE)
    .select(USER_COLUMNS)
    .eq("username", username)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to verify user record: ${error.message}`);
  }

  return data;
};

export const fetchSupabaseUser = async (username) => {
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

export const isRegisteredSiteUser = async (username) => {
  const user = await fetchSupabaseUser(username);
  return Boolean(user?.username);
};

const ensureSupabaseUserRecord = async (normalizedUsername) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(USERS_TABLE)
    .upsert({ username: normalizedUsername }, { onConflict: USER_CONFLICT_COLUMNS, ignoreDuplicates: true })
    .select(USER_COLUMNS)
    .maybeSingle();

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

export const ensureSupabaseUser = async (username) => {
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
