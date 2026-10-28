-- Leave buy-limit-order coins available until a trade executes. If a resting buy can no
-- longer be funded when matched, cancel its remainder and notify the owner.
begin;

alter table public.coin_transactions
  drop constraint if exists coin_transactions_reason_check;
alter table public.coin_transactions
  add constraint coin_transactions_reason_check check (reason in (
    'puzzle_created', 'puzzle_correct', 'puzzle_attempted', 'daily_bonus',
    'shop_redemption', 'coin_transfer', 'tournament_bet', 'tournament_bet_payout',
    'tournament_bet_refund', 'prediction_order_reserve', 'prediction_order_refund',
    'prediction_trade_credit', 'prediction_trade_fee',
    'prediction_market_payout', 'prediction_liquidity_funding'
  ));

-- Release coins held by buy orders created under the old reserve-on-placement model.
-- The reserve and release source keys make this safe to run more than once.
do $$
declare
  order_row public.prediction_orders%rowtype;
begin
  for order_row in
    select orders.*
    from public.prediction_orders orders
    where orders.side = 'buy'
      and orders.status in ('open', 'partial')
      and orders.remaining_quantity > 0
      and exists (
        select 1
        from public.coin_transactions transaction
        where transaction.source_key = 'prediction-order-reserve:' || orders.id
      )
      and not exists (
        select 1
        from public.coin_transactions transaction
        where transaction.source_key = 'prediction-order-unreserve:' || orders.id
      )
    order by orders.id
    for update
  loop
    perform public.apply_coin_transaction(
      order_row.username,
      round(order_row.price_cents::numeric * order_row.remaining_quantity / 100, 6),
      'prediction_order_refund',
      'prediction-order-unreserve:' || order_row.id,
      jsonb_build_object(
        'marketId', order_row.market_id,
        'orderId', order_row.id,
        'reason', 'charge-on-fill-migration'
      )
    );
  end loop;
end;
$$;

create or replace function public.cancel_unfunded_prediction_order(p_order_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.prediction_orders%rowtype;
  market_label text;
  market_path text;
begin
  select * into order_row
  from public.prediction_orders
  where id = p_order_id
  for update;

  if order_row.id is null
    or order_row.side <> 'buy'
    or order_row.status not in ('open', 'partial')
    or order_row.remaining_quantity <= 0 then
    return;
  end if;

  update public.prediction_orders
  set remaining_quantity = 0,
      status = 'cancelled',
      updated_at = now()
  where id = order_row.id;

  if order_row.username = 'prediction_admin' then return; end if;

  select
    coalesce(nullif(btrim(market.display_name), ''), market.question),
    coalesce(nullif(btrim(market.group_path), ''), '/betting')
  into market_label, market_path
  from public.prediction_markets market
  where market.id = order_row.market_id;

  insert into public.notifications (
    recipient_username, notification_type, feature_key, feature_message, feature_path
  ) values (
    order_row.username,
    'feature',
    'prediction-order-cancelled-unfunded:' || order_row.id,
    format(
      'We cancelled the remaining %s %s contract%s in your buy order on %s because you did not have enough available Atomic Coins when the order was matched.',
      order_row.remaining_quantity,
      initcap(order_row.outcome),
      case when order_row.remaining_quantity = 1 then '' else 's' end,
      market_label
    ),
    market_path
  )
  on conflict do nothing;
end;
$$;

revoke all on function public.cancel_unfunded_prediction_order(bigint)
  from public, anon, authenticated;

create or replace function public.place_prediction_order(
  p_username text,
  p_market_id text,
  p_outcome text,
  p_side text,
  p_price_cents integer,
  p_quantity integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_username text := lower(btrim(coalesce(p_username, '')));
  normalized_outcome text := lower(btrim(coalesce(p_outcome, '')));
  normalized_side text := lower(btrim(coalesce(p_side, '')));
  market_row public.prediction_markets%rowtype;
  incoming public.prediction_orders%rowtype;
  resting public.prediction_orders%rowtype;
  available_contracts integer;
  match_quantity integer;
  execution_price integer;
  trade_amount numeric(18, 6);
  resting_buy_amount numeric(18, 6);
  taker_fee numeric(18, 6);
  incoming_balance numeric(18, 6);
  resting_balance numeric(18, 6);
  fill_id bigint;
  pair_key_value text;
  debit_key text;
  next_balance numeric(18, 6);
begin
  if normalized_username !~ '^[a-z0-9_-]{1,100}$'
    or normalized_outcome not in ('yes', 'no')
    or normalized_side not in ('buy', 'sell')
    or p_price_cents not between 1 and 99
    or p_quantity not between 1 and 10000 then
    raise exception 'Invalid prediction order';
  end if;

  perform pg_advisory_xact_lock(hashtext('prediction-market:' || p_market_id));
  select * into market_row
  from public.prediction_markets
  where id = p_market_id
  for update;

  if market_row.id is null then raise exception 'Prediction market not found'; end if;
  if market_row.status <> 'open' or market_row.closes_at <= now() then
    raise exception 'Prediction market is closed';
  end if;
  perform public.assert_coin_economy_access(normalized_username);

  if exists (
    select 1
    from public.prediction_orders
    where market_id = p_market_id
      and username = normalized_username
      and status in ('open', 'partial')
      and remaining_quantity > 0
      and (
        (
          normalized_side = 'buy'
          and (
            (outcome = normalized_outcome and side = 'sell' and price_cents <= p_price_cents)
            or
            (outcome <> normalized_outcome and side = 'buy'
              and price_cents + p_price_cents >= 100)
          )
        )
        or
        (
          normalized_side = 'sell'
          and (
            (outcome = normalized_outcome and side = 'buy' and price_cents >= p_price_cents)
            or
            (outcome <> normalized_outcome and side = 'sell'
              and price_cents + p_price_cents <= 100)
          )
        )
      )
  ) then
    raise exception 'Order would cross one of your open orders';
  end if;

  if normalized_side = 'sell' then
    insert into public.prediction_positions (market_id, username, outcome)
    values (p_market_id, normalized_username, normalized_outcome)
    on conflict do nothing;
    select quantity - reserved_quantity into available_contracts
    from public.prediction_positions
    where market_id = p_market_id
      and username = normalized_username
      and outcome = normalized_outcome
    for update;
    if coalesce(available_contracts, 0) < p_quantity then
      raise exception 'Not enough available contracts';
    end if;
  end if;

  insert into public.prediction_orders (
    market_id, username, outcome, side, price_cents, quantity, remaining_quantity
  ) values (
    p_market_id, normalized_username, normalized_outcome, normalized_side,
    p_price_cents, p_quantity, p_quantity
  ) returning * into incoming;

  insert into public.coin_accounts (username) values (normalized_username)
  on conflict (username) do nothing;
  if normalized_side = 'sell' then
    update public.prediction_positions
    set reserved_quantity = reserved_quantity + p_quantity, updated_at = now()
    where market_id = p_market_id
      and username = normalized_username
      and outcome = normalized_outcome;
  end if;
  select balance into next_balance
  from public.coin_accounts
  where username = normalized_username;

  while incoming.remaining_quantity > 0 loop
    resting.id := null;

    if incoming.side = 'buy' then
      select * into resting
      from public.prediction_orders
      where market_id = p_market_id
        and status in ('open', 'partial')
        and remaining_quantity > 0
        and username <> incoming.username
        and (
          (outcome = incoming.outcome and side = 'sell' and price_cents <= incoming.price_cents)
          or
          (outcome <> incoming.outcome and side = 'buy'
            and price_cents + incoming.price_cents >= 100)
        )
      order by
        case when outcome = incoming.outcome then price_cents else 100 - price_cents end asc,
        created_at asc,
        id asc
      limit 1
      for update;

      exit when resting.id is null;
      match_quantity := least(incoming.remaining_quantity, resting.remaining_quantity);
      execution_price := case
        when resting.outcome = incoming.outcome then resting.price_cents
        else 100 - resting.price_cents
      end;
      trade_amount := round(execution_price::numeric * match_quantity / 100, 6);
      taker_fee := round(trade_amount * 0.02, 6);

      insert into public.coin_accounts (username)
      values (incoming.username), (resting.username)
      on conflict (username) do nothing;
      perform 1
      from public.coin_accounts
      where username in (incoming.username, resting.username)
      order by username
      for update;
      select balance into incoming_balance
      from public.coin_accounts where username = incoming.username;

      if incoming_balance < trade_amount + taker_fee then
        perform public.cancel_unfunded_prediction_order(incoming.id);
        select * into incoming from public.prediction_orders where id = incoming.id;
        next_balance := incoming_balance;
        exit;
      end if;

      if resting.side = 'buy' then
        resting_buy_amount := round(resting.price_cents::numeric * match_quantity / 100, 6);
        select balance into resting_balance
        from public.coin_accounts where username = resting.username;
        if resting_balance < resting_buy_amount then
          perform public.cancel_unfunded_prediction_order(resting.id);
          continue;
        end if;
      end if;

      debit_key := incoming.id || ':' || resting.id || ':' || incoming.filled_quantity;
      next_balance := public.apply_coin_transaction(
        incoming.username,
        -trade_amount,
        'prediction_order_reserve',
        'prediction-trade-buyer:' || debit_key || ':incoming',
        jsonb_build_object(
          'marketId', p_market_id, 'orderId', incoming.id, 'makerOrderId', resting.id,
          'priceCents', execution_price, 'quantity', match_quantity, 'chargeMode', 'fill'
        )
      );

      if resting.outcome = incoming.outcome then
        update public.prediction_positions
        set quantity = quantity - match_quantity,
            reserved_quantity = reserved_quantity - match_quantity,
            updated_at = now()
        where market_id = p_market_id
          and username = resting.username
          and outcome = incoming.outcome;
        insert into public.prediction_positions (market_id, username, outcome, quantity)
        values (p_market_id, incoming.username, incoming.outcome, match_quantity)
        on conflict (market_id, username, outcome) do update
        set quantity = public.prediction_positions.quantity + excluded.quantity,
            updated_at = now();

        insert into public.prediction_fills (
          market_id, outcome, price_cents, quantity, buyer_username, seller_username,
          maker_order_id, taker_order_id
        ) values (
          p_market_id, incoming.outcome, execution_price, match_quantity, incoming.username,
          resting.username, resting.id, incoming.id
        ) returning id into fill_id;

        perform public.apply_coin_transaction(
          resting.username,
          trade_amount,
          'prediction_trade_credit',
          'prediction-fill-seller:' || fill_id,
          jsonb_build_object('marketId', p_market_id, 'fillId', fill_id, 'orderId', resting.id)
        );
      else
        perform public.apply_coin_transaction(
          resting.username,
          -resting_buy_amount,
          'prediction_order_reserve',
          'prediction-trade-buyer:' || debit_key || ':resting',
          jsonb_build_object(
            'marketId', p_market_id, 'orderId', resting.id, 'takerOrderId', incoming.id,
            'priceCents', resting.price_cents, 'quantity', match_quantity,
            'chargeMode', 'fill'
          )
        );

        pair_key_value := debit_key;
        insert into public.prediction_positions (market_id, username, outcome, quantity)
        values (p_market_id, incoming.username, incoming.outcome, match_quantity)
        on conflict (market_id, username, outcome) do update
        set quantity = public.prediction_positions.quantity + excluded.quantity,
            updated_at = now();
        insert into public.prediction_positions (market_id, username, outcome, quantity)
        values (p_market_id, resting.username, resting.outcome, match_quantity)
        on conflict (market_id, username, outcome) do update
        set quantity = public.prediction_positions.quantity + excluded.quantity,
            updated_at = now();

        insert into public.prediction_fills (
          market_id, outcome, price_cents, quantity, buyer_username, maker_order_id,
          taker_order_id, pair_key
        ) values (
          p_market_id, incoming.outcome, execution_price, match_quantity, incoming.username,
          resting.id, incoming.id, pair_key_value
        );
        insert into public.prediction_fills (
          market_id, outcome, price_cents, quantity, buyer_username, maker_order_id,
          taker_order_id, pair_key
        ) values (
          p_market_id, resting.outcome, resting.price_cents, match_quantity, resting.username,
          resting.id, incoming.id, pair_key_value
        );
      end if;
    else
      select * into resting
      from public.prediction_orders
      where market_id = p_market_id
        and status in ('open', 'partial')
        and remaining_quantity > 0
        and username <> incoming.username
        and (
          (outcome = incoming.outcome and side = 'buy' and price_cents >= incoming.price_cents)
          or
          (outcome <> incoming.outcome and side = 'sell'
            and price_cents + incoming.price_cents <= 100)
        )
      order by
        case when outcome = incoming.outcome then price_cents else 100 - price_cents end desc,
        created_at asc,
        id asc
      limit 1
      for update;

      exit when resting.id is null;
      match_quantity := least(incoming.remaining_quantity, resting.remaining_quantity);
      execution_price := case
        when resting.outcome = incoming.outcome then resting.price_cents
        else 100 - resting.price_cents
      end;
      trade_amount := round(execution_price::numeric * match_quantity / 100, 6);
      taker_fee := round(trade_amount * 0.02, 6);

      insert into public.coin_accounts (username)
      values (incoming.username), (resting.username)
      on conflict (username) do nothing;
      perform 1
      from public.coin_accounts
      where username in (incoming.username, resting.username)
      order by username
      for update;

      if resting.side = 'buy' then
        resting_buy_amount := round(resting.price_cents::numeric * match_quantity / 100, 6);
        select balance into resting_balance
        from public.coin_accounts where username = resting.username;
        if resting_balance < resting_buy_amount then
          perform public.cancel_unfunded_prediction_order(resting.id);
          continue;
        end if;
      end if;

      debit_key := incoming.id || ':' || resting.id || ':' || incoming.filled_quantity;
      if resting.outcome = incoming.outcome then
        perform public.apply_coin_transaction(
          resting.username,
          -resting_buy_amount,
          'prediction_order_reserve',
          'prediction-trade-buyer:' || debit_key || ':resting',
          jsonb_build_object(
            'marketId', p_market_id, 'orderId', resting.id, 'takerOrderId', incoming.id,
            'priceCents', execution_price, 'quantity', match_quantity, 'chargeMode', 'fill'
          )
        );

        update public.prediction_positions
        set quantity = quantity - match_quantity,
            reserved_quantity = reserved_quantity - match_quantity,
            updated_at = now()
        where market_id = p_market_id
          and username = incoming.username
          and outcome = incoming.outcome;
        insert into public.prediction_positions (market_id, username, outcome, quantity)
        values (p_market_id, resting.username, incoming.outcome, match_quantity)
        on conflict (market_id, username, outcome) do update
        set quantity = public.prediction_positions.quantity + excluded.quantity,
            updated_at = now();

        insert into public.prediction_fills (
          market_id, outcome, price_cents, quantity, buyer_username, seller_username,
          maker_order_id, taker_order_id
        ) values (
          p_market_id, incoming.outcome, execution_price, match_quantity, resting.username,
          incoming.username, resting.id, incoming.id
        ) returning id into fill_id;
        next_balance := public.apply_coin_transaction(
          incoming.username,
          trade_amount,
          'prediction_trade_credit',
          'prediction-fill-seller:' || fill_id,
          jsonb_build_object('marketId', p_market_id, 'fillId', fill_id, 'orderId', incoming.id)
        );
      else
        pair_key_value := debit_key;
        update public.prediction_positions
        set quantity = quantity - match_quantity,
            reserved_quantity = reserved_quantity - match_quantity,
            updated_at = now()
        where market_id = p_market_id
          and username = incoming.username
          and outcome = incoming.outcome;
        update public.prediction_positions
        set quantity = quantity - match_quantity,
            reserved_quantity = reserved_quantity - match_quantity,
            updated_at = now()
        where market_id = p_market_id
          and username = resting.username
          and outcome = resting.outcome;

        insert into public.prediction_fills (
          market_id, outcome, price_cents, quantity, buyer_username, seller_username,
          maker_order_id, taker_order_id, pair_key
        ) values (
          p_market_id, incoming.outcome, execution_price, match_quantity, resting.username,
          incoming.username, resting.id, incoming.id, pair_key_value
        ) returning id into fill_id;
        next_balance := public.apply_coin_transaction(
          incoming.username,
          trade_amount,
          'prediction_trade_credit',
          'prediction-fill-seller:' || fill_id,
          jsonb_build_object('marketId', p_market_id, 'fillId', fill_id, 'orderId', incoming.id)
        );

        insert into public.prediction_fills (
          market_id, outcome, price_cents, quantity, buyer_username, seller_username,
          maker_order_id, taker_order_id, pair_key
        ) values (
          p_market_id, resting.outcome, resting.price_cents, match_quantity, incoming.username,
          resting.username, resting.id, incoming.id, pair_key_value
        ) returning id into fill_id;
        perform public.apply_coin_transaction(
          resting.username,
          round(resting.price_cents::numeric * match_quantity / 100, 6),
          'prediction_trade_credit',
          'prediction-fill-seller:' || fill_id,
          jsonb_build_object('marketId', p_market_id, 'fillId', fill_id, 'orderId', resting.id)
        );
      end if;
    end if;

    next_balance := public.apply_coin_transaction(
      incoming.username,
      -taker_fee,
      'prediction_trade_fee',
      'prediction-taker-fee:' || incoming.id || ':' || resting.id || ':' || incoming.filled_quantity,
      jsonb_build_object(
        'marketId', p_market_id,
        'orderId', incoming.id,
        'makerOrderId', resting.id,
        'priceCents', execution_price,
        'quantity', match_quantity,
        'rate', 0.02
      )
    );

    update public.prediction_orders
    set filled_quantity = filled_quantity + match_quantity,
        remaining_quantity = remaining_quantity - match_quantity,
        status = case
          when remaining_quantity - match_quantity = 0 then 'filled'
          else 'partial'
        end,
        updated_at = now()
    where id = incoming.id
    returning * into incoming;

    update public.prediction_orders
    set filled_quantity = filled_quantity + match_quantity,
        remaining_quantity = remaining_quantity - match_quantity,
        status = case
          when remaining_quantity - match_quantity = 0 then 'filled'
          else 'partial'
        end,
        updated_at = now()
    where id = resting.id;
  end loop;

  return jsonb_build_object(
    'orderId', incoming.id,
    'marketId', p_market_id,
    'balance', coalesce(next_balance, 0),
    'cancelledForInsufficientBalance', incoming.status = 'cancelled'
  );
end;
$$;

create or replace function public.cancel_prediction_order(
  p_username text,
  p_order_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_username text := lower(btrim(coalesce(p_username, '')));
  order_row public.prediction_orders%rowtype;
  order_market_id text;
  next_balance numeric(18, 6);
begin
  select market_id into order_market_id
  from public.prediction_orders
  where id = p_order_id;
  if order_market_id is null then raise exception 'Prediction order not found'; end if;
  perform pg_advisory_xact_lock(hashtext('prediction-market:' || order_market_id));

  select * into order_row
  from public.prediction_orders
  where id = p_order_id
  for update;
  if order_row.id is null or order_row.username <> normalized_username then
    raise exception 'Prediction order not found';
  end if;
  if order_row.status not in ('open', 'partial') or order_row.remaining_quantity <= 0 then
    raise exception 'Prediction order is not open';
  end if;

  if order_row.side = 'sell' then
    update public.prediction_positions
    set reserved_quantity = reserved_quantity - order_row.remaining_quantity,
        updated_at = now()
    where market_id = order_row.market_id
      and username = normalized_username
      and outcome = order_row.outcome;
  end if;

  update public.prediction_orders
  set remaining_quantity = 0, status = 'cancelled', updated_at = now()
  where id = order_row.id;

  select balance into next_balance
  from public.coin_accounts
  where username = normalized_username;
  return jsonb_build_object(
    'orderId', order_row.id,
    'marketId', order_row.market_id,
    'balance', coalesce(next_balance, 0)
  );
end;
$$;

-- Resolution previously refunded unfilled buy orders because their coins were reserved.
-- Keep sell-contract release, but buy orders now require only a status update.
create or replace function public.cancel_prediction_market_orders(p_market_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.prediction_orders%rowtype;
begin
  for order_row in
    select *
    from public.prediction_orders
    where market_id = p_market_id
      and status in ('open', 'partial')
      and remaining_quantity > 0
    order by id
    for update
  loop
    if order_row.side = 'sell' then
      update public.prediction_positions
      set reserved_quantity = reserved_quantity - order_row.remaining_quantity,
          updated_at = now()
      where market_id = p_market_id
        and username = order_row.username
        and outcome = order_row.outcome;
    end if;

    update public.prediction_orders
    set remaining_quantity = 0, status = 'cancelled', updated_at = now()
    where id = order_row.id;
  end loop;
end;
$$;

revoke all on function public.cancel_prediction_market_orders(text)
  from public, anon, authenticated;

-- Patch the two resolvers to use the no-refund cancellation helper without duplicating their
-- payout rules. The wrapper names preserve their existing public signatures and grants.
create or replace function public.resolve_prediction_market(
  p_market_id text,
  p_outcome text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
    if market_row.outcome <> normalized_outcome then
      raise exception 'Prediction market already resolved differently';
    end if;
    return;
  end if;

  perform public.cancel_prediction_market_orders(p_market_id);

  for position_row in
    select *
    from public.prediction_positions
    where market_id = p_market_id and outcome = normalized_outcome and quantity > 0
    order by username
    for update
  loop
    perform public.apply_coin_transaction(
      position_row.username,
      position_row.quantity,
      'prediction_market_payout',
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
$$;

create or replace function public.resolve_prediction_market_at_price(
  p_market_id text,
  p_reference_fill_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
      perform public.apply_coin_transaction(
        position_row.username,
        payout_amount,
        'prediction_market_payout',
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
$$;

revoke all on function public.place_prediction_order(text, text, text, text, integer, integer),
  public.cancel_prediction_order(text, bigint),
  public.resolve_prediction_market(text, text),
  public.resolve_prediction_market_at_price(text, bigint)
  from public, anon, authenticated;
grant execute on function public.place_prediction_order(text, text, text, text, integer, integer),
  public.cancel_prediction_order(text, bigint),
  public.resolve_prediction_market(text, text),
  public.resolve_prediction_market_at_price(text, bigint)
  to service_role;

notify pgrst, 'reload schema';
commit;
