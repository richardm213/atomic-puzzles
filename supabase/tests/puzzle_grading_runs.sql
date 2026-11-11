-- Execute through Firefox on the current database. Every fixture and ledger change rolls back.
begin;
do $$
declare
  solver text := 'grading_rollback_' || txid_current();
  pid text;
  first_id uuid := gen_random_uuid();
  response jsonb;
  first_response jsonb;
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
  first_response := response;
  active_run := (response->'grading'->>'runId')::uuid;
  if (response->>'coinDelta')::numeric <> -1 or not (response->>'rated')::boolean then
    raise exception 'Initial result must rate once and debit the base penalty: %',response;
  end if;
  response := public.submit_puzzle_run_attempt(first_id,solver,pid,'incorrect','1. e4 *',null,20000,'1. e4',null);
  if not (response->>'duplicate')::boolean then raise exception 'Duplicate was applied twice'; end if;
  for i in 2..4 loop
    response := public.submit_puzzle_run_attempt(gen_random_uuid(),solver,pid,'incorrect','1. d4 *',active_run,1000,'1. d4',null);
    if (response->>'coinDelta')::numeric <> -power(0.5::numeric,i-1) or (response->>'rated')::boolean then
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
  if (response->>'coinDelta')::numeric <> -0.25 or response->'grading'->>'color' <> 'red' then
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
rollback;
