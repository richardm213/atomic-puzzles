-- Apply in Firefox on the current database after puzzle_tag_hierarchy_rewards.sql.
-- Queue inserts earn nothing; both approval and direct publication insert puzzles.
begin;

alter table public.notifications alter column coin_amount type numeric(18,6);

-- Preserve the creator's input independently of reviewer edits. NULL on an older
-- row means unknown provenance; approval must not treat its edited tags as original.
alter table public.puzzles_queue add column if not exists submitted_tags text[];
alter table public.puzzles add column if not exists submitted_tags text[];

create or replace function public.capture_puzzle_submitted_tags()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if old.submitted_tags is not null then new.submitted_tags := old.submitted_tags; end if;
  elsif tg_table_name = 'puzzles_queue' or new.submitted_tags is null then
    new.submitted_tags := coalesce(new.tags,'{}'::text[]);
  end if;
  return new;
end;
$$;
revoke all on function public.capture_puzzle_submitted_tags() from public,anon,authenticated;
drop trigger if exists capture_puzzle_submitted_tags on public.puzzles_queue;
create trigger capture_puzzle_submitted_tags before insert or update of submitted_tags
on public.puzzles_queue for each row execute function public.capture_puzzle_submitted_tags();
drop trigger if exists capture_puzzle_submitted_tags on public.puzzles;
create trigger capture_puzzle_submitted_tags before insert or update of submitted_tags
on public.puzzles for each row execute function public.capture_puzzle_submitted_tags();

-- Record even empty submissions so retries cannot reward tags added after publication.
create table if not exists public.puzzle_submission_tag_credits (
  puzzle_id bigint primary key references public.puzzles(id),
  username text not null,
  submitted_tags text[] not null,
  reward numeric(18,6) not null default 0,
  created_at timestamptz not null default now()
);
alter table public.puzzle_submission_tag_credits enable row level security;
revoke all on public.puzzle_submission_tag_credits from public, anon, authenticated;

create or replace function public.credit_puzzle_submission_tags(
  p_puzzle_id bigint, p_submitted_tags text[]
) returns numeric language plpgsql security definer set search_path = '' as $$
declare
  puzzle public.puzzles%rowtype;
  author_name text;
  claimed bigint;
  motif text;
  seen_visible text[] := '{}'::text[];
  tag_reward numeric;
  total_reward numeric := 0;
  creation_reward numeric;
begin
  select * into puzzle from public.puzzles
  where id = p_puzzle_id and deleted_at is null for update;
  if not found then return 0; end if;
  author_name := lower(btrim(coalesce(puzzle.author,'')));
  select amount into creation_reward from public.coin_transactions
  where source_key = 'puzzle:' || p_puzzle_id and reason = 'puzzle_created'
    and username = author_name;
  if creation_reward is null then return 0; end if;
  p_submitted_tags := coalesce(puzzle.submitted_tags,p_submitted_tags,'{}'::text[]);
  if puzzle.submitted_tags is null then
    update public.puzzles set submitted_tags=p_submitted_tags where id=p_puzzle_id;
  end if;

  insert into public.puzzle_submission_tag_credits (puzzle_id,username,submitted_tags)
  values (p_puzzle_id,author_name,coalesce(p_submitted_tags,'{}'::text[]))
  on conflict (puzzle_id) do nothing returning puzzle_id into claimed;
  if claimed is null then return 0; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('puzzle-tag-wallet:' || author_name,0));

  -- Keep the most specific submitted tags. A child already implies its parent.
  for motif in
    select h.tag from public.puzzle_tag_hierarchy h
    where h.tag = any(coalesce(p_submitted_tags,'{}'::text[]))
      and h.tag = any(puzzle.tags)
      and not exists (
        select 1 from unnest(coalesce(p_submitted_tags,'{}'::text[])) child(tag)
        where child.tag <> h.tag and child.tag = any(puzzle.tags)
          and h.tag = any(public.puzzle_tag_ancestors(child.tag)))
    order by array_position(p_submitted_tags,h.tag)
  loop
    -- Initial curated votes belong to seaside_tiramisu, including on their own
    -- submissions. Other authors must not be paid again for an earlier related vote.
    if author_name = 'seaside_tiramisu' or not exists (
      select 1 from public.puzzle_tag_vote_history history
      where history.puzzle_id = p_puzzle_id and history.voter = author_name
        and (history.tag = any(public.puzzle_tag_ancestors(motif))
          or motif = any(public.puzzle_tag_ancestors(history.tag)))
    ) then
      tag_reward := case when cardinality(seen_visible) < 2 then 0.20 else 0.10 end;
      -- Use the ordinary vote and receipt keys: later votes cannot earn twice,
      -- and withdrawing this explicit vote uses the existing reward reversal.
      perform public.apply_coin_transaction(author_name,tag_reward,'puzzle_tagging',
        format('puzzle-tagging:%s:%s:%s',p_puzzle_id,motif,author_name),
        jsonb_build_object('puzzleId',p_puzzle_id,'tag',motif,'action','proposed',
          'submission',true));
      insert into public.puzzle_tag_votes (puzzle_id,tag,voter,direction)
      values (p_puzzle_id,motif,author_name,1)
      on conflict (puzzle_id,tag,voter) do nothing;
      total_reward := total_reward + tag_reward;
    end if;
    select array_agg(distinct tag) into seen_visible
    from unnest(seen_visible || public.puzzle_tag_ancestors(motif)) tags(tag);
  end loop;

  update public.puzzle_submission_tag_credits set reward = total_reward
  where puzzle_id = p_puzzle_id;
  update public.notifications set coin_amount = creation_reward + total_reward
  where notification_type = 'puzzle_approved' and puzzle_id = p_puzzle_id
    and recipient_username = author_name;
  return total_reward;
end;
$$;
revoke all on function public.credit_puzzle_submission_tags(bigint,text[])
  from public, anon, authenticated;
grant execute on function public.credit_puzzle_submission_tags(bigint,text[])
  to service_role;

create or replace function public.credit_tags_after_puzzle_publication()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.credit_puzzle_submission_tags(new.id,new.submitted_tags);
  return new;
end;
$$;
revoke all on function public.credit_tags_after_puzzle_publication()
  from public, anon, authenticated;

-- AFTER triggers run alphabetically: creation rewards, the single approval
-- notification, and initial curated votes must exist before these credits.
drop trigger if exists zz_credit_tags_after_puzzle_publication on public.puzzles;
create trigger zz_credit_tags_after_puzzle_publication after insert on public.puzzles
for each row execute function public.credit_tags_after_puzzle_publication();

-- Carry submitted tags through approval; older installed definitions omitted them.
create or replace function public.approve_queued_puzzle(
  p_queue_id bigint,
  p_reviewer text,
  p_puzzle_id bigint,
  p_complexity_bonus boolean,
  p_explanation_bonus boolean
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  queued public.puzzles_queue%rowtype;
  puzzle_id_sequence text;
  highest_puzzle_id bigint;
begin
  if lower(btrim(coalesce(p_reviewer, ''))) <> 'seaside_tiramisu' then
    raise exception 'Only seaside_tiramisu can approve puzzle submissions';
  end if;

  if p_puzzle_id is null or p_puzzle_id < 1 then
    raise exception 'Puzzle ID must be a positive integer';
  end if;

  if p_complexity_bonus is null or p_explanation_bonus is null then
    raise exception 'Puzzle reward bonus selections are required';
  end if;

  select * into queued
  from public.puzzles_queue
  where id = p_queue_id
  for update;

  if not found then
    raise exception 'Pending puzzle submission % was not found', p_queue_id;
  end if;

  -- Serialize ID allocation and insertion with other approvals.
  lock table public.puzzles in share row exclusive mode;

  -- The puzzle-created trigger reads these transaction-local settings so the
  -- reviewer's selections and the puzzle insert remain one atomic operation.
  perform set_config(
    'app.puzzle_creation_complexity_bonus',
    p_complexity_bonus::text,
    true
  );
  perform set_config(
    'app.puzzle_creation_explanation_bonus',
    p_explanation_bonus::text,
    true
  );

  begin
    insert into public.puzzles (
      id, fen, solution, event, event_name, event_date, players,
      white_player, black_player, explanation, opa_style, author, tags, game_id, match_id,
      position_moves, game_initial_fen, submitted_tags
    )
    values (
      p_puzzle_id,
      btrim(queued.fen),
      btrim(queued.solution),
      btrim(queued.event),
      btrim(queued.event_name),
      btrim(queued.event_date),
      queued.players,
      btrim(queued.white_player),
      btrim(queued.black_player),
      btrim(queued.explanation),
      queued.opa_style,
      coalesce(nullif(btrim(queued.author), ''), queued.submitted_by),
      queued.tags,
      queued.game_id,
      queued.match_id,
      queued.position_moves,
      queued.game_initial_fen,
      coalesce(queued.submitted_tags,'{}'::text[])
    );
  exception
    when unique_violation then
      raise exception 'Puzzle ID % already exists', p_puzzle_id;
  end;

  -- Explicit identity values do not advance PostgreSQL's backing sequence.
  -- Keep it aligned so any future default-ID insert starts after this puzzle.
  select pg_get_serial_sequence('public.puzzles', 'id')
  into puzzle_id_sequence;

  if puzzle_id_sequence is not null then
    select coalesce(max(id), 0)
    into highest_puzzle_id
    from public.puzzles;

    perform setval(
      puzzle_id_sequence::regclass,
      highest_puzzle_id,
      true
    );
  end if;

  delete from public.puzzles_queue
  where id = p_queue_id;

  return p_puzzle_id;
end;
$$;

commit;
