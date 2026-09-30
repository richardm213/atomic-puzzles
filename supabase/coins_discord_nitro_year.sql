-- Add a one-year Discord Nitro reward priced at 4,000 coins.
begin;

alter table public.shop_redemptions
  drop constraint if exists shop_redemptions_item_key_check;
alter table public.shop_redemptions
  add constraint shop_redemptions_item_key_check check (
    item_key in (
      'discord_nitro_month',
      'discord_nitro_year',
      'flowers_500',
      'lichess_patron_month',
      'next_prize_tournament_format'
    )
  );

alter table public.shop_redemptions
  drop constraint if exists shop_redemptions_cost_check;
alter table public.shop_redemptions
  add constraint shop_redemptions_cost_check check (
    (item_key = 'discord_nitro_month' and cost in (400, 500))
    or (item_key = 'discord_nitro_year' and cost in (4000, 5000))
    or (item_key = 'lichess_patron_month' and cost in (500, 600))
    or (item_key = 'next_prize_tournament_format' and cost in (500, 1000))
    or (
      item_key not in (
        'discord_nitro_month',
        'discord_nitro_year',
        'lichess_patron_month',
        'next_prize_tournament_format'
      )
      and cost = 500
    )
  );

create or replace function public.redeem_shop_item(p_username text, p_item_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  normalized_username text := lower(btrim(coalesce(p_username, '')));
  redemption public.shop_redemptions%rowtype;
  current_balance integer;
  item_cost integer := case
    when p_item_key = 'discord_nitro_month' then 400
    when p_item_key = 'discord_nitro_year' then 4000
    when p_item_key = 'lichess_patron_month' then 600
    when p_item_key = 'next_prize_tournament_format' then 1000
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
    -redemption.cost,
    'shop_redemption',
    'redemption:' || redemption.id,
    jsonb_build_object('redemptionId', redemption.id, 'itemKey', p_item_key, 'cost', redemption.cost),
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
    'admin',
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

revoke all on function public.redeem_shop_item(text, text) from public, anon, authenticated;
grant execute on function public.redeem_shop_item(text, text) to service_role;

notify pgrst, 'reload schema';
commit;
