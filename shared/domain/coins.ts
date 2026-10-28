export const SHOP_ITEM_KEYS = [
  "username_change",
  "atomicdb_analysis_12h",
  "discord_nitro_month",
  "discord_nitro_year",
  "flowers_500",
  "lichess_patron_month",
  "next_prize_tournament_format",
] as const;

export type ShopItemKey = (typeof SHOP_ITEM_KEYS)[number];

// The temporary closure expires automatically at midnight Pacific time on November 3, 2026.
export const SHOP_REOPENS_AT = "2026-11-03T08:00:00.000Z";

export const SHOP_REDEMPTION_STATUSES = ["pending", "fulfilled", "cancelled"] as const;
export type ShopRedemptionStatus = (typeof SHOP_REDEMPTION_STATUSES)[number];

export const SHOP_ITEM_COSTS = {
  username_change: 100,
  atomicdb_analysis_12h: 200,
  discord_nitro_month: 400,
  discord_nitro_year: 4_000,
  flowers_500: 500,
  lichess_patron_month: 600,
  next_prize_tournament_format: 1_000,
} as const satisfies Record<ShopItemKey, number>;

export const REDEEMABLE_SHOP_ITEM_KEYS = [
  "username_change",
  "discord_nitro_month",
  "discord_nitro_year",
  "flowers_500",
  "lichess_patron_month",
  "next_prize_tournament_format",
] as const satisfies readonly ShopItemKey[];

export const COIN_TRANSACTION_REASONS = [
  "coin_transfer",
  "puzzle_correct",
  "puzzle_attempted",
  "puzzle_created",
  "shop_redemption",
  "daily_bonus",
  "tournament_bet",
  "tournament_bet_payout",
  "tournament_bet_refund",
  "prediction_order_reserve",
  "prediction_order_refund",
  "prediction_trade_credit",
  "prediction_trade_fee",
  "prediction_market_payout",
  "prediction_liquidity_funding",
] as const;

export type CoinTransactionReason = (typeof COIN_TRANSACTION_REASONS)[number];
