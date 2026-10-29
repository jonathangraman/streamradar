-- Per-episode booleans are patched independently so two devices marking
-- different episodes do not overwrite each other's progress. Retain the
-- preference field already deployed by the recommendation feature.
create or replace function public.valid_library_state(value jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare entry record;
begin
 if jsonb_typeof(value) is distinct from 'object' or octet_length(value::text)>65536 then return false; end if;
 for entry in select * from jsonb_each(value) loop
  if entry.key in ('watchlisted','seen','dismissed','tracking') or entry.key ~ '^ep_[1-9][0-9]{0,3}_[1-9][0-9]{0,4}$' then
   if jsonb_typeof(entry.value) is distinct from 'boolean' then return false; end if;
  elsif entry.key='rating' then
   if entry.value <> 'null'::jsonb and not (jsonb_typeof(entry.value)='number' and entry.value::text in ('1','2','3','4','5')) then return false; end if;
  elsif entry.key='preference' then
   if entry.value <> 'null'::jsonb and entry.value not in ('"more"'::jsonb,'"less"'::jsonb) then return false; end if;
  else return false;
  end if;
 end loop;
 return true;
end;
$$;
revoke all on function public.valid_library_state(jsonb) from public,anon;
grant execute on function public.valid_library_state(jsonb) to authenticated;
alter table public.library_entries drop constraint valid_state;
alter table public.library_entries add constraint valid_state check (public.valid_library_state(state));
