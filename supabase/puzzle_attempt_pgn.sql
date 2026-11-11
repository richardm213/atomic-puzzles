begin;

create table if not exists public.puzzle_attempt_move_logs (
  id uuid primary key,
  username text not null,
  puzzle_id bigint not null references public.puzzles(id) on delete cascade,
  attempted_at timestamptz not null default clock_timestamp(),
  outcome text not null check (outcome in ('correct', 'incorrect', 'resigned')),
  pgn text not null check (length(pgn) between 1 and 16000),
  reconstructed boolean not null default false,
  progress_result jsonb
);

create index if not exists puzzle_attempt_move_logs_solver_idx
  on public.puzzle_attempt_move_logs (username, puzzle_id, attempted_at desc);
create index if not exists puzzle_attempt_move_logs_puzzle_idx
  on public.puzzle_attempt_move_logs (puzzle_id);

alter table public.puzzle_attempt_move_logs enable row level security;
revoke all on public.puzzle_attempt_move_logs from public, anon, authenticated;
grant select, insert, update on public.puzzle_attempt_move_logs to service_role;

create or replace function public.record_puzzle_attempt_with_pgn(
  p_attempt_id uuid,
  p_username text,
  p_puzzle_id text,
  p_outcome text,
  p_attempt_pgn text,
  p_record_progress boolean,
  p_attempt_duration_ms integer,
  p_incorrect_move text,
  p_correct_move text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  solver text := public.canonical_user_username(p_username);
  puzzle_key bigint := p_puzzle_id::bigint;
  inserted uuid;
  result jsonb;
begin
  if nullif(solver, '') is null then
    raise exception 'Username is required';
  end if;

  insert into public.puzzle_attempt_move_logs (id, username, puzzle_id, outcome, pgn)
  values (p_attempt_id, solver, puzzle_key, p_outcome, p_attempt_pgn)
  on conflict (id) do nothing
  returning id into inserted;

  if inserted is null then
    select progress_result into strict result
    from public.puzzle_attempt_move_logs
    where id = p_attempt_id and username = solver and puzzle_id = puzzle_key
      and outcome = p_outcome and pgn = p_attempt_pgn;
    return result;
  end if;

  if p_record_progress and p_outcome <> 'resigned' then
    result := public.record_puzzle_attempt_result(
      solver, puzzle_key::text, p_outcome = 'correct',
      p_attempt_duration_ms, p_incorrect_move, p_correct_move
    );
  else
    result := jsonb_build_object(
      'coinDelta', 0, 'rated', false, 'unratedUntil', null, 'ratingEvent', null
    );
  end if;

  update public.puzzle_attempt_move_logs set progress_result = result where id = inserted;
  return result;
end;
$$;

revoke all on function public.record_puzzle_attempt_with_pgn(uuid,text,text,text,text,boolean,integer,text,text)
  from public, anon, authenticated;
grant execute on function public.record_puzzle_attempt_with_pgn(uuid,text,text,text,text,boolean,integer,text,text)
  to service_role;

commit;
