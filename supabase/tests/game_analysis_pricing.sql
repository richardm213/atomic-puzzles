-- Run in Firefox against the current database. All fixtures and charges roll back.
begin;
do $$
declare
  test_user text := 'analysis-price-' || substr(gen_random_uuid()::text,1,8);
  test_id text := 'analysis-price-regression-' || gen_random_uuid()::text;
  fen text := 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  before_balance numeric;
  after_balance numeric;
  result jsonb;
begin
  insert into public.users(id,username) overriding system value
  values (-floor(random()*9000000000000000)::bigint,test_user);
  perform public.apply_coin_transaction(test_user,10,'daily_bonus',test_id || ':seed','{}',now());
  select balance into strict before_balance from public.coin_accounts where username = test_user for update;
  result := public.request_game_analysis(test_user,test_id,fen,'[]'::jsonb,jsonb_build_array(fen));
  select balance into after_balance from public.coin_accounts where username = test_user;
  if after_balance <> before_balance - 1 or not (result->>'created')::boolean then
    raise exception 'New request must charge exactly one coin';
  end if;
  if (select cost from public.game_analyses where game_id=test_id) <> 1 then
    raise exception 'Stored refund cost must be one coin';
  end if;
  result := public.request_game_analysis(test_user,test_id,fen,'[]'::jsonb,jsonb_build_array(fen));
  if (select balance from public.coin_accounts where username=test_user) <> after_balance then
    raise exception 'Duplicate request must not charge';
  end if;
  update public.game_analyses set status='failed',cost=2 where game_id=test_id;
  select balance into before_balance from public.coin_accounts where username=test_user;
  result := public.request_game_analysis(test_user,test_id,fen,'[]'::jsonb,jsonb_build_array(fen));
  if (select balance from public.coin_accounts where username=test_user) <> before_balance - 1
    or (select cost from public.game_analyses where game_id=test_id) <> 1
    or (select charge_attempt from public.game_analyses where game_id=test_id) <> 2 then
    raise exception 'Retry must charge and store the current one-coin price';
  end if;
end;
$$;
rollback;
select 'PASS: new request 1 coin; duplicate free; retry 1 coin; stored refund cost correct; test data rolled back' as result;
