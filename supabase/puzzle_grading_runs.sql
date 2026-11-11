begin;

-- First-result fields remain the rating history. These two fields summarize later play.
alter table public.puzzle_progress
  add column if not exists has_solved boolean not null default false,
  add column if not exists attempt_color text,
  add column if not exists grading_available_at timestamptz;

create table if not exists public.puzzle_solver_states (
  username text not null,
  puzzle_id bigint not null references public.puzzles(id) on delete cascade,
  grading_available_at timestamptz,
  original_color text,
  correct_streak integer not null default 0 check (correct_streak >= 0),
  primary key (username, puzzle_id)
);

create table if not exists public.puzzle_runs (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  puzzle_id bigint not null references public.puzzles(id) on delete cascade,
  started_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz,
  outcome text check (outcome in ('correct', 'resigned')),
  graded boolean not null,
  previously_solved boolean not null,
  misses integer not null default 0 check (misses >= 0),
  base_reward numeric not null,
  base_penalty numeric not null,
  check ((ended_at is null) = (outcome is null))
);
create unique index if not exists puzzle_runs_active
  on public.puzzle_runs(username, puzzle_id) where ended_at is null;

alter table public.puzzle_attempt_move_logs
  add column if not exists run_id uuid references public.puzzle_runs(id),
  add column if not exists graded boolean not null default false,
  add column if not exists rated boolean not null default false,
  add column if not exists duration_ms integer,
  add column if not exists incorrect_move text,
  add column if not exists correct_move text;

alter table public.puzzle_solver_states enable row level security;
alter table public.puzzle_runs enable row level security;
revoke all on public.puzzle_solver_states, public.puzzle_runs from public, anon, authenticated;
grant all on public.puzzle_solver_states, public.puzzle_runs to service_role;

-- Preserve existing results and receipts. Historical attempts have already finished their runs.
insert into public.puzzle_solver_states
  (username, puzzle_id, grading_available_at, original_color, correct_streak)
select p.username, p.puzzle_id::bigint, p.first_attempt_at + interval '2 months',
  case when p.puzzle_correct then 'green' end,
  case when p.puzzle_correct and p.rated then 1 else 0 end
from public.puzzle_progress p
on conflict do nothing;

-- Grading cooldowns allow practice. Administrative abuse exclusions still restrict access.
create or replace function public.get_locked_puzzle_ids(p_username text, p_puzzle_ids text[])
returns table(puzzle_id text, expires_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select e.puzzle_id, e.expires_at from public.puzzle_rating_exclusions e
  where e.username = public.canonical_user_username(p_username)
    and e.puzzle_id = any(p_puzzle_ids) and e.category = 'abuse'
    and (e.permanent or e.expires_at > now());
$$;

create or replace function public.enforce_puzzle_rating_exclusion()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if row(new.first_attempt_at,new.first_attempt_duration_ms,new.puzzle_correct,
        new.incorrect_move,new.correct_move,new.rated)
      is distinct from row(old.first_attempt_at,old.first_attempt_duration_ms,old.puzzle_correct,
        old.incorrect_move,old.correct_move,old.rated) then
      raise exception 'puzzle_first_result_immutable';
    end if;
    return new;
  end if;
  if exists (
    select 1 from public.puzzle_rating_exclusions e
    where e.username = new.username and e.puzzle_id = new.puzzle_id
      and e.category = 'abuse' and (e.permanent or e.expires_at > now())
  ) then
    raise exception 'puzzle_rating_exclusion_active';
  end if;
  if exists (
    select 1 from public.puzzle_rating_exclusions e
    where e.username = new.username and e.puzzle_id = new.puzzle_id
      and (e.permanent or e.expires_at > now())
  ) then new.rated := false; end if;
  return new;
end;
$$;

update public.puzzle_progress set
  has_solved = puzzle_correct,
  attempt_color = case when puzzle_correct then 'green' else 'red' end
where attempt_color is null;

update public.puzzle_progress p set grading_available_at=s.grading_available_at
from public.puzzle_solver_states s where p.username=s.username and p.puzzle_id=s.puzzle_id::text
  and p.grading_available_at is distinct from s.grading_available_at;

-- Merely opening an author's puzzle no longer extends its cooldown.
create or replace function public.refresh_own_puzzle_cooldown(p_username text, p_puzzle_id text)
returns timestamptz language sql stable security definer set search_path = ''
as $$ select null::timestamptz; $$;

-- Coin posting belongs to the run writer, independently of the one-time rating trigger.
drop trigger if exists award_coins_after_puzzle_attempt on public.puzzle_progress;

create or replace function public.get_puzzle_grading_state(p_username text, p_puzzle_id text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'runId', r.id,
    'graded', coalesce(r.graded,
      not coalesce(e.permanent, false)
      and coalesce(s.grading_available_at, '-infinity'::timestamptz) <= now()
      and (e.category is distinct from 'abuse' or e.expires_at <= now())
      and (e.category is distinct from 'creator' or e.expires_at <= now())),
    'availableAt', greatest(s.grading_available_at,
      case when e.expires_at > now() and e.category in ('creator', 'abuse') then e.expires_at end),
    'permanent', coalesce(e.permanent, false),
    'hasAttempted', p.username is not null,
    'hasSolved', coalesce(p.has_solved, false),
    'misses', coalesce(r.misses, 0),
    'color', p.attempt_color
  )
  from (select public.canonical_user_username(p_username) as username, p_puzzle_id::bigint as puzzle_id) q
  left join public.puzzle_progress p on p.username = q.username and p.puzzle_id = q.puzzle_id::text
  left join public.puzzle_solver_states s on s.username = q.username and s.puzzle_id = q.puzzle_id
  left join public.puzzle_rating_exclusions e on e.username = q.username and e.puzzle_id = q.puzzle_id::text
  left join public.puzzle_runs r on r.username = q.username and r.puzzle_id = q.puzzle_id and r.ended_at is null;
$$;
revoke all on function public.get_puzzle_grading_state(text,text) from public, anon, authenticated;
grant execute on function public.get_puzzle_grading_state(text,text) to service_role;

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
  if p_run_id is not null and (run.id is null or run.id <> p_run_id) then
    raise exception 'puzzle_run_finished';
  end if;
  if run.id is null then
    if p_outcome = 'resigned' and not coalesce(progress.has_solved,false) then
      raise exception 'puzzle_resignation_requires_move';
    end if;
    if first_result then
      perform pg_advisory_xact_lock(hashtextextended(solver || ':daily-puzzle-attempts', 0));
      if (select count(*) from public.puzzle_progress
          where username = solver and first_attempt_at >= date_trunc('day', at_time at time zone 'UTC') at time zone 'UTC'
            and first_attempt_at < (date_trunc('day', at_time at time zone 'UTC') + interval '1 day') at time zone 'UTC') >= 200 then
        raise exception 'daily_puzzle_attempt_limit_reached';
      end if;
    end if;
    factor := case when coalesce(progress.has_solved, false) then 0.25 else 1 end;
    insert into public.puzzle_runs(username,puzzle_id,graded,previously_solved,base_reward,base_penalty)
    values(solver,puzzle_key,
      not coalesce(exclusion.permanent,false)
        and coalesce(state.grading_available_at,'-infinity'::timestamptz) <= at_time
        and (exclusion.category is distinct from 'creator' or exclusion.expires_at <= at_time),
      coalesce(progress.has_solved,false),
      factor * case puzzle_level when 1 then 1 when 2 then 2 when 4 then 5 when 5 then 10 else 3 end,
      factor * case puzzle_level when 1 then 5 when 2 then 3 when 3 then 1.5 when 4 then 0.5 else 0 end)
    returning * into run;
  end if;

  if first_result then
    result_rated := not coalesce(exclusion.permanent,false)
      and (exclusion.expires_at is null or exclusion.expires_at <= at_time);
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
    if run.graded then
      -- Truncation keeps rounded microcoin debits below the geometric 2x cap.
      coin_delta := -trunc(run.base_penalty * power(0.5::numeric,least(run.misses,64)),6);
      state.correct_streak := 0;
      color := coalesce(state.original_color,case when run.misses >= 2 then 'purple' else 'red' end);
    end if;
    run.misses := run.misses + 1;
  elsif p_outcome = 'correct' then
    if run.graded then
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
      state.original_color := coalesce(state.original_color,
        case run.misses when 0 then 'green' when 1 then 'yellow' when 2 then 'orange' else 'red' end);
      color := case when state.correct_streak >= 2 then 'blue' else state.original_color end;
    end if;
    update public.puzzle_progress set has_solved=true
    where username=solver and puzzle_id=puzzle_key::text;
  else
    if run.misses = 0 and not run.previously_solved then
      raise exception 'puzzle_resignation_requires_move';
    end if;
  end if;

  if p_outcome in ('correct','resigned') then
    run.ended_at := at_time;
    run.outcome := p_outcome;
    state.grading_available_at := at_time + interval '2 months';
  end if;
  if color is not null then
    update public.puzzle_progress set attempt_color=color
    where username=solver and puzzle_id=puzzle_key::text;
  end if;
  -- Keep the existing self-solve reward restriction.
  if puzzle_author=solver and solver<>'seaside_tiramisu' and coin_delta>0 then coin_delta:=0; end if;
  if run.graded and p_outcome <> 'resigned' and coin_delta <> 0 then
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
    original_color=state.original_color,correct_streak=state.correct_streak
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
revoke all on function public.submit_puzzle_run_attempt(uuid,text,text,text,text,uuid,integer,text,text)
  from public,anon,authenticated;
grant execute on function public.submit_puzzle_run_attempt(uuid,text,text,text,text,uuid,integer,text,text)
  to service_role;

-- Older PGN clients receive the same persistent-run behavior.
create or replace function public.record_puzzle_attempt_with_pgn(
  p_attempt_id uuid,p_username text,p_puzzle_id text,p_outcome text,p_attempt_pgn text,
  p_record_progress boolean,p_attempt_duration_ms integer,p_incorrect_move text,p_correct_move text
) returns jsonb language sql security definer set search_path = ''
as $$
  select public.submit_puzzle_run_attempt(p_attempt_id,p_username,p_puzzle_id,p_outcome,p_attempt_pgn,
    null,p_attempt_duration_ms,p_incorrect_move,p_correct_move);
$$;

-- Older clients without an idempotency key can record their first result only.
create or replace function public.record_puzzle_attempt_result(
  p_username text,p_puzzle_id text,p_puzzle_correct boolean,p_attempt_duration_ms integer,
  p_incorrect_move text,p_correct_move text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('puzzle-solver:' || public.canonical_user_username(p_username),0));
  if exists (select 1 from public.puzzle_progress
      where username=public.canonical_user_username(p_username) and puzzle_id=p_puzzle_id) then
    return jsonb_build_object('coinDelta',0,'rated',false,'unratedUntil',null,'ratingEvent',null);
  end if;
  return public.submit_puzzle_run_attempt(gen_random_uuid(),p_username,p_puzzle_id,
    case when p_puzzle_correct then 'correct' else 'incorrect' end,
    '[Result "*"]' || chr(10) || chr(10) || '*',null,
    p_attempt_duration_ms,p_incorrect_move,p_correct_move);
end;
$$;

create or replace function public.record_first_puzzle_attempt_v2(
  p_username text,p_puzzle_id text,p_puzzle_correct boolean,p_attempt_duration_ms integer,
  p_incorrect_move text,p_correct_move text
) returns numeric language sql security definer set search_path = ''
as $$
  select (public.record_puzzle_attempt_result(p_username,p_puzzle_id,p_puzzle_correct,
    p_attempt_duration_ms,p_incorrect_move,p_correct_move)->>'coinDelta')::numeric;
$$;

create or replace function public.record_first_puzzle_attempt_v2(
  p_username text,p_puzzle_id text,p_puzzle_correct boolean,p_incorrect_move text,p_correct_move text
) returns integer language sql security definer set search_path = ''
as $$
  select trunc((public.record_puzzle_attempt_result(p_username,p_puzzle_id,p_puzzle_correct,
    null,p_incorrect_move,p_correct_move)->>'coinDelta')::numeric)::integer;
$$;

create or replace function public.record_first_puzzle_attempt(
  p_username text,p_puzzle_id text,p_puzzle_correct boolean
) returns public.puzzle_progress language plpgsql security definer set search_path = ''
as $$
declare result public.puzzle_progress;
begin
  perform public.record_puzzle_attempt_result(p_username,p_puzzle_id,p_puzzle_correct,null,null,null);
  select * into result from public.puzzle_progress
  where username=public.canonical_user_username(p_username) and puzzle_id=p_puzzle_id;
  return result;
end;
$$;

create or replace function public.record_first_puzzle_attempt(
  p_username text,p_puzzle_id text,p_puzzle_correct boolean,
  p_incorrect_move text default null,p_first_attempt_at timestamptz default null
) returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.record_puzzle_attempt_result(p_username,p_puzzle_id,p_puzzle_correct,null,p_incorrect_move,null);
end;
$$;
do $$
declare fn regprocedure;
begin
  for fn in select oid::regprocedure from pg_proc
    where pronamespace='public'::regnamespace
      and proname in ('record_first_puzzle_attempt','record_first_puzzle_attempt_v2',
                      'record_puzzle_attempt_result','record_puzzle_attempt_with_pgn')
  loop
    execute format('revoke all on function %s from public, anon, authenticated',fn);
  end loop;
end;
$$;

revoke insert,update,delete on public.puzzle_progress from anon,authenticated;
notify pgrst, 'reload schema';
commit;
