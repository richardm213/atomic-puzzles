-- Apply in Firefox on the current database. Keep one unread notification per user/puzzle.
begin;
set local lock_timeout='5s';
lock table public.notifications in share row exclusive mode;
-- Keep the latest unread item. Preserve older items in the inbox as read history.
with ranked as(
 select id,row_number()over(partition by recipient_username,puzzle_id order by created_at desc,id desc)as position
 from public.notifications where puzzle_id is not null and read_at is null
)
update public.notifications n set read_at=clock_timestamp()from ranked r where n.id=r.id and r.position>1;

create or replace function public.keep_one_unread_puzzle_notification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.puzzle_id is not null and new.read_at is null then
  -- Serialize deliveries from separate comments, recipients lists, and notification types.
  perform pg_advisory_xact_lock(hashtextextended('unread-puzzle-notification:'||new.recipient_username||':'||new.puzzle_id::text,0));
  if exists(select 1 from public.notifications n where n.recipient_username=new.recipient_username
    and n.puzzle_id=new.puzzle_id and n.read_at is null)then return null;end if;
 end if;
 return new;
end;
$$;
revoke all on function public.keep_one_unread_puzzle_notification()from public,anon,authenticated;
-- Run after identity canonicalization, so aliases share the same notification slot.
drop trigger if exists zz_keep_one_unread_puzzle_notification on public.notifications;
create trigger zz_keep_one_unread_puzzle_notification before insert on public.notifications
for each row execute function public.keep_one_unread_puzzle_notification();
commit;
select jsonb_build_object('committed',true,'duplicate_groups',count(*))as verification
from(select recipient_username,puzzle_id from public.notifications where puzzle_id is not null and read_at is null
 group by recipient_username,puzzle_id having count(*)>1)duplicates;
