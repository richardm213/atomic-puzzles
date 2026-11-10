-- Curated motif schema and write protection for published puzzles.

alter table public.puzzles
  add column if not exists tags text[] not null default '{}'::text[];

alter table public.puzzles
  drop constraint if exists puzzles_tags_valid;

alter table public.puzzles
  add constraint puzzles_tags_valid check (
    array_position(tags, null) is null
    and tags <@ array[
      'advanced_pawn',
      'queen_angles',
      'coercion',
      'diagonal_clearance',
      'file_clearance',
      'square_clearance',
      'fork',
      'epaulette_fork',
      'zwischenzug',
      'knight_invasion',
      'bishop_invasion',
      'rook_invasion',
      'castling_rook_invasion',
      'trident',
      'sacrifice',
      'defensive',
      'prophylaxis',
      'prevent_invasion',
      'prevent_knight_invasion',
      'prevent_rook_invasion',
      'prevent_queen_invasion',
      'prevent_bishop_invasion',
      'material',
      'draw',
      'blocking',
      'king_walk',
      'avoiding_perpetual',
      'pin',
      'unpinning',
      'tempo',
      'discovered_mate',
      'rook_mate',
      'bishop_knight_mate',
      'king_blockade',
      'square',
      'explosion_mate_threat',
      'exposed_king',
      'explosion_defense',
      'development',
      'stuck_pawn',
      'stuck_piece',
      'endgame',
      'threading_the_needle',
      'pawn_endgame'
    ]::text[]
  );

create or replace function public.protect_puzzle_tags()
returns trigger
language plpgsql
set search_path = public, auth
as $$
begin
  if old.tags is distinct from new.tags
    and coalesce(auth.role(), '') <> 'service_role'
    and current_user not in ('postgres', 'service_role')
  then
    raise exception 'Puzzle motifs can only be changed through the protected editor';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_puzzle_tags on public.puzzles;
create trigger protect_puzzle_tags
before update of tags on public.puzzles
for each row execute function public.protect_puzzle_tags();

-- Keep the hierarchy in sync with shared/domain/puzzles/puzzleMotifs.ts.
create or replace function public.related_puzzle_motif_tags(p_tag text)
returns table (tag text)
language sql
immutable
set search_path = ''
as $$
  with recursive relationships(child_tag, parent_tag) as (
    values
      ('epaulette_fork', 'fork'),
      ('castling_rook_invasion', 'rook_invasion'),
      ('prophylaxis', 'defensive'),
      ('prevent_invasion', 'defensive'),
      ('prevent_knight_invasion', 'prevent_invasion'),
      ('prevent_rook_invasion', 'prevent_invasion'),
      ('prevent_queen_invasion', 'prevent_invasion'),
      ('prevent_bishop_invasion', 'prevent_invasion'),
      ('blocking', 'defensive'),
      ('king_walk', 'defensive'),
      ('avoiding_perpetual', 'defensive'),
      ('explosion_defense', 'defensive'),
      ('threading_the_needle', 'endgame'),
      ('pawn_endgame', 'endgame')
  ), ancestors(tag) as (
    select parent_tag from relationships where child_tag = p_tag
    union
    select r.parent_tag from relationships r join ancestors a on r.child_tag = a.tag
  ), descendants(tag) as (
    select child_tag from relationships where parent_tag = p_tag
    union
    select r.child_tag from relationships r join descendants d on r.parent_tag = d.tag
  )
  select tag from ancestors
  union
  select tag from descendants;
$$;

revoke execute on function public.related_puzzle_motif_tags(text) from public, anon, authenticated;

-- Reward eligibility is managed by puzzle_tag_hierarchy_rewards.sql.
notify pgrst, 'reload schema';
