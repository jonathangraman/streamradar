-- Persistent, atomic limits across all serverless instances. Failed attempts
-- still consume a slot. No prompts, ratings or recommendations are stored here.
create schema if not exists streamradar_ai;
revoke all on schema streamradar_ai from public,anon,authenticated;
grant usage on schema streamradar_ai to authenticated;
create table streamradar_ai.ai_pick_usage (
 user_id uuid primary key references auth.users(id) on delete cascade,
 day date not null, calls integer not null, last_call timestamptz not null
);
create table streamradar_ai.ai_pick_month (
 month date primary key, calls integer not null
);
alter table streamradar_ai.ai_pick_usage enable row level security;
alter table streamradar_ai.ai_pick_month enable row level security;
revoke all on streamradar_ai.ai_pick_usage,streamradar_ai.ai_pick_month from public,anon,authenticated;
create function streamradar_ai.claim_ai_pick() returns boolean
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); stamp timestamptz:=clock_timestamp();
 utc_day date:=(stamp at time zone 'UTC')::date;
 utc_month date:=date_trunc('month',stamp at time zone 'UTC')::date;
 used streamradar_ai.ai_pick_usage; total integer;
begin
 if uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
 insert into streamradar_ai.ai_pick_month values(utc_month,0) on conflict do nothing;
 select calls into total from streamradar_ai.ai_pick_month where month=utc_month for update;
 insert into streamradar_ai.ai_pick_usage values(uid,utc_day,0,'1970-01-01') on conflict do nothing;
 select * into used from streamradar_ai.ai_pick_usage where user_id=uid for update;
 if total>=200 or (used.day=utc_day and used.calls>=5) or used.last_call>stamp-interval '30 seconds' then return false; end if;
 update streamradar_ai.ai_pick_usage set day=utc_day,calls=case when used.day=utc_day then used.calls+1 else 1 end,last_call=stamp where user_id=uid;
 update streamradar_ai.ai_pick_month set calls=calls+1 where month=utc_month;
 return true;
end $$;
revoke all on function streamradar_ai.claim_ai_pick() from public,anon;
grant execute on function streamradar_ai.claim_ai_pick() to authenticated;
create function public.claim_ai_pick() returns boolean
language sql security invoker set search_path='' as $$select streamradar_ai.claim_ai_pick()$$;
revoke all on function public.claim_ai_pick() from public,anon;
grant execute on function public.claim_ai_pick() to authenticated;
