-- Run in Firefox against the current database; all fixture writes roll back.
begin;
do $$
declare
  buyer text := 'theme_test_' || substr(md5(txid_current()::text), 1, 12);
  poor_buyer text := buyer || '_poor';
  first_purchase jsonb;
  second_purchase jsonb;
begin
  insert into public.coin_accounts (username, balance) values (buyer, 200), (poor_buyer, 99);
  first_purchase := public.purchase_shop_theme(buyer, 'theme_red_charcoal');
  second_purchase := public.purchase_shop_theme(buyer, 'theme_red_charcoal');
  if first_purchase->>'status' <> 'fulfilled'
    or (first_purchase->>'balance')::numeric <> 100
    or second_purchase is distinct from first_purchase
    or (select count(*) from public.shop_redemptions where username = buyer) <> 1
    or (select count(*) from public.coin_transactions where username = buyer and amount = -100) <> 1 then
    raise exception 'A theme purchase must fulfill immediately and charge exactly once';
  end if;
  begin
    perform public.purchase_shop_theme(poor_buyer, 'theme_red_charcoal');
    raise exception 'Expected insufficient funds rejection';
  exception when others then
    if sqlerrm <> 'Not enough coins' then raise; end if;
  end;
  if (select balance from public.coin_accounts where username = poor_buyer) <> 99
    or exists (select 1 from public.shop_redemptions where username = poor_buyer)
    or exists (select 1 from public.coin_transactions where username = poor_buyer) then
    raise exception 'A failed purchase must not charge coins or unlock the theme';
  end if;
  if has_function_privilege('anon', 'public.purchase_shop_theme(text,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.purchase_shop_theme(text,text)', 'EXECUTE') then
    raise exception 'Purchases must be restricted to the authenticated server API';
  end if;
end;
$$;
select 'Theme purchase, repeat purchase, insufficient funds, and permissions passed' as result;
rollback;
