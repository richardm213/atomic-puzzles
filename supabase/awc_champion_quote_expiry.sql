-- A match anywhere in the AWC field can change every championship price.
-- Only admin liquidity is capped; filled positions and other users' orders are preserved.
begin;

create or replace function public.next_awc_2026_kickoff()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select min(scheduled_at)
  from public.tournament_matches
  where tournament = 'awc2026'
    and scheduled_at > now()
    and played_on is null
    and coalesce(match_id, '') = ''
    and coalesce(s1, 0) = 0 and coalesce(s2, 0) = 0;
$$;

create or replace function public.cap_awc_champion_admin_quote_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kickoff timestamptz;
begin
  if new.username = 'prediction_admin'
    and new.market_id like 'awc-2026-champion-%'
    and new.status in ('open', 'partial') and new.remaining_quantity > 0 then
    kickoff := public.next_awc_2026_kickoff();
    if kickoff is not null then
      new.expires_at := least(new.expires_at, kickoff);
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.refresh_awc_champion_admin_quote_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kickoff timestamptz;
begin
  if new.tournament = 'awc2026' then
    kickoff := public.next_awc_2026_kickoff();
    if kickoff is not null then
      update public.prediction_orders
      set expires_at = kickoff, updated_at = now()
      where username = 'prediction_admin'
        and market_id like 'awc-2026-champion-%'
        and status in ('open', 'partial') and remaining_quantity > 0
        and (expires_at is null or expires_at > kickoff);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prediction_orders_cap_awc_champion_expiry on public.prediction_orders;
create trigger prediction_orders_cap_awc_champion_expiry
before insert or update of market_id, username, expires_at, status
on public.prediction_orders
for each row execute function public.cap_awc_champion_admin_quote_expiry();

drop trigger if exists tournament_matches_refresh_awc_champion_expiry on public.tournament_matches;
create trigger tournament_matches_refresh_awc_champion_expiry
after insert or update of scheduled_at on public.tournament_matches
for each row execute function public.refresh_awc_champion_admin_quote_expiry();

revoke all on function public.next_awc_2026_kickoff(),
  public.cap_awc_champion_admin_quote_expiry(),
  public.refresh_awc_champion_admin_quote_expiry() from public, anon, authenticated;
grant execute on function public.next_awc_2026_kickoff() to service_role;

update public.prediction_orders
set expires_at = public.next_awc_2026_kickoff(), updated_at = now()
where username = 'prediction_admin'
  and market_id like 'awc-2026-champion-%'
  and status in ('open', 'partial') and remaining_quantity > 0
  and public.next_awc_2026_kickoff() is not null
  and (expires_at is null or expires_at > public.next_awc_2026_kickoff());

commit;
