-- Run in the current Supabase SQL editor (Firefox). All fixtures roll back.
begin;
do $$
declare
 author text := 'opening-test-'||substr(gen_random_uuid()::text,1,8);
 buyer text := 'opening-test-'||substr(gen_random_uuid()::text,1,8);
 poor text := 'opening-test-'||substr(gen_random_uuid()::text,1,8);
 cid uuid := gen_random_uuid();
 doc jsonb := '{"startFen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","side":"white","lines":[{"id":"main","kind":"essential","moves":["e2e4"]}]}';
 c jsonb; purchased jsonb; listing uuid; state jsonb; wallet numeric; failed boolean;
begin
 if has_function_privilege('anon','public.opening_command(text,text,jsonb)','execute')
 or has_function_privilege('authenticated','public.opening_command(text,text,jsonb)','execute')
 or has_table_privilege('anon','public.opening_listings','select') then raise exception 'Private content exposed'; end if;
 insert into public.users(id,username) overriding system value values(-floor(random()*9000000000000000)::bigint,author),(-floor(random()*9000000000000000)::bigint,buyer);
 perform public.apply_coin_transaction(author,1000,'daily_bonus',author||':seed','{}',now());
 perform public.apply_coin_transaction(buyer,1000,'daily_bonus',buyer||':seed','{}',now());
 c := public.opening_command(author,'create',jsonb_build_object('id',cid,'title','Test opening','description','','document',doc));
 failed:=false;
 begin perform public.opening_command(buyer,'get',jsonb_build_object('id',cid)); exception when others then failed:=true; end;
 if not failed then raise exception 'Ownership bypass'; end if;
 c:=public.opening_command(author,'publish',jsonb_build_object('id',cid,'revision',1,'price',100));
 listing:=(c->'listing'->>'id')::uuid;
 perform public.opening_command(author,'publish',jsonb_build_object('id',cid,'revision',1,'price',100));
 select balance into wallet from public.coin_accounts where username=author;
 if wallet<>950 then raise exception 'Publishing charged more than once: %',wallet; end if;
 if exists(select 1 from jsonb_array_elements(public.opening_command('','catalog','{}')) x where x ? 'document') then raise exception 'Catalog leaks paid repertoire'; end if;
 failed:=false;
 begin perform public.opening_command(buyer,'buy',jsonb_build_object('id',listing,'version',1,'quotedPrice',1)); exception when others then failed:=true; end;
 if not failed then raise exception 'Stale quote accepted'; end if;
 failed:=false;
 begin perform public.opening_command(poor,'buy',jsonb_build_object('id',listing,'version',1,'quotedPrice',100)); exception when others then failed:=true; end;
 if not failed or exists(select 1 from public.opening_copies where owner=poor) then raise exception 'Insufficient funds purchase persisted'; end if;
 purchased:=public.opening_command(buyer,'buy',jsonb_build_object('id',listing,'version',1,'quotedPrice',100));
 c:=public.opening_command(buyer,'buy',jsonb_build_object('id',listing,'version',1,'quotedPrice',100));
 if c->>'id'<>purchased->>'id' then raise exception 'Purchase not idempotent'; end if;
 select balance into wallet from public.coin_accounts where username=buyer;
 if wallet<>900 then raise exception 'Wrong purchase charge: %',wallet; end if;
 select balance into wallet from public.coin_accounts where username=author;
 if wallet<>1040 then raise exception 'Wrong 90 percent royalty: %',wallet; end if;
 if not exists(select 1 from public.notifications where recipient_username=author and feature_key='opening-sale:'||(purchased->>'id')) then raise exception 'Missing sale notification'; end if;
 -- Optimistic review snapshot ensures retries cannot double-advance a due card.
 state:=jsonb_build_object('known',false,'correct',1,'wrong',0,'intervalDays',1,'reviewedAt',now(),'nextDue',now()+interval '1 day');
 c:=public.opening_command(buyer,'review',jsonb_build_object('id',purchased->>'id','revision',1,'card','test-card','previous',null,'state',state));
 perform public.opening_command(buyer,'review',jsonb_build_object('id',purchased->>'id','revision',1,'card','test-card','previous',null,'state',state||'{"correct":2}'));
 c:=public.opening_command(buyer,'get',jsonb_build_object('id',purchased->>'id'));
 if c->'progress'->'test-card'<>state then raise exception 'Review advanced twice'; end if;
 perform public.opening_command(buyer,'review',jsonb_build_object('id',purchased->>'id','revision',1,'card','test-card','previous',state,'state',state||'{"correct":3}'));
 c:=public.opening_command(buyer,'get',jsonb_build_object('id',purchased->>'id'));
 if c->'progress'->'test-card'<>state then raise exception 'Early review changed progress'; end if;
 -- Buyer edits stay private until they explicitly replace their copy with an update.
 perform public.opening_command(buyer,'save',jsonb_build_object('id',purchased->>'id','revision',1,'title','Local edits','description','','document',doc,'cardKeys',jsonb_build_array('test-card')));
 perform public.opening_command(author,'save',jsonb_build_object('id',cid,'revision',1,'title','Updated opening','description','new','document',doc,'cardKeys','[]'::jsonb));
 c:=public.opening_command(buyer,'get',jsonb_build_object('id',purchased->>'id'));
 if c->>'title'<>'Local edits' or c->>'update_available'<>'true' then raise exception 'Creator overwrote buyer edits'; end if;
 if not exists(select 1 from public.notifications where recipient_username=buyer and feature_key='opening-update:'||listing||':2') then raise exception 'Missing update notification'; end if;
 failed:=false;
 begin perform public.opening_command(buyer,'update',jsonb_build_object('id',purchased->>'id','revision',2)); exception when others then failed:=true; end;
 if not failed then raise exception 'Destructive update accepted without confirmation'; end if;
 c:=public.opening_command(buyer,'update',jsonb_build_object('id',purchased->>'id','revision',2,'confirmReplacement',true));
 if c->>'title'<>'Updated opening' or c->>'update_available'<>'false' or c->'progress'->'test-card'<>state then raise exception 'Update lost retained progress'; end if;
 raise notice 'Opening transaction, ownership, scheduling, royalties, notifications and update checks passed';
end $$;
rollback;
select 'Opening transaction regression checks passed; all fixtures rolled back' as result;
