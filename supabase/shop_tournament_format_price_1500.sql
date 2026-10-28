begin;

alter table public.shop_redemptions
  drop constraint if exists shop_redemptions_cost_check;

-- Preserve any historical 1,000-coin purchases while requiring the RPC below
-- to charge the new 1,500-coin price for future purchases.
alter table public.shop_redemptions
  add constraint shop_redemptions_cost_check check (
    (item_key = 'username_change' and cost = 100)
    or (item_key = 'atomicdb_analysis_12h' and cost = 200)
    or (item_key = 'discord_nitro_month' and cost in (400, 500))
    or (item_key = 'lichess_patron_month' and cost in (500, 600))
    or (item_key = 'next_prize_tournament_format' and cost in (1000, 1500))
    or cost = case
      when item_key = 'discord_nitro_year' then 4000
      else 500
    end
  );

create or replace function public.redeem_shop_item(p_username text, p_item_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_username text := lower(btrim(coalesce(p_username, '')));
  redemption public.shop_redemptions%rowtype;
  current_balance numeric(18, 6);
  item_cost integer := case
    when p_item_key = 'discord_nitro_month' then 400
    when p_item_key = 'discord_nitro_year' then 4000
    when p_item_key = 'lichess_patron_month' then 600
    when p_item_key = 'next_prize_tournament_format' then 1500
    else 500
  end;
begin
  if p_item_key not in (
    'discord_nitro_month',
    'discord_nitro_year',
    'flowers_500',
    'lichess_patron_month',
    'next_prize_tournament_format'
  ) then
    raise exception 'Unknown shop item';
  end if;

  insert into public.shop_redemptions (username, item_key, cost)
  values (normalized_username, p_item_key, item_cost)
  returning * into redemption;

  current_balance := public.apply_coin_transaction(
    normalized_username,
    -redemption.cost::numeric,
    'shop_redemption',
    'redemption:' || redemption.id,
    jsonb_build_object(
      'redemptionId', redemption.id,
      'itemKey', p_item_key,
      'cost', redemption.cost
    ),
    redemption.created_at
  );

  insert into public.notifications (
    recipient_username,
    actor_username,
    notification_type,
    puzzle_id,
    comment_id,
    shop_item_key,
    redemption_id
  ) values (
    'seaside_tiramisu',
    normalized_username,
    'shop_redemption',
    null,
    null,
    p_item_key,
    redemption.id
  );

  return jsonb_build_object(
    'balance', current_balance,
    'redemptionId', redemption.id,
    'status', redemption.status
  );
end;
$$;

revoke all on function public.redeem_shop_item(text, text)
  from public, anon, authenticated;
grant execute on function public.redeem_shop_item(text, text)
  to service_role;

commit;

notify pgrst, 'reload schema';
