-- Apply to the current database in Firefox. This credential can only set AWC kickoff times.
begin;

create table if not exists public.awc_2026_schedule_receipts (
  fixture_id text primary key,
  scheduled_at timestamptz not null,
  source_post_id text not null,
  source_posted_at timestamptz not null,
  source_url text not null,
  updated_at timestamptz not null default now()
);
alter table public.awc_2026_schedule_receipts enable row level security;
revoke all on public.awc_2026_schedule_receipts from public, anon, authenticated;

create or replace function public.apply_awc_2026_schedule(
  p_fixture_id text, p_p1 text, p_p2 text,
  p_expected_scheduled_at timestamptz, p_scheduled_at timestamptz,
  p_source_post_id text, p_source_posted_at timestamptz, p_source_url text,
  p_reschedule boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_token text := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb ->> 'x-awc-schedule-token';
  token_hash text;
  fixture public.tournament_matches%rowtype;
  receipt public.awc_2026_schedule_receipts%rowtype;
begin
  if worker_token is null or worker_token !~ '^[0-9a-f]{64}$' then
    raise insufficient_privilege using message = 'Invalid AWC scheduling credential';
  end if;
  select decrypted_secret into token_hash from vault.decrypted_secrets
  where name = 'awc_2026_schedule_worker_sha256';
  if token_hash is null or encode(sha256(convert_to(worker_token, 'UTF8')), 'hex') <> token_hash then
    raise insufficient_privilege using message = 'Invalid AWC scheduling credential';
  end if;
  if now() >= timestamptz '2026-12-09 00:00:00+00' then
    raise exception 'AWC scheduling window ended';
  end if;
  -- A live run can verify its restricted credential even when there are no new schedules.
  if p_fixture_id is null and p_p1 is null and p_p2 is null
    and p_expected_scheduled_at is null and p_scheduled_at is null
    and p_source_post_id is null and p_source_posted_at is null
    and p_source_url is null and p_reschedule = false then
    return 'credential verified';
  end if;
  if p_scheduled_at is null or p_scheduled_at <= now() or p_scheduled_at > now() + interval '21 days'
    or p_source_post_id is null or p_source_post_id !~ '^[A-Za-z0-9]{8}$'
    or p_source_posted_at is null or p_source_posted_at < timestamptz '2026-09-17 00:00:00+00'
    or p_source_posted_at > now() + interval '5 minutes'
    or p_source_url is null or p_source_url !~
      '^https://lichess[.]org/forum/team-atomic-wc/2026-awc-rounds-and-results[?]page=[0-9]+#[A-Za-z0-9]{8}$'
    or right(p_source_url, 8) <> p_source_post_id
    or p_reschedule is null
  then raise exception 'Invalid AWC scheduling payload'; end if;

  perform pg_advisory_xact_lock(hashtext('awc-2026-schedule-worker'));
  select * into strict fixture from public.tournament_matches
  where tournament = 'awc2026' and id = p_fixture_id for update;
  if fixture.p1 is distinct from p_p1 or fixture.p2 is distinct from p_p2
    or coalesce(fixture.p1, '') = '' or coalesce(fixture.p2, '') = ''
    or lower(fixture.p1) in ('bye','tbd') or lower(fixture.p2) in ('bye','tbd')
    or lower(fixture.p1) = lower(fixture.p2)
    or fixture.played_on is not null or coalesce(fixture.match_id, '') <> ''
    or coalesce(fixture.outcome_type, '') <> '' or coalesce(fixture.s1, 0) <> 0 or coalesce(fixture.s2, 0) <> 0
  then raise exception 'AWC match changed or is already played'; end if;

  select * into receipt from public.awc_2026_schedule_receipts where fixture_id = p_fixture_id;
  if receipt.source_posted_at >= p_source_posted_at then
    if receipt.scheduled_at = p_scheduled_at then return 'unchanged'; end if;
    return 'stale announcement';
  end if;
  if fixture.scheduled_at is distinct from p_expected_scheduled_at then
    raise exception 'AWC kickoff changed during polling';
  end if;
  if fixture.scheduled_at is not null and fixture.scheduled_at <> p_scheduled_at and not p_reschedule then
    raise exception 'Changed kickoff requires an explicit reschedule';
  end if;

  if fixture.scheduled_at is distinct from p_scheduled_at then
    update public.tournament_matches set scheduled_at = p_scheduled_at
    where tournament = 'awc2026' and id = p_fixture_id;
  end if;
  insert into public.awc_2026_schedule_receipts
    (fixture_id, scheduled_at, source_post_id, source_posted_at, source_url)
  values (p_fixture_id, p_scheduled_at, p_source_post_id, p_source_posted_at, p_source_url)
  on conflict (fixture_id) do update set
    scheduled_at = excluded.scheduled_at, source_post_id = excluded.source_post_id,
    source_posted_at = excluded.source_posted_at, source_url = excluded.source_url, updated_at = now();
  return 'applied';
end;
$$;
revoke all on function public.apply_awc_2026_schedule(text,text,text,timestamptz,timestamptz,text,timestamptz,text,boolean) from public;
grant execute on function public.apply_awc_2026_schedule(text,text,text,timestamptz,timestamptz,text,timestamptz,text,boolean) to anon;
notify pgrst, 'reload schema';
commit;
