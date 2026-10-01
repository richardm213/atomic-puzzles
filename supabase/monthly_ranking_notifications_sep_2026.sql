-- Add September 2026 Blitz, Bullet, and Hyper ranking notifications for every registered user.
-- Rankings were read from the production archive leaderboard after the month closed.
begin;

alter table public.notifications
  add column if not exists ranking_period date,
  add column if not exists ranking_mode text,
  add column if not exists ranking_position integer;

alter table public.notifications
  drop constraint if exists notifications_notification_type_check;
alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in (
    'puzzle_comment', 'comment_reply', 'puzzle_approved', 'puzzle_rating_added',
    'shop_redemption', 'coin_gift', 'coin_request', 'monthly_ranking'
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
  );

alter table public.notifications
  drop constraint if exists notifications_ranking_mode_check,
  add constraint notifications_ranking_mode_check
    check (ranking_mode is null or ranking_mode in ('blitz', 'bullet', 'hyperbullet')),
  drop constraint if exists notifications_ranking_position_check,
  add constraint notifications_ranking_position_check
    check (ranking_position is null or ranking_position > 0),
  drop constraint if exists notifications_ranking_period_check,
  add constraint notifications_ranking_period_check
    check (ranking_period is null or ranking_period = date_trunc('month', ranking_period)::date),
  drop constraint if exists notifications_ranking_payload_check,
  add constraint notifications_ranking_payload_check check (
    notification_type = 'monthly_ranking'
    or (ranking_period is null and ranking_mode is null and ranking_position is null)
  );

create unique index if not exists notifications_one_monthly_ranking_per_mode
  on public.notifications (recipient_username, notification_type, ranking_period, ranking_mode)
  where notification_type = 'monthly_ranking';

delete from public.notifications
where notification_type = 'monthly_ranking'
  and ranking_period = date '2026-09-01';

with canonical_aliases(recipient_username, canonical_username) as (
  values
    ('azrael_666', 'chessuxx'),
    ('cats_are_very_cute', 'studieb'),
    ('iberserkatomic', 'venusaurbeedrill'),
    ('loss_is_power', 'absolutelytrash'),
    ('mustacheparrot', 'chessuxx'),
    ('neoarcturus', 'rechesster'),
    ('nitrocoloraze', 'lesha2002'),
    ('ralionkaalyebenka', 'thuban'),
    ('sichuan_liangfen', 'seaside_tiramisu'),
    ('unique_openings', 'absolutelytrash'),
    ('vmalinovsky2009', 'the_best_of_best'),
    ('whatismymainbro', 'whatismynamebro'),
    ('whooooami', 'quasabianth'),
    ('zayashira', 'yash')
), placements(canonical_username, ranking_mode, ranking_position) as (
  values
    ('absolutelytrash', 'hyperbullet', 19),
    ('aeonneiro', 'bullet', 88),
    ('alphadream', 'blitz', 84),
    ('anonymously1234', 'blitz', 80),
    ('applauchew', 'bullet', 81),
    ('applauchew', 'hyperbullet', 92),
    ('balintakiraly', 'blitz', 131),
    ('balintakiraly', 'bullet', 147),
    ('balintakiraly', 'hyperbullet', 96),
    ('basilegg', 'blitz', 65),
    ('bigcoomer', 'blitz', 76),
    ('chessuxx', 'bullet', 22),
    ('chessuxx', 'hyperbullet', 31),
    ('dandan2016', 'bullet', 42),
    ('dandan2016', 'hyperbullet', 36),
    ('dani_cq_15', 'blitz', 144),
    ('dani_cq_15', 'bullet', 167),
    ('divagueur', 'blitz', 97),
    ('divagueur', 'bullet', 121),
    ('divagueur', 'hyperbullet', 73),
    ('equanimity8', 'blitz', 18),
    ('equanimity8', 'bullet', 44),
    ('ezratgreat', 'bullet', 50),
    ('ezratgreat', 'hyperbullet', 58),
    ('game_ender4', 'blitz', 128),
    ('gautham_a', 'hyperbullet', 20),
    ('goroarmet', 'blitz', 11),
    ('goroarmet', 'bullet', 31),
    ('goroarmet', 'hyperbullet', 35),
    ('henk_dekleerkast', 'bullet', 8),
    ('henk_dekleerkast', 'hyperbullet', 5),
    ('howlind', 'blitz', 14),
    ('howlind', 'bullet', 27),
    ('howlind', 'hyperbullet', 24),
    ('iagoluedersvega', 'blitz', 58),
    ('iagoluedersvega', 'bullet', 92),
    ('iagoluedersvega', 'hyperbullet', 76),
    ('iamplayingchesshere', 'bullet', 98),
    ('iamplayingchesshere', 'hyperbullet', 64),
    ('ihatespammers', 'bullet', 1),
    ('kuma0418', 'bullet', 49),
    ('laoswarrior', 'blitz', 31),
    ('laoswarrior', 'bullet', 35),
    ('laoswarrior', 'hyperbullet', 52),
    ('maracker', 'blitz', 7),
    ('maracker', 'bullet', 7),
    ('maracker', 'hyperbullet', 7),
    ('matvei-e2e4', 'blitz', 24),
    ('matvei-e2e4', 'bullet', 46),
    ('maxwellssilvrhammer', 'bullet', 4),
    ('maxwellssilvrhammer', 'hyperbullet', 1),
    ('mr-best', 'blitz', 83),
    ('mr-best', 'bullet', 103),
    ('mr-best', 'hyperbullet', 104),
    ('nrizwan', 'blitz', 117),
    ('nrizwan', 'bullet', 136),
    ('nrizwan', 'hyperbullet', 72),
    ('passionate_player', 'blitz', 46),
    ('paul8900', 'blitz', 37),
    ('paul8900', 'bullet', 48),
    ('paul8900', 'hyperbullet', 47),
    ('plzbeatme', 'hyperbullet', 23),
    ('quasabianth', 'blitz', 4),
    ('quasabianth', 'bullet', 10),
    ('quasabianth', 'hyperbullet', 10),
    ('rabbier', 'blitz', 13),
    ('rabbier', 'hyperbullet', 48),
    ('raviharav', 'bullet', 40),
    ('realitygambit', 'bullet', 79),
    ('rechesster', 'blitz', 2),
    ('rechesster', 'bullet', 5),
    ('rechesster', 'hyperbullet', 6),
    ('renaudmerle', 'blitz', 36),
    ('renaudmerle', 'bullet', 63),
    ('rkrounit', 'bullet', 11),
    ('rkrounit', 'hyperbullet', 2),
    ('rodrifk', 'hyperbullet', 43),
    ('seaside_tiramisu', 'blitz', 8),
    ('sile314', 'hyperbullet', 37),
    ('sircachetes', 'blitz', 12),
    ('sircachetes', 'bullet', 13),
    ('sircachetes', 'hyperbullet', 14),
    ('sl0thyy17', 'blitz', 113),
    ('the_nameless_knight', 'blitz', 145),
    ('theatomicstorm', 'bullet', 53),
    ('theatomicstorm', 'hyperbullet', 41),
    ('tnt2425', 'bullet', 26),
    ('tnt2425', 'hyperbullet', 29),
    ('venusaurbeedrill', 'blitz', 29),
    ('venusaurbeedrill', 'bullet', 41),
    ('venusaurbeedrill', 'hyperbullet', 22),
    ('whatismynamebro', 'bullet', 178),
    ('wolfram_ep', 'blitz', 3),
    ('wolfram_ep', 'bullet', 6),
    ('yehas', 'blitz', 177),
    ('yehas', 'bullet', 173)
)
insert into public.notifications (
  recipient_username,
  actor_username,
  notification_type,
  puzzle_id,
  comment_id,
  ranking_period,
  ranking_mode,
  ranking_position
)
select
  u.username,
  null,
  'monthly_ranking',
  null,
  null,
  date '2026-09-01',
  placements.ranking_mode,
  placements.ranking_position
from public.users u
left join canonical_aliases aliases
  on aliases.recipient_username = lower(btrim(u.username))
join placements
  on placements.canonical_username = coalesce(aliases.canonical_username, lower(btrim(u.username)))
on conflict (recipient_username, notification_type, ranking_period, ranking_mode)
  where notification_type = 'monthly_ranking'
do update set ranking_position = excluded.ranking_position;

notify pgrst, 'reload schema';
commit;
