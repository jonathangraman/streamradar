-- Owner requested removal of the per-person daily cap. Preserve counters,
-- cooldown, monthly application cap, authentication and private permissions.
create or replace function streamradar_ai.claim_ai_pick() returns boolean
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
 if total>=200 or used.last_call>stamp-interval '30 seconds' then return false; end if;
 update streamradar_ai.ai_pick_usage set day=utc_day,calls=case when used.day=utc_day then used.calls+1 else 1 end,last_call=stamp where user_id=uid;
 update streamradar_ai.ai_pick_month set calls=calls+1 where month=utc_month;
 return true;
end $$;
