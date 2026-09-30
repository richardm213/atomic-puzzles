with eligible as (
  select username, rating, rating_deviation
  from public.puzzle_user_ratings
  where attempts > 0
), ensured_users as (
  -- Some solvers predate the users table. Preserve their existing usernames
  -- so the notification recipient foreign key can represent them.
  insert into public.users (username)
  select username from eligible
  on conflict (username) do nothing
  returning username
), inserted as (
  insert into public.notifications (
    recipient_username,
    actor_username,
    notification_type,
    puzzle_id,
    comment_id,
    rating,
    rating_deviation
  )
  select
    eligible.username,
    null,
    'puzzle_rating_added',
    4,
    null,
    eligible.rating,
    eligible.rating_deviation
  from eligible
  where not exists (
    select 1
    from public.notifications existing
    where existing.recipient_username = eligible.username
      and existing.notification_type = 'puzzle_rating_added'
  )
  returning id
)
select count(*)::integer as notifications_sent
from inserted;
