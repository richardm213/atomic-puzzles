-- One current position, one settlement entitlement, and auditable corrections.
begin;
alter table public.coin_accounts drop constraint if exists coin_accounts_balance_check;
do $$
declare definition text;
begin
 select pg_get_constraintdef(oid) into definition from pg_constraint
 where conrelid='public.coin_transactions'::regclass and conname='coin_transactions_reason_check';
 if definition not like '%prediction_reconciliation%' then
  execute 'alter table public.coin_transactions drop constraint coin_transactions_reason_check';
  execute 'alter table public.coin_transactions add constraint coin_transactions_reason_check check ('||substr(definition,8,length(definition)-8)||' or reason = ''prediction_reconciliation'')';
 end if;
end;
$$;
CREATE OR REPLACE FUNCTION public.post_coin_transaction_internal(p_username text, p_amount numeric, p_reason text, p_source_key text, p_metadata jsonb, p_created_at timestamp with time zone, p_cap_debit boolean, p_allow_negative boolean)
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  account_username text := lower(btrim(coalesce(p_username, '')));
  source text := btrim(p_source_key);
  requested_amount numeric(18, 6) := round(coalesce(p_amount, 0), 6);
  applied_amount numeric(18, 6) := requested_amount;
  wallet numeric(18, 6);
  entry_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if account_username = '' or requested_amount = 0 or nullif(source, '') is null then
    raise exception 'Invalid coin transaction';
  end if;

  insert into public.coin_accounts (username) values (account_username)
  on conflict (username) do nothing;
  select balance into strict wallet
  from public.coin_accounts where username = account_username for update;

  if p_cap_debit and requested_amount < 0 then
    applied_amount := greatest(requested_amount, -greatest(wallet, 0));
    if applied_amount = 0 then return 0; end if;
    entry_metadata := entry_metadata ||
      jsonb_build_object('balanceCapped', applied_amount <> requested_amount);
    -- Preserve the actual penalty in the audit metadata when the caller supplies it.
    if entry_metadata ? 'penalty' then
      entry_metadata := jsonb_set(entry_metadata, '{penalty}', to_jsonb(-applied_amount));
    end if;
  end if;

  insert into public.coin_transactions (username, amount, reason, source_key, metadata, created_at)
  values (account_username, applied_amount, p_reason, source, entry_metadata, p_created_at)
  on conflict (source_key) do nothing;
  if not found then return 0; end if;

  if applied_amount < 0 and wallet + applied_amount < 0 and not p_allow_negative then
    raise exception 'Not enough coins';
  end if;
  update public.coin_accounts
  set balance = balance + applied_amount, updated_at = now()
  where username = account_username;
  return applied_amount;
end;
$function$
;

create or replace function public.post_coin_transaction(
 p_username text,p_amount numeric,p_reason text,p_source_key text,p_metadata jsonb,
 p_created_at timestamptz,p_cap_debit boolean default false
) returns numeric language sql set search_path='' as $$
 select public.post_coin_transaction_internal(p_username,p_amount,p_reason,p_source_key,p_metadata,p_created_at,p_cap_debit,false);
$$;

-- Exchange fills still use the balance-returning API. Share the ledger writer so
-- sale proceeds can repay part of a negative wallet and ordinary debits still require funds.
create or replace function public.apply_coin_transaction(
  p_username text,
  p_amount numeric,
  p_reason text,
  p_source_key text,
  p_metadata jsonb default '{}'::jsonb,
  p_created_at timestamptz default now()
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  wallet numeric;
begin
  perform public.post_coin_transaction(
    p_username, p_amount, p_reason, p_source_key, p_metadata, p_created_at
  );
  select balance into strict wallet from public.coin_accounts
  where username = lower(btrim(p_username));
  return wallet;
end;
$$;

create or replace function public.post_prediction_reconciliation(
 p_username text,p_amount numeric,p_source_key text,p_metadata jsonb
) returns numeric language plpgsql security definer set search_path='' as $$
begin
 if p_source_key not like 'prediction-history-reconcile:v1:%'
  or p_metadata->>'auditVersion' is distinct from 'prediction-accounting-v1'
  or nullif(p_metadata->>'marketId','') is null
  or not (p_metadata ?& array['expectedCash','previousCash'])
  or (p_metadata->>'expectedCash')::numeric-(p_metadata->>'previousCash')::numeric <> p_amount
 then raise exception 'Invalid prediction reconciliation'; end if;
 return public.post_coin_transaction_internal(p_username,p_amount,'prediction_reconciliation',p_source_key,p_metadata,now(),false,true);
end;
$$;
revoke all on function public.post_coin_transaction_internal(text,numeric,text,text,jsonb,timestamptz,boolean,boolean),public.post_prediction_reconciliation(text,numeric,text,jsonb) from public,anon,authenticated;
grant execute on function public.post_coin_transaction_internal(text,numeric,text,text,jsonb,timestamptz,boolean,boolean),public.post_prediction_reconciliation(text,numeric,text,jsonb) to service_role;

-- Legacy bets already represented by contracts have only one payout authority.
create or replace function public.credit_prediction_market_payout(
 p_market_id text,p_username text,p_outcome text,p_amount numeric,p_source_key text,p_metadata jsonb
) returns numeric language plpgsql security definer set search_path='' as $$
declare legacy_paid numeric(18,6); due numeric(18,6);
begin
 select coalesce(sum(t.amount),0) into legacy_paid
 from public.prediction_legacy_position_credits c join public.coin_transactions t
 on t.reason='tournament_bet_payout' and t.username=c.username and (
  t.metadata->>'betId'=c.source_bet_id::text or t.source_key='tournament-bet-payout:'||c.source_bet_id
  or t.metadata->>'reverses'='tournament-bet-payout:'||c.source_bet_id)
 where c.market_id=p_market_id and c.username=p_username and c.outcome=p_outcome;
 due:=greatest(0,round(p_amount-legacy_paid,6));
 if due=0 then return 0; end if;
 return public.post_coin_transaction(p_username,due,'prediction_market_payout',p_source_key,
  p_metadata||jsonb_build_object('legacyAlreadyPaid',legacy_paid),now());
end;
$$;
revoke all on function public.credit_prediction_market_payout(text,text,text,numeric,text,jsonb) from public,anon,authenticated;
grant execute on function public.credit_prediction_market_payout(text,text,text,numeric,text,jsonb) to service_role;
create or replace function public.net_prediction_position()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  opposite_outcome text := case when new.outcome = 'yes' then 'no' else 'yes' end;
  opposite_quantity numeric(18, 6);
  net_quantity numeric(18, 6);
  netting_id bigint;
begin
  if new.quantity <= 0 or new.username = 'prediction_admin'
    or (tg_op = 'UPDATE' and new.quantity <= old.quantity) then
    return null;
  end if;

  if exists(select 1 from public.prediction_markets where id=new.market_id and status='resolved') then
    raise exception 'Cannot add contracts to a resolved market';
  end if;

  select quantity into opposite_quantity
  from public.prediction_positions
  where market_id = new.market_id
    and username = new.username
    and outcome = opposite_outcome
  for update;

  if coalesce(opposite_quantity, 0) <= 0 then return null; end if;

  -- Opposing exposure supersedes resting sell orders on the position being closed.
  update public.prediction_orders
  set remaining_quantity = 0,
      status = 'cancelled',
      updated_at = now()
  where market_id = new.market_id
    and username = new.username
    and outcome in (new.outcome, opposite_outcome)
    and side = 'sell'
    and status in ('open', 'partial')
    and remaining_quantity > 0;

  update public.prediction_positions
  set reserved_quantity = 0,
      updated_at = now()
  where market_id = new.market_id
    and username = new.username
    and outcome in (new.outcome, opposite_outcome);

  net_quantity := least(new.quantity, opposite_quantity);

  insert into public.prediction_position_nettings (market_id, username, quantity)
  values (new.market_id, new.username, net_quantity)
  returning id into netting_id;

  update public.prediction_positions
  set quantity = quantity - net_quantity,
      updated_at = now()
  where market_id = new.market_id
    and username = new.username
    and outcome in (new.outcome, opposite_outcome);

  perform public.apply_coin_transaction(
    new.username,
    net_quantity,
    'prediction_trade_credit',
    'prediction-position-net:' || netting_id,
    jsonb_build_object(
      'marketId', new.market_id,
      'nettingId', netting_id,
      'quantity', net_quantity,
      'reason', 'opposing-position-net'
    )
  );

  return null;
end;
$$;


CREATE OR REPLACE FUNCTION public.resolve_tournament_betting_market(p_market_id text, p_winner text, p_resolution text DEFAULT 'manual'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  normalized_market_id text := lower(btrim(coalesce(p_market_id, '')));
  normalized_winner text := lower(btrim(coalesce(p_winner, '')));
  normalized_resolution text := lower(btrim(coalesce(p_resolution, '')));
  market_row public.tournament_betting_markets%rowtype;
  bet_row public.tournament_bets%rowtype;
  won boolean;
  legacy_payout numeric(18, 6);
begin
  select * into market_row
  from public.tournament_betting_markets
  where id = normalized_market_id
  for update;
  if market_row.id is null then raise exception 'Tournament market not found'; end if;
  if market_row.status = 'settled' then return; end if;

  if not exists (
    select 1 from public.tournament_betting_outcomes
    where market_id = market_row.id and player = normalized_winner
  ) then raise exception 'Invalid tournament market winner'; end if;
  if normalized_resolution not in ('played', 'manual') then
    raise exception 'Invalid tournament market resolution';
  end if;

  update public.tournament_betting_markets
  set status = 'settled', winner = normalized_winner, resolution = normalized_resolution,
      settled_at = now(), updated_at = now()
  where id = market_row.id;

  for bet_row in
    select * from public.tournament_bets
    where market_id = market_row.id and status = 'open'
    order by id for update
  loop
    won := bet_row.selection = normalized_winner;
    legacy_payout := 0;
    if won and not exists (
      select 1 from public.prediction_legacy_position_credits credit
      where credit.source_bet_id = bet_row.id
    ) then
      legacy_payout := bet_row.potential_payout;
      perform public.apply_coin_transaction(
        bet_row.username, legacy_payout, 'tournament_bet_payout',
        'tournament-bet-payout:' || bet_row.id,
        jsonb_build_object('betId', bet_row.id, 'marketId', market_row.id, 'winner', normalized_winner)
      );
    end if;

    update public.tournament_bets
    set status = case when won then 'won' else 'lost' end,
        payout = legacy_payout, settled_at = now()
    where id = bet_row.id;
  end loop;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.resolve_prediction_market(p_market_id text, p_outcome text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  normalized_outcome text := lower(btrim(coalesce(p_outcome, '')));
  market_row public.prediction_markets%rowtype;
  position_row public.prediction_positions%rowtype;
begin
  if normalized_outcome not in ('yes', 'no') then raise exception 'Invalid market outcome'; end if;
  perform pg_advisory_xact_lock(hashtext('prediction-market:' || p_market_id));
  select * into market_row
  from public.prediction_markets
  where id = p_market_id
  for update;
  if market_row.id is null then raise exception 'Prediction market not found'; end if;
  if market_row.status = 'resolved' then
    if market_row.outcome is distinct from normalized_outcome then
      raise exception 'Prediction market already resolved differently';
    end if;
    return;
  end if;

  if market_row.status not in ('open', 'closed') then
    raise exception 'Prediction market cannot be settled from status %', market_row.status;
  end if;

  perform public.cancel_prediction_market_orders(p_market_id);

  for position_row in
    select *
    from public.prediction_positions
    where market_id = p_market_id and outcome = normalized_outcome and quantity > 0
    order by username
    for update
  loop
    perform public.credit_prediction_market_payout(
      p_market_id, position_row.username, normalized_outcome,
      position_row.quantity,
      'prediction-market-payout:' || p_market_id || ':' || position_row.username,
      jsonb_build_object(
        'marketId', p_market_id, 'outcome', normalized_outcome,
        'contracts', position_row.quantity
      )
    );
  end loop;

  update public.prediction_markets
  set status = 'resolved', outcome = normalized_outcome, settlement_price_cents = null,
      settlement_reference_fill_id = null, resolved_at = now(), updated_at = now()
  where id = p_market_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.resolve_prediction_market_at_price(p_market_id text, p_reference_fill_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  market_row public.prediction_markets%rowtype;
  position_row public.prediction_positions%rowtype;
  reference_fill public.prediction_fills%rowtype;
  settlement_price integer;
  payout_amount numeric(18, 6);
begin
  perform pg_advisory_xact_lock(hashtext('prediction-market:' || p_market_id));
  select * into market_row
  from public.prediction_markets
  where id = p_market_id
  for update;
  if market_row.id is null then raise exception 'Prediction market not found'; end if;

  select * into reference_fill
  from public.prediction_fills
  where id = p_reference_fill_id and market_id = p_market_id;
  if reference_fill.id is null then raise exception 'Settlement reference trade not found'; end if;

  settlement_price := case reference_fill.outcome
    when 'yes' then reference_fill.price_cents
    else 100 - reference_fill.price_cents
  end;

  if market_row.status = 'resolved' then
    if market_row.outcome is null
      and market_row.settlement_reference_fill_id = p_reference_fill_id then
      return;
    end if;
    raise exception 'Prediction market already resolved differently';
  end if;

  if market_row.status not in ('open', 'closed') then
    raise exception 'Prediction market cannot be settled from status %', market_row.status;
  end if;

  perform public.cancel_prediction_market_orders(p_market_id);

  for position_row in
    select *
    from public.prediction_positions
    where market_id = p_market_id and quantity > 0
    order by username, outcome
    for update
  loop
    payout_amount := round(
      position_row.quantity::numeric
      * case position_row.outcome
          when 'yes' then settlement_price
          else 100 - settlement_price
        end
      / 100,
      6
    );

    if payout_amount > 0 then
      perform public.credit_prediction_market_payout(
        p_market_id, position_row.username, position_row.outcome,
        payout_amount,
        'prediction-market-price-payout:' || p_market_id || ':'
          || position_row.username || ':' || position_row.outcome,
        jsonb_build_object(
          'marketId', p_market_id,
          'outcome', position_row.outcome,
          'contracts', position_row.quantity,
          'settlementPriceCents', settlement_price,
          'settlementReferenceFillId', p_reference_fill_id
        )
      );
    end if;
  end loop;

  update public.prediction_markets
  set status = 'resolved',
      outcome = null,
      settlement_price_cents = settlement_price,
      settlement_reference_fill_id = p_reference_fill_id,
      resolved_at = now(),
      updated_at = now()
  where id = p_market_id;
end;
$function$
;
commit;
