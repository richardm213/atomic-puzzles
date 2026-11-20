-- Run in Firefox against the current database. The fixtures roll back.
begin;

do $$
declare
  fixture constant text := 'prediction-expiry-regression';
  deadline timestamptz := clock_timestamp() + interval '1 hour';
  taker_order bigint;
  amended_order bigint;
begin
  insert into public.prediction_markets (
    id, question, resolution_rules, resolution_source_url, closes_at
  ) values (fixture, 'Expiry test', 'Test fixture', 'https://lichess.org', deadline);

  insert into public.prediction_positions (
    market_id, username, outcome, quantity, reserved_quantity
  ) values (fixture, 'expiry_test_seller', 'no', 10, 10);

  insert into public.prediction_orders (
    id, market_id, username, outcome, side, price_cents, quantity, remaining_quantity, expires_at
  ) values
    (-90101, fixture, 'expiry_test_buyer', 'yes', 'buy', 90, 10, 10, clock_timestamp()),
    (-90102, fixture, 'expiry_test_seller', 'no', 'sell', 10, 10, 10, clock_timestamp());

  taker_order := (public.place_prediction_order(
    'expiry_test_taker', fixture, 'no', 'buy', 20, 10
  )->>'orderId')::bigint;
  if not exists (
    select 1 from public.prediction_orders where id = taker_order and status = 'open'
      and remaining_quantity = 10
  ) or exists (
    select 1 from public.prediction_fills where market_id = fixture
  ) then
    raise exception 'Expired orders could still take a fill';
  end if;
  if exists (
    select 1 from public.prediction_orders where id in (-90101, -90102) and status <> 'cancelled'
  ) or exists (
    select 1 from public.prediction_positions where market_id = fixture and reserved_quantity <> 0
  ) then
    raise exception 'Expiry left an active order or reserved contracts behind';
  end if;

  update public.prediction_orders set expires_at = deadline where id = taker_order;
  amended_order := (public.amend_prediction_order(
    'expiry_test_taker', fixture, taker_order, 25, 10
  )->>'orderId')::bigint;
  if not exists (
    select 1 from public.prediction_orders where id = amended_order and expires_at = deadline
  ) then
    raise exception 'Amending an order lost its expiry';
  end if;

  update public.prediction_orders set expires_at = clock_timestamp() where id = amended_order;
  begin
    perform public.amend_prediction_order('expiry_test_taker', fixture, amended_order, 30, 10);
    raise exception 'Expired order was amended';
  exception when raise_exception then
    if sqlerrm <> 'Prediction order is not open' then raise; end if;
  end;
end;
$$;

rollback;

select 'expiry matching, contract release and amendment passed' as result;
