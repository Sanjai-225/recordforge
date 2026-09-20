-- Defensive defaults for future migrations. All exposed RPC grants are explicit.
alter default privileges in schema public revoke execute on functions from public;
revoke all on private.completed_chatbots,private.participant_totals from public,anon,authenticated;
alter table public.field_definitions add constraint field_definitions_no_secret_fields
 check(key not in ('token','secret','api_key','apikey','service_role_key','access_token','refresh_token','authorization','cookie','session','passwd'));

-- Expiration must be an absolute timestamp: different rate-limit windows cannot
-- safely be compared by their numeric bucket alone.
alter table public.rate_limits add column expires_at timestamptz not null default clock_timestamp()+interval '1 day';
create index rate_limits_expiration on public.rate_limits(expires_at);
create or replace function public.take_rate_limit(p_key text,p_limit integer,p_window integer) returns boolean language plpgsql security definer set search_path='' as $$
declare b bigint; n integer;
begin
 if p_key !~ '^[a-f0-9]{64}$' or p_limit not between 1 and 10000 or p_window not between 1 and 86400 then raise exception 'INVALID_INPUT'; end if;
 b:=floor(extract(epoch from clock_timestamp())/p_window);
 insert into public.rate_limits(key,bucket,attempts,expires_at) values(p_key,b,1,to_timestamp((b+1)*p_window))
 on conflict(key,bucket) do update set attempts=public.rate_limits.attempts+1 returning attempts into n;
 if random()<0.02 then delete from public.rate_limits where expires_at<clock_timestamp(); end if;
 return n<=p_limit;
end $$;
revoke all on function public.take_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.take_rate_limit(text,integer,integer) to service_role;

-- Developer searches/exports include drafts and archived submissions, which are
-- intentionally absent from the partial completion index.
create index chatbot_event_generation_created on public.chatbot_submissions(event_id,generation,created_at desc);
