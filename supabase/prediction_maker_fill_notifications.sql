-- Notify the resting-order owner on every fill, never the incoming taker.
begin;

create or replace function public.notify_filled_prediction_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  market_label text;
  share_label text;
  market_path text;
  message text;
begin
  if new.username = 'prediction_admin' then return new; end if;

  -- Incoming orders have no maker fills. An order that initially takes liquidity can
  -- later rest and become a maker; only those later fills should notify its owner.
  -- Paired outcomes insert two fill rows, so notify from the single order update.
  if not exists (
    select 1 from public.prediction_fills where maker_order_id = new.id
  ) then return new; end if;

  select
    coalesce(nullif(btrim(market.group_title), ''), market.question),
    case
      when nullif(btrim(market.outcome_yes_label), '') is not null
        and nullif(btrim(market.outcome_no_label), '') is not null
      then case new.outcome when 'yes' then market.outcome_yes_label else market.outcome_no_label end
      else coalesce(nullif(btrim(market.display_name), ''), market.question) ||
        case when new.outcome = 'no' then ' (No)' else '' end
    end,
    coalesce(nullif(btrim(market.group_path), ''), '/betting')
  into market_label, share_label, market_path
  from public.prediction_markets market
  where market.id = new.market_id;

  message := format(
    'You %s %s share%s of %s in %s.',
    case new.side when 'buy' then 'bought' else 'sold' end,
    new.filled_quantity - old.filled_quantity,
    case when new.filled_quantity - old.filled_quantity = 1 then '' else 's' end,
    share_label, market_label
  );

  insert into public.notifications (
    recipient_username, notification_type, feature_key, feature_message, feature_path
  ) values (
    new.username, 'feature',
    'prediction-order-filled:' || new.id || ':' || new.filled_quantity,
    message, market_path
  ) on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.notify_filled_prediction_order()
  from public, anon, authenticated;

drop trigger if exists notify_filled_prediction_order on public.prediction_orders;
create trigger notify_filled_prediction_order
after update of filled_quantity on public.prediction_orders
for each row
when (new.filled_quantity > old.filled_quantity)
execute function public.notify_filled_prediction_order();

commit;
