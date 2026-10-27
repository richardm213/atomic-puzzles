-- Convert open legacy sportsbook bets into tradable prediction-market positions.
-- Each tournament bet can be credited only once, so this script is safe to rerun.
begin;

-- Sportsbook payouts can be fractional even though exchange orders are whole-contract.
alter table public.prediction_positions
  alter column quantity type numeric(18, 6) using quantity::numeric,
  alter column reserved_quantity type numeric(18, 6) using reserved_quantity::numeric;

create table if not exists public.prediction_legacy_position_credits (
  source_bet_id bigint primary key references public.tournament_bets(id),
  market_id text not null references public.prediction_markets(id),
  username text not null,
  outcome text not null check (outcome in ('yes', 'no')),
  quantity numeric(18, 6) not null check (quantity > 0),
  price_cents integer not null check (price_cents between 1 and 99),
  credited_at timestamptz not null default now()
);

create index if not exists prediction_legacy_position_credits_user_idx
  on public.prediction_legacy_position_credits (username, market_id, outcome);

revoke all on table public.prediction_legacy_position_credits from public, anon, authenticated;
alter table public.prediction_legacy_position_credits enable row level security;

with eligible as (
  select
    bet.id as source_bet_id,
    market.id as market_id,
    lower(btrim(bet.username)) as username,
    case when bet.market_id = 'awc2026-winner-no' then 'no' else 'yes' end as outcome,
    bet.potential_payout::numeric(18, 6) as quantity,
    bet.price_cents
  from public.tournament_bets bet
  join public.prediction_markets market on (
    (
      bet.market_id in ('awc2026-winner', 'awc2026-winner-no')
      and market.group_id = 'awc-2026-champion'
      and lower(btrim(market.display_name)) = lower(btrim(bet.selection))
    )
    or
    (
      bet.market_id like 'lichess-ban-2026-%'
      and market.group_id = 'ban-2026'
      and lower(btrim(market.display_name)) = lower(btrim(bet.selection))
    )
  )
  where bet.status = 'open'
    and bet.potential_payout > 0
), credited as (
  insert into public.prediction_legacy_position_credits (
    source_bet_id,
    market_id,
    username,
    outcome,
    quantity,
    price_cents
  )
  select source_bet_id, market_id, username, outcome, quantity, price_cents
  from eligible
  on conflict (source_bet_id) do nothing
  returning market_id, username, outcome, quantity
)
insert into public.prediction_positions (market_id, username, outcome, quantity)
select market_id, username, outcome, sum(quantity)
from credited
group by market_id, username, outcome
on conflict (market_id, username, outcome) do update
set quantity = public.prediction_positions.quantity + excluded.quantity,
    updated_at = now();

commit;
