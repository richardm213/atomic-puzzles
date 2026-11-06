-- Creator rankings are derived from puzzle authorship and votes, so vote changes are reflected
-- immediately without maintaining a second karma ledger.

create index if not exists puzzles_created_at_idx on public.puzzles (created_at);
create index if not exists puzzles_normalized_author_idx
  on public.puzzles ((lower(btrim(author))));
create index if not exists puzzle_votes_puzzle_id_idx on public.puzzle_votes (puzzle_id);
create index if not exists puzzle_votes_created_at_idx on public.puzzle_votes (created_at);
create index if not exists puzzle_votes_normalized_username_idx
  on public.puzzle_votes ((lower(btrim(username))));

create or replace function public.get_puzzle_creator_leaderboard(
  p_period text,
  p_month text default null
)
returns table (
  rank bigint,
  username text,
  puzzles_created bigint,
  puzzle_karma bigint,
  upvotes_received bigint,
  downvotes_received bigint,
  upvotes_given bigint,
  downvotes_given bigint
)
language sql
stable
set search_path = public
as $$
  with selected_puzzles as (
    select
      puzzle.id,
      lower(btrim(puzzle.author)) as author
    from public.puzzles puzzle
    where nullif(btrim(coalesce(puzzle.author, '')), '') is not null
      and (
        p_period = 'all'
        or (
          p_period = 'monthly'
          and puzzle.created_at >= ((p_month || '-01')::date::timestamp at time zone 'UTC')
          and puzzle.created_at < (
            ((p_month || '-01')::date + interval '1 month')::timestamp at time zone 'UTC'
          )
        )
      )
  ),
  creator_totals_from_puzzles as (
    select
      selected.author as username,
      count(distinct selected.id)::bigint as puzzles_created,
      count(*) filter (
        where vote.vote = 1
          and lower(btrim(vote.username)) <> selected.author
      )::bigint as upvotes_received,
      count(*) filter (
        where vote.vote = -1
          and lower(btrim(vote.username)) <> selected.author
      )::bigint as downvotes_received
    from selected_puzzles selected
    left join public.puzzle_votes vote on vote.puzzle_id = selected.id
    group by selected.author
  ),
  creator_totals as (
    select * from creator_totals_from_puzzles
    union all
    select 'admin', 0::bigint, 0::bigint, 0::bigint
    where not exists (
      select 1 from creator_totals_from_puzzles where username = 'admin'
    )
  ),
  votes_given as (
    select
      lower(btrim(vote.username)) as username,
      count(*) filter (where vote.vote = 1)::bigint as upvotes_given,
      count(*) filter (where vote.vote = -1)::bigint as downvotes_given
    from public.puzzle_votes vote
    where nullif(btrim(coalesce(vote.username, '')), '') is not null
      and (
        p_period = 'all'
        or (
          p_period = 'monthly'
          and vote.created_at >= ((p_month || '-01')::date::timestamp at time zone 'UTC')
          and vote.created_at < (
            ((p_month || '-01')::date + interval '1 month')::timestamp at time zone 'UTC'
          )
        )
      )
    group by lower(btrim(vote.username))
  ),
  combined as (
    select
      creator.username,
      creator.puzzles_created,
      creator.upvotes_received - creator.downvotes_received as puzzle_karma,
      creator.upvotes_received,
      creator.downvotes_received,
      coalesce(given.upvotes_given, 0)::bigint as upvotes_given,
      coalesce(given.downvotes_given, 0)::bigint as downvotes_given
    from creator_totals creator
    left join votes_given given using (username)
  )
  select
    rank() over (order by combined.puzzle_karma desc)::bigint as rank,
    combined.username,
    combined.puzzles_created,
    combined.puzzle_karma,
    combined.upvotes_received,
    combined.downvotes_received,
    combined.upvotes_given,
    combined.downvotes_given
  from combined
  order by combined.puzzle_karma desc, combined.username asc;
$$;

create or replace function public.get_puzzle_creator_leaderboard_months()
returns table (month text)
language sql
stable
set search_path = public
as $$
  select distinct to_char(puzzle.created_at at time zone 'UTC', 'YYYY-MM') as month
  from public.puzzles puzzle
  where puzzle.created_at is not null
    and nullif(btrim(coalesce(puzzle.author, '')), '') is not null
  order by month desc;
$$;

revoke all on function public.get_puzzle_creator_leaderboard(text, text) from public;
revoke all on function public.get_puzzle_creator_leaderboard(text, text) from anon, authenticated;
grant execute on function public.get_puzzle_creator_leaderboard(text, text) to service_role;

revoke all on function public.get_puzzle_creator_leaderboard_months() from public;
revoke all on function public.get_puzzle_creator_leaderboard_months() from anon, authenticated;
grant execute on function public.get_puzzle_creator_leaderboard_months() to service_role;

notify pgrst, 'reload schema';
