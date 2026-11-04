-- Preserve the quantity and last-trade time of every position when its market resolves.
-- Cost basis remains derivable from immutable fills and legacy position credits, while this
-- snapshot keeps resolved positions in betting history even if live positions are later cleared.
begin;

create table if not exists public.prediction_position_settlements (
  market_id text not null references public.prediction_markets(id),
  username text not null,
  outcome text not null check (outcome in ('yes', 'no')),
  quantity numeric(18, 6) not null check (quantity > 0),
  position_updated_at timestamptz not null,
  resolved_at timestamptz not null,
  primary key (market_id, username, outcome)
);

create index if not exists prediction_position_settlements_resolved_idx
  on public.prediction_position_settlements (resolved_at desc, market_id);

revoke all on table public.prediction_position_settlements from public, anon, authenticated;
alter table public.prediction_position_settlements enable row level security;

-- Backfill markets that resolved before snapshots existed. Position timestamps were previously
-- restored to their latest actual trade or original converted bet.
insert into public.prediction_position_settlements (
  market_id,
  username,
  outcome,
  quantity,
  position_updated_at,
  resolved_at
)
select
  position.market_id,
  position.username,
  position.outcome,
  position.quantity,
  position.updated_at,
  market.resolved_at
from public.prediction_positions position
join public.prediction_markets market on market.id = position.market_id
where position.quantity > 0
  and position.username <> 'prediction_admin'
  and market.status = 'resolved'
  and market.resolved_at is not null
on conflict (market_id, username, outcome) do nothing;

create or replace function public.snapshot_prediction_positions(
  p_market_id text,
  p_resolved_at timestamptz
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.prediction_position_settlements (
    market_id,
    username,
    outcome,
    quantity,
    position_updated_at,
    resolved_at
  )
  select
    market_id,
    username,
    outcome,
    quantity,
    updated_at,
    p_resolved_at
  from public.prediction_positions
  where market_id = p_market_id
    and quantity > 0
    and username <> 'prediction_admin'
  on conflict (market_id, username, outcome) do update
  set quantity = excluded.quantity,
      position_updated_at = excluded.position_updated_at,
      resolved_at = excluded.resolved_at;
$$;

revoke all on function public.snapshot_prediction_positions(text, timestamptz)
  from public, anon, authenticated;

-- Releasing a resting sell reservation is not a position trade, so it must not replace the
-- position's meaningful last-update time immediately before the resolution snapshot.
create or replace function public.cancel_prediction_market_orders(p_market_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.prediction_orders%rowtype;
begin
  for order_row in
    select *
    from public.prediction_orders
    where market_id = p_market_id
      and status in ('open', 'partial')
      and remaining_quantity > 0
    order by id
    for update
  loop
    if order_row.side = 'sell' then
      update public.prediction_positions
      set reserved_quantity = reserved_quantity - order_row.remaining_quantity
      where market_id = p_market_id
        and username = order_row.username
        and outcome = order_row.outcome;
    end if;

    update public.prediction_orders
    set remaining_quantity = 0,
        status = 'cancelled',
        updated_at = now()
    where id = order_row.id;
  end loop;
end;
$$;

revoke all on function public.cancel_prediction_market_orders(text)
  from public, anon, authenticated;

create or replace function public.snapshot_prediction_positions_on_resolution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status <> 'resolved' and new.status = 'resolved' then
    perform public.snapshot_prediction_positions(new.id, coalesce(new.resolved_at, now()));
  end if;
  return new;
end;
$$;

revoke all on function public.snapshot_prediction_positions_on_resolution()
  from public, anon, authenticated;

drop trigger if exists prediction_markets_snapshot_positions on public.prediction_markets;
create trigger prediction_markets_snapshot_positions
before update of status on public.prediction_markets
for each row
execute function public.snapshot_prediction_positions_on_resolution();

notify pgrst, 'reload schema';
commit;
