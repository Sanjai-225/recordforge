create view private.participant_totals as
 select p.id,p.event_id,p.generation,p.user_id,p.name,p.department,p.register_number,p.event_code,p.additional_data,p.enabled,p.deleted_at,p.version,p.created_at,p.updated_at,
 count(c.id) filter(where c.deleted_at is null)::integer as submitted,
 count(c.id) filter(where c.deleted_at is null and c.deployed_at is not null)::integer as deployed,
 count(q.id)::integer as completed,count(q.id)::integer as verified,max(q.verified_at) as latest_completion
 from public.participants p join public.events e on e.id=p.event_id and e.generation=p.generation
 left join public.chatbot_submissions c on c.participant_id=p.id
 left join private.completed_chatbots q on q.id=c.id
 where p.deleted_at is null
 group by p.id;

create function private.event_clock(e public.events) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('name',e.name,'generation',e.generation,'state',case when e.state='LIVE' and now()>=e.started_at+make_interval(mins=>e.duration_minutes)+e.pause_seconds*interval '1 second' then 'ENDED' else e.state end,
 'participant_limit',e.participant_limit,'chatbot_limit',e.chatbot_limit,'duration_minutes',e.duration_minutes,
 'started_at',e.started_at,'paused_at',e.paused_at,'ended_at',e.ended_at,'pause_seconds',e.pause_seconds,
 'deadline',e.started_at+make_interval(mins=>e.duration_minutes)+e.pause_seconds*interval '1 second','version',e.version)
$$;
create function private.metrics() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('participants',coalesce(count(*),0),'submitted',coalesce(sum(submitted),0),'deployed',coalesce(sum(deployed),0),'completed',coalesce(sum(completed),0),'target',(select participant_limit*chatbot_limit from public.events)) from private.participant_totals
$$;
create function public.registration_config() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('event',private.event_clock(e),'fields',coalesce((select jsonb_agg(jsonb_build_object('key',key,'label',label,'type',type,'required',required,'options',options) order by position,key) from public.field_definitions where event_id=e.id and scope='registration' and enabled),'[]'::jsonb)) from public.events e
$$;
create function public.public_snapshot(p_kind text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.events; cfg jsonb; r record; obj jsonb; rows jsonb:='[]'; col text; selected text[]; ord text; direction text;
begin
 if p_kind not in ('leaderboard','progress') then raise exception 'NOT_FOUND'; end if;
 select * into e from public.events;
 select config into cfg from public.dashboard_configs where event_id=e.id and kind=p_kind;
 if p_kind='leaderboard' then
  selected:=array(select jsonb_array_elements_text(cfg->'columns')); ord:=cfg->>'sort'; direction:=cfg->>'direction';
  for r in select * from private.participant_totals pt order by
    case when direction='asc' and ord in ('completed','deployed','verified') then (to_jsonb(pt)->>ord)::integer end asc nulls last,
    case when direction='desc' and ord in ('completed','deployed','verified') then (to_jsonb(pt)->>ord)::integer end desc nulls last,
    case when direction='asc' and ord not in ('completed','deployed','verified') then to_jsonb(pt)->>ord end asc nulls last,
    case when direction='desc' and ord not in ('completed','deployed','verified') then to_jsonb(pt)->>ord end desc nulls last,event_code asc
    limit (cfg->>'row_limit')::integer loop
    obj:='{}';
    foreach col in array selected loop obj:=obj||jsonb_build_object(col,to_jsonb(r)->col); end loop;
    obj:=obj||jsonb_build_object('additional_data',coalesce((select jsonb_object_agg(f.label,r.additional_data->f.key) from public.field_definitions f where f.event_id=e.id and f.scope='registration' and f.enabled and f.show_public),'{}'::jsonb));
    rows:=rows||jsonb_build_array(obj);
  end loop;
 end if;
 return jsonb_build_object('event',private.event_clock(e),'config',cfg,'metrics',private.metrics(),'rows',rows,'server_time',now(),'revision',(select revision from public.event_signals where event_id=e.id));
end $$;
create function public.participant_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.events; p public.participants; profile public.profiles;
begin
 select * into e from public.events;
 select * into p from public.participants where user_id=auth.uid() and event_id=e.id and generation=e.generation;
 if p.id is null or not private.is_current_participant(p.id) then raise exception 'NOT_AUTHORIZED'; end if;
 select * into profile from public.profiles where user_id=auth.uid();
 return jsonb_build_object('event',private.event_clock(e),'participant',to_jsonb(p),'username',profile.username,
 'chatbots',coalesce((select jsonb_agg(to_jsonb(c) order by sequence) from public.chatbot_submissions c where participant_id=p.id and deleted_at is null),'[]'::jsonb),
 'metrics',(select to_jsonb(t)-'user_id'-'register_number'-'additional_data' from private.participant_totals t where id=p.id),
 'fields',coalesce((select jsonb_agg(to_jsonb(f) order by position,key) from public.field_definitions f where event_id=e.id and enabled),'[]'::jsonb),
 'server_time',now(),'revision',(select revision from public.event_signals where event_id=e.id));
end $$;
create function public.consistency_check() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n bigint; s bigint; a bigint; l bigint;
begin
 if not private.is_developer() then raise exception 'NOT_AUTHORIZED'; end if;
 select count(*) into n from public.chatbot_submissions c join public.participants p on p.id=c.participant_id join public.events e on e.id=c.event_id and e.generation=c.generation where c.deleted_at is null and p.deleted_at is null and c.deployed_at is not null and c.verified_at is not null;
 select coalesce(sum(completed),0) into s from private.participant_totals;
 select count(*) into a from private.completed_chatbots;
 select (private.metrics()->>'completed')::bigint into l;
 return jsonb_build_object('qualifying_rows',n,'participant_sum',s,'leaderboard_total',l,'master_total',a,'consistent',n=s and n=a and n=l,'checked_at',now());
end $$;
create function public.developer_snapshot(p_section text default 'overview',p_query text default '',p_department text default '',p_offset integer default 0,p_limit integer default 100,p_include_deleted boolean default false,p_action text default '',p_generation integer default null,p_sort text default 'verified_at',p_direction text default 'desc') returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare e public.events; rows jsonb:='[]'; total bigint:=0; page_size integer; cfg jsonb; gen integer;
begin
 if not private.is_developer() then raise exception 'NOT_AUTHORIZED'; end if;
 select * into e from public.events; gen:=coalesce(p_generation,e.generation);
 page_size:=greatest(1,least(p_limit,200));
 if p_offset<0 or length(p_query)>120 or p_sort not in ('verified_at','deployed_at','created_at','title') or p_direction not in ('asc','desc') then raise exception 'INVALID_INPUT'; end if;
 if p_section='participants' then
  select count(*) into total from public.participants p where event_id=e.id and generation=gen and (p_include_deleted or deleted_at is null) and (p_query='' or p.name ilike '%'||p_query||'%' or p.event_code ilike '%'||p_query||'%' or p.register_number ilike '%'||p_query||'%') and (p_department='' or p.department=p_department);
  select coalesce(jsonb_agg(row),'[]') into rows from (select to_jsonb(p)||jsonb_build_object('username',u.username,'completed',coalesce(t.completed,0),'deployed',coalesce(t.deployed,0),'submitted',coalesce(t.submitted,0)) row from public.participants p join public.profiles u on u.user_id=p.user_id left join private.participant_totals t on t.id=p.id where p.event_id=e.id and p.generation=gen and (p_include_deleted or p.deleted_at is null) and (p_query='' or p.name ilike '%'||p_query||'%' or p.event_code ilike '%'||p_query||'%' or p.register_number ilike '%'||p_query||'%') and (p_department='' or p.department=p_department) order by p.event_code limit page_size offset p_offset) q;
 elsif p_section in ('chatbots','completions') then
  select count(*) into total from public.chatbot_submissions c join public.participants p on p.id=c.participant_id where c.event_id=e.id and c.generation=gen and (p_include_deleted or (c.deleted_at is null and p.deleted_at is null)) and (p_section<>'completions' or (c.deployed_at is not null and c.verified_at is not null and c.deleted_at is null and p.deleted_at is null)) and (p_query='' or c.title ilike '%'||p_query||'%' or p.event_code ilike '%'||p_query||'%' or p.name ilike '%'||p_query||'%') and (p_department='' or p.department=p_department);
  select coalesce(jsonb_agg(row),'[]') into rows from (select to_jsonb(c)||jsonb_build_object('event_code',p.event_code,'participant_name',p.name,'department',p.department) row from public.chatbot_submissions c join public.participants p on p.id=c.participant_id where c.event_id=e.id and c.generation=gen and (p_include_deleted or (c.deleted_at is null and p.deleted_at is null)) and (p_section<>'completions' or (c.deployed_at is not null and c.verified_at is not null and c.deleted_at is null and p.deleted_at is null)) and (p_query='' or c.title ilike '%'||p_query||'%' or p.event_code ilike '%'||p_query||'%' or p.name ilike '%'||p_query||'%') and (p_department='' or p.department=p_department) order by case when p_direction='asc' then case p_sort when 'title' then c.title when 'deployed_at' then c.deployed_at::text when 'created_at' then c.created_at::text else c.verified_at::text end end asc nulls last,case when p_direction='desc' then case p_sort when 'title' then c.title when 'deployed_at' then c.deployed_at::text when 'created_at' then c.created_at::text else c.verified_at::text end end desc nulls last,c.id limit page_size offset p_offset) q;
 elsif p_section in ('audit','activity') then
  select count(*) into total from public.audit_logs a where event_id=e.id and (p_generation is null or generation=gen) and (p_section<>'activity' or actor_role='developer') and (p_action='' or action=p_action) and (p_query='' or action ilike '%'||p_query||'%' or coalesce(entity_id,'') ilike '%'||p_query||'%');
  select coalesce(jsonb_agg(row),'[]') into rows from (select to_jsonb(a)||jsonb_build_object('actor_username',u.username) row from public.audit_logs a left join public.profiles u on u.user_id=a.actor_user_id where a.event_id=e.id and (p_generation is null or a.generation=gen) and (p_section<>'activity' or a.actor_role='developer') and (p_action='' or a.action=p_action) and (p_query='' or a.action ilike '%'||p_query||'%' or coalesce(a.entity_id,'') ilike '%'||p_query||'%') order by a.id desc limit page_size offset p_offset) q;
 elsif p_section not in ('overview','control','configuration','fields','displays','reset','health') then raise exception 'NOT_FOUND'; end if;
 select jsonb_object_agg(kind,config) into cfg from public.dashboard_configs where event_id=e.id;
 return jsonb_build_object('event',to_jsonb(e)||jsonb_build_object('clock',private.event_clock(e)),'metrics',private.metrics(),'rows',rows,'total',total,'offset',p_offset,'page_size',page_size,'configs',cfg,
 'fields',coalesce((select jsonb_agg(to_jsonb(f) order by scope,position,key) from public.field_definitions f where event_id=e.id),'[]'::jsonb),
 'recent_completions',coalesce((select jsonb_agg(to_jsonb(q)) from (select c.id,c.title,c.deployed_at,c.verified_at,p.event_code,p.name as participant_name,p.department from private.completed_chatbots c join public.participants p on p.id=c.participant_id order by c.verified_at desc limit 12) q),'[]'::jsonb),
 'consistency',case when p_section in ('overview','health') then public.consistency_check() else null end,
 'departments',coalesce((select jsonb_agg(department) from (select distinct department from public.participants where event_id=e.id and generation=e.generation order by department) q),'[]'::jsonb),
 'server_time',now(),'revision',(select revision from public.event_signals where event_id=e.id));
end $$;

create function public.evidence_export(p_kind text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.events; result jsonb;
begin
 if not private.is_developer() then raise exception 'NOT_AUTHORIZED'; end if;
 select * into e from public.events;
 if p_kind='participants' then
  select coalesce(jsonb_agg(to_jsonb(p)-'user_id'),'[]') into result from private.participant_totals p;
 elsif p_kind in ('chatbots','completions','timeline') then
  select coalesce(jsonb_agg(to_jsonb(q) order by verified_at nulls last,created_at),'[]') into result from (select c.id,c.generation,p.event_code,p.name,p.department,c.sequence,c.title,c.deployment_url,c.created_at,c.deployed_at,c.verified_at,c.deleted_at,c.additional_data from public.chatbot_submissions c join public.participants p on p.id=c.participant_id where c.event_id=e.id and c.generation=e.generation and (p_kind='chatbots' or (c.deleted_at is null and p.deleted_at is null and c.deployed_at is not null and c.verified_at is not null))) q;
 elsif p_kind='audit' then select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') into result from public.audit_logs a where event_id=e.id;
 else raise exception 'INVALID_INPUT'; end if;
 return jsonb_build_object('event',e.name,'generation',e.generation,'exported_at',now(),'rows',result);
end $$;
revoke all on function public.registration_config(),public.public_snapshot(text),public.participant_snapshot(),public.developer_snapshot(text,text,text,integer,integer,boolean,text,integer,text,text),public.consistency_check(),public.evidence_export(text) from public,anon,authenticated;
grant execute on function public.registration_config(),public.public_snapshot(text) to anon,authenticated;
grant execute on function public.participant_snapshot(),public.developer_snapshot(text,text,text,integer,integer,boolean,text,integer,text,text),public.consistency_check(),public.evidence_export(text) to authenticated;
revoke execute on function private.event_clock(public.events),private.metrics() from public,anon,authenticated;
