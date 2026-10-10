-- Store Atomic Coin balances and ledger entries with fractional precision.
-- Product surfaces continue to show whole-coin balances; negative ledger entries
-- may be shown to one decimal place so fractional penalties remain auditable.
begin;

alter table public.coin_accounts
  drop constraint if exists coin_accounts_balance_check;

alter table public.coin_accounts
  alter column balance drop default,
  alter column balance type numeric(18, 6) using balance::numeric(18, 6),
  alter column balance set default 0;

alter table public.coin_accounts
  add constraint coin_accounts_balance_check check (balance >= 0);

alter table public.coin_transactions
  drop constraint if exists coin_transactions_amount_check;

alter table public.coin_transactions
  alter column amount type numeric(18, 6) using amount::numeric(18, 6);

alter table public.coin_transactions
  add constraint coin_transactions_amount_check check (amount <> 0);

comment on column public.coin_accounts.balance is
  'Exact Atomic Coin balance. User-facing balances are displayed as whole coins.';

comment on column public.coin_transactions.amount is
  'Exact signed Atomic Coin ledger amount, stored to six decimal places.';

-- Fractional callers resolve to this overload. Whole-coin callers keep using
-- the integer overload below, which delegates here so both paths share the same
-- locking, ban enforcement, idempotency, and nonnegative-balance checks.
create or replace function public.apply_coin_transaction(
  p_username text,
  p_amount numeric,
  p_reason text,
  p_source_key text,
  p_metadata jsonb default '{}'::jsonb,
  p_created_at timestamptz default now()
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_username text := lower(btrim(coalesce(p_username, '')));
  normalized_amount numeric(18, 6) := round(coalesce(p_amount, 0), 6);
  inserted_id bigint;
  next_balance numeric(18, 6);
begin
  if normalized_username = ''
    or normalized_amount = 0
    or nullif(btrim(p_source_key), '') is null then
    raise exception 'Invalid coin transaction';
  end if;

  perform public.assert_coin_economy_access(normalized_username);

  insert into public.coin_accounts (username) values (normalized_username)
  on conflict (username) do nothing;
  perform 1 from public.coin_accounts where username = normalized_username for update;

  insert into public.coin_transactions (
    username,
    amount,
    reason,
    source_key,
    metadata,
    created_at
  ) values (
    normalized_username,
    normalized_amount,
    p_reason,
    btrim(p_source_key),
    coalesce(p_metadata, '{}'::jsonb),
    p_created_at
  )
  on conflict (source_key) do nothing
  returning id into inserted_id;

  if inserted_id is not null then
    update public.coin_accounts
    set balance = balance + normalized_amount, updated_at = now()
    where username = normalized_username
      and balance + normalized_amount >= 0
    returning balance into next_balance;
    if next_balance is null then
      raise exception 'Not enough coins';
    end if;
  end if;

  select balance into next_balance
  from public.coin_accounts
  where username = normalized_username;
  return next_balance;
end;
$$;

create or replace function public.apply_coin_transaction(
  p_username text,
  p_amount integer,
  p_reason text,
  p_source_key text,
  p_metadata jsonb default '{}'::jsonb,
  p_created_at timestamptz default now()
)
returns integer
language sql
security definer
set search_path = public
as $$
  select floor(public.apply_coin_transaction(
    p_username,
    p_amount::numeric,
    p_reason,
    p_source_key,
    p_metadata,
    p_created_at
  ))::integer;
$$;

revoke all on function public.apply_coin_transaction(
  text,
  numeric,
  text,
  text,
  jsonb,
  timestamptz
) from public, anon, authenticated;

revoke all on function public.apply_coin_transaction(
  text,
  integer,
  text,
  text,
  jsonb,
  timestamptz
) from public, anon, authenticated;

create or replace function public.get_coin_summary(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_username text := lower(btrim(coalesce(p_username, '')));
  current_balance numeric(18, 6);
  claimed_today boolean;
  active_ban public.coin_economy_bans%rowtype;
begin
  insert into public.coin_accounts (username) values (normalized_username)
  on conflict (username) do nothing;
  select balance into current_balance
  from public.coin_accounts
  where username = normalized_username;
  select exists (
    select 1 from public.coin_transactions
    where source_key = 'daily:' || normalized_username || ':' || current_date::text
  ) into claimed_today;
  select * into active_ban
  from public.coin_economy_bans ban
  where ban.username = normalized_username
    and ban.starts_at <= now()
    and ban.ends_at > now()
    and ban.revoked_at is null
  order by ban.ends_at desc, ban.id desc
  limit 1;

  return jsonb_build_object(
    'balance', current_balance,
    'dailyClaimAvailable', not claimed_today and active_ban.id is null,
    'economyBan', case when active_ban.id is null then null else jsonb_build_object(
      'endsAt', active_ban.ends_at,
      'reason', active_ban.reason
    ) end
  );
end;
$$;

revoke all on function public.get_coin_summary(text) from public, anon, authenticated;
grant execute on function public.get_coin_summary(text) to service_role;

commit;

notify pgrst, 'reload schema';
