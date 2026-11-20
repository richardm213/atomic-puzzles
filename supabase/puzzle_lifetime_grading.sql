-- Apply in Firefox on the current database. Does not change first results, coins, or ratings.
begin;
set local lock_timeout='5s';
set local statement_timeout='25s';
-- Lifetime graded history determines colors. Practice remains untracked.
alter table public.puzzle_solver_states
  add column if not exists graded_miss_count integer not null default 0 check(graded_miss_count>=0),
  add column if not exists graded_solve_count integer not null default 0 check(graded_solve_count>=0),
  add column if not exists first_graded_solve_at timestamptz,
  add column if not exists last_attempted_at timestamptz;

create or replace function public.puzzle_lifetime_attempt_color(misses integer,solved boolean,solves integer)
returns text language sql immutable set search_path='' as $$
  select case when solved then case
    when misses>=3 then 'red' when misses=2 then 'orange' when misses=1 then 'yellow'
    when solves>=2 then 'blue' else 'green' end
    when misses>=3 then 'purple' else 'red' end;
$$;
revoke all on function public.puzzle_lifetime_attempt_color(integer,boolean,integer)from public,anon,authenticated;
grant execute on function public.puzzle_lifetime_attempt_color(integer,boolean,integer)to service_role;

-- Serialize the one-time history repair with attempt submissions.
lock table public.puzzle_solver_states,public.puzzle_runs,public.puzzle_progress,public.puzzle_attempt_move_logs in share row exclusive mode;
with logs as(
 select username,puzzle_id,count(*)filter(where graded and outcome='incorrect')::integer as misses,
 count(*)filter(where graded and outcome='correct')::integer as solves,
 max(attempted_at)as last_attempt,
 min(attempted_at)filter(where graded and outcome='correct')as first_solve
 from public.puzzle_attempt_move_logs group by username,puzzle_id
), history as(
 select s.username,s.puzzle_id,
 greatest(s.last_attempted_at,l.last_attempt,p.first_attempt_at,s.grading_available_at-interval '2 months')as last_attempt,
 greatest(s.graded_miss_count,coalesce(l.misses,0)+case when not p.puzzle_correct and not exists(
 select 1 from public.puzzle_attempt_move_logs a where a.username=p.username and a.puzzle_id=s.puzzle_id
 and a.graded and a.outcome='incorrect'and a.attempted_at=p.first_attempt_at)then 1 else 0 end,
 case coalesce(s.original_color,p.attempt_color)when 'yellow'then 1 when 'orange'then 2 when 'purple'then 3
 when 'red'then case when p.has_solved then 3 else 1 end else 0 end)as misses,
 greatest(s.graded_solve_count,coalesce(l.solves,0)+case when p.puzzle_correct and not exists(
 select 1 from public.puzzle_attempt_move_logs a where a.username=p.username and a.puzzle_id=s.puzzle_id
 and a.graded and a.outcome='correct'and a.attempted_at=p.first_attempt_at)then 1 else 0 end,
 s.correct_streak,case when p.has_solved then 1 else 0 end)as solves,
 coalesce(s.first_graded_solve_at,least(l.first_solve,case when p.puzzle_correct then p.first_attempt_at end),
 case when p.has_solved then s.grading_available_at-interval '2 months'end)as first_solve
 from public.puzzle_solver_states s join public.puzzle_progress p on p.username=s.username and p.puzzle_id=s.puzzle_id::text
 left join logs l on l.username=s.username and l.puzzle_id=s.puzzle_id
)
update public.puzzle_solver_states s set graded_miss_count=h.misses,graded_solve_count=h.solves,
 first_graded_solve_at=h.first_solve,last_attempted_at=h.last_attempt,
 grading_available_at=case when h.solves>=1 then h.first_solve+interval '2 months'else s.grading_available_at end,
 original_color=case when h.solves>=1 then public.puzzle_lifetime_attempt_color(h.misses,true,1)end
from history h where s.username=h.username and s.puzzle_id=h.puzzle_id;

update public.puzzle_progress p set
 attempt_color=public.puzzle_lifetime_attempt_color(s.graded_miss_count,p.has_solved,s.graded_solve_count),
 grading_available_at=s.grading_available_at
from public.puzzle_solver_states s where p.username=s.username and p.puzzle_id=s.puzzle_id::text
and(p.attempt_color,p.grading_available_at)is distinct from
(public.puzzle_lifetime_attempt_color(s.graded_miss_count,p.has_solved,s.graded_solve_count),s.grading_available_at);

create or replace function public.get_puzzle_grading_state(p_username text, p_puzzle_id text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'runId', r.id,
    'graded', coalesce(s.graded_solve_count,0)<2 and not coalesce(e.permanent,false)
      and coalesce(r.graded,
      coalesce(greatest(s.grading_available_at,
        case when e.category in ('creator','abuse') then e.expires_at end),
        '-infinity'::timestamptz) <= now()),
    'availableAt', case when coalesce(s.graded_solve_count,0)>=2 then null else greatest(s.grading_available_at,
      case when e.expires_at > now() and e.category in ('creator', 'abuse') then e.expires_at end) end,
    'permanent', coalesce(e.permanent, false) or coalesce(s.graded_solve_count,0)>=2,
    'hasAttempted', p.username is not null,
    'hasSolved', coalesce(p.has_solved, false),
    'misses', case when r.graded = false or coalesce(s.graded_solve_count,0)>=2 then 0 else coalesce(r.misses, 0) end,
    'color', p.attempt_color
  )
  from (select public.canonical_user_username(p_username) as username, p_puzzle_id::bigint as puzzle_id) q
  left join public.puzzle_progress p on p.username = q.username and p.puzzle_id = q.puzzle_id::text
  left join public.puzzle_solver_states s on s.username = q.username and s.puzzle_id = q.puzzle_id
  left join public.puzzle_rating_exclusions e on e.username = q.username and e.puzzle_id = q.puzzle_id::text
  left join public.puzzle_runs r on r.username = q.username and r.puzzle_id = q.puzzle_id and r.ended_at is null;
$$;

create or replace function public.submit_puzzle_run_attempt(
  p_attempt_id uuid, p_username text, p_puzzle_id text, p_outcome text,
  p_attempt_pgn text, p_run_id uuid, p_attempt_duration_ms integer,
  p_incorrect_move text, p_correct_move text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  solver text := public.canonical_user_username(p_username);
  puzzle_key bigint := p_puzzle_id::bigint;
  at_time timestamptz := clock_timestamp();
  run public.puzzle_runs%rowtype;
  state public.puzzle_solver_states%rowtype;
  progress public.puzzle_progress%rowtype;
  receipt public.puzzle_attempt_move_logs%rowtype;
  exclusion public.puzzle_rating_exclusions%rowtype;
  puzzle_author text;
  puzzle_level smallint;
  first_result boolean;
  result_rated boolean := false;
  coin_delta numeric := 0;
  speed_bonus numeric := 0;
  rating_event jsonb;
  result jsonb;
  factor numeric;
  color text;
begin
  if nullif(solver, '') is null or p_outcome not in ('correct','incorrect','resigned') then
    raise exception 'Invalid puzzle attempt';
  end if;
  -- All submissions for a player are ordered, including cross-puzzle coin/rating writes.
  perform pg_advisory_xact_lock(hashtextextended('puzzle-solver:' || solver, 0));
  perform pg_advisory_xact_lock(hashtextextended(solver || ':' || puzzle_key::text, 0));
  select * into receipt from public.puzzle_attempt_move_logs where id = p_attempt_id;
  if found then
    if receipt.username <> solver or receipt.puzzle_id <> puzzle_key
      or receipt.outcome <> p_outcome or receipt.pgn <> p_attempt_pgn then
      raise exception 'puzzle_attempt_id_conflict';
    end if;
    return receipt.progress_result || jsonb_build_object('duplicate', true,
      'grading',public.get_puzzle_grading_state(solver,puzzle_key::text));
  end if;

  select public.canonical_user_username(p.author), coalesce(pr.human_level, pr.computed_level, 3)
  into puzzle_author, puzzle_level from public.puzzles p
  left join public.puzzle_ratings pr on pr.puzzle_id = p.id
  where p.id = puzzle_key and p.deleted_at is null;
  if not found then raise exception 'Puzzle not found'; end if;

  select * into exclusion from public.puzzle_rating_exclusions
  where username = solver and puzzle_id = puzzle_key::text;
  if exclusion.category = 'abuse' and (exclusion.permanent or exclusion.expires_at > at_time) then
    raise exception 'puzzle_rating_exclusion_active';
  end if;

  insert into public.puzzle_solver_states(username, puzzle_id) values(solver,puzzle_key)
  on conflict do nothing;
  select * into strict state from public.puzzle_solver_states
  where username = solver and puzzle_id = puzzle_key for update;
  select * into progress from public.puzzle_progress
  where username = solver and puzzle_id = puzzle_key::text;
  first_result := not found;
  select * into run from public.puzzle_runs
  where username = solver and puzzle_id = puzzle_key and ended_at is null for update;
  if state.practice_resolution_id = p_attempt_id then
    return jsonb_build_object('coinDelta',0,'rated',false,'graded',false,'duplicate',true,
      'unratedUntil',state.grading_available_at,'ratingEvent',null,
      'grading',public.get_puzzle_grading_state(solver,puzzle_key::text));
  end if;
  if p_run_id is not null and (run.id is null or run.id <> p_run_id) then
    raise exception 'puzzle_run_finished';
  end if;
  if run.id is null then
    if p_outcome = 'resigned' and not coalesce(progress.has_solved,false) then
      raise exception 'puzzle_resignation_requires_move';
    end if;
    factor := case when coalesce(progress.has_solved, false) then 0.25 else 1 end;
    insert into public.puzzle_runs(username,puzzle_id,graded,previously_solved,base_reward,base_penalty)
    values(solver,puzzle_key,
      (public.get_puzzle_grading_state(solver,puzzle_key::text)->>'graded')::boolean,
      coalesce(progress.has_solved,false),
      factor * case puzzle_level when 1 then 1 when 2 then 2 when 4 then 5 when 5 then 10 else 3 end,
      factor * case puzzle_level when 1 then 5 when 2 then 3 when 3 then 1.5 when 4 then 0.5 else 0 end)
    returning * into run;
  end if;

  -- Practice retains only an active session marker and cooldown retry receipt.
  -- It cannot create history, miss counts, solved status, colors, coins, or ratings.
  if not run.graded or state.graded_solve_count>=2 then
    run.graded := false;
    -- After a first solve, practice cannot extend its fixed cooldown.
    update public.puzzle_solver_states
    set grading_available_at=case when state.graded_solve_count=0
          then at_time + interval '2 months' else state.grading_available_at end,
      practice_resolution_id=p_attempt_id,last_attempted_at=at_time
    where username=solver and puzzle_id=puzzle_key
    returning * into state;
    update public.puzzle_progress set grading_available_at=state.grading_available_at
    where username=solver and puzzle_id=puzzle_key::text;
    if p_outcome in ('correct','resigned') then
      -- Existing practice sessions may still have logs written by the old implementation.
      update public.puzzle_runs set ended_at=at_time,outcome=p_outcome where id=run.id;
      delete from public.puzzle_runs r where r.id=run.id
        and not exists(select 1 from public.puzzle_attempt_move_logs l where l.run_id=r.id);
    end if;
    return jsonb_build_object('coinDelta',0,'rated',false,'graded',false,'duplicate',false,
      'unratedUntil',state.grading_available_at,'ratingEvent',null,
      'grading',public.get_puzzle_grading_state(solver,puzzle_key::text));
  end if;

  if first_result then
    perform pg_advisory_xact_lock(hashtextextended(solver || ':daily-puzzle-attempts', 0));
    if (select count(*) from public.puzzle_progress
        where username = solver and first_attempt_at >= date_trunc('day', at_time at time zone 'UTC') at time zone 'UTC'
          and first_attempt_at < (date_trunc('day', at_time at time zone 'UTC') + interval '1 day') at time zone 'UTC') >= 200 then
      raise exception 'daily_puzzle_attempt_limit_reached';
    end if;
    result_rated := true;
    insert into public.puzzle_progress(username,puzzle_id,first_attempt_at,first_attempt_duration_ms,
      puzzle_correct,rated,incorrect_move,correct_move,has_solved,attempt_color)
    values(solver,puzzle_key::text,at_time,p_attempt_duration_ms,
      p_outcome='correct',result_rated,p_incorrect_move,p_correct_move,p_outcome='correct',
      case when p_outcome='correct' then 'green' else 'red' end);
    select jsonb_build_object(
      'username',e.username,'puzzleId',e.puzzle_id::text,'attemptedAt',e.attempted_at,
      'puzzleCorrect',e.puzzle_correct,'userRatingBefore',e.user_rating_before,
      'userRatingAfter',e.user_rating_after,'userRatingDeviationBefore',e.user_rd_before,
      'userRatingDeviationAfter',e.user_rd_after,'puzzleRatingBefore',e.puzzle_rating_before,
      'puzzleRatingAfter',e.puzzle_rating_after,'puzzleRatingDeviationBefore',e.puzzle_rd_before,
      'puzzleRatingDeviationAfter',e.puzzle_rd_after)
    into rating_event from public.puzzle_rating_events e
    where e.username=solver and e.puzzle_id=puzzle_key;
  end if;

  if p_outcome = 'incorrect' then
    -- Truncation keeps rounded microcoin debits below the geometric 2x cap.
    coin_delta := -trunc(run.base_penalty * power(0.5::numeric,least(run.misses,64)),6);
    state.correct_streak := 0;
    state.graded_miss_count := state.graded_miss_count+1;
    color := public.puzzle_lifetime_attempt_color(state.graded_miss_count,
      coalesce(progress.has_solved,false),state.graded_solve_count);
    if coalesce(progress.has_solved,false) then state.original_color:=color;end if;
    run.misses := run.misses + 1;
  elsif p_outcome = 'correct' then
    if run.misses < 4 then
      coin_delta := round(run.base_reward * power(0.5::numeric,run.misses),6);
    end if;
    if first_result and result_rated and run.misses=0 and puzzle_level between 1 and 3
      and p_attempt_duration_ms >= 0 and p_attempt_duration_ms < 30000 then
      speed_bonus := case when p_attempt_duration_ms <= 5000 then 1
        else round(power(5::numeric,-((p_attempt_duration_ms::numeric-5000)/25000)),6) end;
      coin_delta := coin_delta + speed_bonus;
    end if;
    state.correct_streak := case when run.misses=0 then state.correct_streak+1 else 0 end;
    state.graded_solve_count := state.graded_solve_count+1;
    state.first_graded_solve_at := coalesce(state.first_graded_solve_at,at_time);
    state.original_color := public.puzzle_lifetime_attempt_color(state.graded_miss_count,true,1);
    color := public.puzzle_lifetime_attempt_color(state.graded_miss_count,true,state.graded_solve_count);
    update public.puzzle_progress set has_solved=true,solved_move=coalesce(solved_move,p_correct_move)
    where username=solver and puzzle_id=puzzle_key::text;
  else
    if run.misses = 0 and not run.previously_solved then
      raise exception 'puzzle_resignation_requires_move';
    end if;
  end if;

  if p_outcome in ('correct','resigned') then
    run.ended_at := at_time;
    run.outcome := p_outcome;
    state.grading_available_at := coalesce(state.first_graded_solve_at,at_time) + interval '2 months';
  end if;
  if color is not null then
    update public.puzzle_progress set attempt_color=color
    where username=solver and puzzle_id=puzzle_key::text;
  end if;
  -- Keep the existing self-solve reward restriction.
  if puzzle_author=solver and solver<>'seaside_tiramisu' and coin_delta>0 then coin_delta:=0; end if;
  if p_outcome <> 'resigned' and coin_delta <> 0 then
    coin_delta := public.post_coin_transaction(solver,coin_delta,
      case when p_outcome='correct' then 'puzzle_correct' else 'puzzle_attempted' end,
      'puzzle-run-attempt:' || p_attempt_id::text,
      jsonb_build_object('puzzleId',puzzle_key::text,'runId',run.id,
        'attemptId',p_attempt_id,'correct',p_outcome='correct','misses',run.misses,
        'previouslySolved',run.previously_solved,'baseReward',run.base_reward,
        'basePenalty',run.base_penalty,'speedBonus',speed_bonus),at_time,true);
  end if;
  update public.puzzle_runs set misses=run.misses,ended_at=run.ended_at,outcome=run.outcome
  where id=run.id;
  update public.puzzle_solver_states set grading_available_at=state.grading_available_at,
    original_color=state.original_color,correct_streak=state.correct_streak,
    graded_miss_count=state.graded_miss_count,graded_solve_count=state.graded_solve_count,
    first_graded_solve_at=state.first_graded_solve_at,last_attempted_at=at_time
  where username=solver and puzzle_id=puzzle_key;

  update public.puzzle_progress set grading_available_at=state.grading_available_at
  where username=solver and puzzle_id=puzzle_key::text;
  result := jsonb_build_object('coinDelta',coin_delta,'rated',result_rated,'graded',run.graded,
    'unratedUntil',state.grading_available_at,'ratingEvent',rating_event,
    'grading',public.get_puzzle_grading_state(solver,puzzle_key::text),'duplicate',false);
  insert into public.puzzle_attempt_move_logs(id,username,puzzle_id,attempted_at,outcome,pgn,
    run_id,graded,rated,duration_ms,incorrect_move,correct_move,progress_result)
  values(p_attempt_id,solver,puzzle_key,at_time,p_outcome,p_attempt_pgn,
    run.id,run.graded,result_rated,p_attempt_duration_ms,p_incorrect_move,p_correct_move,result);
  return result;
end;
$$;

notify pgrst,'reload schema';
commit;
