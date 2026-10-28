-- Reduce matching scans and collapse each market transaction to one realtime signal.
begin;

create index if not exists prediction_orders_open_match_idx
  on public.prediction_orders (market_id, outcome, side, price_cents, created_at, id)
  include (username, remaining_quantity)
  where status in ('open', 'partial') and remaining_quantity > 0;

alter table public.prediction_market_updates
  add column if not exists transaction_id bigint;

create or replace function public.signal_prediction_market_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_row jsonb;
  changed_market_id text;
  changed_scope text := case when tg_table_name = 'prediction_markets' then 'catalog' else 'book' end;
begin
  changed_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  changed_market_id := coalesce(changed_row ->> 'market_id', changed_row ->> 'id');

  insert into public.prediction_market_updates (
    market_id, version, change_scope, transaction_id, updated_at
  )
  values (changed_market_id, 1, changed_scope, txid_current(), now())
  on conflict (market_id) do update
  set version = public.prediction_market_updates.version + 1,
      change_scope = excluded.change_scope,
      transaction_id = excluded.transaction_id,
      updated_at = excluded.updated_at
  where public.prediction_market_updates.transaction_id is distinct from excluded.transaction_id;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.signal_prediction_market_update()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
