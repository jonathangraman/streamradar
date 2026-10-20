-- Add explicit taste feedback without changing existing ratings or watched state.
alter table public.library_entries drop constraint valid_state;
alter table public.library_entries add constraint valid_state check (
 jsonb_typeof(state)='object' and state - array['watchlisted','seen','rating','dismissed','preference']='{}'::jsonb
 and (not state ? 'watchlisted' or jsonb_typeof(state->'watchlisted')='boolean')
 and (not state ? 'seen' or jsonb_typeof(state->'seen')='boolean')
 and (not state ? 'dismissed' or jsonb_typeof(state->'dismissed')='boolean')
 and (not state ? 'rating' or state->'rating'='null'::jsonb or (jsonb_typeof(state->'rating')='number' and state->>'rating' in ('1','2','3','4','5')))
 and (not state ? 'preference' or state->'preference'='null'::jsonb or state->>'preference' in ('more','less'))
);
create table public.account_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 services jsonb not null default '[]'::jsonb,
 updated_at timestamptz not null default now(),
 constraint valid_services check(jsonb_typeof(services)='array' and jsonb_array_length(services)<=9 and services <@ '["netflix","prime","disney","peacock","paramount","mgm","starz","apple","max"]'::jsonb)
);
create table public.recommendation_history (
 user_id uuid not null references auth.users(id) on delete cascade,
 id uuid not null,
 created_at timestamptz not null default now(),
 batch jsonb not null,
 primary key(user_id,id),
 constraint valid_batch check(jsonb_typeof(batch)='object' and batch ? 'picks' and octet_length(batch::text)<32768 and jsonb_typeof(batch->'picks')='array' and jsonb_array_length(batch->'picks') between 1 and 12)
);
create index recommendation_history_recent on public.recommendation_history(user_id,created_at desc);
alter table public.account_preferences enable row level security;
alter table public.recommendation_history enable row level security;
revoke all on public.account_preferences,public.recommendation_history from public,anon,authenticated;
grant select,insert,update on public.account_preferences to authenticated;
grant select,insert,delete on public.recommendation_history to authenticated;
create policy own_preferences_read on public.account_preferences for select to authenticated using((select auth.uid())=user_id);
create policy own_preferences_insert on public.account_preferences for insert to authenticated with check((select auth.uid())=user_id);
create policy own_preferences_update on public.account_preferences for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy own_history_read on public.recommendation_history for select to authenticated using((select auth.uid())=user_id);
create policy own_history_insert on public.recommendation_history for insert to authenticated with check((select auth.uid())=user_id);
create policy own_history_delete on public.recommendation_history for delete to authenticated using((select auth.uid())=user_id);

create function public.sync_account_extras(expected_user uuid,changes jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); entry jsonb;
begin
 if uid is null or expected_user is distinct from uid then raise exception 'Account changed; sign in again' using errcode='42501'; end if;
 if jsonb_typeof(changes)<>'object' or octet_length(changes::text)>262144 then raise exception 'Invalid account changes'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,0));
 if changes ? 'services' then
  insert into public.account_preferences(user_id,services) values(uid,changes->'services')
  on conflict(user_id) do update set services=excluded.services,updated_at=now();
 end if;
 if changes ? 'batches' then
  if jsonb_typeof(changes->'batches')<>'array' or jsonb_array_length(changes->'batches')>5 then raise exception 'Invalid history batch'; end if;
  for entry in select value from jsonb_array_elements(changes->'batches') loop
   insert into public.recommendation_history(user_id,id,batch) values(uid,(entry->>'id')::uuid,entry)
   on conflict(user_id,id) do nothing;
  end loop;
  delete from public.recommendation_history where user_id=uid and id in (
   select id from public.recommendation_history where user_id=uid order by created_at desc,id desc offset 20
  );
 end if;
end $$;
revoke all on function public.sync_account_extras(uuid,jsonb) from public,anon;
grant execute on function public.sync_account_extras(uuid,jsonb) to authenticated;

-- Least-privilege self-deletion; no admin key is exposed or required by the app.
-- Revoke refresh sessions before deleting the user and cascading account data.
create function streamradar_ai.delete_own_account(expected_user uuid,confirmation text) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null or expected_user is distinct from uid then raise exception 'Account changed; sign in again' using errcode='42501'; end if;
 if confirmation is distinct from 'DELETE' then raise exception 'Type DELETE to confirm'; end if;
 if not exists(select 1 from auth.users where id=uid) then raise exception 'Account no longer exists' using errcode='42501'; end if;
 delete from auth.sessions where user_id=uid;
 delete from auth.users where id=uid;
end $$;
revoke all on function streamradar_ai.delete_own_account(uuid,text) from public,anon;
grant execute on function streamradar_ai.delete_own_account(uuid,text) to authenticated;
create function public.delete_own_account(expected_user uuid,confirmation text) returns void
language sql security invoker set search_path='' as $$select streamradar_ai.delete_own_account(expected_user,confirmation)$$;
revoke all on function public.delete_own_account(uuid,text) from public,anon;
grant execute on function public.delete_own_account(uuid,text) to authenticated;
