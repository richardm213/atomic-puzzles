-- Price new and retried game analyses at one coin while preserving historical costs.
begin;

alter table public.game_analyses
  alter column cost set default 1;
alter table public.game_analyses
  drop constraint if exists game_analyses_cost_check;
alter table public.game_analyses
  add constraint game_analyses_cost_check check (cost > 0);

create or replace function public.request_game_analysis(
  p_username text,
  p_game_id text,
  p_initial_fen text,
  p_moves jsonb,
  p_position_fens jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_username text := lower(btrim(coalesce(p_username, '')));
  normalized_game_id text := btrim(coalesce(p_game_id, ''));
  existing public.game_analyses%rowtype;
  current_balance numeric(18, 6);
  inserted_count integer := 0;
begin
  if normalized_username !~ '^[a-z0-9_-]{1,100}$'
    or length(normalized_game_id) not between 1 and 160
    or nullif(btrim(coalesce(p_initial_fen, '')), '') is null
    or jsonb_typeof(p_moves) <> 'array'
    or jsonb_typeof(p_position_fens) <> 'array'
    or jsonb_array_length(p_position_fens) <> jsonb_array_length(p_moves) + 1
    or jsonb_array_length(p_position_fens) > 1001 then
    raise exception 'Invalid game analysis request';
  end if;

  insert into public.game_analyses (
    game_id, requested_by, initial_fen, moves, position_fens, total_positions, cost
  ) values (
    normalized_game_id, normalized_username, btrim(p_initial_fen), p_moves, p_position_fens,
    jsonb_array_length(p_position_fens), 1
  ) on conflict (game_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 1 then
    current_balance := public.apply_coin_transaction(
      normalized_username, -1::numeric, 'game_analysis',
      'game-analysis:' || normalized_game_id || ':1',
      jsonb_build_object('gameId', normalized_game_id, 'cost', 1), now()
    );
  else
    select * into existing
    from public.game_analyses
    where game_id = normalized_game_id
    for update;

    if existing.status = 'failed' then
      current_balance := public.apply_coin_transaction(
        normalized_username, -1::numeric, 'game_analysis',
        'game-analysis:' || normalized_game_id || ':' || (existing.charge_attempt + 1)::text,
        jsonb_build_object('gameId', normalized_game_id, 'cost', 1, 'retry', true), now()
      );
    end if;

    update public.game_analyses
    set status = 'queued', requested_by = normalized_username, cost = 1,
      charge_attempt = charge_attempt + 1, error = null, retry_count = 0,
      next_check_at = now(), updated_at = now()
    where game_id = normalized_game_id and status = 'failed';
    if existing.status <> 'failed' then
      select balance into current_balance
      from public.coin_accounts where username = normalized_username;
    end if;
  end if;

  select * into existing from public.game_analyses where game_id = normalized_game_id;
  return jsonb_build_object(
    'created', inserted_count = 1,
    'balance', coalesce(current_balance, 0),
    'status', existing.status,
    'gameId', existing.game_id
  );
end;
$$;

revoke all on function public.request_game_analysis(text, text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.request_game_analysis(text, text, text, jsonb, jsonb)
  to service_role;

create or replace function public.refund_game_analysis(
  p_username text,
  p_game_id text,
  p_charge_attempt integer,
  p_message text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  charge_source text := 'game-analysis:' || btrim(p_game_id) || ':' || p_charge_attempt::text;
  charged_amount numeric(18, 6);
  current_balance numeric(18, 6);
begin
  select abs(amount) into charged_amount
  from public.coin_transactions
  where source_key = charge_source and amount < 0
  limit 1;
  if charged_amount is null then
    select balance into current_balance
    from public.coin_accounts
    where username = lower(btrim(p_username));
    return coalesce(current_balance, 0);
  end if;

  return public.apply_coin_transaction(
    lower(btrim(p_username)), charged_amount, 'game_analysis',
    'game-analysis-refund:' || btrim(p_game_id) || ':' || p_charge_attempt::text,
    jsonb_build_object('gameId', btrim(p_game_id), 'refund', true, 'reason', p_message), now()
  );
end;
$$;

revoke all on function public.refund_game_analysis(text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.refund_game_analysis(text, text, integer, text)
  to service_role;

commit;
notify pgrst, 'reload schema';
