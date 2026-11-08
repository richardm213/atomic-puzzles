-- Permanent theme purchases share the shop ledger and fulfill immediately.
begin;

do $$
declare
  constraint_name text;
  old_expression text;
begin
  foreach constraint_name in array array['shop_redemptions_item_key_check', 'shop_redemptions_cost_check'] loop
    select pg_get_expr(conbin, conrelid) into old_expression
    from pg_constraint
    where conrelid = 'public.shop_redemptions'::regclass and conname = constraint_name;
    if old_expression is null then
      raise exception 'Missing shop constraint %', constraint_name;
    end if;
    if strpos(old_expression, 'theme_red_charcoal') = 0 then
      execute format('alter table public.shop_redemptions drop constraint %I', constraint_name);
      execute format(
        'alter table public.shop_redemptions add constraint %I check ((item_key = ''theme_red_charcoal'' and cost = 100) or (item_key <> ''theme_red_charcoal'' and (%s)))',
        constraint_name, old_expression
      );
    end if;
  end loop;
end;
$$;

create unique index if not exists shop_redemptions_theme_owned_idx
  on public.shop_redemptions (username, item_key)
  where item_key = 'theme_red_charcoal' and status = 'fulfilled';

create or replace function public.purchase_shop_theme(p_username text, p_item_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_username text := lower(btrim(coalesce(p_username, '')));
  redemption public.shop_redemptions%rowtype;
  current_balance numeric(18, 6);
begin
  if normalized_username !~ '^[a-z0-9_-]{1,100}$' or p_item_key is distinct from 'theme_red_charcoal' then
    raise exception 'Invalid theme purchase';
  end if;

  perform pg_advisory_xact_lock(hashtext('shop-theme:' || normalized_username || ':' || p_item_key));
  select * into redemption from public.shop_redemptions
  where username = normalized_username and item_key = p_item_key and status = 'fulfilled';
  if found then
    select balance into current_balance from public.coin_accounts where username = normalized_username;
    return jsonb_build_object('balance', coalesce(current_balance, 0), 'redemptionId', redemption.id, 'status', 'fulfilled');
  end if;

  perform public.assert_coin_economy_access(normalized_username);
  insert into public.shop_redemptions (username, item_key, cost, status, fulfilled_at, fulfilled_by)
  values (normalized_username, p_item_key, 100, 'fulfilled', now(), normalized_username)
  returning * into redemption;

  current_balance := public.apply_coin_transaction(
    normalized_username, -100::numeric, 'shop_redemption', 'redemption:' || redemption.id,
    jsonb_build_object('redemptionId', redemption.id, 'itemKey', p_item_key, 'cost', 100), redemption.created_at
  );
  return jsonb_build_object('balance', current_balance, 'redemptionId', redemption.id, 'status', redemption.status);
end;
$$;

revoke all on function public.purchase_shop_theme(text, text) from public, anon, authenticated;
grant execute on function public.purchase_shop_theme(text, text) to service_role;

notify pgrst, 'reload schema';
commit;
