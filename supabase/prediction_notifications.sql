-- Notify prediction-market users when an order finishes filling or a position pays out.
-- These notifications use the existing feature payload because it already supports a unique
-- event key, direct copy, and a destination path without expanding the private inbox schema.
begin;

create or replace function public.notify_filled_prediction_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  market_label text;
  market_path text;
begin
  if new.username = 'prediction_admin' then return new; end if;

  select
    coalesce(nullif(btrim(market.display_name), ''), market.question),
    coalesce(nullif(btrim(market.group_path), ''), '/betting')
  into market_label, market_path
  from public.prediction_markets market
  where market.id = new.market_id;

  insert into public.notifications (
    recipient_username, notification_type, feature_key, feature_message, feature_path
  ) values (
    new.username,
    'feature',
    'prediction-order-filled:' || new.id,
    format(
      'Your %s order for %s %s contract%s on %s was filled.',
      new.side,
      new.quantity,
      initcap(new.outcome),
      case when new.quantity = 1 then '' else 's' end,
      market_label
    ),
    market_path
  )
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.notify_filled_prediction_order()
  from public, anon, authenticated;

drop trigger if exists notify_filled_prediction_order on public.prediction_orders;
create trigger notify_filled_prediction_order
after update of status on public.prediction_orders
for each row
when (old.status is distinct from new.status and new.status = 'filled')
execute function public.notify_filled_prediction_order();

create or replace function public.notify_prediction_market_payout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  market_label text;
  market_path text;
  payout_label text;
begin
  if new.username = 'prediction_admin' then return new; end if;

  select
    coalesce(nullif(btrim(market.display_name), ''), market.question),
    coalesce(nullif(btrim(market.group_path), ''), '/betting')
  into market_label, market_path
  from public.prediction_markets market
  where market.id = new.metadata ->> 'marketId';

  payout_label := trim(trailing '.' from trim(
    trailing '0' from to_char(new.amount, 'FM999999999990.000000')
  ));

  insert into public.notifications (
    recipient_username, notification_type, feature_key, feature_message, feature_path
  ) values (
    new.username,
    'feature',
    'prediction-market-payout:' || new.id,
    format(
      'Your prediction on %s paid out %s coin%s.',
      market_label,
      payout_label,
      case when new.amount = 1 then '' else 's' end
    ),
    market_path
  )
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.notify_prediction_market_payout()
  from public, anon, authenticated;

drop trigger if exists notify_prediction_market_payout on public.coin_transactions;
create trigger notify_prediction_market_payout
after insert on public.coin_transactions
for each row
when (new.reason = 'prediction_market_payout' and new.amount > 0)
execute function public.notify_prediction_market_payout();

notify pgrst, 'reload schema';
commit;
