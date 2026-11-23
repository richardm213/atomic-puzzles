-- Install in Firefox on the current database before settling this strike as a push.
begin;

alter table public.prediction_markets drop constraint if exists prediction_markets_settlement_reference_check;
alter table public.prediction_markets add constraint prediction_markets_settlement_reference_check check (
  (settlement_price_cents is null) = (settlement_reference_fill_id is null)
  or (
    id = 'awc2026-lb-r3-m1-quasabianth-plus-2'
    and settlement_price_cents = 50
    and settlement_reference_fill_id is null
  )
);

create or replace function public.resolve_awc2026_rechesster_spread_push(
  p_match_id text, p_rechesster_score numeric, p_quasabianth_score numeric
) returns void language plpgsql security definer set search_path = '' as $$
declare
  strike_id constant text := 'awc2026-lb-r3-m1-quasabianth-plus-2';
  fixture public.tournament_matches%rowtype;
  market public.prediction_markets%rowtype;
  holding public.prediction_positions%rowtype;
begin
  if nullif(btrim(p_match_id), '') is null or p_rechesster_score is null or p_quasabianth_score is null
    or p_rechesster_score not in (5.5, 6) or p_rechesster_score - p_quasabianth_score <> 2 then
    raise exception 'Enter the verified archive match ID and two-point clinching score';
  end if;

  perform pg_advisory_xact_lock(hashtext('tournament-result:awc2026'));
  perform pg_advisory_xact_lock(hashtext('prediction-market:' || strike_id));
  select * into fixture from public.tournament_matches
  where tournament = 'awc2026' and id = 'lb-r3-m1' for share;
  if fixture.p1 is distinct from 'rechesster' or fixture.p2 is distinct from 'quasabianth'
    or fixture.played_on is null or fixture.match_id is distinct from p_match_id
    or coalesce(fixture.outcome_type, '') not in ('', 'played')
    or fixture.s1 <= fixture.s2 or fixture.s1 < p_rechesster_score or fixture.s2 < p_quasabianth_score then
    raise exception 'Published match result does not support this push';
  end if;

  select * into market from public.prediction_markets where id = strike_id for update;
  if market.outcome_yes_label is distinct from 'quasabianth +2'
    or market.outcome_no_label is distinct from 'rechesster -2'
    or market.resolution_rules not like '%50¢ per contract%' then
    raise exception 'Expected the Rechesster -2 / Quasabianth +2 push rules';
  end if;
  if market.status = 'resolved' and market.settlement_price_cents = 50
    and market.settlement_reference_fill_id is null then return; end if;
  if market.status not in ('open', 'closed') then
    raise exception 'Strike cannot be settled from status %', market.status;
  end if;

  perform public.cancel_prediction_market_orders(strike_id);
  for holding in select * from public.prediction_positions
    where market_id = strike_id and quantity > 0 order by username, outcome for update
  loop
    perform public.credit_prediction_market_payout(
      strike_id, holding.username, holding.outcome, holding.quantity * 0.5,
      'prediction-market-price-payout:' || strike_id || ':' || holding.username || ':' || holding.outcome,
      jsonb_build_object('marketId', strike_id, 'outcome', holding.outcome, 'contracts', holding.quantity,
        'settlementPriceCents', 50, 'settlementKind', 'push', 'matchId', p_match_id,
        'clinchingScore', jsonb_build_array(p_rechesster_score, p_quasabianth_score))
    );
  end loop;

  update public.prediction_markets set status = 'resolved', outcome = null,
    settlement_price_cents = 50, settlement_reference_fill_id = null,
    resolved_at = now(), updated_at = now() where id = strike_id;
end;
$$;

revoke all on function public.resolve_awc2026_rechesster_spread_push(text, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.resolve_awc2026_rechesster_spread_push(text, numeric, numeric)
  to service_role;

commit;
