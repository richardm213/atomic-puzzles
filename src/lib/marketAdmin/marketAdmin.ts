import type {
  AdminMarket,
  MarketResolutionInput,
  ResolutionPreview,
  ResolutionReceipt,
} from "../../../shared/domain/marketAdmin";
import { createPostApi } from "../api/postApi";

const request = createPostApi("/api/markets/admin", {
  errorMessage: "Unable to administer markets.",
  invalidMessage: "Invalid market administration response.",
});
export const fetchAdminMarkets = async () =>
  (await request<{ result: { markets: AdminMarket[] } }>({ action: "list" })).result;
export const previewMarketResolution = async (input: MarketResolutionInput, signal?: AbortSignal) =>
  (
    await request<{ result: ResolutionPreview }>(
      { action: "preview", input },
      { ...(signal ? { signal } : {}), timeoutMs: 30000 },
    )
  ).result;
export const resolveAdminMarket = async (input: MarketResolutionInput, version: string) =>
  (
    await request<{ result: ResolutionReceipt }>(
      { action: "resolve", input, version },
      { timeoutMs: 60000 },
    )
  ).result;
