-- Remove the per-outcome 50% net-worth cap from fixed-price tournament bets.
-- The existing balance, fee, per-bet maximum, and market-specific caps remain.
begin;

do $migration$
declare
  function_sql text;
  function_sql_without_limit text;
begin
  select pg_get_functiondef(
    'public.place_tournament_bet(text,text,text,numeric)'::regprocedure
  ) into function_sql;

  if position('exceeds 50 percent of net worth' in function_sql) > 0 then
    function_sql_without_limit := regexp_replace(
      function_sql,
      $pattern$select coalesce\(sum\(total_cost\), 0\)[[:space:]]+into open_bet_cost.*?raise exception 'Tournament position exceeds 50 percent of net worth';[[:space:]]*end if;$pattern$,
      ''
    );

    if function_sql_without_limit = function_sql
      or position('exceeds 50 percent of net worth' in function_sql_without_limit) > 0 then
      raise exception 'Unable to remove the tournament bet net-worth limit safely';
    end if;

    execute function_sql_without_limit;
  end if;
end
$migration$;

commit;

notify pgrst, 'reload schema';
