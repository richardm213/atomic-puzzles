-- Private opening copies, optional creator listings, and per-copy training state.
begin;
create table if not exists public.opening_copies (
  id uuid primary key default gen_random_uuid(),
  owner text not null,
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '' check (char_length(description)<=500),
  document jsonb not null,
  progress jsonb not null default '{}'::jsonb,
  revision integer not null default 1,
  source_listing_id uuid,
  source_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner,source_listing_id)
);
create table if not exists public.opening_listings (
  id uuid primary key default gen_random_uuid(),
  author_copy_id uuid not null unique references public.opening_copies(id),
  author text not null,
  title text not null,
  description text not null default '',
  document jsonb not null,
  version integer not null default 1,
  price numeric(18,6) not null check(price>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
do $$ begin
  if not exists(select 1 from pg_constraint where conname='opening_copies_source_listing_fk') then
    alter table public.opening_copies add constraint opening_copies_source_listing_fk foreign key(source_listing_id) references public.opening_listings(id);
  end if;
end $$;
create index if not exists opening_copies_owner_idx on public.opening_copies(owner,updated_at desc);
alter table public.opening_copies enable row level security;
alter table public.opening_listings enable row level security;
revoke all on public.opening_copies,public.opening_listings from public,anon,authenticated;
grant all on public.opening_copies,public.opening_listings to service_role;

-- Extend rather than replace the current ledger's permitted reasons.
do $$ declare expr text; begin
 select pg_get_expr(conbin,conrelid) into expr from pg_constraint where conrelid='public.coin_transactions'::regclass and conname='coin_transactions_reason_check';
 if expr is null then raise exception 'Missing coin ledger reason constraint'; end if;
 if strpos(expr,'opening_publish')=0 then
  alter table public.coin_transactions drop constraint coin_transactions_reason_check;
  execute format('alter table public.coin_transactions add constraint coin_transactions_reason_check check ((%s) or reason in (''opening_publish'',''opening_purchase'',''opening_sale''))',expr);
 end if;
end $$;

create or replace function public.opening_result(p_id uuid,p_username text) returns jsonb
language sql stable security definer set search_path=public as $$
 select to_jsonb(c) || jsonb_build_object(
  'listing',(select jsonb_build_object('id',l.id,'price',l.price,'version',l.version) from public.opening_listings l where l.author_copy_id=c.id),
  'source',(select jsonb_build_object('id',l.id,'version',l.version,'author',l.author,'title',l.title) from public.opening_listings l where l.id=c.source_listing_id),
  'update_available',coalesce((select l.version>c.source_version from public.opening_listings l where l.id=c.source_listing_id),false))
 from public.opening_copies c where c.id=p_id and c.owner=p_username;
$$;

create or replace function public.refresh_opening_listing(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare c public.opening_copies%rowtype; l public.opening_listings%rowtype;
begin
 select * into c from public.opening_copies where id=p_id;
 select * into l from public.opening_listings where author_copy_id=p_id for update;
 if not found or (l.document=c.document and l.title=c.title and l.description=c.description) then return; end if;
 update public.opening_listings set document=c.document,title=c.title,description=c.description,version=version+1,updated_at=now() where id=l.id returning * into l;
 insert into public.notifications(recipient_username,actor_username,notification_type,feature_key,feature_message,feature_path)
 select owner,null,'feature','opening-update:'||l.id||':'||l.version,
  c.title||' has an update. Applying it replaces your edits; your unchanged training progress is kept.', '/openings'
 from public.opening_copies where source_listing_id=l.id on conflict do nothing;
end;
$$;

create or replace function public.opening_command(p_username text,p_action text,p_input jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
 u text:=lower(btrim(coalesce(p_username,'')));
 c public.opening_copies%rowtype;
 l public.opening_listings%rowtype;
 copy_id uuid;
 state jsonb;
 key text;
 amount numeric(18,6);
 royalty numeric(18,6);
 buyer_id uuid;
begin
 if p_action='catalog' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'description',description,'author',author,'price',price,'version',version,'line_count',jsonb_array_length(document->'lines')) order by updated_at desc,id) from public.opening_listings),'[]'::jsonb);
 end if;
 if u !~ '^[a-z0-9_-]{1,100}$' then raise exception 'Invalid opening owner'; end if;
 if p_action='list' then
  return coalesce((select jsonb_agg(public.opening_result(id,u)-'document'-'progress' order by updated_at desc,id) from public.opening_copies where owner=u),'[]'::jsonb);
 end if;
 if p_action='buy' then
  select * into l from public.opening_listings where id=(p_input->>'id')::uuid for update;
  if not found then raise exception 'Opening not found'; end if;
  if l.author=u then return public.opening_result(l.author_copy_id,u); end if;
  select id into buyer_id from public.opening_copies where owner=u and source_listing_id=l.id;
  if found then return public.opening_result(buyer_id,u); end if;
  if l.version is distinct from (p_input->>'version')::integer or l.price is distinct from (p_input->>'quotedPrice')::numeric then raise exception 'Opening or price changed'; end if;
  -- A fixed account-lock order prevents reciprocal purchases deadlocking on royalties.
  insert into public.coin_accounts(username) select name from unnest(array[u,l.author]) name order by name on conflict do nothing;
  perform username from public.coin_accounts where username in(u,l.author) order by username for update;
  buyer_id:=gen_random_uuid();
  if l.price>0 then
   perform public.apply_coin_transaction(u,-l.price,'opening_purchase','opening-buy:'||buyer_id,jsonb_build_object('openingId',l.id,'title',l.title,'creator',l.author),now());
   royalty:=trunc(l.price*0.9,6);
   if royalty>0 then perform public.apply_coin_transaction(l.author,royalty,'opening_sale','opening-sale:'||buyer_id,jsonb_build_object('openingId',l.id,'title',l.title,'buyer',u),now()); end if;
  end if;
  insert into public.opening_copies(id,owner,title,description,document,source_listing_id,source_version) values(buyer_id,u,l.title,l.description,l.document,l.id,l.version);
  insert into public.notifications(recipient_username,actor_username,notification_type,feature_key,feature_message,feature_path)
  values(l.author,null,'feature','opening-sale:'||buyer_id,u||' purchased '||l.title||'. You earned '||coalesce(royalty,0)||' coins.','/openings') on conflict do nothing;
  return public.opening_result(buyer_id,u);
 end if;
 copy_id:=(p_input->>'id')::uuid;
 if p_action='create' then
  insert into public.opening_copies(id,owner,title,description,document) values(copy_id,u,p_input->>'title',p_input->>'description',p_input->'document') on conflict(id) do nothing;
 end if;
 select * into c from public.opening_copies where id=copy_id and owner=u for update;
 if not found then raise exception 'Opening not found or not owned'; end if;
 if p_action in('get','create') then return public.opening_result(c.id,u); end if;
 if c.revision is distinct from (p_input->>'revision')::integer then raise exception 'Opening revision conflict'; end if;
 if p_action='save' then
  update public.opening_copies set title=p_input->>'title',description=p_input->>'description',document=p_input->'document',
   progress=(select coalesce(jsonb_object_agg(e.key,e.value),'{}') from jsonb_each(c.progress) e where e.key in(select jsonb_array_elements_text(p_input->'cardKeys'))),
   revision=revision+1,updated_at=now() where id=c.id;
  if c.source_listing_id is null then perform public.refresh_opening_listing(c.id); end if;
 elsif p_action='review' then
  key:=p_input->>'card';
  state:=c.progress->key;
  -- The server computed this review from a snapshot. Retries and concurrent answers cannot advance it twice.
  if coalesce(state,'null'::jsonb)=coalesce(p_input->'previous','null'::jsonb)
    and not coalesce((state->>'known')::boolean,false)
    and coalesce((state->>'nextDue')::timestamptz,'-infinity'::timestamptz)<=clock_timestamp() then
   update public.opening_copies set progress=jsonb_set(progress,array[key],p_input->'state',true) where id=c.id;
  end if;
 elsif p_action='known' then
  state:=p_input->'state';
  for key in select jsonb_array_elements_text(p_input->'keys') loop
   c.progress:=jsonb_set(c.progress,array[key],state,true);
  end loop;
  update public.opening_copies set progress=c.progress where id=c.id;
 elsif p_action='publish' then
  if c.source_listing_id is not null then raise exception 'Cannot publish a purchased copy'; end if;
  if jsonb_array_length(c.document->'lines')=0 then raise exception 'Cannot publish an empty opening'; end if;
  amount:=(p_input->>'price')::numeric;
  if amount is null or amount<0 then raise exception 'Invalid opening price'; end if;
  select * into l from public.opening_listings where author_copy_id=c.id for update;
  if not found then
   perform public.apply_coin_transaction(u,-50::numeric,'opening_publish','opening-publish:'||c.id,jsonb_build_object('title',c.title,'openingId',c.id),now());
   insert into public.opening_listings(author_copy_id,author,title,description,document,price) values(c.id,u,c.title,c.description,c.document,amount);
  else
   update public.opening_listings set price=amount,updated_at=now() where id=l.id;
   perform public.refresh_opening_listing(c.id);
  end if;
 elsif p_action='update' then
  if p_input->>'confirmReplacement' is distinct from 'true' then raise exception 'Update confirmation required'; end if;
  select * into l from public.opening_listings where id=c.source_listing_id;
  if not found then raise exception 'Opening source not found'; end if;
  -- Stable position-and-move identities preserve progress for unchanged training items.
  update public.opening_copies set document=l.document,title=l.title,description=l.description,source_version=l.version,
   revision=revision+1,updated_at=now() where id=c.id;
 else raise exception 'Invalid opening action';
 end if;
 return public.opening_result(c.id,u);
end;
$$;
revoke all on function public.opening_command(text,text,jsonb),public.opening_result(uuid,text),public.refresh_opening_listing(uuid) from public,anon,authenticated;
grant execute on function public.opening_command(text,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
