create function public.registration_auth_user(p_request_id uuid) returns uuid language sql stable security definer set search_path='' as $$
 select id from auth.users where email=p_request_id::text || '@participants.invalid' limit 1
$$;
revoke all on function public.registration_auth_user(uuid) from public,anon,authenticated;
grant execute on function public.registration_auth_user(uuid) to service_role;

create function public.admin_command(p_operation text,p_payload jsonb,p_request_id uuid) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare e public.events; p public.participants; c public.chatbot_submissions; f public.field_definitions; receipt public.reset_receipts;
 old jsonb; result jsonb; reason text; target text; t timestamptz; config jsonb; n integer; b integer; d integer; x uuid;
begin
 if not private.is_developer() then raise exception 'NOT_AUTHORIZED'; end if;
 if p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or length(p_payload::text)>30000 then raise exception 'INVALID_INPUT'; end if;
 select * into e from public.events for update;
 select * into receipt from public.reset_receipts where request_id=p_request_id;
 if found then
  if receipt.actor_user_id<>auth.uid() or receipt.operation<>p_operation or receipt.payload<>p_payload then raise exception 'REQUEST_CONFLICT'; end if;
  return receipt.result;
 end if;
 if coalesce((p_payload->>'generation')::integer,-1)<>e.generation then raise exception 'STALE_GENERATION'; end if;
 if coalesce((p_payload->>'event_version')::integer,-1)<>e.version then raise exception 'STALE_VERSION'; end if;
 reason:=trim(coalesce(p_payload->>'reason',''));
 if length(reason) not between 3 and 1000 then raise exception 'REASON_REQUIRED'; end if;
 t:=clock_timestamp();
 if p_operation='event_state' then
  target:=p_payload->>'state'; old:=to_jsonb(e);
  if not ((e.state='DRAFT' and target='REGISTRATION_OPEN') or (e.state='REGISTRATION_OPEN' and target='REGISTRATION_CLOSED') or (e.state='REGISTRATION_CLOSED' and target in ('REGISTRATION_OPEN','READY')) or (e.state='READY' and target in ('REGISTRATION_OPEN','LIVE')) or (e.state='LIVE' and target in ('PAUSED','ENDED')) or (e.state='PAUSED' and target in ('LIVE','ENDED'))) then raise exception 'INVALID_TRANSITION'; end if;
  if target='PAUSED' then perform private.assert_live(e); end if;
  if e.state='PAUSED' and target='LIVE' and e.paused_at>=e.started_at+make_interval(mins=>e.duration_minutes)+e.pause_seconds*interval '1 second' then raise exception 'EVENT_EXPIRED'; end if;
  update public.events set state=target,
    started_at=case when e.state='READY' and target='LIVE' then t else started_at end,
    paused_at=case when target='PAUSED' then t when target='LIVE' then null else paused_at end,
    pause_seconds=pause_seconds+case when e.state='PAUSED' and target='LIVE' then extract(epoch from t-e.paused_at) else 0 end,
    ended_at=case when target='ENDED' then t else ended_at end
   where id=e.id returning to_jsonb(events.*) into result;
  perform private.audit('event_'||lower(target),'event',e.id::text,old,result,reason,p_request_id);
 elsif p_operation='configure_event' then
  n:=(p_payload->>'participant_limit')::integer; b:=(p_payload->>'chatbot_limit')::integer; d:=(p_payload->>'duration_minutes')::integer;
  if n is null or b is null or d is null then raise exception 'INVALID_CONFIG'; end if;
  if (select count(*) from public.participants where event_id=e.id and generation=e.generation and deleted_at is null)+(select count(*) from public.registration_reservations where event_id=e.id and generation=e.generation and status='pending' and expires_at>t)>n then raise exception 'CONFIG_CONFLICT'; end if;
  if exists(select 1 from public.chatbot_submissions cs join public.participants ps on ps.id=cs.participant_id where cs.event_id=e.id and cs.generation=e.generation and cs.deleted_at is null and ps.deleted_at is null and cs.sequence>b) then raise exception 'CONFIG_CONFLICT'; end if;
  if e.started_at is not null and d<>e.duration_minutes then raise exception 'TIMER_CONFIG_LOCKED'; end if;
  config:=p_payload->'id_config';
  if config is null or jsonb_typeof(config)<>'object' or exists(select 1 from jsonb_object_keys(config) k where k not in ('prefix','separator','register_digits','include_department','use_sequence')) or coalesce(config->>'prefix','!') !~ '^[A-Z0-9_-]{0,20}$' or coalesce(config->>'separator','!') !~ '^[-_]{0,1}$' or coalesce((config->>'register_digits')::integer,0) not between 1 and 12 or coalesce(jsonb_typeof(config->'include_department'),'')<>'boolean' or coalesce(jsonb_typeof(config->'use_sequence'),'')<>'boolean' then raise exception 'INVALID_CONFIG'; end if;
  if e.state in ('LIVE','PAUSED','ENDED') and config<>e.id_config then raise exception 'ID_CONFIG_LOCKED'; end if;
  old:=to_jsonb(e);
  update public.events set name=trim(p_payload->>'name'),participant_limit=n,chatbot_limit=b,duration_minutes=d,id_config=config where id=e.id returning to_jsonb(events.*) into result;
  perform private.audit('configuration_changed','event',e.id::text,old,result,reason,p_request_id);
 elsif p_operation in ('participant_edit','participant_remove','participant_restore','participant_reset') then
  select * into p from public.participants where id=(p_payload->>'id')::uuid and event_id=e.id and generation=e.generation for update;
  if p.id is null then raise exception 'NOT_FOUND'; end if;
  if coalesce((p_payload->>'version')::integer,-1)<>p.version then raise exception 'STALE_VERSION'; end if;
  old:=to_jsonb(p);
  if p_operation='participant_edit' then
   perform private.validate_fields(e.id,'registration',coalesce(p_payload->'additional_data',p.additional_data));
   update public.participants set name=trim(p_payload->>'name'),department=upper(trim(p_payload->>'department')),register_number=upper(trim(p_payload->>'register_number')),event_code=upper(trim(p_payload->>'event_code')),enabled=(p_payload->>'enabled')::boolean,additional_data=coalesce(p_payload->'additional_data',additional_data),version=version+1,updated_at=t where id=p.id returning * into p;
  elsif p_operation='participant_remove' then
   update public.participants set deleted_at=t,enabled=false,version=version+1,updated_at=t where id=p.id returning * into p;
  elsif p_operation='participant_restore' then
   if p.deleted_at is not null and (select count(*) from public.participants where event_id=e.id and generation=e.generation and deleted_at is null)>=e.participant_limit then raise exception 'PARTICIPANT_LIMIT'; end if;
   if exists(select 1 from public.chatbot_submissions where participant_id=p.id and deleted_at is null and sequence>e.chatbot_limit) then raise exception 'CONFIG_CONFLICT'; end if;
   update public.participants set deleted_at=null,enabled=true,version=version+1,updated_at=t where id=p.id returning * into p;
  else
   for c in select * from public.chatbot_submissions where participant_id=p.id and deleted_at is null for update loop
    update public.chatbot_submissions set deleted_at=t,version=version+1,updated_at=t where id=c.id;
    perform private.audit('chatbot_removed_by_participant_reset','chatbot',c.id::text,to_jsonb(c),jsonb_build_object('deleted_at',t),reason,p_request_id);
   end loop;
   update public.participants set version=version+1,updated_at=t where id=p.id returning * into p;
  end if;
  result:=to_jsonb(p); perform private.audit(p_operation,'participant',p.id::text,old,result,reason,p_request_id);
 elsif p_operation in ('chatbot_correct','chatbot_reset','chatbot_remove','chatbot_restore') then
  select participant_id into x from public.chatbot_submissions where id=(p_payload->>'id')::uuid and event_id=e.id and generation=e.generation;
  select * into p from public.participants where id=x for update;
  select * into c from public.chatbot_submissions where id=(p_payload->>'id')::uuid and participant_id=p.id for update;
  if c.id is null then raise exception 'NOT_FOUND'; end if;
  if coalesce((p_payload->>'version')::integer,-1)<>c.version then raise exception 'STALE_VERSION'; end if;
  old:=to_jsonb(c);
  if p_operation='chatbot_correct' then
   perform private.validate_fields(e.id,'submission',coalesce(p_payload->'additional_data',c.additional_data));
   if nullif(p_payload->>'deployed_at','')::timestamptz>t or nullif(p_payload->>'verified_at','')::timestamptz>t then raise exception 'FUTURE_TIMESTAMP'; end if;
   update public.chatbot_submissions set title=trim(p_payload->>'title'),deployment_url=trim(p_payload->>'deployment_url'),additional_data=coalesce(p_payload->'additional_data',additional_data),deployed_at=nullif(p_payload->>'deployed_at','')::timestamptz,verified_at=nullif(p_payload->>'verified_at','')::timestamptz,version=version+1,updated_at=t where id=c.id returning * into c;
  elsif p_operation='chatbot_reset' then
   update public.chatbot_submissions set deployed_at=null,verified_at=null,version=version+1,updated_at=t where id=c.id returning * into c;
  elsif p_operation='chatbot_remove' then
   update public.chatbot_submissions set deleted_at=t,version=version+1,updated_at=t where id=c.id returning * into c;
  else
   if p.deleted_at is not null then raise exception 'RESTORE_PARTICIPANT_FIRST'; end if;
   if c.sequence>e.chatbot_limit or exists(select 1 from public.chatbot_submissions where participant_id=p.id and id<>c.id and deleted_at is null and sequence=c.sequence) then raise exception 'RESTORE_SEQUENCE_CONFLICT'; end if;
   update public.chatbot_submissions set deleted_at=null,version=version+1,updated_at=t where id=c.id returning * into c;
  end if;
  result:=to_jsonb(c); perform private.audit(p_operation,'chatbot',c.id::text,old,result,reason,p_request_id);
 elsif p_operation='dashboard_save' then
  target:=p_payload->>'kind'; if target not in ('leaderboard','progress') then raise exception 'INVALID_CONFIG'; end if;
  perform private.validate_dashboard(target,p_payload->'config');
  select dc.config into old from public.dashboard_configs dc where event_id=e.id and kind=target;
  result:=private.dashboard_default(target)||(p_payload->'config');
  update public.dashboard_configs set config=result where event_id=e.id and kind=target;
  perform private.audit('dashboard_configuration_changed','dashboard',target,old,result,reason,p_request_id);
 elsif p_operation in ('field_save','field_delete') then
  if e.state in ('LIVE','PAUSED') then raise exception 'FIELDS_LOCKED'; end if;
  if p_operation='field_delete' then
   delete from public.field_definitions where id=(p_payload->>'id')::uuid and event_id=e.id returning to_jsonb(field_definitions.*) into old;
   if old is null then raise exception 'NOT_FOUND'; end if;
   result:=jsonb_build_object('deleted',true);
  else
   select * into f from public.field_definitions where event_id=e.id and scope=p_payload->>'scope' and key=p_payload->>'key'; old:=to_jsonb(f);
   if jsonb_typeof(p_payload->'options')<>'array' or jsonb_array_length(p_payload->'options')>50 or exists(select 1 from jsonb_array_elements(p_payload->'options') v where jsonb_typeof(v)<>'string' or length(v#>>'{}')>80) then raise exception 'INVALID_FIELDS'; end if;
   insert into public.field_definitions(event_id,scope,key,label,type,required,enabled,show_participant,show_public,options,position)
   values(e.id,p_payload->>'scope',p_payload->>'key',p_payload->>'label',p_payload->>'type',(p_payload->>'required')::boolean,(p_payload->>'enabled')::boolean,(p_payload->>'show_participant')::boolean,(p_payload->>'show_public')::boolean,p_payload->'options',coalesce((p_payload->>'position')::integer,0))
   on conflict(event_id,scope,key) do update set label=excluded.label,type=excluded.type,required=excluded.required,enabled=excluded.enabled,show_participant=excluded.show_participant,show_public=excluded.show_public,options=excluded.options,position=excluded.position returning to_jsonb(field_definitions.*) into result;
  end if;
  perform private.audit(p_operation,'field',coalesce(p_payload->>'id',p_payload->>'key'),old,result,reason,p_request_id);
 elsif p_operation in ('prepare_clean_event','reset_submissions','reset_registrations','reset_runtime','reset_dashboards') then
  if (p_payload->>'confirmation') is distinct from (case when p_operation='prepare_clean_event' then 'PREPARE CLEAN EVENT' else 'RESET '||upper(replace(p_operation,'reset_','')) end) then raise exception 'CONFIRMATION_REQUIRED'; end if;
  if e.state in ('LIVE','PAUSED') then raise exception 'END_EVENT_BEFORE_RESET'; end if;
  old:=to_jsonb(e);
  if p_operation in ('prepare_clean_event','reset_registrations') then
   -- Application access is revoked atomically; Auth identities are retained for recovery.
   update public.profiles set retired_at=t,enabled=false where role='participant' and user_id in (select user_id from public.participants where event_id=e.id and generation=e.generation);
   update public.participants set deleted_at=coalesce(deleted_at,t),enabled=false,version=version+1 where event_id=e.id and generation=e.generation;
   update public.chatbot_submissions set deleted_at=coalesce(deleted_at,t),version=version+1 where event_id=e.id and generation=e.generation;
   update public.registration_reservations set status='cancelled' where event_id=e.id and status='pending';
   update public.events set generation=generation+1,state='DRAFT',started_at=null,paused_at=null,ended_at=null,pause_seconds=0,next_identity=1 where id=e.id;
  elsif p_operation='reset_submissions' then
   for c in select * from public.chatbot_submissions where event_id=e.id and generation=e.generation and deleted_at is null for update loop
    update public.chatbot_submissions set deleted_at=t,version=version+1,updated_at=t where id=c.id;
    perform private.audit('chatbot_removed_by_bulk_reset','chatbot',c.id::text,to_jsonb(c),jsonb_build_object('deleted_at',t),reason,p_request_id);
   end loop;
  elsif p_operation='reset_runtime' then
   if exists(select 1 from public.chatbot_submissions where event_id=e.id and generation=e.generation and deleted_at is null) then raise exception 'CLEAR_SUBMISSIONS_FIRST'; end if;
   update public.events set state='DRAFT',started_at=null,paused_at=null,ended_at=null,pause_seconds=0 where id=e.id;
  else update public.dashboard_configs set config=private.dashboard_default(kind) where event_id=e.id;
  end if;
  select jsonb_build_object('operation',p_operation,'previous_generation',e.generation,'generation',events.generation,'completed_at',t,'audit_preserved',true) into result from public.events where id=e.id;
  perform private.audit(p_operation,'event',e.id::text,old,result,reason,p_request_id);
 else raise exception 'UNKNOWN_OPERATION'; end if;
 update public.events set version=version+1,updated_at=t where id=e.id;
 insert into public.reset_receipts(request_id,actor_user_id,operation,payload,result) values(p_request_id,auth.uid(),p_operation,p_payload,result);
 return result;
end $$;
revoke all on function public.admin_command(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.admin_command(text,jsonb,uuid) to authenticated;
