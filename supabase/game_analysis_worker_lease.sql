-- Prevent overlapping submission, progress, and request workers from overwriting one another.
begin;

alter table public.game_analyses
  add column if not exists worker_lease_token text,
  add column if not exists worker_lease_until timestamptz,
  add column if not exists last_checked_at timestamptz;

-- Keep the frequently-polled admin response small. The source JSON can contain complete engine
-- positions, so returning it merely to count progress makes each refresh unnecessarily expensive.
create or replace view public.game_analysis_admin_summaries
with (security_invoker = true)
as
select
  g.game_id,
  g.status,
  g.requested_by,
  greatest(0, g.total_positions - 1)::integer as total_moves,
  case
    when g.status = 'ready' then greatest(0, g.total_positions - 1)::integer
    when jsonb_array_length(g.position_states) = g.total_positions then (
      select count(*)::integer
      from jsonb_array_elements(g.position_states) with ordinality as state(value, position_number)
      where state.position_number > 1
        and state.value ->> 'completed' = 'true'
    )
    else least(
      greatest(0, g.total_positions - 1),
      greatest(0, g.completed_positions - 1)
    )::integer
  end as completed_moves,
  case
    when g.status = 'ready' then greatest(0, g.total_positions - 1)::integer
    when jsonb_array_length(g.position_states) = g.total_positions then (
      select count(*)::integer
      from jsonb_array_elements(g.position_states) with ordinality as state(value, position_number)
      where state.position_number > 1
        and (
          state.value ->> 'completed' = 'true'
          or state.value ->> 'requestStatus' is not null
        )
    )
    else least(
      greatest(0, g.total_positions - 1),
      greatest(0, g.queued_positions - 1)
    )::integer
  end as queued_moves,
  g.error,
  g.created_at,
  g.updated_at,
  g.completed_at,
  g.next_check_at,
  g.last_checked_at
from public.game_analyses as g;

revoke all on public.game_analysis_admin_summaries from public, anon, authenticated;
grant select on public.game_analysis_admin_summaries to service_role;

create or replace function public.claim_game_analysis(
  p_game_id text,
  p_lease_token text,
  p_lease_seconds integer,
  p_due_before timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_count integer := 0;
begin
  if nullif(btrim(coalesce(p_game_id, '')), '') is null
    or nullif(btrim(coalesce(p_lease_token, '')), '') is null
    or p_lease_seconds not between 30 and 3600 then
    return false;
  end if;

  update public.game_analyses
  set worker_lease_token = p_lease_token,
      worker_lease_until = now() + make_interval(secs => p_lease_seconds)
  where game_id = btrim(p_game_id)
    and status in ('queued', 'processing')
    and (p_due_before is null or next_check_at <= p_due_before)
    and (worker_lease_until is null or worker_lease_until <= now());
  get diagnostics claimed_count = row_count;
  return claimed_count = 1;
end;
$$;

create or replace function public.release_game_analysis(
  p_game_id text,
  p_lease_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  released_count integer := 0;
begin
  update public.game_analyses
  set worker_lease_token = null,
      worker_lease_until = null
  where game_id = btrim(coalesce(p_game_id, ''))
    and worker_lease_token = p_lease_token;
  get diagnostics released_count = row_count;
  return released_count = 1;
end;
$$;

revoke all on function public.claim_game_analysis(text, text, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_game_analysis(text, text, integer, timestamptz)
  to service_role;

revoke all on function public.release_game_analysis(text, text)
  from public, anon, authenticated;
grant execute on function public.release_game_analysis(text, text)
  to service_role;

commit;
notify pgrst, 'reload schema';
