-- Restore position dates after the one-time opposing-position normalization.
-- A position's meaningful update time is its latest trade or original converted bet,
-- not the timestamp of the maintenance migration that netted both sides.
begin;

with position_events as (
  select
    fill.market_id,
    fill.buyer_username as username,
    fill.created_at as occurred_at
  from public.prediction_fills fill
  where fill.buyer_username <> 'prediction_admin'

  union all

  select
    fill.market_id,
    fill.seller_username as username,
    fill.created_at as occurred_at
  from public.prediction_fills fill
  where fill.seller_username is not null
    and fill.seller_username <> 'prediction_admin'

  union all

  select
    credit.market_id,
    bet.username,
    bet.placed_at as occurred_at
  from public.prediction_legacy_position_credits credit
  join public.tournament_bets bet on bet.id = credit.source_bet_id
  where bet.username <> 'prediction_admin'
),
latest_position_events as (
  select market_id, username, max(occurred_at) as occurred_at
  from position_events
  group by market_id, username
)
update public.prediction_positions position
set updated_at = event.occurred_at
from latest_position_events event
where position.market_id = event.market_id
  and position.username = event.username
  and position.quantity > 0
  and position.username <> 'prediction_admin';

commit;
