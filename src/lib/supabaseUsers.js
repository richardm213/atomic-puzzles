import { getSupabaseClient } from "./supabaseClient";
import { normalizeUsername } from "../utils/playerNames";

const USERS_TABLE = import.meta.env.VITE_SUPABASE_USERS_TABLE?.trim() || "users";
const USER_COLUMNS = "username, created_at";

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

export const ensureSupabaseUser = async (username) => {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    throw new Error("Missing Lichess username.");
  }

  const existingUser = await getUserByUsername(normalizedUsername);
  if (existingUser) {
    return { user: existingUser, created: false };
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(USERS_TABLE)
    .insert({ username: normalizedUsername })
    .select(USER_COLUMNS)
    .single();

  if (!error && data) {
    return { user: data, created: true };
  }

  // Another login could have created the row between our read and insert.
  const racedUser = await getUserByUsername(normalizedUsername);
  if (racedUser) {
    return { user: racedUser, created: false };
  }

  throw new Error(`Unable to save user record: ${error?.message || "unknown error"}`);
};
