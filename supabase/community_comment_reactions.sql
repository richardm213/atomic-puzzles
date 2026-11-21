-- Apply in Firefox on the current database before deploying the comment-reaction UI.
begin;

create table if not exists public.community_comment_reactions (
  comment_id bigint not null references public.community_comments(id) on update cascade on delete cascade,
  reaction text not null check (char_length(reaction) between 1 and 80),
  reactor_username text not null references public.users(username) on update cascade on delete cascade,
  check (reactor_username = lower(btrim(reactor_username)) and char_length(reactor_username) between 1 and 100),
  primary key (comment_id, reaction, reactor_username)
);

alter table public.community_comment_reactions enable row level security;
revoke all on public.community_comment_reactions from public, anon, authenticated;
grant select, insert, delete on public.community_comment_reactions to service_role;

-- The primary key covers this bounded lookup. Return counts and viewer selection, never reactors.
create or replace function public.get_community_comment_reactions(p_comment_ids bigint[], p_viewer text default null)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_object_agg(comment_id::text, reactions), '{}'::jsonb)
  from (
    select comment_id, jsonb_agg(jsonb_build_object(
      'reaction', reaction, 'count', count, 'reacted', reacted
    ) order by count desc, reaction) as reactions
    from (
      select comment_id, reaction, count(*) as count,
        coalesce(bool_or(reactor_username = lower(btrim(p_viewer))), false) as reacted
      from public.community_comment_reactions
      where comment_id = any(p_comment_ids)
      group by comment_id, reaction
    ) counts
    group by comment_id
  ) summaries;
$$;

create or replace function public.set_community_comment_reaction(
  p_comment_id bigint, p_target_type text, p_target_ids text[], p_target_context text,
  p_viewer text, p_reaction text, p_reacted boolean
)
returns jsonb language plpgsql set search_path = '' as $$
declare viewer text := lower(btrim(p_viewer));
begin
  if viewer is null or char_length(viewer) not between 1 and 100
    or p_reaction is null or char_length(p_reaction) not between 1 and 80 or p_reacted is null then
    raise exception 'Invalid comment reaction' using errcode = '22023';
  end if;
  -- Check the target atomically and prevent deletion while this write is in flight.
  perform 1 from public.community_comments
  where id = p_comment_id and target_type = p_target_type and target_id = any(p_target_ids)
    and target_context = coalesce(p_target_context, '') for key share;
  if not found then
    raise exception 'Comment does not belong to this discussion' using errcode = 'P0002';
  end if;
  if p_reacted then
    insert into public.users(username) values(viewer) on conflict(username) do nothing;
    insert into public.community_comment_reactions(comment_id, reaction, reactor_username)
    values(p_comment_id, p_reaction, viewer) on conflict do nothing;
  else
    delete from public.community_comment_reactions
    where comment_id = p_comment_id and reaction = p_reaction and reactor_username = viewer;
  end if;
  return coalesce(public.get_community_comment_reactions(array[p_comment_id], viewer) -> p_comment_id::text, '[]'::jsonb);
end;
$$;

revoke all on function public.get_community_comment_reactions(bigint[], text),
  public.set_community_comment_reaction(bigint, text, text[], text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.get_community_comment_reactions(bigint[], text),
  public.set_community_comment_reaction(bigint, text, text[], text, text, text, boolean)
  to service_role;

-- Keep reactions inside the existing single discussion RPC, rather than fetching per comment.
create or replace function public.get_community_discussion_bundle(
  p_target_type text, p_target_ids text[], p_target_context text default '', p_username text default null
)
returns jsonb language sql stable set search_path = '' as $$
  with comments as (
    select c.id, c.target_type, c.target_id, c.target_context, c.username, c.parent_id, c.body, c.created_at,
      coalesce(vc.upvotes, 0) as upvotes, coalesce(vc.downvotes, 0) as downvotes,
      coalesce(vc.score, 0) as score, coalesce(v.vote, 0) as viewer_vote
    from public.community_comments c
    left join public.community_comment_vote_counts vc on vc.comment_id = c.id
    left join public.community_comment_votes v on v.comment_id = c.id and v.username = lower(btrim(p_username))
    where c.target_type = p_target_type and c.target_id = any(p_target_ids)
      and c.target_context = coalesce(p_target_context, '')
  ), reactions as (
    select public.get_community_comment_reactions(array(select id from comments), p_username) as by_id
  ), puzzle_counts as (
    select pvc.puzzle_id, pvc.upvotes, pvc.downvotes, pvc.score
    from public.puzzle_vote_counts pvc
    where p_target_type = 'puzzle' and p_target_ids[1] ~ '^[0-9]+$'
      and pvc.puzzle_id = p_target_ids[1]::bigint
  ), viewer_puzzle_vote as (
    select pv.vote from public.puzzle_votes pv
    where p_target_type = 'puzzle' and p_target_ids[1] ~ '^[0-9]+$'
      and pv.puzzle_id = p_target_ids[1]::bigint and pv.username = lower(btrim(p_username))
  )
  select jsonb_build_object(
    'comments', coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object(
      'reactions', coalesce(r.by_id -> c.id::text, '[]'::jsonb)
    ) order by c.created_at, c.id) from comments c cross join reactions r), '[]'::jsonb),
    'counts', case when p_target_type = 'puzzle' then coalesce(
      (select to_jsonb(pc) from puzzle_counts pc),
      jsonb_build_object('puzzle_id', p_target_ids[1]::bigint, 'upvotes', 0, 'downvotes', 0, 'score', 0)
    ) else null end,
    'viewerVote', case when p_target_type = 'puzzle' then coalesce((select vote from viewer_puzzle_vote), 0) else null end
  );
$$;

notify pgrst, 'reload schema';
commit;
