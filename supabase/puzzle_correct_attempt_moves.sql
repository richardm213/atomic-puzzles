begin;

-- Keep the original attempt immutable; this is a summary of the first correct graded solve.
alter table public.puzzle_progress add column if not exists solved_move text;

with moves as (
  select p.username,p.puzzle_id,
    coalesce(case when p.puzzle_correct then p.correct_move end, (
      select l.correct_move from public.puzzle_attempt_move_logs l
      where l.username=p.username and l.puzzle_id=p.puzzle_catalog_id
        and l.outcome='correct' and l.graded and not l.reconstructed
      order by l.attempted_at,l.id limit 1
    )) as move
  from public.puzzle_progress p where p.has_solved and p.solved_move is null
)
update public.puzzle_progress p set solved_move=m.move
from moves m where m.username=p.username and m.puzzle_id=p.puzzle_id and m.move is not null;

-- Patch only the writer, preserving cooldowns, exclusions, coins, and historical first results.
do $migration$
declare
  definition text := pg_get_functiondef('public.submit_puzzle_run_attempt(uuid,text,text,text,text,uuid,integer,text,text)'::regprocedure);
  old_statement text := 'set has_solved=true' || chr(10);
  new_statement text := 'set has_solved=true,solved_move=coalesce(solved_move,p_correct_move)' || chr(10);
begin
  if position(new_statement in definition)>0 then return; end if;
  if position(old_statement in definition)=0 then raise exception 'Unexpected puzzle run writer'; end if;
  execute replace(definition,old_statement,new_statement);
end;
$migration$;

notify pgrst, 'reload schema';
commit;
