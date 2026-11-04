begin;

create table if not exists public.player_social_profiles (
  username text primary key,
  flair text,
  archive_start_date date,
  total_games bigint not null default 0 check (total_games >= 0),
  updated_at timestamptz not null default now(),
  constraint player_social_profiles_username_check
    check (username = lower(btrim(username)) and username ~ '^[a-z0-9_-]{1,100}$'),
  constraint player_social_profiles_flair_length_check
    check (flair is null or char_length(flair) between 1 and 8)
);

create table if not exists public.player_follows (
  follower_username text not null,
  followed_username text not null,
  created_at timestamptz not null default now(),
  primary key (follower_username, followed_username),
  constraint player_follows_no_self_check check (follower_username <> followed_username),
  constraint player_follows_follower_check
    check (follower_username = lower(btrim(follower_username)) and follower_username ~ '^[a-z0-9_-]{1,100}$'),
  constraint player_follows_followed_check
    check (followed_username = lower(btrim(followed_username)) and followed_username ~ '^[a-z0-9_-]{1,100}$')
);

create index if not exists player_follows_followed_idx
  on public.player_follows (followed_username, created_at desc);

alter table public.player_social_profiles enable row level security;
alter table public.player_follows enable row level security;
revoke all on public.player_social_profiles from anon, authenticated;
revoke all on public.player_follows from anon, authenticated;
grant select (username, flair) on public.player_social_profiles to anon, authenticated;

create or replace function public.add_default_player_follows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.player_follows (follower_username, followed_username)
  select lower(btrim(new.username)), default_username
  from unnest(array['admin', 'seaside_tiramisu']) as default_username
  where lower(btrim(new.username)) <> default_username
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists users_add_default_player_follows on public.users;
create trigger users_add_default_player_follows
after insert on public.users
for each row execute function public.add_default_player_follows();

insert into public.player_follows (follower_username, followed_username)
select lower(btrim(users.username)), defaults.username
from public.users
cross join (values ('admin'), ('seaside_tiramisu')) as defaults(username)
where lower(btrim(users.username)) <> defaults.username
on conflict do nothing;

commit;
