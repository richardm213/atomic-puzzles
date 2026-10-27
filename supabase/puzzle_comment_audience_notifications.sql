begin;

do $$
declare
  type_definition text;
  shape_definition text;
  type_expression text;
  shape_expression text;
begin
  select pg_get_constraintdef(oid)
  into type_definition
  from pg_constraint
  where conrelid = 'public.notifications'::regclass
    and conname = 'notifications_notification_type_check';

  select pg_get_constraintdef(oid)
  into shape_definition
  from pg_constraint
  where conrelid = 'public.notifications'::regclass
    and conname = 'notifications_shape_check';

  if type_definition is null or shape_definition is null then
    raise exception 'Expected notification constraints were not found';
  end if;

  if position('puzzle_attempt_comment' in type_definition) = 0
    or position('puzzle_author_comment' in type_definition) = 0 then
    type_expression := regexp_replace(type_definition, '^CHECK \((.*)\)$', '\1');
    shape_expression := regexp_replace(shape_definition, '^CHECK \((.*)\)$', '\1');

    alter table public.notifications
      drop constraint notifications_notification_type_check,
      drop constraint notifications_shape_check;

    execute format(
      'alter table public.notifications add constraint notifications_notification_type_check check ((%s) or notification_type in (%L, %L))',
      type_expression,
      'puzzle_attempt_comment',
      'puzzle_author_comment'
    );

    execute format(
      'alter table public.notifications add constraint notifications_shape_check check ((%s) or (notification_type in (%L, %L) and actor_username is not null and comment_id is not null and puzzle_id is not null))',
      shape_expression,
      'puzzle_attempt_comment',
      'puzzle_author_comment'
    );
  end if;
end
$$;

-- Reclassify existing follower notifications when the recipient has a more
-- specific relationship to a puzzle commented on during the last five days.
update public.notifications notification
set notification_type = 'puzzle_author_comment'
from public.community_comments comment
join public.puzzles puzzle on puzzle.id::text = comment.target_id
where notification.notification_type = 'puzzle_comment'
  and notification.comment_id = comment.id
  and comment.target_type = 'puzzle'
  and comment.target_context = ''
  and comment.created_at >= now() - interval '5 days'
  and lower(notification.recipient_username) = lower(puzzle.author)
  and lower(notification.recipient_username) <> lower(comment.username);

update public.notifications notification
set notification_type = 'puzzle_attempt_comment'
from public.community_comments comment
join public.puzzle_progress progress
  on progress.puzzle_id::text = comment.target_id
 and progress.first_attempt_at <= comment.created_at
where notification.notification_type = 'puzzle_comment'
  and notification.comment_id = comment.id
  and comment.target_type = 'puzzle'
  and comment.target_context = ''
  and comment.created_at >= now() - interval '5 days'
  and lower(notification.recipient_username) = lower(progress.username)
  and lower(notification.recipient_username) <> lower(comment.username)
  and not exists (
    select 1
    from public.puzzles puzzle
    where puzzle.id::text = comment.target_id
      and lower(puzzle.author) = lower(notification.recipient_username)
  );

-- Add notifications for creators and prior attempters who did not already
-- receive a mention, reply, or follower notification for the same comment.
insert into public.notifications (
  recipient_username,
  actor_username,
  notification_type,
  puzzle_id,
  comment_id,
  created_at
)
select
  lower(puzzle.author),
  comment.username,
  'puzzle_author_comment',
  puzzle.id,
  comment.id,
  comment.created_at
from public.community_comments comment
join public.puzzles puzzle on puzzle.id::text = comment.target_id
where comment.target_type = 'puzzle'
  and comment.target_context = ''
  and comment.created_at >= now() - interval '5 days'
  and lower(puzzle.author) <> lower(comment.username)
  and not exists (
    select 1
    from public.notifications existing
    where existing.comment_id = comment.id
      and lower(existing.recipient_username) = lower(puzzle.author)
  );

insert into public.notifications (
  recipient_username,
  actor_username,
  notification_type,
  puzzle_id,
  comment_id,
  created_at
)
select distinct
  lower(progress.username),
  comment.username,
  'puzzle_attempt_comment',
  puzzle.id,
  comment.id,
  comment.created_at
from public.community_comments comment
join public.puzzles puzzle on puzzle.id::text = comment.target_id
join public.puzzle_progress progress
  on progress.puzzle_id::text = comment.target_id
 and progress.first_attempt_at <= comment.created_at
where comment.target_type = 'puzzle'
  and comment.target_context = ''
  and comment.created_at >= now() - interval '5 days'
  and lower(progress.username) <> lower(comment.username)
  and lower(progress.username) <> lower(puzzle.author)
  and not exists (
    select 1
    from public.notifications existing
    where existing.comment_id = comment.id
      and lower(existing.recipient_username) = lower(progress.username)
  );

notify pgrst, 'reload schema';

commit;
