-- Durable, shared AtomicDB game analysis jobs with an idempotent two-coin charge.
begin;

alter table public.coin_transactions
  drop constraint if exists coin_transactions_reason_check;
alter table public.coin_transactions
  add constraint coin_transactions_reason_check check (reason in (
    'coin_transfer', 'puzzle_correct', 'puzzle_attempted', 'puzzle_created',
    'shop_redemption', 'daily_bonus', 'tournament_bet', 'tournament_bet_payout',
    'tournament_bet_refund', 'prediction_order_reserve', 'prediction_order_refund',
    'prediction_trade_credit', 'prediction_trade_fee', 'prediction_market_payout',
    'prediction_liquidity_funding', 'game_analysis'
  ));

create table if not exists public.game_analyses (
  game_id text primary key check (length(btrim(game_id)) between 1 and 160),
  status text not null default 'queued' check (status in ('queued', 'processing', 'ready', 'failed')),
  requested_by text not null check (
    requested_by = lower(btrim(requested_by)) and requested_by ~ '^[a-z0-9_-]{1,100}$'
  ),
  initial_fen text not null,
  moves jsonb not null check (jsonb_typeof(moves) = 'array'),
  position_fens jsonb not null check (jsonb_typeof(position_fens) = 'array'),
  position_states jsonb not null default '[]'::jsonb check (jsonb_typeof(position_states) = 'array'),
  total_positions integer not null check (total_positions > 0),
  queued_positions integer not null default 0 check (queued_positions >= 0),
  completed_positions integer not null default 0 check (completed_positions >= 0),
  cost numeric(18, 6) not null default 2 check (cost = 2),
  charge_attempt integer not null default 1 check (charge_attempt > 0),
  result jsonb,
  error text,
  retry_count integer not null default 0 check (retry_count >= 0),
  next_check_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (queued_positions <= total_positions),
  check (completed_positions <= total_positions)
);

create index if not exists game_analyses_work_idx
  on public.game_analyses (next_check_at, created_at)
  where status in ('queued', 'processing');

revoke all on table public.game_analyses from public, anon, authenticated;

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
    game_id, requested_by, initial_fen, moves, position_fens, total_positions
  ) values (
    normalized_game_id, normalized_username, btrim(p_initial_fen), p_moves, p_position_fens,
    jsonb_array_length(p_position_fens)
  ) on conflict (game_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 1 then
    current_balance := public.apply_coin_transaction(
      normalized_username,
      -2::numeric,
      'game_analysis',
      'game-analysis:' || normalized_game_id || ':1',
      jsonb_build_object('gameId', normalized_game_id, 'cost', 2),
      now()
    );
  else
    select * into existing
    from public.game_analyses
    where game_id = normalized_game_id
    for update;

    if existing.status = 'failed' then
      current_balance := public.apply_coin_transaction(
        normalized_username,
        -2::numeric,
        'game_analysis',
        'game-analysis:' || normalized_game_id || ':' || (existing.charge_attempt + 1)::text,
        jsonb_build_object('gameId', normalized_game_id, 'cost', 2, 'retry', true),
        now()
      );
    end if;

    update public.game_analyses
    set status = 'queued', requested_by = normalized_username,
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

commit;
notify pgrst, 'reload schema';
