begin;

alter table public.notifications
  add column if not exists rating integer,
  add column if not exists rating_deviation integer;

alter table public.notifications
  drop constraint if exists notifications_notification_type_check,
  add constraint notifications_notification_type_check
    check (notification_type in (
      'puzzle_comment',
      'comment_reply',
      'puzzle_approved',
      'puzzle_rating_added'
    )),
  drop constraint if exists notifications_shape_check,
  add constraint notifications_shape_check check (
    (notification_type in ('puzzle_comment', 'comment_reply')
      and actor_username is not null
      and comment_id is not null)
    or (notification_type = 'puzzle_approved'
      and actor_username is null
      and comment_id is null)
    or (notification_type = 'puzzle_rating_added'
      and actor_username is null
      and comment_id is null
      and rating is not null
      and rating_deviation is not null)
  ),
  drop constraint if exists notifications_rating_check,
  add constraint notifications_rating_check
    check (rating is null or rating between 800 and 3200),
  drop constraint if exists notifications_rating_deviation_check,
  add constraint notifications_rating_deviation_check
    check (rating_deviation is null or rating_deviation between 50 and 350),
  drop constraint if exists notifications_puzzle_rating_payload_check,
  add constraint notifications_puzzle_rating_payload_check check (
    notification_type <> 'puzzle_rating_added'
    or (rating is not null and rating_deviation is not null)
  );

create unique index if not exists notifications_one_puzzle_rating_launch_per_user
  on public.notifications (recipient_username, notification_type)
  where notification_type = 'puzzle_rating_added';

notify pgrst, 'reload schema';
commit;
