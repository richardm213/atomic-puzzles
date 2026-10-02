-- Set the once-per-UTC-day Atomic Coin bonus to 5 coins.

create or replace function public.claim_daily_coins(p_username text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  normalized_username text := lower(btrim(coalesce(p_username, '')));
  source text := 'daily:' || normalized_username || ':' || current_date::text;
  current_balance integer;
begin
  if exists (select 1 from public.coin_transactions where source_key = source) then
    raise exception 'Daily bonus already claimed';
  end if;
  current_balance := public.apply_coin_transaction(
    normalized_username, 5, 'daily_bonus', source,
    jsonb_build_object('date', current_date), now()
  );
  return jsonb_build_object(
    'balance', current_balance,
    'dailyClaimAvailable', false,
    'awarded', 5
  );
end;
$$;

revoke all on function public.claim_daily_coins(text) from public, anon, authenticated;
grant execute on function public.claim_daily_coins(text) to service_role;

notify pgrst, 'reload schema';
