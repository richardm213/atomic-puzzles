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
export type Legacy = {
  id: string;
  tournament_id: string;
  bracket_match_id: string | null;
  market_kind: string;
  status: string;
  winner: string | null;
  [key: string]: unknown;
};
export type Bet = {
  id: number;
  market_id: string;
  username: string;
  selection: string;
  status: string;
  total_cost: number;
  potential_payout: number;
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
  source_bet_id: number;
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
  legacyBetIds: number[];
  refunds: { username: string; amount: number }[];
};
export type LegacyResolution = {
  id: string;
  winner: string | null;
  method: "played" | "inverse" | "eliminate" | "eliminate-inverse" | "loss" | "refund" | "price";
  price?: number;
  yesPlayer?: string;
  selection?: string;
};
export type PreparedResolution = ResolutionPreview & {
  actor: string;
  input: MarketResolutionInput;
  eventId: string | null;
  expectedFixtures: Fixture[];
  fixtureChanges: FixtureChange[];
  expectedMarkets: Market[];
  expectedPositions: Position[];
  expectedBets: Bet[];
  expectedLegacy: Legacy[];
  expectedAwards: PointAward[];
  awards: PointAward[];
  settlements: Settlement[];
  legacyResolutions: LegacyResolution[];
  expectedPayments: { username: string; amount: number }[];
};
