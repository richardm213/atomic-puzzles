-- Allow one order to sweep the accumulated depth displayed by the order book.
do $$
declare
  function_def text;
begin
  select pg_get_functiondef(
    'public.place_prediction_order(text,text,text,text,integer,integer)'::regprocedure
  ) into function_def;

  if position('p_quantity not between 1 and 10000' in function_def) = 0 then
    raise exception 'Expected place_prediction_order quantity limit was not found';
  end if;

  execute replace(
    function_def,
    'p_quantity not between 1 and 10000',
    'p_quantity not between 1 and 100000'
  );

  select pg_get_functiondef(
    'public.amend_prediction_order(text,text,bigint,integer,integer)'::regprocedure
  ) into function_def;

  if position('p_quantity > 10000' in function_def) = 0 then
    raise exception 'Expected amend_prediction_order quantity limit was not found';
  end if;

  function_def := replace(function_def, 'p_quantity > 10000', 'p_quantity > 100000');
  function_def := replace(
    function_def,
    'Prediction order quantity must be between 1 and 10000',
    'Prediction order quantity must be between 1 and 100000'
  );
  execute function_def;
end;
$$;
