-- Add a structured 200-coin request for a 12-hour AtomicDB opening analysis.
begin;

alter table public.shop_redemptions
  add column if not exists request_details jsonb not null default '{}'::jsonb;

alter table public.shop_redemptions
  drop constraint if exists shop_redemptions_item_key_check;
alter table public.shop_redemptions
  add constraint shop_redemptions_item_key_check check (item_key in (
    'discord_nitro_month',
    'discord_nitro_year',
    'flowers_500',
    'lichess_patron_month',
    'next_prize_tournament_format',
    'atomicdb_analysis_12h'
  ));

alter table public.shop_redemptions
  drop constraint if exists shop_redemptions_cost_check;
alter table public.shop_redemptions
  add constraint shop_redemptions_cost_check check (
    (item_key = 'atomicdb_analysis_12h' and cost = 200)
    or (item_key = 'next_prize_tournament_format' and cost in (500, 1000))
    or (item_key = 'discord_nitro_month' and cost in (400, 500))
    or (item_key = 'discord_nitro_year' and cost in (4000, 5000))
    or (item_key = 'lichess_patron_month' and cost in (500, 600))
    or (item_key = 'flowers_500' and cost = 500)
  );

create or replace function public.request_atomicdb_analysis(
  p_username text,
  p_focus text,
  p_openings text[],
  p_players text[] default '{}'::text[]
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  normalized_username text := lower(btrim(coalesce(p_username, '')));
  clean_openings text[];
  clean_players text[];
  redemption public.shop_redemptions%rowtype;
  current_balance integer;
  notification_message text;
begin
  select coalesce(array_agg(btrim(value)), '{}'::text[])
  into clean_openings
  from unnest(coalesce(p_openings, '{}'::text[])) value
  where nullif(btrim(value), '') is not null;

  select coalesce(array_agg(lower(btrim(value))), '{}'::text[])
  into clean_players
  from unnest(coalesce(p_players, '{}'::text[])) value
  where nullif(btrim(value), '') is not null;

  if normalized_username = '' or p_focus not in ('higher_eval', 'player_lines') then
    raise exception 'Invalid AtomicDB analysis request';
  end if;
  if cardinality(clean_openings) < 1 or cardinality(clean_openings) > 5 then
    raise exception 'Between 1 and 5 openings are required';
  end if;
  if exists (select 1 from unnest(clean_openings) value where length(value) > 1000) then
    raise exception 'Opening input is too long';
  end if;
  if p_focus = 'higher_eval' and cardinality(clean_players) <> 0 then
    raise exception 'Higher-evaluation requests cannot include players';
  end if;
  if p_focus = 'player_lines' and (
    cardinality(clean_openings) <> 1
    or cardinality(clean_players) < 1
    or cardinality(clean_players) > 10
  ) then
    raise exception 'Player-line requests require one opening and 1 to 10 players';
  end if;
  if exists (
    select 1 from unnest(clean_players) value
    where value !~ '^[a-z0-9_-]{1,50}$'
  ) then
    raise exception 'Invalid Lichess username';
  end if;

  insert into public.shop_redemptions (username, item_key, cost, request_details)
  values (
    normalized_username,
    'atomicdb_analysis_12h',
    200,
    jsonb_build_object('focus', p_focus, 'openings', clean_openings, 'players', clean_players)
  )
  returning * into redemption;

  current_balance := public.apply_coin_transaction(
    normalized_username,
    -200,
    'shop_redemption',
    'redemption:' || redemption.id,
    jsonb_build_object(
      'redemptionId', redemption.id,
      'itemKey', redemption.item_key,
      'cost', redemption.cost,
      'focus', p_focus
    ),
    redemption.created_at
  );

  notification_message := case
    when p_focus = 'higher_eval' then
      'Higher evaluation · ' || cardinality(clean_openings) ||
      case when cardinality(clean_openings) = 1 then ' opening' else ' openings' end
    else
      'Player lines · ' || cardinality(clean_players) ||
      case when cardinality(clean_players) = 1 then ' player' else ' players' end
  end;

  insert into public.notifications (
    recipient_username,
    actor_username,
    notification_type,
    puzzle_id,
    comment_id,
    shop_item_key,
    redemption_id,
    coin_message
  ) values (
    'admin',
    normalized_username,
    'shop_redemption',
    null,
    null,
    redemption.item_key,
    redemption.id,
    notification_message
  );

  return jsonb_build_object(
    'balance', current_balance,
    'redemptionId', redemption.id,
    'status', redemption.status
  );
end;
$$;

revoke all on function public.request_atomicdb_analysis(text, text, text[], text[])
  from public, anon, authenticated;
grant execute on function public.request_atomicdb_analysis(text, text, text[], text[])
  to service_role;

notify pgrst, 'reload schema';
commit;
