create function public.reserve_registration(p_request_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events; r public.registration_reservations; code text; digits integer; dep text; reg text; uname text;
begin
 select * into e from public.events for update;
 select * into r from public.registration_reservations where id=p_request_id;
 if found then
  if r.payload<>p_payload then raise exception 'REQUEST_CONFLICT'; end if;
  if r.generation<>e.generation then raise exception 'STALE_GENERATION'; end if;
  if r.status='complete' or (r.status='pending' and r.expires_at>clock_timestamp()) then return to_jsonb(r); end if;
  raise exception 'RESERVATION_EXPIRED';
 end if;
 if e.state<>'REGISTRATION_OPEN' then raise exception 'REGISTRATION_CLOSED'; end if;
 uname:=lower(trim(p_payload->>'username')); reg:=upper(trim(p_payload->>'register_number')); dep:=upper(trim(p_payload->>'department'));
 if uname is null or uname !~ '^[a-z0-9_]{3,32}$' or reg is null or reg !~ '^[A-Z0-9-]{4,40}$' or dep is null or dep !~ '^[A-Z0-9&-]{1,16}$' or length(trim(coalesce(p_payload->>'name',''))) not between 1 and 120 then raise exception 'INVALID_REGISTRATION'; end if;
 perform private.validate_fields(e.id,'registration',coalesce(p_payload->'additional_data','{}'));
 update public.registration_reservations set status='expired' where status='pending' and expires_at<=clock_timestamp();
 if exists(select 1 from public.participants where event_id=e.id and generation=e.generation and register_number=reg) or exists(select 1 from public.registration_reservations where event_id=e.id and generation=e.generation and register_number=reg and status='pending') then raise exception 'REGISTER_EXISTS'; end if;
 if exists(select 1 from public.profiles where username=uname and retired_at is null) or exists(select 1 from public.registration_reservations where username=uname and status='pending') then raise exception 'USERNAME_EXISTS'; end if;
 if (select count(*) from public.participants where event_id=e.id and generation=e.generation and deleted_at is null)+(select count(*) from public.registration_reservations where event_id=e.id and generation=e.generation and status='pending')>=e.participant_limit then raise exception 'PARTICIPANT_LIMIT'; end if;
 digits:=(e.id_config->>'register_digits')::integer;
 code:=coalesce(e.id_config->>'prefix','') || case when (e.id_config->>'include_department')::boolean then regexp_replace(dep,'[^A-Z0-9]','','g') || coalesce(e.id_config->>'separator','') else '' end || case when (e.id_config->>'use_sequence')::boolean then lpad(e.next_identity::text,greatest(digits,length(e.next_identity::text)),'0') else right(reg,digits) end;
 if exists(select 1 from public.participants where event_id=e.id and generation=e.generation and event_code=code) or exists(select 1 from public.registration_reservations where event_id=e.id and generation=e.generation and event_code=code and status='pending') then raise exception 'EVENT_ID_COLLISION'; end if;
 update public.events set next_identity=next_identity+1 where id=e.id;
 insert into public.registration_reservations(id,event_id,generation,username,register_number,event_code,payload) values(p_request_id,e.id,e.generation,uname,reg,code,p_payload) returning * into r;
 return to_jsonb(r);
end $$;
create function public.finalize_registration(p_request_id uuid,p_user_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events; r public.registration_reservations; p public.participants;
begin
 select * into e from public.events for update;
 select * into r from public.registration_reservations where id=p_request_id for update;
 if r.id is null then raise exception 'RESERVATION_EXPIRED'; end if;
 if r.status='complete' then
  if r.user_id<>p_user_id then raise exception 'REQUEST_CONFLICT'; end if;
  select * into p from public.participants where user_id=p_user_id and event_id=e.id and generation=e.generation;
  if p.id is null then raise exception 'STALE_GENERATION'; end if;
  return to_jsonb(p);
 end if;
 if r.generation<>e.generation then raise exception 'STALE_GENERATION'; end if;
 if r.status<>'pending' or r.expires_at<=clock_timestamp() then raise exception 'RESERVATION_EXPIRED'; end if;
 if e.state<>'REGISTRATION_OPEN' then raise exception 'REGISTRATION_CLOSED'; end if;
 insert into public.profiles(user_id,username) values(p_user_id,r.username);
 insert into public.participants(event_id,generation,user_id,name,department,register_number,event_code,additional_data)
 values(e.id,e.generation,p_user_id,trim(r.payload->>'name'),upper(trim(r.payload->>'department')),r.register_number,r.event_code,coalesce(r.payload->'additional_data','{}')) returning * into p;
 update public.registration_reservations set status='complete',user_id=p_user_id where id=r.id;
 perform private.audit('participant_registered','participant',p.id::text,null,to_jsonb(p),null,p_request_id,p_user_id);
 return to_jsonb(p);
end $$;
create function public.cancel_registration(p_request_id uuid) returns void language sql security definer set search_path='' as $$
 update public.registration_reservations set status='cancelled' where id=p_request_id and status='pending'
$$;
create function public.take_rate_limit(p_key text,p_limit integer,p_window integer) returns boolean language plpgsql security definer set search_path='' as $$
declare b bigint; n integer;
begin
 b:=floor(extract(epoch from clock_timestamp())/p_window);
 insert into public.rate_limits(key,bucket,attempts) values(p_key,b,1) on conflict(key,bucket) do update set attempts=public.rate_limits.attempts+1 returning attempts into n;
 if random()<0.02 then delete from public.rate_limits where bucket<b-10000; end if;
 return n<=p_limit;
end $$;

create function public.create_chatbot(p_id uuid,p_generation integer,p_title text,p_url text,p_additional jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events; p public.participants; c public.chatbot_submissions; seq integer;
begin
 select * into e from public.events for share;
 if e.generation<>p_generation then raise exception 'STALE_GENERATION'; end if;
 select * into p from public.participants where user_id=auth.uid() and event_id=e.id and generation=e.generation for update;
 if p.id is null or not private.is_current_participant(p.id) then raise exception 'NOT_AUTHORIZED'; end if;
 select * into c from public.chatbot_submissions where id=p_id;
 if found then
  if c.participant_id<>p.id or c.deleted_at is not null then raise exception 'REQUEST_CONFLICT'; end if;
  if c.title<>trim(p_title) or c.deployment_url<>trim(p_url) or c.additional_data<>p_additional then raise exception 'REQUEST_CONFLICT'; end if;
  return to_jsonb(c);
 end if;
 perform private.assert_live(e);
 perform private.validate_fields(e.id,'submission',p_additional);
 select s into seq from generate_series(1,e.chatbot_limit) s where not exists(select 1 from public.chatbot_submissions where participant_id=p.id and sequence=s and deleted_at is null) order by s limit 1;
 if seq is null then raise exception 'CHATBOT_LIMIT'; end if;
 insert into public.chatbot_submissions(id,event_id,generation,participant_id,sequence,title,deployment_url,additional_data) values(p_id,e.id,e.generation,p.id,seq,trim(p_title),trim(p_url),p_additional) returning * into c;
 perform private.audit('chatbot_created','chatbot',c.id::text,null,to_jsonb(c),null,p_id);
 return to_jsonb(c);
end $$;
create function public.edit_chatbot(p_id uuid,p_version integer,p_title text,p_url text,p_additional jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events; p public.participants; c public.chatbot_submissions; old jsonb;
begin
 select * into e from public.events for share;
 select * into p from public.participants where user_id=auth.uid() and event_id=e.id and generation=e.generation for update;
 if p.id is null or not private.is_current_participant(p.id) then raise exception 'NOT_AUTHORIZED'; end if;
 select * into c from public.chatbot_submissions where id=p_id and participant_id=p.id and deleted_at is null for update;
 if c.id is null then raise exception 'NOT_FOUND'; end if;
 perform private.assert_live(e);
 if c.deployed_at is not null then raise exception 'RECORD_LOCKED'; end if;
 if c.version<>p_version then raise exception 'STALE_VERSION'; end if;
 perform private.validate_fields(e.id,'submission',p_additional); old:=to_jsonb(c);
 update public.chatbot_submissions set title=trim(p_title),deployment_url=trim(p_url),additional_data=p_additional,updated_at=clock_timestamp(),version=version+1 where id=c.id returning * into c;
 perform private.audit('chatbot_edited','chatbot',c.id::text,old,to_jsonb(c),null,p_id);
 return to_jsonb(c);
end $$;
create function public.confirm_chatbot(p_id uuid,p_step text,p_generation integer,p_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events; p public.participants; c public.chatbot_submissions; old jsonb; t timestamptz;
begin
 if p_step not in ('deploy','verify') then raise exception 'INVALID_TRANSITION'; end if;
 select * into e from public.events for share;
 if e.generation<>p_generation then raise exception 'STALE_GENERATION'; end if;
 select * into p from public.participants where user_id=auth.uid() and event_id=e.id and generation=e.generation for update;
 if p.id is null or not private.is_current_participant(p.id) then raise exception 'NOT_AUTHORIZED'; end if;
 select * into c from public.chatbot_submissions where id=p_id and participant_id=p.id and deleted_at is null for update;
 if c.id is null then raise exception 'NOT_FOUND'; end if;
 -- Idempotent retry returns the original official timestamp even after deadline.
 if (p_step='deploy' and c.deployed_at is not null) or (p_step='verify' and c.verified_at is not null) then return to_jsonb(c); end if;
 if c.version<>p_version then raise exception 'STALE_VERSION'; end if;
 t:=clock_timestamp();
 perform private.assert_live(e);
 if p_step='verify' and c.deployed_at is null then raise exception 'DEPLOY_FIRST'; end if;
 old:=to_jsonb(c);
 update public.chatbot_submissions set deployed_at=case when p_step='deploy' then t else deployed_at end,verified_at=case when p_step='verify' then t else verified_at end,updated_at=t,version=version+1 where id=c.id returning * into c;
 perform private.audit(case when p_step='deploy' then 'deployment_confirmed' else 'verification_confirmed' end,'chatbot',c.id::text,old,to_jsonb(c),null,p_id);
 return to_jsonb(c);
end $$;

revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.reserve_registration(uuid,jsonb),public.finalize_registration(uuid,uuid),public.cancel_registration(uuid),public.take_rate_limit(text,integer,integer) to service_role;
grant execute on function public.create_chatbot(uuid,integer,text,text,jsonb),public.edit_chatbot(uuid,integer,text,text,jsonb),public.confirm_chatbot(uuid,text,integer,integer) to authenticated;
