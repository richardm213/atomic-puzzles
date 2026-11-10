-- Apply in the current Supabase project before deploying the app without ban handling.
-- Patch the installed routines in place so later changes to prices, rewards and
-- order handling are preserved. Abort instead of dropping unknown dependencies.
begin;

do $migration$
declare
  routine record;
  definition text;
  updated_definition text;
  ban_reference constant text :=
    '(is_coin_economy_banned|assert_coin_economy_access|coin_economy_bans)';
begin
  for routine in
    select p.oid, p.proname
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.prosrc ~ ban_reference
      and p.proname not in (
        'is_coin_economy_banned', 'assert_coin_economy_access',
        'create_coin_economy_ban', 'revoke_coin_economy_ban'
      )
  loop
    definition := pg_catalog.pg_get_functiondef(routine.oid);
    updated_definition := definition;

    case routine.proname
      when 'get_coin_summary' then
        updated_definition := replace(updated_definition,
          '  active_ban public.coin_economy_bans%rowtype;' || chr(10), '');
        updated_definition := regexp_replace(updated_definition,
          '  select [*] into active_ban[[:space:]]+from public[.]coin_economy_bans ban[^;]+;[[:space:]]+', '  ');
        updated_definition := regexp_replace(updated_definition,
          'not claimed_today and active_ban[.]id is null,[[:space:]]*''economyBan'', case when active_ban[.]id is null then null else jsonb_build_object[(][^)]*[)] end',
          'not claimed_today');
      when 'apply_coin_transaction', 'purchase_shop_theme', 'place_prediction_order' then
        updated_definition := regexp_replace(updated_definition,
          '[[:space:]]+perform public[.]assert_coin_economy_access[(]normalized_username[)];', '', 'g');
      when 'award_coins_for_puzzle_attempt', 'award_coins_for_created_puzzle', 'cast_rewarded_puzzle_tag_vote' then
        updated_definition := regexp_replace(updated_definition,
          '[[:space:]]+(and not|or) public[.]is_coin_economy_banned[(][a-z_.]+[)]', '', 'g');
      else
        raise exception 'Unexpected coin economy ban dependency: %', routine.oid::regprocedure;
    end case;

    if updated_definition = definition or updated_definition ~ (ban_reference || '|active_ban') then
      raise exception 'Could not remove the coin economy ban dependency from %', routine.oid::regprocedure;
    end if;
    execute updated_definition;
  end loop;
end;
$migration$;

drop function if exists public.create_coin_economy_ban(text, timestamptz, text, text);
drop function if exists public.revoke_coin_economy_ban(bigint, text);
drop function if exists public.assert_coin_economy_access(text);
drop function if exists public.is_coin_economy_banned(text);
drop table if exists public.coin_economy_bans;

notify pgrst, 'reload schema';
commit;
