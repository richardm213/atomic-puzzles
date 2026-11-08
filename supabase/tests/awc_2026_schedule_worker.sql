-- Run in Firefox against the current database. Supply awc.test_worker_token locally;
-- never put the credential in this file. All fixtures and changes are rolled back.
begin;

do $$
declare
  fixture public.tournament_matches%rowtype;
  finished public.tournament_matches%rowtype;
  snapshot jsonb;
  result text;
  kickoff timestamptz := now() + interval '2 days';
  moved timestamptz := now() + interval '3 days';
  source_at timestamptz := now() - interval '2 minutes';
  url text := 'https://lichess.org/forum/team-atomic-wc/2026-awc-rounds-and-results?page=18#Audit001';
  token text := current_setting('awc.test_worker_token');
begin
  select * into strict fixture from public.tournament_matches
  where tournament='awc2026' and id='wb-r2-m1';
  insert into public.tournament_matches
  select (jsonb_populate_record(null::public.tournament_matches,
    to_jsonb(fixture) || jsonb_build_object(
      'id','awc-schedule-worker-test', 'scheduled_at',null,
      's1',0,'s2',0,'played_on',null,'match_id',null,'outcome_type',null,
      'winner_to',null,'loser_to',null
    ))).*;
  select to_jsonb(t) into snapshot from public.tournament_matches t
  where tournament='awc2026' and id='awc-schedule-worker-test';

  perform set_config('request.headers','{}',true);
  begin
    perform public.apply_awc_2026_schedule('awc-schedule-worker-test', fixture.p1, fixture.p2,
      null,kickoff,'Audit001',source_at,url,false);
    raise exception 'Unauthenticated write was accepted';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.headers',jsonb_build_object('x-awc-schedule-token',token)::text,true);

  result := public.apply_awc_2026_schedule(null,null,null,null,null,null,null,null,false);
  if result <> 'credential verified' then raise exception 'Credential preflight failed'; end if;

  result := public.apply_awc_2026_schedule('awc-schedule-worker-test',fixture.p1,fixture.p2,
    null,kickoff,'Audit001',source_at,url,false);
  if result <> 'applied' then raise exception 'Initial schedule not applied'; end if;
  if (select scheduled_at from public.tournament_matches where tournament='awc2026' and id='awc-schedule-worker-test') <> kickoff then
    raise exception 'Schedule read-back failed';
  end if;
  if (select to_jsonb(t)-array['scheduled_at','updated_at'] from public.tournament_matches t
      where tournament='awc2026' and id='awc-schedule-worker-test') is distinct from
      snapshot-array['scheduled_at','updated_at'] then raise exception 'Non-scheduling columns changed'; end if;

  result := public.apply_awc_2026_schedule('awc-schedule-worker-test',fixture.p1,fixture.p2,
    null,kickoff,'Audit001',source_at,url,false);
  if result <> 'unchanged' then raise exception 'Repeat was not idempotent'; end if;

  result := public.apply_awc_2026_schedule('awc-schedule-worker-test',fixture.p1,fixture.p2,
    kickoff,moved,'Audit002',source_at+interval '1 minute',replace(url,'Audit001','Audit002'),true);
  if result <> 'applied' then raise exception 'Explicit reschedule failed'; end if;
  result := public.apply_awc_2026_schedule('awc-schedule-worker-test',fixture.p1,fixture.p2,
    moved,kickoff,'Audit001',source_at,url,true);
  if result <> 'stale announcement' then raise exception 'Stale announcement overwrote schedule'; end if;

  begin
    perform public.apply_awc_2026_schedule('awc-schedule-worker-test',fixture.p1,fixture.p2,
      kickoff,moved+interval '1 hour','Audit003',now(),replace(url,'Audit001','Audit003'),true);
    raise exception 'Concurrent update was overwritten';
  exception when raise_exception then
    if sqlerrm <> 'AWC kickoff changed during polling' then raise; end if;
  end;

  begin
    perform public.apply_awc_2026_schedule('awc-schedule-worker-test','wrong-player',fixture.p2,
      moved,moved+interval '1 hour','Audit003',now(),replace(url,'Audit001','Audit003'),true);
    raise exception 'Wrong-player update was accepted';
  exception when raise_exception then
    if sqlerrm <> 'AWC match changed or is already played' then raise; end if;
  end;

  select * into strict finished from public.tournament_matches
  where tournament='awc2026' and played_on is not null limit 1;
  begin
    perform public.apply_awc_2026_schedule(finished.id,finished.p1,finished.p2,
      finished.scheduled_at,kickoff,'Audit001',source_at,url,false);
    raise exception 'Completed match was changed';
  exception when raise_exception then
    if sqlerrm <> 'AWC match changed or is already played' then raise; end if;
  end;

  begin
    perform public.apply_awc_2026_forum_update('{}'::jsonb,'{}'::jsonb,'[]'::jsonb);
    raise exception 'Schedule credential reached the result writer';
  exception when insufficient_privilege then null;
  end;
  if has_function_privilege('anon','public.resolve_prediction_market(text,text)','EXECUTE') then
    raise exception 'Anonymous role unexpectedly has market resolution access';
  end if;
end;
$$;
rollback;

select
  (select count(*) from public.tournament_matches where tournament='awc2026' and id='awc-schedule-worker-test') as remaining_test_fixtures,
  (select count(*) from public.awc_2026_schedule_receipts where fixture_id='awc-schedule-worker-test') as remaining_test_receipts;
