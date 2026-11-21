-- Run in Firefox on the current database after community_comment_reactions.sql. Always rolls back.
begin;
insert into public.users(id,username) overriding system value
values(-17772101,'reaction_test_alice'),(-17772102,'reaction_test_bob');
insert into public.community_comments(id,target_type,target_id,target_context,username,body)
overriding system value values(-17772101,'profile','reaction_test_alice','','reaction_test_alice','Reaction test');
do $$declare rows jsonb; bundle jsonb;
begin
  perform public.set_community_comment_reaction(-17772101,'profile',array['reaction_test_alice'],'','reaction_test_alice','kekwbrug',true);
  rows := public.set_community_comment_reaction(-17772101,'profile',array['reaction_test_alice'],'','reaction_test_alice','kekwbrug',true);
  if rows <> '[{"reaction":"kekwbrug","count":1,"reacted":true}]'::jsonb then raise exception 'Repeated add duplicated a reaction';end if;
  perform public.set_community_comment_reaction(-17772101,'profile',array['reaction_test_alice'],'','reaction_test_bob','kekwbrug',true);
  rows := public.set_community_comment_reaction(-17772101,'profile',array['reaction_test_alice'],'','reaction_test_alice','kekwbrug',false);
  if rows <> '[{"reaction":"kekwbrug","count":1,"reacted":false}]'::jsonb then raise exception 'Removing a reaction affected another user';end if;
  begin
    perform public.set_community_comment_reaction(-17772101,'puzzle',array['121'],'','reaction_test_alice','kekwbrug',true);
    raise exception 'Wrong discussion accepted';
  exception when no_data_found then null;end;
  bundle := public.get_community_discussion_bundle('profile',array['reaction_test_alice'],'','reaction_test_bob');
  if bundle->'comments'->0->'reactions' <> '[{"reaction":"kekwbrug","count":1,"reacted":true}]'::jsonb then raise exception 'Discussion did not include reactions';end if;
  if public.get_community_comment_reactions(array[-17772101],null)->'-17772101' <> '[{"reaction":"kekwbrug","count":1,"reacted":false}]'::jsonb then raise exception 'Anonymous reaction summary is wrong';end if;
  if has_table_privilege('anon','public.community_comment_reactions','select')
    or has_table_privilege('authenticated','public.community_comment_reactions','insert')
    or has_function_privilege('anon','public.set_community_comment_reaction(bigint,text,text[],text,text,text,boolean)','execute')then raise exception 'Direct reaction access is exposed';end if;
  delete from public.community_comments where id=-17772101;
  if exists(select 1 from public.community_comment_reactions where comment_id=-17772101)then raise exception 'Deleted comment left reactions';end if;
end $$;
select jsonb_build_object('passed',true,'cases',array['idempotent add','viewer-only removal','discussion boundary','batched private summaries','restricted access','delete cascade'])as test_result;
rollback;
