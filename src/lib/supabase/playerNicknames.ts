import { getSupabaseClient } from "./client";
import { loadSupabaseRows } from "./rows";

export type PlayerNicknameRow = {
  username: string;
  nickname: string;
  is_primary: boolean;
};

export const fetchPrimaryPlayerNicknames = async (): Promise<PlayerNicknameRow[]> => {
  const supabase = getSupabaseClient();
  return loadSupabaseRows<PlayerNicknameRow>(
    "player_nicknames",
    supabase
      .from("player_nicknames")
      .select("username,nickname,is_primary")
      .eq("is_primary", true)
      .order("username"),
  );
};
