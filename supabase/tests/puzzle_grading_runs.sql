-- Execute through Firefox on the current database. Every fixture and ledger change rolls back.
begin;
create temporary table grading_test_fixture as
select p.id::text as puzzle_id from public.puzzles p
join public.puzzle_ratings r on r.puzzle_id=p.id
where p.deleted_at is null
order by (r.human_level = 3) desc nulls last, p.id limit 1;

create function pg_temp.assert_grading(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception '%', message; end if;
end $$;

do $$
declare
  solver text := 'grading_rollback_' || txid_current();
  pid text;
  first_id uuid := gen_random_uuid();
  response jsonb;
  active_run uuid;
  old_available timestamptz;
  i integer;
begin
  select p.id::text into pid from public.puzzles p
    join public.puzzle_ratings r on r.puzzle_id=p.id
    where p.deleted_at is null and coalesce(r.human_level,r.computed_level)=3
    order by p.id limit 1;
  if pid is null then raise exception 'No V3 test fixture'; end if;
  insert into public.coin_accounts(username,balance) values(solver,100);
  response := public.submit_puzzle_run_attempt(first_id,solver,pid,'incorrect','1. e4 *',null,20000,'1. e4',null);
  active_run := (response->'grading'->>'runId')::uuid;
  if (response->>'coinDelta')::numeric <> -1.5 or not (response->>'rated')::boolean then
    raise exception 'Initial result must rate once and debit the base penalty: %',response;
  end if;
  response := public.submit_puzzle_run_attempt(first_id,solver,pid,'incorrect','1. e4 *',null,20000,'1. e4',null);
  if not (response->>'duplicate')::boolean then raise exception 'Duplicate was applied twice'; end if;
  perform pg_temp.assert_grading(
    (select balance from public.coin_accounts where username=solver)=98.5
    and (select count(*) from public.puzzle_attempt_move_logs where username=solver)=1
    and (select count(*) from public.coin_transactions where username=solver)=1
    and (select count(*) from public.puzzle_rating_events where username=solver)=1,
    'Duplicate request changed wallet, ledger, log, or rating history');
  begin
    perform public.submit_puzzle_run_attempt(first_id,solver,pid,'correct','1. Nf3 *',null,1000,null,'1. Nf3');
    raise exception 'Reused attempt ID accepted different content';
  exception when others then
    if sqlerrm <> 'puzzle_attempt_id_conflict' then raise; end if;
  end;
  update public.puzzle_runs set started_at=now()-interval '3 months' where id=active_run;
  response := public.get_puzzle_grading_state(solver,pid);
  perform pg_temp.assert_grading((response->>'graded')::boolean
    and response->>'runId'=active_run::text and (response->>'misses')::integer=1,
    'An old unfinished graded run lost its miss count or eligibility');
  for i in 2..4 loop
    response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'incorrect','1. d4 *',active_run,1000,'1. d4',null);
    if (response->>'coinDelta')::numeric <> -1.5*power(0.5::numeric,i-1) or (response->>'rated')::boolean then
      raise exception 'Retry penalty or rating wrong: %',response;
    end if;
  end loop;
  if response->'grading'->>'color' <> 'purple' then raise exception 'Unsolved three-miss color'; end if;
  response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'correct','1. Nf3 *',active_run,1000,null,'1. Nf3');
  if (response->>'coinDelta')::numeric <> 0 then raise exception 'Reward after four misses'; end if;
  if exists(select 1 from public.puzzle_progress where username=solver and
      (puzzle_correct or incorrect_move <> '1. e4' or first_attempt_duration_ms <> 20000 or not has_solved)) then
    raise exception 'First result was overwritten or later solve lost';
  end if;
  if (select count(*) from public.puzzle_rating_events where username=solver) <> 1 then
    raise exception 'Retries changed rating';
  end if;
  begin
    perform public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'correct','1. Nf3 *',active_run,1000,null,'1. Nf3');
    raise exception 'Closed run accepted a stale submission';
  exception when others then
    if sqlerrm <> 'puzzle_run_finished' then raise; end if;
  end;
  select grading_available_at into old_available from public.puzzle_solver_states where username=solver;
  response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'correct','1. Nf3 *',null,1000,null,'1. Nf3');
  if (response->>'coinDelta')::numeric <> 0 or (response->>'graded')::boolean
    or (select correct_streak from public.puzzle_solver_states where username=solver) <> 0 then
    raise exception 'Practice earned coins or blue credit';
  end if;
  if (response->>'unratedUntil')::timestamptz < old_available then raise exception 'Cooldown moved backwards'; end if;
  for i in 1..2 loop
    update public.puzzle_solver_states set grading_available_at=now()-interval '1 second' where username=solver;
    response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'correct','1. Nf3 *',null,1000,null,'1. Nf3');
    if (response->>'coinDelta')::numeric <> 0.75 or (response->>'rated')::boolean then
      raise exception 'Repeat solve did not use quarter stakes without speed: %',response;
    end if;
  end loop;
  if response->'grading'->>'color' <> 'blue' then raise exception 'Clean graded streak did not become blue'; end if;
  update public.puzzle_solver_states set grading_available_at=now()-interval '1 second' where username=solver;
  response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'incorrect','1. d4 *',null,1000,'1. d4',null);
  if (response->>'coinDelta')::numeric <> -0.375 or response->'grading'->>'color' <> 'red' then
    raise exception 'Quarter penalty or blue reset wrong: %',response;
  end if;
  active_run := (response->'grading'->>'runId')::uuid;
  response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'resigned','1. d4 *',active_run,null,null,null);
  if (response->>'coinDelta')::numeric <> 0 or response->'grading'->>'runId' is not null then
    raise exception 'Resignation charged coins or left run active';
  end if;
end $$;

do $$
declare
  solver text := 'grading_green_' || txid_current();
  pid text;
  response jsonb;
begin
  select p.id::text into pid from public.puzzles p
    join public.puzzle_ratings r on r.puzzle_id=p.id
    where p.deleted_at is null and coalesce(r.human_level,r.computed_level)=3
    order by p.id limit 1;
  insert into public.coin_accounts(username,balance) values(solver,100);
  begin
    perform public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'resigned','*',null,null,null,null);
    raise exception 'Resignation accepted before a move';
  exception when others then
    if sqlerrm <> 'puzzle_resignation_requires_move' then raise; end if;
  end;
  response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'correct','1. Nf3 *',null,1000,null,'1. Nf3');
  if (response->>'coinDelta')::numeric <> 4 then raise exception 'First-try speed reward lost'; end if;
  update public.puzzle_solver_states set grading_available_at=now()-interval '1 second' where username=solver;
  response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'incorrect','1. e4 *',null,1000,'1. e4',null);
  if response->'grading'->>'color' <> 'green' then raise exception 'First-try green was lost'; end if;
  response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'correct','1. Nf3 *',
    (response->'grading'->>'runId')::uuid,1000,null,'1. Nf3');
  if (response->>'coinDelta')::numeric <> 0.375 or response->'grading'->>'color' <> 'green' then
    raise exception 'Retry reward or baseline color wrong';
  end if;
end $$;
-- Exercise the complete reward cutoff, including a fifth miss that still incurs a debit.
do $$
declare
  pid text := (select puzzle_id from grading_test_fixture);
  solver text;
  miss_count integer;
  miss integer;
  response jsonb;
  active_run uuid;
  reward numeric;
  penalties numeric;
  first_time timestamptz;
  expected_color text;
begin
  update public.puzzle_ratings set human_level=3 where puzzle_id=pid::bigint;
  for miss_count in 0..5 loop
    solver := 'grading_ladder_' || txid_current() || '_' || miss_count;
    insert into public.coin_accounts(username,balance) values(solver,100);
    active_run := null;
    penalties := 0;
    for miss in 1..miss_count loop
      response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'incorrect',
        '1. e4 *',active_run,30000,case when miss=1 then '1. e4' else '1. d4' end,null);
      active_run := (response->'grading'->>'runId')::uuid;
      penalties := penalties + 1.5*power(0.5::numeric,miss-1);
      perform pg_temp.assert_grading(
        (response->>'coinDelta')::numeric = -1.5*power(0.5::numeric,miss-1)
        and (response->>'rated')::boolean = (miss=1),
        format('Wrong retry debit/rating for %s, miss %s',solver,miss));
      perform pg_temp.assert_grading(response->'grading'->>'color'=
        case when miss>=3 then 'purple' else 'red' end,
        format('Unsolved color boundary for %s, miss %s',solver,miss));
    end loop;
    select first_attempt_at into first_time from public.puzzle_progress where username=solver;
    response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'correct',
      '1. Nf3 *',active_run,30000,null,'1. Nf3');
    reward := case when miss_count<4 then 3*power(0.5::numeric,miss_count) else 0 end;
    expected_color := case miss_count when 0 then 'green' when 1 then 'yellow'
      when 2 then 'orange' else 'red' end;
    perform pg_temp.assert_grading(
      (response->>'coinDelta')::numeric = reward
      and (response->>'rated')::boolean = (miss_count=0)
      and response->'grading'->>'color' = expected_color,
      format('Solve reward/rating/color for %s',solver));
    perform pg_temp.assert_grading(
      (select balance from public.coin_accounts where username=solver)=100-penalties+reward
      and coalesce((select sum(amount) from public.coin_transactions where username=solver),0)=-penalties+reward,
      format('Wallet and ledger disagree for %s',solver));
    perform pg_temp.assert_grading(
      (select count(*) from public.puzzle_attempt_move_logs where username=solver)=miss_count+1
      and (select count(*) from public.puzzle_rating_events where username=solver)=1,
      format('Submission or rating history count for %s',solver));
    perform pg_temp.assert_grading(
      (select puzzle_correct=(miss_count=0) and has_solved
         and first_attempt_duration_ms=30000
         and first_attempt_at=coalesce(first_time,first_attempt_at)
         and case when miss_count=0 then correct_move='1. Nf3' else incorrect_move='1. e4' end
       from public.puzzle_progress where username=solver),
      format('First attempt changed after retries for %s',solver));
    perform pg_temp.assert_grading(penalties<3, 'Geometric penalties exceeded the 2x cap');
  end loop;
end $$;

-- Legacy history has no active run. Recent history permits practice, older history permits grading.
do $$
declare
  pid text := (select puzzle_id from grading_test_fixture);
  was_correct boolean;
  is_recent boolean;
  solver text;
  first_time timestamptz;
  available timestamptz;
  first_snapshot jsonb;
  response jsonb;
  active_run uuid;
  factor numeric;
  expected_color text;
begin
  update public.puzzle_ratings set human_level=3 where puzzle_id=pid::bigint;
  foreach was_correct in array array[false,true] loop
    foreach is_recent in array array[false,true] loop
      solver := 'grading_history_' || txid_current() || '_' || was_correct || '_' || is_recent;
      first_time := clock_timestamp() - case when is_recent then interval '1 day' else interval '3 months' end;
      available := first_time + interval '2 months';
      insert into public.coin_accounts(username,balance) values(solver,100);
      insert into public.puzzle_progress(username,puzzle_id,first_attempt_at,first_attempt_duration_ms,
        puzzle_correct,rated,incorrect_move,correct_move,has_solved,attempt_color,grading_available_at)
      values(solver,pid,first_time,65432,was_correct,true,
        case when not was_correct then '1. e4' end,case when was_correct then '1. Nf3' end,
        was_correct,case when was_correct then 'green' else 'red' end,available);
      insert into public.puzzle_solver_states(username,puzzle_id,grading_available_at,original_color,correct_streak)
      values(solver,pid::bigint,available,case when was_correct then 'green' end,
        case when was_correct then 1 else 0 end);
      select to_jsonb(p)-'has_solved'-'attempt_color'-'grading_available_at' into first_snapshot
        from public.puzzle_progress p where username=solver;
      response := public.get_puzzle_grading_state(solver,pid);
      perform pg_temp.assert_grading(
        (response->>'graded')::boolean = not is_recent
        and (response->>'hasSolved')::boolean = was_correct and response->>'runId' is null,
        format('Initial historical eligibility for %s',solver));
      factor := case when was_correct then 0.25 else 1 end;
      response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'incorrect',
        '1. d4 *',null,1000,'1. d4',null);
      active_run := (response->'grading'->>'runId')::uuid;
      perform pg_temp.assert_grading(
        (response->>'coinDelta')::numeric = case when is_recent then 0 else -1.5*factor end
        and not (response->>'rated')::boolean
        and (response->>'graded')::boolean = not is_recent
        and (response->>'unratedUntil')::timestamptz=available,
        format('Historical miss stakes, rating, or cooldown for %s',solver));
      if is_recent then
        update public.puzzle_solver_states set grading_available_at=now() where username=solver;
        update public.puzzle_progress set grading_available_at=now() where username=solver;
        response := public.get_puzzle_grading_state(solver,pid);
        perform pg_temp.assert_grading(not (response->>'graded')::boolean
          and response->>'runId'=active_run::text,
          format('An open practice run changed eligibility at expiry for %s',solver));
      end if;
      response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'correct',
        '1. Nf3 *',active_run,1000,null,'1. Nf3');
      expected_color := case when was_correct then 'green' when is_recent then 'red' else 'yellow' end;
      perform pg_temp.assert_grading(
        (response->>'coinDelta')::numeric = case when is_recent then 0 else 1.5*factor end
        and not (response->>'rated')::boolean
        and (response->'grading'->>'hasSolved')::boolean
        and response->'grading'->>'color'=expected_color,
        format('Historical recovery reward/color for %s',solver));
      perform pg_temp.assert_grading(
        (select balance from public.coin_accounts where username=solver)=
          100
        and (select count(*) from public.puzzle_rating_events where username=solver)=1
        and (select to_jsonb(p)-'has_solved'-'attempt_color'-'grading_available_at'
             from public.puzzle_progress p where username=solver)=first_snapshot,
        format('Historical wallet, first move/time, or rating changed for %s',solver));
      select grading_available_at into available from public.puzzle_solver_states where username=solver;
      perform pg_temp.assert_grading(available>clock_timestamp()+interval '2 months'-interval '2 seconds',
        format('Correct solve did not reset the cooldown for %s',solver));
      response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'incorrect',
        '1. d4 *',null,1000,'1. d4',null);
      active_run := (response->'grading'->>'runId')::uuid;
      perform pg_temp.assert_grading((response->>'coinDelta')::numeric=0,
        format('Practice miss charged coins for %s',solver));
      response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'resigned',
        '1. d4 *',active_run,null,null,null);
      perform pg_temp.assert_grading((response->>'coinDelta')::numeric=0
        and (response->>'unratedUntil')::timestamptz>available,
        format('Practice resignation did not reset the cooldown for %s',solver));
      if is_recent and not was_correct then
        update public.puzzle_solver_states set grading_available_at=now() where username=solver;
        update public.puzzle_progress set grading_available_at=now() where username=solver;
        response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'correct',
          '1. Nf3 *',null,1000,null,'1. Nf3');
        perform pg_temp.assert_grading((response->>'coinDelta')::numeric=0.75
          and response->'grading'->>'color'='green'
          and (select to_jsonb(p)-'has_solved'-'attempt_color'-'grading_available_at'
               from public.puzzle_progress p where username=solver)=first_snapshot,
          'A practice solve did not switch a previously incorrect puzzle to quarter stakes');
      end if;
    end loop;
  end loop;
end $$;

-- Base stakes, speed eligibility, zero-penalty levels, and an empty wallet.
do $$
declare
  pid text := (select puzzle_id from grading_test_fixture);
  level integer;
  solver text;
  response jsonb;
  reward numeric;
  penalty numeric;
begin
  for level in 1..5 loop
    update public.puzzle_ratings set human_level=level where puzzle_id=pid::bigint;
    reward := case level when 1 then 1 when 2 then 2 when 3 then 3 when 4 then 5 else 10 end;
    penalty := case level when 1 then 4 when 2 then 2 when 3 then 1.5 when 4 then 0.5 else 0 end;
    solver := 'grading_level_correct_' || txid_current() || '_' || level;
    insert into public.coin_accounts(username,balance) values(solver,100);
    response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'correct','1. Nf3 *',
      null,1000,null,'1. Nf3');
    perform pg_temp.assert_grading((response->>'coinDelta')::numeric =
      reward+case when level<=3 then 1 else 0 end,format('First-try reward for V%s',level));
    solver := 'grading_level_wrong_' || txid_current() || '_' || level;
    insert into public.coin_accounts(username,balance) values(solver,100);
    response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'incorrect','1. e4 *',
      null,1000,'1. e4',null);
    perform pg_temp.assert_grading((response->>'coinDelta')::numeric=-penalty
      and (select count(*) from public.puzzle_attempt_move_logs where username=solver)=1,
      format('First-miss penalty or missing zero-debit submission for V%s',level));
    response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'correct','1. Nf3 *',
      (response->'grading'->>'runId')::uuid,1000,null,'1. Nf3');
    perform pg_temp.assert_grading((response->>'coinDelta')::numeric=reward/2,
      format('Retry rewarded speed or wrong base amount for V%s',level));
  end loop;
  update public.puzzle_ratings set human_level=3 where puzzle_id=pid::bigint;
  solver := 'grading_empty_wallet_' || txid_current();
  insert into public.coin_accounts(username,balance) values(solver,0);
  response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'incorrect','1. e4 *',
    null,1000,'1. e4',null);
  perform pg_temp.assert_grading((response->>'coinDelta')::numeric=0
    and (select balance from public.coin_accounts where username=solver)=0
    and (response->'grading'->>'misses')::integer=1,'Empty wallet lost or forgave the recorded miss');
  response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'correct','1. Nf3 *',
    (response->'grading'->>'runId')::uuid,1000,null,'1. Nf3');
  perform pg_temp.assert_grading((response->>'coinDelta')::numeric=1.5
    and (select balance from public.coin_accounts where username=solver)=1.5,
    'An unfunded first miss incorrectly restored full reward eligibility');
end $$;
-- Permanent practice and administrative locks must survive the new grading system.
do $$
declare
  pid text := (select puzzle_id from grading_test_fixture);
  solver text := 'grading_exclusion_' || txid_current();
  response jsonb;
begin
  insert into public.coin_accounts(username,balance) values(solver,100);
  insert into public.puzzle_rating_exclusions(username,puzzle_id,category,expires_at,reason,permanent)
  values(solver,pid,'creator',now()+interval '2 months','Rollback grading regression',true);
  response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'incorrect','1. e4 *',null,1000,'1. e4',null);
  perform pg_temp.assert_grading(not (response->>'rated')::boolean and not (response->>'graded')::boolean
    and (response->>'coinDelta')::numeric=0, 'Permanent practice was graded or rated');
  response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'correct','1. Nf3 *',
    (response->'grading'->>'runId')::uuid,1000,null,'1. Nf3');
  perform pg_temp.assert_grading((response->>'coinDelta')::numeric=0
    and (select balance from public.coin_accounts where username=solver)=100
    and (select count(*) from public.puzzle_rating_events where username=solver)=0,
    'Permanent practice changed wallet or rating');
  begin
    update public.puzzle_progress set incorrect_move='tampered' where username=solver;
    raise exception 'First result could be rewritten';
  exception when others then
    if sqlerrm <> 'puzzle_first_result_immutable' then raise; end if;
  end;
  solver := 'grading_blocked_' || txid_current();
  insert into public.puzzle_rating_exclusions(username,puzzle_id,category,expires_at,reason)
  values(solver,pid,'abuse',now()+interval '2 months','Rollback grading regression');
  begin
    perform public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'correct','1. Nf3 *',null,1000,null,'1. Nf3');
    raise exception 'Administrative exclusion was bypassed';
  exception when others then
    if sqlerrm <> 'puzzle_rating_exclusion_active' then raise; end if;
  end;
  perform pg_temp.assert_grading(
    not exists(select 1 from public.puzzle_progress where username=solver)
    and not exists(select 1 from public.puzzle_runs where username=solver)
    and not exists(select 1 from public.puzzle_attempt_move_logs where username=solver),
    'Rejected submission left partial state');
end $$;
rollback;
