-- Notify prediction-market users when an order finishes filling or a market resolves.
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

drop trigger if exists notify_prediction_market_payout on public.coin_transactions;

create or replace function public.send_prediction_market_resolution_notifications(
  p_market_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  market_row public.prediction_markets%rowtype;
  position_username text;
  market_label text;
  market_path text;
  winner_label text;
  result_label text;
  score_row record;
  winner_score_label text;
  loser_score_label text;
  payout_amount numeric(18, 6);
  payout_label text;
  notification_key text;
begin
  select * into market_row
  from public.prediction_markets market
  where market.id = p_market_id;

  if market_row.id is null or market_row.status <> 'resolved' then return; end if;

  market_label := coalesce(nullif(btrim(market_row.display_name), ''), market_row.question);
  market_path := coalesce(nullif(btrim(market_row.group_path), ''), '/betting');

  if market_row.outcome is not null then
    winner_label := case market_row.outcome
      when 'yes' then coalesce(nullif(btrim(market_row.outcome_yes_label), ''), 'Yes')
      else coalesce(nullif(btrim(market_row.outcome_no_label), ''), 'No')
    end;
    winner_label := upper(left(winner_label, 1)) || substr(winner_label, 2);

    if market_row.outcome_yes_label is not null and market_row.outcome_no_label is not null then
      select match.p1, match.p2, match.s1, match.s2
      into score_row
      from public.tournament_matches match
      where (
          lower(btrim(match.p1)) = lower(btrim(market_row.outcome_yes_label))
          and lower(btrim(match.p2)) = lower(btrim(market_row.outcome_no_label))
        ) or (
          lower(btrim(match.p1)) = lower(btrim(market_row.outcome_no_label))
          and lower(btrim(match.p2)) = lower(btrim(market_row.outcome_yes_label))
        )
      order by match.played_on desc nulls last, match.id desc
      limit 1;
    end if;

    if score_row.p1 is not null then
      if lower(btrim(score_row.p1)) = lower(btrim(winner_label)) then
        winner_score_label := trim(trailing '.' from trim(
          trailing '0' from to_char(score_row.s1, 'FM999999999990.0')
        ));
        loser_score_label := trim(trailing '.' from trim(
          trailing '0' from to_char(score_row.s2, 'FM999999999990.0')
        ));
      else
        winner_score_label := trim(trailing '.' from trim(
          trailing '0' from to_char(score_row.s2, 'FM999999999990.0')
        ));
        loser_score_label := trim(trailing '.' from trim(
          trailing '0' from to_char(score_row.s1, 'FM999999999990.0')
        ));
      end if;
      result_label := format(
        '%s won %s%s%s.',
        winner_label,
        winner_score_label,
        chr(8211),
        loser_score_label
      );
    else
      result_label := format('%s won.', winner_label);
    end if;
  else
    result_label := format('%s settled at %s¢.', market_label, market_row.settlement_price_cents);
  end if;

  for position_username in
    select participant.username
    from (
      select position.username
      from public.prediction_positions position
      where position.market_id = p_market_id
        and position.quantity > 0
      union
      select bet.username
      from public.tournament_bets bet
      where bet.market_id = p_market_id
    ) participant
    where participant.username <> 'prediction_admin'
    order by participant.username
  loop
    select coalesce(sum(transaction.amount), 0)
    into payout_amount
    from public.coin_transactions transaction
    where transaction.username = position_username
      and (
        (
          transaction.reason = 'prediction_market_payout'
          and transaction.source_key =
            'prediction-market-payout:' || p_market_id || ':' || position_username
        )
        or (
          transaction.reason = 'tournament_bet_payout'
          and transaction.source_key in (
            select 'tournament-bet-payout:' || bet.id
            from public.tournament_bets bet
            where bet.market_id = p_market_id
              and bet.username = position_username
              and not exists (
                select 1 from public.prediction_legacy_position_credits credit
                where credit.source_bet_id = bet.id
              )
          )
        )
      );

    payout_label := case
      when round(payout_amount, 2) = trunc(round(payout_amount, 2))
        then to_char(round(payout_amount, 2), 'FM999,999,999,990')
      else to_char(round(payout_amount, 2), 'FM999,999,999,990.00')
    end;
    notification_key :=
      'prediction-market-payout:tournament:' || p_market_id || ':' || position_username;

    update public.notifications
    set
      feature_message = case
        when payout_amount > 0 then format(
          '%s +%s coin%s',
          result_label,
          payout_label,
          case when round(payout_amount, 2) = 1 then '' else 's' end
        )
        else result_label || ' No payout'
      end,
      feature_path = market_path
    where recipient_username = position_username
      and notification_type = 'feature'
      and feature_key = notification_key;

    if not found then
      insert into public.notifications (
        recipient_username, notification_type, feature_key, feature_message, feature_path
      ) values (
        position_username,
        'feature',
        notification_key,
        case
          when payout_amount > 0 then format(
            '%s +%s coin%s',
            result_label,
            payout_label,
            case when round(payout_amount, 2) = 1 then '' else 's' end
          )
          else result_label || ' No payout'
        end,
        market_path
      );
    end if;
  end loop;
end;
$$;

revoke all on function public.send_prediction_market_resolution_notifications(text)
  from public, anon, authenticated;

create or replace function public.notify_prediction_market_payout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.send_prediction_market_resolution_notifications(new.id);
  return new;
end;
$$;

revoke all on function public.notify_prediction_market_payout()
  from public, anon, authenticated;

drop trigger if exists notify_prediction_market_payout on public.prediction_markets;
create trigger notify_prediction_market_payout
after update of status on public.prediction_markets
for each row
when (old.status is distinct from new.status and new.status = 'resolved')
execute function public.notify_prediction_market_payout();

notify pgrst, 'reload schema';
commit;
