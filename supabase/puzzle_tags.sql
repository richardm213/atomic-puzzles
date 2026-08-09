-- Adds a curated motif list to each published puzzle.
-- Safe to run more than once in the Supabase SQL editor.

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
      'zwischenzug',
      'knight_invasion',
      'bishop_invasion',
      'rook_invasion',
      'castling_rook_invasion',
      'trident',
      'sacrifice',
      'defensive',
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
      'king_blockade',
      'square',
      'explosion_mate_threat',
      'explosion_defense',
      'development',
      'stuck_pawn',
      'stuck_piece',
      'equal',
      'endgame',
      'endgame_draw'
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

notify pgrst, 'reload schema';
