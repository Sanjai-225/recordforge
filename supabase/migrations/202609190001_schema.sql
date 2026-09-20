-- All competition writes are mediated by explicit RPCs. Never grant table writes to browsers.
create schema if not exists private;
revoke all on schema private from public;

create table public.events (
 id uuid primary key default gen_random_uuid(), singleton boolean not null default true unique check(singleton),
 generation integer not null default 1 check(generation > 0), name text not null default 'LLM Chatbot Challenge' check(length(name) between 1 and 160),
 state text not null default 'DRAFT' check(state in ('DRAFT','REGISTRATION_OPEN','REGISTRATION_CLOSED','READY','LIVE','PAUSED','ENDED')),
 participant_limit integer not null default 120 check(participant_limit between 1 and 10000),
 chatbot_limit integer not null default 10 check(chatbot_limit between 1 and 100),
 duration_minutes integer not null default 60 check(duration_minutes between 1 and 1440),
 started_at timestamptz, paused_at timestamptz, ended_at timestamptz, pause_seconds numeric not null default 0 check(pause_seconds >= 0),
 id_config jsonb not null default '{"prefix":"","separator":"","register_digits":4,"include_department":true,"use_sequence":false}',
 next_identity integer not null default 1, version integer not null default 1,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create table public.profiles (
 user_id uuid primary key references auth.users(id), username text not null check(username ~ '^[a-z0-9_]{3,32}$'),
 role text not null default 'participant' check(role in ('participant','developer')), enabled boolean not null default true,
 retired_at timestamptz, created_at timestamptz not null default clock_timestamp()
);
create unique index profiles_active_username on public.profiles(username) where retired_at is null;
create table public.participants (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id), generation integer not null,
 user_id uuid not null references public.profiles(user_id), name text not null check(length(name) between 1 and 120),
 department text not null check(department ~ '^[A-Z0-9&-]{1,16}$'), register_number text not null check(register_number ~ '^[A-Z0-9-]{4,40}$'),
 event_code text not null check(event_code ~ '^[A-Z0-9_-]{2,64}$'), additional_data jsonb not null default '{}' check(jsonb_typeof(additional_data)='object'),
 enabled boolean not null default true, deleted_at timestamptz, version integer not null default 1,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(event_id,generation,register_number), unique(event_id,generation,event_code), unique(event_id,generation,user_id), unique(id,event_id,generation)
);
create index participants_current on public.participants(event_id,generation) where deleted_at is null;
create index participants_department on public.participants(event_id,generation,department);
create table public.chatbot_submissions (
 id uuid primary key, event_id uuid not null references public.events(id), generation integer not null, participant_id uuid not null,
 sequence integer not null check(sequence > 0), title text not null check(length(title) between 1 and 160),
 deployment_url text not null check(length(deployment_url) <= 2048 and deployment_url ~ '^https?://[^[:space:]@/]+([/:?#][^[:space:]]*)?$'),
 additional_data jsonb not null default '{}' check(jsonb_typeof(additional_data)='object'),
 deployed_at timestamptz, verified_at timestamptz, deleted_at timestamptz, version integer not null default 1,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 foreign key(participant_id,event_id,generation) references public.participants(id,event_id,generation),
 check(verified_at is null or (deployed_at is not null and verified_at >= deployed_at))
);
create unique index chatbot_active_sequence on public.chatbot_submissions(participant_id,sequence) where deleted_at is null;
create index chatbot_participant on public.chatbot_submissions(participant_id);
create index chatbot_completion on public.chatbot_submissions(event_id,generation,verified_at desc) where deleted_at is null and verified_at is not null and deployed_at is not null;
create table public.field_definitions (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id), scope text not null check(scope in ('registration','submission')),
 key text not null check(key ~ '^[a-z][a-z0-9_]{0,39}$' and key not in ('id','user_id','role','password','username','name','department','register_number','event_code','event_id','generation','deployed_at','verified_at','completed','created_at','deleted_at','enabled','__proto__','constructor','prototype')),
 label text not null check(length(label) between 1 and 80), type text not null check(type in ('text','number','select','boolean')),
 required boolean not null default false, enabled boolean not null default true, show_participant boolean not null default true, show_public boolean not null default false,
 options jsonb not null default '[]' check(jsonb_typeof(options)='array'), position integer not null default 0,
 unique(event_id,scope,key)
);
create table public.dashboard_configs (
 event_id uuid not null references public.events(id), kind text not null check(kind in ('leaderboard','progress')), config jsonb not null, primary key(event_id,kind)
);
create table public.registration_reservations (
 id uuid primary key, event_id uuid not null references public.events(id), generation integer not null,
 username text not null, register_number text not null, event_code text not null, payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','complete','expired','cancelled')),
 user_id uuid, expires_at timestamptz not null default clock_timestamp()+interval '15 minutes', created_at timestamptz not null default clock_timestamp()
);
create unique index reservations_username on public.registration_reservations(username) where status='pending';
create unique index reservations_register on public.registration_reservations(event_id,generation,register_number) where status='pending';
create unique index reservations_event_code on public.registration_reservations(event_id,generation,event_code) where status='pending';
create table public.audit_logs (
 id bigint generated always as identity primary key, event_id uuid not null references public.events(id), generation integer not null,
 actor_user_id uuid, actor_role text not null, action text not null, entity_type text not null, entity_id text,
 old_data jsonb, new_data jsonb, reason text, request_id uuid, server_timestamp timestamptz not null default clock_timestamp()
);
create index audit_event_time on public.audit_logs(event_id,generation,id desc);
create index audit_action_time on public.audit_logs(action,id desc);
create table public.event_signals (event_id uuid primary key references public.events(id), revision bigint not null default 0);
create table public.reset_receipts (
 request_id uuid primary key, actor_user_id uuid not null, operation text not null, payload jsonb not null, result jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
create table public.rate_limits (key text not null, bucket bigint not null, attempts integer not null, primary key(key,bucket));

create function private.is_developer() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where user_id=auth.uid() and role='developer' and enabled and retired_at is null)
$$;
create function private.is_current_participant(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.participants p join public.events e on e.id=p.event_id and e.generation=p.generation join public.profiles u on u.user_id=p.user_id
 where p.id=p_id and p.user_id=auth.uid() and p.deleted_at is null and p.enabled and u.enabled and u.retired_at is null)
$$;
create function private.active_identity() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where user_id=auth.uid() and enabled and retired_at is null)
$$;
grant usage on schema private to authenticated;
grant execute on function private.is_developer(), private.is_current_participant(uuid), private.active_identity() to authenticated;

alter table public.events enable row level security;
alter table public.profiles enable row level security;
alter table public.participants enable row level security;
alter table public.chatbot_submissions enable row level security;
alter table public.field_definitions enable row level security;
alter table public.dashboard_configs enable row level security;
alter table public.registration_reservations enable row level security;
alter table public.audit_logs enable row level security;
alter table public.event_signals enable row level security;
alter table public.reset_receipts enable row level security;
alter table public.rate_limits enable row level security;
create policy events_read on public.events for select to authenticated using(private.active_identity());
create policy profiles_read on public.profiles for select to authenticated using(private.is_developer() or (user_id=auth.uid() and enabled and retired_at is null));
create policy participants_read on public.participants for select to authenticated using(private.is_developer() or private.is_current_participant(id));
create policy chatbot_read on public.chatbot_submissions for select to authenticated using(private.is_developer() or (deleted_at is null and private.is_current_participant(participant_id)));
create policy fields_read on public.field_definitions for select to authenticated using(private.active_identity());
create policy dashboards_read on public.dashboard_configs for select to authenticated using(private.active_identity());
create policy audit_read on public.audit_logs for select to authenticated using(private.is_developer());
create policy signals_read on public.event_signals for select to anon,authenticated using(true);
create policy receipts_read on public.reset_receipts for select to authenticated using(private.is_developer());
revoke all on all tables in schema public from anon,authenticated;
grant select on public.event_signals to anon,authenticated;
grant select on public.events,public.profiles,public.participants,public.chatbot_submissions,public.field_definitions,public.dashboard_configs,public.audit_logs,public.reset_receipts to authenticated;
grant all on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;

create view private.completed_chatbots as
 select c.* from public.chatbot_submissions c join public.participants p on p.id=c.participant_id join public.events e on e.id=c.event_id and e.generation=c.generation
 where c.deleted_at is null and p.deleted_at is null and c.deployed_at is not null and c.verified_at is not null;

create function private.audit(p_action text,p_entity text,p_id text,p_old jsonb,p_new jsonb,p_reason text,p_request uuid,p_actor uuid default auth.uid()) returns void
 language plpgsql security definer set search_path='' as $$
declare e public.events; r text;
begin
 select * into e from public.events;
 select role into r from public.profiles where user_id=p_actor;
 insert into public.audit_logs(event_id,generation,actor_user_id,actor_role,action,entity_type,entity_id,old_data,new_data,reason,request_id)
 values(e.id,e.generation,p_actor,coalesce(r,'system'),p_action,p_entity,p_id,p_old,p_new,p_reason,p_request);
 update public.event_signals set revision=revision+1 where event_id=e.id;
end $$;
create function private.validate_fields(p_event uuid,p_scope text,p_data jsonb) returns void language plpgsql set search_path='' as $$
declare f public.field_definitions; k text; v jsonb;
begin
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>20000 then raise exception 'INVALID_FIELDS'; end if;
 for k in select jsonb_object_keys(p_data) loop
  if not exists(select 1 from public.field_definitions where event_id=p_event and scope=p_scope and key=k and enabled) then raise exception 'UNKNOWN_FIELD'; end if;
 end loop;
 for f in select * from public.field_definitions where event_id=p_event and scope=p_scope and enabled loop
  v:=p_data->f.key;
  if f.required and (v is null or v='null'::jsonb or v='""'::jsonb) then raise exception 'REQUIRED_FIELD'; end if;
  if v is not null and v<>'null'::jsonb and v<>'""'::jsonb then
   if (f.type='text' and (jsonb_typeof(v)<>'string' or length(v#>>'{}')>2000)) or (f.type='number' and jsonb_typeof(v)<>'number') or (f.type='boolean' and jsonb_typeof(v)<>'boolean') or (f.type='select' and not f.options @> jsonb_build_array(v)) then raise exception 'INVALID_FIELDS'; end if;
  end if;
 end loop;
end $$;
create function private.assert_live(e public.events) returns void language plpgsql set search_path='' as $$
begin
 if e.state<>'LIVE' then raise exception 'EVENT_NOT_LIVE'; end if;
 if e.started_at is null or clock_timestamp()>=e.started_at+make_interval(mins=>e.duration_minutes)+e.pause_seconds*interval '1 second' then raise exception 'EVENT_EXPIRED'; end if;
end $$;
create function private.dashboard_default(p_kind text) returns jsonb language sql immutable set search_path='' as $$
 select case when p_kind='leaderboard' then '{"title":"Participant leaderboard","subtitle":"Every verified chatbot counts","columns":["event_code","name","department","completed","deployed","verified","latest_completion"],"sort":"completed","direction":"desc","row_limit":120}'::jsonb
 else '{"title":"LLM Chatbot World Record Challenge","subtitle":"Built together. Counted with confidence.","show_timer":true,"show_percentage":true,"show_participants":true,"show_target":true,"show_progress":true,"branding":"RecordForge"}'::jsonb end
$$;
create function private.validate_dashboard(p_kind text,p_config jsonb) returns void language plpgsql set search_path='' as $$
declare k text; v jsonb;
begin
 if jsonb_typeof(p_config)<>'object' or length(p_config::text)>6000 then raise exception 'INVALID_CONFIG'; end if;
 for k,v in select * from jsonb_each(p_config) loop
  if k in ('title','subtitle','branding') then
   if jsonb_typeof(v)<>'string' or length(v#>>'{}')>180 then raise exception 'INVALID_CONFIG'; end if;
  elsif p_kind='leaderboard' and k='columns' then
   if jsonb_typeof(v)<>'array' or jsonb_array_length(v)>7 or jsonb_array_length(v)<1 or exists(select 1 from jsonb_array_elements_text(v) x where x not in ('event_code','name','department','completed','deployed','verified','latest_completion')) then raise exception 'INVALID_CONFIG'; end if;
  elsif p_kind='leaderboard' and k='sort' then
   if (v#>>'{}') not in ('event_code','name','department','completed','deployed','verified','latest_completion') then raise exception 'INVALID_CONFIG'; end if;
  elsif p_kind='leaderboard' and k='direction' then
   if (v#>>'{}') not in ('asc','desc') then raise exception 'INVALID_CONFIG'; end if;
  elsif p_kind='leaderboard' and k='row_limit' then
   if jsonb_typeof(v)<>'number' or (v#>>'{}')::integer not between 1 and 1000 then raise exception 'INVALID_CONFIG'; end if;
  elsif p_kind='progress' and k in ('show_timer','show_percentage','show_participants','show_target','show_progress') then
   if jsonb_typeof(v)<>'boolean' then raise exception 'INVALID_CONFIG'; end if;
  else raise exception 'INVALID_CONFIG'; end if;
 end loop;
end $$;

insert into public.events(id) values('00000000-0000-4000-8000-000000000001');
insert into public.event_signals(event_id) select id from public.events;
insert into public.dashboard_configs(event_id,kind,config) select e.id,k,private.dashboard_default(k) from public.events e cross join unnest(array['leaderboard','progress']) k;
-- Only non-sensitive invalidation revisions are sent through Realtime.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.event_signals; end if;
end $$;

revoke execute on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_developer(),private.is_current_participant(uuid),private.active_identity() to authenticated;
