-- Run in Firefox on the current database after puzzle_lifetime_grading.sql. Always rolls back.
begin;
-- This fixture and all submitted attempts must be rolled back.
insert into public.users(id,username)overriding system value values(-17771777,'grading_test_20261119');
create temporary table lifetime_grading_fixture on commit drop as
select id,row_number()over(order by id)as scenario from public.puzzles where deleted_at is null order by id limit 2;
insert into public.puzzle_progress(username,puzzle_id,first_attempt_at,puzzle_correct,rated,has_solved,attempt_color)
select 'grading_test_20261119',id::text,now()-interval '4 months',scenario=2,false,scenario=2,
case when scenario=2 then 'green'else 'red'end from lifetime_grading_fixture;
insert into public.puzzle_solver_states(username,puzzle_id,grading_available_at,original_color,correct_streak)
select 'grading_test_20261119',id,now()-interval '2 months',case when scenario=2 then 'green'end,
case when scenario=2 then 1 else 0 end from lifetime_grading_fixture;
update public.puzzle_solver_states s set graded_miss_count=case f.scenario when 1 then 1 else 0 end,graded_solve_count=case f.scenario when 2 then 1 else 0 end,first_graded_solve_at=case when f.scenario=2 then now()-interval '4 months'end from lifetime_grading_fixture f where s.username='grading_test_20261119'and s.puzzle_id=f.id;
do $$
declare
  puzzle text;clean text;result jsonb;state public.puzzle_solver_states;expiry timestamptz;logs_before bigint;
begin
select id::text into strict puzzle from lifetime_grading_fixture where scenario=1;
select id::text into strict clean from lifetime_grading_fixture where scenario=2;
select *into strict state from public.puzzle_solver_states where username='grading_test_20261119'and puzzle_id=puzzle::bigint;
if state.graded_miss_count<>1 or state.graded_solve_count<>0 then raise exception 'Legacy wrong attempt lost';end if;
result:=public.submit_puzzle_run_attempt(gen_random_uuid(),'grading_test_20261119',puzzle,'correct','*',null,30000,null,'1. Kd1');
if result#>>'{grading,color}'<>'yellow'or(result#>>'{grading,permanent}')::boolean or(result#>>'{grading,graded}')::boolean then raise exception 'First solve must retain old miss and start cooldown: %',result;end if;
select grading_available_at into expiry from public.puzzle_solver_states where username='grading_test_20261119'and puzzle_id=puzzle::bigint;
select count(*)into logs_before from public.puzzle_attempt_move_logs where username='grading_test_20261119';
result:=public.submit_puzzle_run_attempt(gen_random_uuid(),'grading_test_20261119',puzzle,'incorrect','*',null,10000,'1. Ke2',null);
if(result->>'graded')::boolean or(result->>'coinDelta')::numeric<>0 then raise exception 'Cooldown attempt must be practice';end if;
result:=public.submit_puzzle_run_attempt(gen_random_uuid(),'grading_test_20261119',puzzle,'correct','*',null,10000,null,'1. Kd1');
if(result->>'graded')::boolean then raise exception 'Practice run unexpectedly graded';end if;
if(select grading_available_at from public.puzzle_solver_states where username='grading_test_20261119'and puzzle_id=puzzle::bigint)is distinct from expiry
or(select count(*)from public.puzzle_attempt_move_logs where username='grading_test_20261119')<>logs_before then raise exception 'Practice changed fixed cooldown or retained history';end if;
-- Advance the first-solve clock past its two-month wait.
update public.puzzle_solver_states set first_graded_solve_at=now()-interval '3 months',grading_available_at=now()-interval '1 month'
where username='grading_test_20261119'and puzzle_id=puzzle::bigint;
result:=public.submit_puzzle_run_attempt(gen_random_uuid(),'grading_test_20261119',puzzle,'incorrect','*',null,10000,'1. Ke2',null);
if not(result->>'graded')::boolean or result#>>'{grading,color}'<>'orange'then raise exception 'Past and current graded mistakes must accumulate: %',result;end if;
result:=public.submit_puzzle_run_attempt(gen_random_uuid(),'grading_test_20261119',puzzle,'correct','*',null,30000,null,'1. Kd1');
if not(result#>>'{grading,permanent}')::boolean or(result#>>'{grading,graded}')::boolean or result#>>'{grading,color}'<>'orange'then raise exception 'Second solve must permanently finish grading and retain misses: %',result;end if;
result:=public.submit_puzzle_run_attempt(gen_random_uuid(),'grading_test_20261119',puzzle,'correct','*',null,10000,null,'1. Kd1');
if(result->>'graded')::boolean or(result->>'coinDelta')::numeric<>0 then raise exception 'Third solve must be practice';end if;
if(select puzzle_correct from public.puzzle_progress where username='grading_test_20261119'and puzzle_id=puzzle)then raise exception 'Original rating result changed';end if;
result:=public.submit_puzzle_run_attempt(gen_random_uuid(),'grading_test_20261119',clean,'correct','*',null,30000,null,'1. Kd1');
if not(result#>>'{grading,permanent}')::boolean or result#>>'{grading,color}'<>'blue'then raise exception 'Two clean graded solves must finish bright green: %',result;end if;
if public.puzzle_lifetime_attempt_color(3,true,2)<>'red'or public.puzzle_lifetime_attempt_color(3,false,0)<>'purple'then raise exception 'Three-miss colors regressed';end if;
end $$;
select jsonb_build_object('passed',true,'cases',array['legacy mistake retained','first solve fixed cooldown','practice leaves history and cooldown unchanged','cumulative graded mistakes','second solve permanent','third solve practice','clean pair bright green','three-plus miss colors'])as test_result;

rollback;
