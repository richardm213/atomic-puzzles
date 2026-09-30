-- Atomic Puzzles achievements: Supabase-owned catalog, permanent unlocks, and puzzle triggers.
-- Rating unlocks are evaluated against the Turso archive by the achievements function because
-- match ratings do not live in Supabase. Once inserted here, an unlock is never removed.
begin;

create table if not exists public.badge_tiers (
  key text primary key,
  name text not null unique,
  rank smallint not null unique check (rank between 1 and 7),
  description text not null
);

insert into public.badge_tiers (key, name, rank, description) values
  ('meteorite', 'Meteorite', 1, 'The first mark in a new achievement path.'),
  ('moon', 'Moon', 2, 'A steady orbit built through repeat effort.'),
  ('planet', 'Planet', 3, 'A substantial milestone with its own gravity.'),
  ('sun', 'Sun', 4, 'A bright achievement reached by dedicated players.'),
  ('eclipse', 'Eclipse', 5, 'A rare milestone that stands out across the site.'),
  ('nova', 'Nova', 6, 'An exceptional achievement at the edge of mastery.'),
  ('black_hole', 'Black Hole', 7, 'The highest tier in an achievement path.')
on conflict (key) do update set name=excluded.name, rank=excluded.rank, description=excluded.description;

create table if not exists public.badges (
  key text primary key,
  category text not null check (category in ('attempted','correct','created','blitz','bullet','hyperbullet')),
  threshold integer not null check (threshold > 0),
  name text not null,
  description text not null,
  tier text not null references public.badge_tiers(key),
  tier_level smallint not null default 1 check (tier_level > 0),
  icon_key text not null check (icon_key in ('attempted','correct','created','blitz','bullet','hyperbullet')),
  sort_order integer not null unique,
  active boolean not null default true,
  unique (category, threshold)
);

with puzzle_families as (
  select * from (values
    ('attempted', 0, array['First Spark','Warm Fuse','Active Circuit','Puzzle Current','Live Wire','Power Grid','Atomic Dynamo']),
    ('correct', 100, array['First Detonation','Clean Sequence','Chain Reaction','Critical Mass','Reactor Core','Precision Engine','Solution Singularity']),
    ('created', 200, array['First Blueprint','Puzzle Tinkerer','Position Smith','Workshop Lead','Puzzle Architect','Master Builder','Atomic Foundry'])
  ) family(category, sort_base, names)
), puzzle_rows as (
  select family.category, threshold.value, family.names[threshold.ordinality] name,
    (array['meteorite','moon','planet','sun','eclipse','nova','black_hole'])[threshold.ordinality] tier,
    family.sort_base + threshold.ordinality::integer sort_order
  from puzzle_families family
  cross join unnest(array[1,10,50,100,250,500,1000]) with ordinality threshold(value, ordinality)
), puzzle_catalog as (
  select category || '-' || value key, category, value threshold, name,
    case category
      when 'attempted' then 'Attempt ' || value || case when value=1 then ' puzzle.' else ' puzzles.' end
      when 'correct' then 'Solve ' || value || case when value=1 then ' puzzle' else ' puzzles' end || ' correctly on the first attempt.'
      else 'Create ' || value || case when value=1 then ' published puzzle.' else ' published puzzles.' end
    end description,
    tier, 1::smallint tier_level, category icon_key, sort_order
  from puzzle_rows
), rating_families as (
  select * from (values ('blitz','Blitz',300),('bullet','Bullet',400),('hyperbullet','Hyper',500))
  family(category, label, sort_base)
), rating_rows as (
  select family.category, family.label, threshold.value, threshold.ordinality::integer ordinal,
    family.sort_base,
    (array['Cadet','Striker','Specialist','Tactician','Expert','Master','Vanguard','Elite','Champion','Luminary','Paragon','Titan','Legend','Mythic','Grandmaster','Atomic Sovereign'])[threshold.ordinality] name,
    (array['meteorite','meteorite','moon','moon','planet','planet','sun','sun','sun','eclipse','eclipse','eclipse','nova','nova','black_hole','black_hole'])[threshold.ordinality] tier,
    (array[1,2,1,2,1,2,1,2,3,1,2,3,1,2,1,2])[threshold.ordinality] tier_level
  from rating_families family
  cross join unnest(array[1500,1600,1700,1800,1900,2000,2050,2100,2150,2200,2250,2300,2350,2400,2450,2500]) with ordinality threshold(value, ordinality)
), rating_catalog as (
  select category || '-' || value key, category, value threshold, label || ' ' || name name,
    'Reach ' || value || ' ' || label || ' rating with RD below 60.' description,
    tier, tier_level::smallint, category icon_key, sort_base + ordinal sort_order
  from rating_rows
), catalog as (
  select * from puzzle_catalog union all select * from rating_catalog
)
insert into public.badges (key,category,threshold,name,description,tier,tier_level,icon_key,sort_order)
select key,category,threshold,name,description,tier,tier_level,icon_key,sort_order from catalog
on conflict (key) do update set category=excluded.category, threshold=excluded.threshold,
  name=excluded.name, description=excluded.description, tier=excluded.tier,
  tier_level=excluded.tier_level, icon_key=excluded.icon_key, sort_order=excluded.sort_order, active=true;

create table if not exists public.user_badges (
  username text not null check (username=lower(btrim(username)) and length(username)>0),
  badge_key text not null,
  earned_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb,
  primary key (username,badge_key)
);
alter table public.user_badges drop constraint if exists user_badges_badge_key_fkey;
alter table public.user_badges add constraint user_badges_badge_key_fkey
  foreign key (badge_key) references public.badges(key);
create index if not exists user_badges_username_earned_idx
  on public.user_badges (username,earned_at desc,badge_key);

revoke all on table public.badge_tiers,public.badges,public.user_badges
  from public,anon,authenticated;

create or replace function public.unlock_puzzle_milestone_badges(
  p_username text,p_category text,p_value integer,p_evidence jsonb default '{}'::jsonb
) returns void language sql security definer set search_path=public as $$
  insert into public.user_badges (username,badge_key,evidence)
  select lower(btrim(p_username)),badges.key,
    coalesce(p_evidence,'{}'::jsonb) || jsonb_build_object(
      'category',p_category,'threshold',badges.threshold,'value',p_value)
  from public.badges
  where badges.active and badges.category=p_category and badges.threshold<=p_value
    and nullif(btrim(coalesce(p_username,'')),'') is not null
  on conflict (username,badge_key) do nothing;
$$;
revoke all on function public.unlock_puzzle_milestone_badges(text,text,integer,jsonb)
  from public,anon,authenticated;

create or replace function public.unlock_badges_after_puzzle_attempt()
returns trigger language plpgsql security definer set search_path=public as $$
declare attempted_count integer; correct_count integer;
begin
  select count(*)::integer,count(*) filter (where puzzle_correct)::integer
  into attempted_count,correct_count from public.puzzle_progress where username=new.username;
  perform public.unlock_puzzle_milestone_badges(
    new.username,'attempted',attempted_count,jsonb_build_object('puzzleId',new.puzzle_id));
  if new.puzzle_correct then
    perform public.unlock_puzzle_milestone_badges(
      new.username,'correct',correct_count,jsonb_build_object('puzzleId',new.puzzle_id));
  end if;
  return new;
end;
$$;
drop trigger if exists unlock_badges_after_puzzle_attempt on public.puzzle_progress;
create trigger unlock_badges_after_puzzle_attempt
  after insert or update of puzzle_correct on public.puzzle_progress
  for each row execute function public.unlock_badges_after_puzzle_attempt();

create or replace function public.unlock_badges_after_puzzle_created()
returns trigger language plpgsql security definer set search_path=public as $$
declare created_count integer;
begin
  if nullif(btrim(coalesce(new.author,'')),'') is not null then
    select count(*)::integer into created_count from public.puzzles
    where lower(btrim(author))=lower(btrim(new.author));
    perform public.unlock_puzzle_milestone_badges(
      new.author,'created',created_count,jsonb_build_object('puzzleId',new.id));
  end if;
  return new;
end;
$$;
drop trigger if exists unlock_badges_after_puzzle_created on public.puzzles;
create trigger unlock_badges_after_puzzle_created
  after insert on public.puzzles for each row execute function public.unlock_badges_after_puzzle_created();

with puzzle_stats as (
  select lower(btrim(username)) username,count(*)::integer attempted,
    count(*) filter (where puzzle_correct)::integer correct
  from public.puzzle_progress where nullif(btrim(username),'') is not null
  group by lower(btrim(username))
), created_stats as (
  select lower(btrim(author)) username,count(*)::integer created from public.puzzles
  where nullif(btrim(coalesce(author,'')),'') is not null group by lower(btrim(author))
), combined as (
  select coalesce(p.username,c.username) username,coalesce(p.attempted,0) attempted,
    coalesce(p.correct,0) correct,coalesce(c.created,0) created
  from puzzle_stats p full join created_stats c on c.username=p.username
), earned as (
  select combined.username,badges.key badge_key,
    case badges.category when 'attempted' then combined.attempted
      when 'correct' then combined.correct else combined.created end achievement_value,
    badges.threshold
  from combined join public.badges on badges.category in ('attempted','correct','created')
    and badges.threshold<=case badges.category when 'attempted' then combined.attempted
      when 'correct' then combined.correct else combined.created end
)
insert into public.user_badges (username,badge_key,evidence)
select username,badge_key,jsonb_build_object(
  'value',achievement_value,'threshold',threshold,'backfilled',true) from earned
on conflict (username,badge_key) do nothing;

notify pgrst,'reload schema';
commit;
