-- Deliver one durable inbox notification when a requested game analysis is ready.
begin;

create or replace function public.refund_game_analysis(
  p_username text,
  p_game_id text,
  p_charge_attempt integer,
  p_message text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  charge_source text := 'game-analysis:' || btrim(p_game_id) || ':' || p_charge_attempt::text;
  charged_amount numeric(18, 6);
  current_balance numeric(18, 6);
begin
  select abs(amount) into charged_amount
    from public.coin_transactions
    where source_key = charge_source and amount < 0
    limit 1;
  if charged_amount is null then
    select balance into current_balance
    from public.coin_accounts
    where username = lower(btrim(p_username));
    return coalesce(current_balance, 0);
  end if;

  return public.apply_coin_transaction(
    lower(btrim(p_username)),
    charged_amount,
    'game_analysis',
    'game-analysis-refund:' || btrim(p_game_id) || ':' || p_charge_attempt::text,
    jsonb_build_object('gameId', btrim(p_game_id), 'refund', true, 'reason', p_message),
    now()
  );
end;
$$;

revoke all on function public.refund_game_analysis(text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.refund_game_analysis(text, text, integer, text)
  to service_role;

create or replace function public.notify_ready_game_analysis()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (
    recipient_username,
    notification_type,
    feature_key,
    feature_message,
    feature_path
  ) values (
    new.requested_by,
    'feature',
    'game-analysis-ready:' || new.game_id,
    'Your game analysis is ready.',
    '/game/' || new.game_id
  )
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.notify_ready_game_analysis()
  from public, anon, authenticated;

drop trigger if exists notify_ready_game_analysis on public.game_analyses;
create trigger notify_ready_game_analysis
after update of status on public.game_analyses
for each row
when (old.status is distinct from new.status and new.status = 'ready')
execute function public.notify_ready_game_analysis();

commit;
