-- Apply in the current Supabase project. Until the Vault hash is configured,
-- no caller can publish. See docs/awc-2026-forum-worker.md.
begin;

create or replace function public.apply_awc_2026_forum_update(
  expected jsonb, patch jsonb, advance jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_token text := (current_setting('request.headers', true)::jsonb)->>'x-awc-bracket-token';
  token_hash text;
  fixture public.tournament_matches%rowtype;
  destination public.tournament_matches%rowtype;
  kickoff timestamptz;
  played_date date;
  score1 numeric;
  score2 numeric;
  archive_id text;
  winner text;
  loser text;
  entry jsonb;
  is_unplayed boolean;
  result_patch boolean := patch ? 's1';
  locked_rows integer;
begin
  if worker_token is null or worker_token !~ '^[0-9a-f]{64}$' then
    raise insufficient_privilege using message = 'Invalid AWC worker credential';
  end if;
  select decrypted_secret into token_hash
  from vault.decrypted_secrets where name = 'awc_2026_forum_worker_sha256';
  if token_hash is null or encode(sha256(convert_to(worker_token, 'UTF8')), 'hex') <> token_hash then
    raise insufficient_privilege using message = 'Invalid AWC worker credential';
  end if;

  -- Let a live run verify its credential without writing any rows.
  if expected = '{}'::jsonb and patch = '{}'::jsonb and advance = '[]'::jsonb then
    return true;
  end if;

  if expected is null or jsonb_typeof(expected) <> 'object'
    or patch is null or jsonb_typeof(patch) <> 'object'
    or advance is null or jsonb_typeof(advance) <> 'array'
    or jsonb_array_length(advance) > 2
    or coalesce(expected->>'id', '') !~ '^(wb-r[123]-m[1-8]|wb-final|lb-r[1-5]-m[1-4]|lb-final|grand-final-(set-1|reset))$'
  then
    raise exception 'Invalid AWC worker payload';
  end if;

  perform pg_advisory_xact_lock(hashtext('awc-2026-forum-worker'));

  -- A new database trigger must be reviewed before this credential can cause it
  -- to run. The worker must never settle markets indirectly.
  if exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.tournament_matches'::regclass
      and not tgisinternal and tgenabled in ('O', 'A') and (tgtype::integer & 16) <> 0
  ) then
    raise exception 'Tournament match update trigger requires manual review';
  end if;

  select * into strict fixture
  from public.tournament_matches
  where tournament = 'awc2026' and id = expected->>'id'
  for update;

  if (to_jsonb(fixture) - array(
    select k from jsonb_object_keys(to_jsonb(fixture)) as keys(k) where not (expected ? k)
  )) is distinct from expected
    or coalesce(fixture.p1, '') = '' or coalesce(fixture.p2, '') = ''
    or lower(fixture.p1) in ('bye', 'tbd') or lower(fixture.p2) in ('bye', 'tbd')
    or lower(fixture.p1) = lower(fixture.p2)
  then
    raise exception 'Bracket row changed or does not have two players';
  end if;

  is_unplayed := fixture.played_on is null and coalesce(fixture.outcome_type, '') = ''
    and coalesce(fixture.match_id, '') = '' and coalesce(fixture.s1, 0) = 0 and coalesce(fixture.s2, 0) = 0;

  if patch ? 'scheduled_at' and patch - 'scheduled_at' = '{}'::jsonb then
    kickoff := (patch->>'scheduled_at')::timestamptz;
    if not is_unplayed or fixture.scheduled_at is not null or kickoff is null
      or kickoff <= now() or kickoff > now() + interval '21 days' or advance <> '[]'::jsonb
    then
      raise exception 'Kickoff must be new, future, and for an unplayed match';
    end if;
    update public.tournament_matches set scheduled_at = kickoff
    where tournament = 'awc2026' and id = fixture.id;
    return true;
  end if;

  archive_id := patch->>'match_id';
  if result_patch and patch ?& array['s1', 's2', 'played_on', 'match_id']
    and patch - array['s1', 's2', 'played_on', 'match_id'] = '{}'::jsonb then
    score1 := (patch->>'s1')::numeric;
    score2 := (patch->>'s2')::numeric;
    played_date := (patch->>'played_on')::date;
    if not is_unplayed or archive_id is null or (archive_id <> '' and archive_id !~ '^[A-Za-z0-9]{8}$')
      or score1 is null or score2 is null or score1 = score2
      or score1 not between 0 and 99 or score2 not between 0 and 99
      or mod(score1, 0.5) <> 0 or mod(score2, 0.5) <> 0
      or played_date is null or played_date < date '2026-09-07' or played_date > (now() at time zone 'UTC')::date
    then
      raise exception 'Invalid result or already played';
    end if;
    winner := case when score1 > score2 then fixture.p1 else fixture.p2 end;
    loser := case when score1 > score2 then fixture.p2 else fixture.p1 end;

    for entry in select value from jsonb_array_elements(advance) loop
      if coalesce(entry->>'side', '') not in ('p1', 'p2')
        or coalesce(entry->>'id', '') !~ '^(wb-r[123]-m[1-8]|wb-final|lb-r[1-5]-m[1-4]|lb-final|grand-final-(set-1|reset))$'
        or entry->>'id' = fixture.id
        or not coalesce(case
          when fixture.id = 'grand-final-set-1' then score2 > score1 and entry->>'id' = 'grand-final-reset'
            and entry->>'player' = case when entry->>'side' = 'p1' then fixture.p1 else fixture.p2 end
          else (entry->>'id' = fixture.winner_to and entry->>'player' = winner)
            or (entry->>'id' = fixture.loser_to and entry->>'player' = loser)
        end, false)
      then
        raise exception 'Invalid advancement';
      end if;

      select * into strict destination from public.tournament_matches
      where tournament = 'awc2026' and id = entry->>'id' for update;
      if destination.played_on is not null or coalesce(destination.outcome_type, '') <> ''
        or coalesce(destination.match_id, '') <> '' or coalesce(destination.s1, 0) <> 0 or coalesce(destination.s2, 0) <> 0
        or coalesce(to_jsonb(destination)->>(entry->>'side'), '') <> ''
        or lower(coalesce(to_jsonb(destination)->>(case when entry->>'side' = 'p1' then 'p2' else 'p1' end), '')) = lower(entry->>'player')
      then
        raise exception 'Advancement slot is not available';
      end if;

      update public.tournament_matches
      set p1 = case when entry->>'side' = 'p1' then entry->>'player' else p1 end,
          p2 = case when entry->>'side' = 'p2' then entry->>'player' else p2 end
      where tournament = 'awc2026' and id = destination.id;
      get diagnostics locked_rows = row_count;
      if locked_rows <> 1 then raise exception 'Advancement update was not unique'; end if;
    end loop;

    update public.tournament_matches
    set s1 = score1, s2 = score2, played_on = played_date, match_id = archive_id
    where tournament = 'awc2026' and id = fixture.id;
  elsif patch ? 'match_id' and patch - 'match_id' = '{}'::jsonb
    and advance = '[]'::jsonb and archive_id ~ '^[A-Za-z0-9]{8}$'
    and fixture.played_on is not null and fixture.s1 <> fixture.s2
    and coalesce(fixture.outcome_type, '') = '' and coalesce(fixture.match_id, '') = ''
  then
    update public.tournament_matches set match_id = archive_id
    where tournament = 'awc2026' and id = fixture.id;
  else
    raise exception 'Unsupported AWC bracket update';
  end if;
  get diagnostics locked_rows = row_count;
  if locked_rows <> 1 then raise exception 'Result update was not unique'; end if;
  return true;
end;
$$;

revoke all on function public.apply_awc_2026_forum_update(jsonb, jsonb, jsonb) from public;
grant execute on function public.apply_awc_2026_forum_update(jsonb, jsonb, jsonb) to anon;
notify pgrst, 'reload schema';

commit;
