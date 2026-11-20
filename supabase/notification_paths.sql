-- Allow internal feature links with query parameters and canonical player profile links.
begin;
do $$
declare
  definition text;
  old_pattern text := '^/[A-Za-z0-9/_-]+$';
  query_pattern text := '^/[A-Za-z0-9/_-]+([?][A-Za-z0-9_=&%.,~+-]+)?$';
  new_pattern text := '^(/[A-Za-z0-9/_-]+([?][A-Za-z0-9_=&%.,~+-]+)?|/@/[A-Za-z0-9_-]{1,100})$';
begin
  select pg_get_constraintdef(oid) into strict definition from pg_constraint
  where conrelid='public.notifications'::regclass and conname='notifications_shape_check';
  if position(quote_literal(query_pattern) in definition)>0 or position(quote_literal(old_pattern) in definition)>0 then
    definition := replace(replace(definition,quote_literal(query_pattern),quote_literal(new_pattern)),
      quote_literal(old_pattern),quote_literal(new_pattern));
    alter table public.notifications drop constraint notifications_shape_check;
    execute 'alter table public.notifications add constraint notifications_shape_check '||definition;
  elsif position(quote_literal(new_pattern) in definition)=0 then
    raise exception 'Unrecognized notification path constraint';
  end if;
end;
$$;
commit;
