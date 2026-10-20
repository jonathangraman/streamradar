-- Account data is separate from the legacy device tables. No legacy data is altered.
create table public.library_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('movie','tv')),
  tmdb_id bigint not null check (tmdb_id between 1 and 9007199254740991),
  item jsonb,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id,media_type,tmdb_id),
  constraint valid_item check (item is null or (jsonb_typeof(item)='object' and item ? 'id' and item ? 'type' and item->>'id' is not null and item->>'type' is not null and octet_length(item::text)<65536 and (item->>'id')::bigint=tmdb_id and item->>'type'=media_type)),
  constraint valid_state check (jsonb_typeof(state)='object' and state - array['watchlisted','seen','rating','dismissed']='{}'::jsonb
    and (not state ? 'watchlisted' or jsonb_typeof(state->'watchlisted')='boolean')
    and (not state ? 'seen' or jsonb_typeof(state->'seen')='boolean')
    and (not state ? 'dismissed' or jsonb_typeof(state->'dismissed')='boolean')
    and (not state ? 'rating' or state->'rating'='null'::jsonb or (jsonb_typeof(state->'rating')='number' and state->>'rating' in ('1','2','3','4','5'))))
);
alter table public.library_entries enable row level security;
revoke all on public.library_entries from public, anon, authenticated;
grant select,insert,update on public.library_entries to authenticated;
create policy own_library_select on public.library_entries for select to authenticated using ((select auth.uid())=user_id);
create policy own_library_insert on public.library_entries for insert to authenticated with check ((select auth.uid())=user_id);
create policy own_library_update on public.library_entries for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

-- Field patches avoid replacing another device's unrelated changes; false values
-- are durable removals, so a later refresh cannot resurrect deleted saved titles.
create function public.sync_library_entries(changes jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare change jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to sync your library' using errcode='42501'; end if;
  if jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes)>100 then raise exception 'Invalid sync batch'; end if;
  for change in select value from jsonb_array_elements(changes) loop
    insert into public.library_entries(user_id,media_type,tmdb_id,item,state)
    values(auth.uid(),change->>'media_type',(change->>'tmdb_id')::bigint,nullif(change->'item','null'::jsonb),change->'state')
    on conflict(user_id,media_type,tmdb_id) do update
      set item=coalesce(excluded.item,library_entries.item),
          state=library_entries.state || excluded.state,updated_at=now();
  end loop;
end;
$$;
revoke all on function public.sync_library_entries(jsonb) from public,anon;
grant execute on function public.sync_library_entries(jsonb) to authenticated;
