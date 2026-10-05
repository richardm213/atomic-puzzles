-- Route every future shop-purchase notification to seaside_tiramisu.
-- Keeping this at the notifications boundary covers every redemption RPC,
-- including shop items added after this migration.
begin;

create or replace function public.route_shop_redemption_notification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.notification_type = 'shop_redemption' then
    new.recipient_username := 'seaside_tiramisu';
  end if;
  return new;
end;
$$;

drop trigger if exists route_shop_redemption_notification on public.notifications;
create trigger route_shop_redemption_notification
before insert on public.notifications
for each row
execute function public.route_shop_redemption_notification();

commit;
