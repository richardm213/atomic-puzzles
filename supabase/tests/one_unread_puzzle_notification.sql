-- Run in Firefox on the current database after one_unread_puzzle_notification.sql. Always rolls back.
begin;
insert into public.users(id,username)overriding system value values(-17771778,'notification_test_20261119');
do $$
declare puzzle bigint; comment bigint; actor text; first_id bigint; delivered integer;
begin
 select c.target_id::bigint,c.id,c.username into strict puzzle,comment,actor
 from public.community_comments c join public.puzzles p on p.id::text=c.target_id
 where c.target_type='puzzle'and p.deleted_at is null order by c.id limit 1;
 insert into public.notifications(recipient_username,actor_username,notification_type,puzzle_id,comment_id)
 values('notification_test_20261119',actor,'puzzle_comment',puzzle,comment)returning id into first_id;
 insert into public.notifications(recipient_username,actor_username,notification_type,puzzle_id,comment_id)
 values('notification_test_20261119',actor,'comment_reply',puzzle,comment),
 ('notification_test_20261119',actor,'comment_mention',puzzle,comment);
 get diagnostics delivered=row_count;
 if delivered<>0 then raise exception 'Replies and mentions bypassed unread deduplication';end if;
 update public.notifications set read_at=now()where id=first_id;
 insert into public.notifications(recipient_username,actor_username,notification_type,puzzle_id,comment_id)
 values('notification_test_20261119',actor,'comment_reply',puzzle,comment);
 get diagnostics delivered=row_count;
 if delivered<>1 then raise exception 'Opening the existing notification did not free the puzzle slot';end if;
 if(select count(*)from public.notifications where recipient_username='notification_test_20261119'and read_at is null)<>1 then
  raise exception 'Unexpected unread notification count';end if;
end $$;
select jsonb_build_object('passed',true,'cases',array['reply/mention share the unread puzzle slot','opening it allows a later notification'])as test_result;
rollback;
