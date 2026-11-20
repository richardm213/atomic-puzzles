-- Allow replies in every discussion and notify profile owners without fabricating a puzzle ID.
begin;
do $$
declare definition text; expression text;
begin
  select pg_get_constraintdef(oid) into strict definition from pg_constraint
  where conrelid='public.notifications'::regclass and conname='notifications_notification_type_check';
  if position(quote_literal('profile_comment') in definition)=0 then
    expression:=substring(definition from 8 for length(definition)-8);
    alter table public.notifications drop constraint notifications_notification_type_check;
    execute 'alter table public.notifications add constraint notifications_notification_type_check check (('
      ||expression||') or notification_type=''profile_comment'')';
  end if;
  select pg_get_constraintdef(oid) into strict definition from pg_constraint
  where conrelid='public.notifications'::regclass and conname='notifications_shape_check';
  if position(quote_literal('profile_comment') in definition)=0 then
    expression:=substring(definition from 8 for length(definition)-8);
    alter table public.notifications drop constraint notifications_shape_check;
    execute 'alter table public.notifications add constraint notifications_shape_check check (('
      ||expression||') or (notification_type in(''comment_reply'',''profile_comment'')'
      ||' and actor_username is not null and comment_id is not null and puzzle_id is null'
      ||' and feature_path ~ ''^/[A-Za-z0-9_@%-][A-Za-z0-9_@%./-]*#comment-[0-9]+$''))';
  end if;
end $$;
commit;
