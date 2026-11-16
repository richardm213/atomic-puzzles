import type { PointAward } from "../../../shared/domain/atomicTourAwards";
import type {
  Fixture,
  FixtureChange,
  MarketResolutionInput,
  ResolutionPreview,
} from "../../../shared/domain/marketAdmin";

export type Market = {
  id: string;
  question: string;
  display_name: string | null;
  status: string;
  group_id: string | null;
  group_title: string | null;
  group_order: number | null;
  display_order: number | null;
  group_path: string | null;
  outcome_yes_label: string | null;
  outcome_no_label: string | null;
  outcome: string | null;
  settlement_price_cents: number | null;
  [key: string]: unknown;
};
export type Position = {
  market_id: string;
  username: string;
  outcome: "yes" | "no";
  quantity: number;
  reserved_quantity: number;
  [key: string]: unknown;
};
export type Credit = {
  id: number;
  fee_coins: number;
  market_id: string;
  username: string;
  outcome: string;
  quantity: number;
  price_cents: number;
  [key: string]: unknown;
};
export type Fill = {
  id: number;
  market_id: string;
  buyer_username: string;
  seller_username: string | null;
  outcome: "yes" | "no";
  price_cents: number;
  quantity: number;
  created_at: string;
  [key: string]: unknown;
};
export type Ledger = {
  username: string;
  amount: number;
  reason: string;
  source_key: string;
  metadata: Record<string, unknown> | null;
  [key: string]: unknown;
};
export type Settlement = {
  id: string;
  method: "binary" | "price" | "refund";
  outcome: "yes" | "no" | null;
  price: number;
  referenceFillId: number | null;
  message: string;
  refunds: { username: string; amount: number }[];
};
export type PreparedResolution = ResolutionPreview & {
  actor: string;
  input: MarketResolutionInput;
  eventId: string | null;
  expectedFixtures: Fixture[];
  fixtureChanges: FixtureChange[];
  expectedMarkets: Market[];
  expectedPositions: Position[];
  expectedAwards: PointAward[];
  awards: PointAward[];
  settlements: Settlement[];
  expectedPayments: { username: string; amount: number }[];
};
