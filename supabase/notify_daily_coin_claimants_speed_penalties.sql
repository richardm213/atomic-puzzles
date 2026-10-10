-- Notify every account that has claimed a daily bonus about puzzle speed penalties.
-- The partial unique index makes this announcement safe to rerun.
begin;

alter table public.notifications
  drop constraint if exists notifications_notification_type_check;
alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in (
    'puzzle_comment', 'comment_reply', 'puzzle_approved', 'puzzle_rating_added',
    'shop_redemption', 'coin_gift', 'coin_request', 'monthly_ranking',
    'coin_policy_update'
  ));

alter table public.notifications
  drop constraint if exists notifications_shape_check;
alter table public.notifications
  add constraint notifications_shape_check check (
    (notification_type in ('puzzle_comment', 'comment_reply') and actor_username is not null and comment_id is not null and puzzle_id is not null)
    or (notification_type = 'puzzle_approved' and actor_username is null and comment_id is null and puzzle_id is not null)
    or (notification_type = 'puzzle_rating_added' and actor_username is null and comment_id is null and rating is not null and rating_deviation is not null)
    or (notification_type = 'shop_redemption' and actor_username is not null and comment_id is null and puzzle_id is null and shop_item_key is not null and redemption_id is not null)
    or (notification_type = 'coin_gift' and actor_username is not null and puzzle_id is null and comment_id is null and coin_amount > 0 and coin_transfer_id is not null)
    or (notification_type = 'coin_request' and actor_username is not null and puzzle_id is null and comment_id is null and coin_amount > 0 and coin_request_id is not null)
    or (notification_type = 'monthly_ranking' and actor_username is null and puzzle_id is null and comment_id is null and ranking_period is not null and ranking_mode is not null)
    or (notification_type = 'coin_policy_update' and actor_username is null and puzzle_id is null and comment_id is null and nullif(btrim(coin_message), '') is not null)
  );

create unique index if not exists notifications_one_speed_penalty_update_per_user
  on public.notifications (recipient_username, notification_type)
  where notification_type = 'coin_policy_update';

insert into public.notifications (
  recipient_username,
  actor_username,
  notification_type,
  puzzle_id,
  comment_id,
  coin_message
)
select distinct
  transaction.username,
  null,
  'coin_policy_update',
  null,
  null,
  'Puzzle speed penalties are now active. Incorrect rated first attempts under 30 seconds receive an additional deduction. See the Earn Coins page for details.'
from public.coin_transactions transaction
where transaction.reason = 'daily_bonus'
on conflict (recipient_username, notification_type)
  where notification_type = 'coin_policy_update'
do nothing;

notify pgrst, 'reload schema';
commit;
