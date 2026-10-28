import { z } from "zod";

import {
  SHOP_ITEM_KEYS,
  SHOP_REDEMPTION_STATUSES,
  type ShopItemKey,
  type ShopRedemptionStatus,
} from "../../../shared/domain/coins";
import { postApi } from "../api/postApi";

export type { ShopRedemptionStatus } from "../../../shared/domain/coins";

export type ShopRedemption = {
  id: number;
  username: string;
  itemKey: ShopItemKey;
  cost: number;
  status: ShopRedemptionStatus;
  createdAt: string;
  fulfilledAt: string | null;
  fulfilledBy: string | null;
  requestDetails: Record<string, unknown>;
};

const itemKeySchema = z.enum(SHOP_ITEM_KEYS);

const redemptionRowSchema = z
  .object({
    id: z.number(),
    username: z.string(),
    item_key: itemKeySchema,
    cost: z.number(),
    status: z.enum(SHOP_REDEMPTION_STATUSES),
    created_at: z.string(),
    fulfilled_at: z.string().nullable(),
    fulfilled_by: z.string().nullable(),
    request_details: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .transform((row) => ({
    id: row.id,
    username: row.username,
    itemKey: row.item_key,
    cost: row.cost,
    status: row.status,
    createdAt: row.created_at,
    fulfilledAt: row.fulfilled_at,
    fulfilledBy: row.fulfilled_by,
    requestDetails: row.request_details,
  }));

const listSchema = z.object({ redemptions: z.array(redemptionRowSchema) });
const updateSchema = z.object({ redemption: redemptionRowSchema });

export const fetchShopRedemptions = async (): Promise<ShopRedemption[]> => {
  const response = await postApi(
    "/api/coins",
    { action: "listRedemptions" },
    {
      schema: listSchema,
      errorMessage: "Unable to load shop redemptions.",
      invalidMessage: "The redemption service returned invalid data.",
    },
  );
  return response.redemptions;
};

export const updateShopRedemption = async (
  id: number,
  status: Exclude<ShopRedemptionStatus, "pending">,
): Promise<ShopRedemption> => {
  const response = await postApi(
    "/api/coins",
    { action: "updateRedemption", id, status },
    {
      schema: updateSchema,
      errorMessage: "Unable to update this redemption.",
      invalidMessage: "The redemption service returned invalid data.",
    },
  );
  return response.redemption;
};
