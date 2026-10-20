create or replace function public.sync_library_entries(changes jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare change jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to sync your library' using errcode='42501'; end if;
  if jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes)>100 then raise exception 'Invalid sync batch'; end if;
  for change in select value from jsonb_array_elements(changes) loop
    if (change->>'expected_user') is distinct from auth.uid()::text then raise exception 'Account changed; retry sync after signing in' using errcode='42501'; end if;
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
