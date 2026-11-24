-- Scheduling worker and manual kickoff edits share one atomic expiry rule.
begin;

-- Explicit links extend the standard match-ID rule to match-specific props.
create table if not exists public.prediction_market_fixture_links (
  market_id text not null references public.prediction_markets(id) on delete cascade,
  tournament text not null,
  fixture_id text not null,
  primary key (market_id, tournament, fixture_id),
  foreign key (tournament, fixture_id) references public.tournament_matches(tournament, id) on delete cascade
);
alter table public.prediction_market_fixture_links enable row level security;
revoke all on public.prediction_market_fixture_links from public, anon, authenticated;
grant all on public.prediction_market_fixture_links to service_role;

drop trigger if exists prediction_orders_cap_awc_champion_expiry on public.prediction_orders;
drop trigger if exists tournament_matches_refresh_awc_champion_expiry on public.tournament_matches;
drop function if exists public.cap_awc_champion_admin_quote_expiry();
drop function if exists public.refresh_awc_champion_admin_quote_expiry();
drop function if exists public.next_awc_2026_kickoff();

create or replace function public.awc_2026_market_kickoff(p_market_id text)
returns timestamptz
language sql stable
set search_path = ''
as $$
  select min(f.scheduled_at)
  from public.tournament_matches f
  join public.prediction_markets m on m.id = p_market_id and (
    m.id = 'awc2026-' || f.id
    or exists (select 1 from public.prediction_market_fixture_links l
      where l.market_id = m.id and l.tournament = f.tournament and l.fixture_id = f.id)
    or (m.group_id = 'awc-2026-champion' and lower(btrim(m.display_name)) in
      (lower(btrim(f.p1)), lower(btrim(f.p2))))
  )
  where f.tournament = 'awc2026' and f.scheduled_at is not null
    and f.played_on is null and coalesce(f.match_id, '') = ''
    and coalesce(f.outcome_type, '') = ''
    and coalesce(f.s1, 0) = 0 and coalesce(f.s2, 0) = 0;
$$;

create or replace function public.cap_awc_scheduled_admin_order_expiry()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare kickoff timestamptz;
begin
  if new.username = 'prediction_admin'
    and new.status in ('open', 'partial') and new.remaining_quantity > 0 then
    kickoff := public.awc_2026_market_kickoff(new.market_id);
    if kickoff is not null then new.expires_at := least(new.expires_at, kickoff); end if;
  end if;
  return new;
end;
$$;

create or replace function public.sync_awc_2026_admin_order_expiry(p_fixture_id text)
returns table(order_id bigint, market_id text, previous_expires_at timestamptz, expires_at timestamptz)
language sql security definer
set search_path = ''
as $$
  with eligible as materialized (
    select o.id, o.expires_at as previous_expiry,
      public.awc_2026_market_kickoff(m.id) as kickoff
    from public.tournament_matches f
    join public.prediction_markets m on m.status = 'open' and (
      m.id = 'awc2026-' || f.id
      or exists (select 1 from public.prediction_market_fixture_links l
        where l.market_id = m.id and l.tournament = f.tournament and l.fixture_id = f.id)
      or (m.group_id = 'awc-2026-champion' and lower(btrim(m.display_name)) in
        (lower(btrim(f.p1)), lower(btrim(f.p2))))
    )
    join public.prediction_orders o on o.market_id = m.id
    where f.tournament = 'awc2026' and f.id = p_fixture_id and f.scheduled_at > now()
      and f.played_on is null and coalesce(f.match_id, '') = ''
      and coalesce(f.outcome_type, '') = '' and coalesce(f.s1, 0) = 0 and coalesce(f.s2, 0) = 0
      and o.username = 'prediction_admin' and o.status in ('open', 'partial')
      and o.remaining_quantity > 0 and (o.expires_at is null or o.expires_at > now())
    for update of o
  )
  update public.prediction_orders o set expires_at = e.kickoff, updated_at = now()
  from eligible e where o.id = e.id and e.kickoff is not null
    and o.expires_at is distinct from e.kickoff
  returning o.id, o.market_id, e.previous_expiry, o.expires_at;
$$;

create or replace function public.refresh_awc_scheduled_admin_order_expiry()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.tournament = 'awc2026' then
    perform public.sync_awc_2026_admin_order_expiry(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists prediction_orders_cap_awc_scheduled_expiry on public.prediction_orders;
create trigger prediction_orders_cap_awc_scheduled_expiry
before insert or update of market_id, username, expires_at, status on public.prediction_orders
for each row execute function public.cap_awc_scheduled_admin_order_expiry();

drop trigger if exists tournament_matches_refresh_awc_scheduled_expiry on public.tournament_matches;
create trigger tournament_matches_refresh_awc_scheduled_expiry
after insert or update of scheduled_at on public.tournament_matches
for each row execute function public.refresh_awc_scheduled_admin_order_expiry();

revoke all on function public.awc_2026_market_kickoff(text),
  public.cap_awc_scheduled_admin_order_expiry(), public.sync_awc_2026_admin_order_expiry(text),
  public.refresh_awc_scheduled_admin_order_expiry() from public, anon, authenticated;
grant execute on function public.sync_awc_2026_admin_order_expiry(text) to service_role;

insert into public.prediction_market_fixture_links (market_id, tournament, fixture_id)
select m.id, f.tournament, f.id
from (values
  ('awc-2026-semifinal-jude-3-plus-points', 'wb-r3-m2'),
  ('awc2026-lb-r3-m1-quasabianth-plus-2', 'lb-r3-m1'),
  ('awc2026-lb-r3-m1-rechesster-6-0', 'lb-r3-m1')
) as links(market_id, fixture_id)
join public.prediction_markets m on m.id = links.market_id
join public.tournament_matches f on f.tournament = 'awc2026' and f.id = links.fixture_id
on conflict do nothing;

-- Only currently active quotes are changed: expired/cancelled orders are never revived.
select changed.* from public.tournament_matches f
cross join lateral public.sync_awc_2026_admin_order_expiry(f.id) changed
where f.tournament = 'awc2026' and f.scheduled_at > now();
commit;
