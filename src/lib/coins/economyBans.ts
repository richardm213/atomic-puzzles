import { postApi } from "../api/postApi";

export type CoinEconomyBan = {
  id: number;
  username: string;
  starts_at: string;
  ends_at: string;
  reason: string;
  created_by: string;
  created_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
};

const banRequest = <T>(body: Record<string, unknown>): Promise<T> =>
  postApi("/api/coins", body, {
    errorMessage: "Unable to manage coin economy bans.",
    invalidMessage: "The coin service returned no data.",
  });

export const fetchCoinEconomyBans = (): Promise<{ bans: CoinEconomyBan[] }> =>
  banRequest({ action: "listBans" });

export const createCoinEconomyBan = (input: {
  username: string;
  endsAt: string;
  reason: string;
}): Promise<{ ban: CoinEconomyBan }> => banRequest({ action: "ban", ...input });

export const revokeCoinEconomyBan = (id: number): Promise<{ ban: CoinEconomyBan }> =>
  banRequest({ action: "revokeBan", id });
