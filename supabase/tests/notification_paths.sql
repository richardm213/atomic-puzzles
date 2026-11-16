-- Apply notification_paths.sql first. All test notifications roll back.
begin;
do $$
declare
  notification_key text := 'notification-path-test:'||gen_random_uuid()::text;
  rejected boolean;
begin
  insert into public.notifications(recipient_username,notification_type,feature_key,feature_message,feature_path)
  values('admin','feature',notification_key,'Correction regression','/rankings/coins?view=transactions&player=admin');
  rejected:=false;
  begin
    update public.notifications set feature_path='https://example.com/coins' where feature_key=notification_key;
  exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'External feature link accepted'; end if;
  rejected:=false;
  begin
    update public.notifications set feature_message='' where feature_key=notification_key;
  exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Required notification payload was lost'; end if;
end;
$$;
rollback;
select 'PASS: internal query links accepted; external paths and missing payloads rejected' as result;
